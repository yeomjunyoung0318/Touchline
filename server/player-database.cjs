'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const C = require('../src/core.js');
const { PublicError } = require('./ai-engine.cjs');
const { queryParams, matchesFilters, SNAPSHOT_PAGE_SIZE, imageCdnBase, portraitUrl } = require('./fcradar.cjs');
const { loadGrowthProfiles } = require('./growth-profiles.cjs');

const MAX_RECORDS = 100000;
const DATABASE_VERSION = 5;
const CHECKPOINT_ORDER = 'name-asc-v2';
const invalidDatabase = message => new PublicError(message, 'PLAYER_DATABASE_ERROR', 502);

function searchFacets(players, categories) {
  const leagues = new Map(), teams = new Set(), nationalities = new Set();
  const ranges = {};
  let genderKnown = 0;
  for (const player of players) {
    const league = player.profile?.league;
    if (league) {
      if (!leagues.has(league)) leagues.set(league, new Set());
      if (player.club) leagues.get(league).add(player.club);
      if (categories.has(league)) genderKnown++;
    }
    if (player.club) teams.add(player.club);
    if (player.nationality) nationalities.add(player.nationality);
    for (const [key, value] of [['age', player.age], ['potential', player.potential],
      ['height', player.profile?.heightCm], ['weight', player.profile?.weightKg]]) {
      if (!Number.isInteger(value)) continue;
      const range = ranges[key] ?? (ranges[key] = [value, value]);
      range[0] = Math.min(range[0], value);
      range[1] = Math.max(range[1], value);
    }
  }
  return {
    leagues: [...leagues].map(([name, clubs]) => ({ name, teams: [...clubs], gender: categories.get(name) ?? null })),
    teams: [...teams], nationalities: [...nationalities], ranges, genderKnown,
  };
}

function indexSnapshot(snapshot, growthProfiles) {
  const { version, date, total, updatedAt, players } = snapshot;
  if (![1, 2, 3, 4, DATABASE_VERSION].includes(version) || !/^\d{8}$/.test(date) || !Number.isInteger(total) ||
      total < 1 || total > MAX_RECORDS || !Number.isFinite(Date.parse(updatedAt)) ||
      !Array.isArray(players) || !players.length || players.length > total) {
    throw invalidDatabase('선수 DB 파일 형식을 확인할 수 없어요.');
  }
  const rows = players.map(row => {
    const player = C.normalizePlayer(row);
    if (!C.isApiPlayer(player) || player.source !== 'import') throw invalidDatabase('선수 DB의 API 선수 ID를 확인할 수 없어요.');
    const growth = growthProfiles?.get(player.id);
    if (growth && (growth.source === 'cmtracker' || player.profile?.growth?.source !== 'cmtracker')) {
      player.profile = { ...player.profile, growth };
    }
    return { ...player, imageUrl: '', hasImage: row.hasImage === true };
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== rows.length) throw invalidDatabase('선수 DB에 중복 ID가 있어요.');
  const categories = new Map((Array.isArray(snapshot.leagueCategories) ? snapshot.leagueCategories : []).filter(pair =>
    Array.isArray(pair) && typeof pair[0] === 'string' && ['male', 'female'].includes(pair[1])));
  return { version, date, total, updatedAt, players: rows, byId, categories, facets: searchFacets(rows, categories),
    unmodeled: rows.filter(row => !C.WEIGHTS[row.positions[0]]).length,
    bodyKnown: rows.filter(row => row.profile?.heightCm && row.profile?.weightKg).length,
    financeKnown: rows.filter(row => row.profile?.marketValue && row.profile?.wage).length,
    rolesKnown: rows.filter(row => Array.isArray(row.profile?.roleIds)).length,
    growthKnown: rows.filter(row => row.profile?.growth).length,
    playstyleKnown: rows.filter(row => row.playstyles && row.playstyle_plus).length,
    playstylePlusCount: rows.filter(row => row.playstyle_plus?.length).length };
}

async function writeSnapshot(file, value, signal) {
  signal.throwIfAborted();
  const temporary = file + '.' + randomUUID() + '.tmp';
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(value), { flag: 'wx' });
    signal.throwIfAborted();
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.unlink(temporary).catch(() => {});
  }
}

function readCheckpoint(file, date, total, pages) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.version !== DATABASE_VERSION || saved.order !== CHECKPOINT_ORDER || saved.date !== date || saved.total !== total || !Number.isInteger(saved.page) ||
        saved.page < 1 || saved.page > pages) return null;
    const processed = Math.min(saved.page * SNAPSHOT_PAGE_SIZE, total);
    const { players } = indexSnapshot(saved);
    return players.length <= processed ? { page: saved.page, processed, players } : null;
  } catch {
    return null;
  }
}

function createPlayerDatabase(file, { intervalMs = 1250 } = {}) {
  const pendingFile = file + '.pending';
  const growthProfiles = loadGrowthProfiles(path.dirname(file));
  let active = null;
  let error = '';
  let job = null;
  let progress = null;
  try {
    if (fs.statSync(file).size > 160 * 1024 * 1024) throw invalidDatabase('선수 DB 파일이 너무 커요.');
    active = indexSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')), growthProfiles);
  } catch (problem) {
    if (problem.code !== 'ENOENT') error = '저장된 선수 DB를 읽지 못했어요. 선수 DB 적재를 다시 실행해주세요.';
  }

  function status() {
    return {
      count: active?.players.length ?? 0,
      date: active?.date ?? null,
      total: active?.total ?? null,
      skipped: active ? active.total - active.players.length : 0,
      unmodeled: active?.unmodeled ?? 0,
      playstyleKnown: active?.playstyleKnown ?? 0,
      playstylePlusCount: active?.playstylePlusCount ?? 0,
      bodyKnown: active?.bodyKnown ?? 0,
      financeKnown: active?.financeKnown ?? 0,
      rolesKnown: active?.rolesKnown ?? 0,
      growthKnown: active?.growthKnown ?? 0,
      genderKnown: active?.facets.genderKnown ?? 0,
      updatedAt: active?.updatedAt ?? null,
      syncing: !!job,
      progress,
      error,
    };
  }

  async function load(provider, config, signal, onProgress) {
    let nextRequest = 0;
    async function send(operation) {
      const attempt = async () => {
        await delay(Math.max(0, nextRequest - Date.now()), undefined, { signal });
        nextRequest = Date.now() + intervalMs;
        return operation(AbortSignal.any([signal, AbortSignal.timeout(45000)]));
      };
      try {
        return await attempt();
      } catch (problem) {
        const throttle = problem.status === 429 && problem.retryAfter > 0 && problem.retryAfter <= 60;
        const interrupted = problem.retryable || ['FCRADAR_NETWORK', 'FCRADAR_READ'].includes(problem.code);
        if (signal.aborted || (!throttle && !interrupted)) throw problem;
        nextRequest = Math.max(nextRequest, Date.now() + (throttle ? problem.retryAfter + 1 : 2) * 1000);
        return attempt();
      }
    }

    const { date, total } = await send(requestSignal => provider.loadActiveSnapshot(config, requestSignal));
    if (!/^\d{8}$/.test(date) || !Number.isInteger(total) || total < 1 || total > MAX_RECORDS) {
      throw invalidDatabase('FC27 스냅샷의 날짜와 선수 수를 확인해주세요.');
    }
    const reusable = active?.date === date && active.total === total && active.version === DATABASE_VERSION &&
      active.bodyKnown > 0 && active.playstyleKnown === active.players.length;
    if (reusable && (active.categories.size || !provider.loadLeagueCategories)) return;
    const leagueCategories = provider.loadLeagueCategories ? await send(requestSignal => provider.loadLeagueCategories(config, requestSignal)) : [];
    if (reusable) {
      const complete = { version: DATABASE_VERSION, date, total, updatedAt: new Date().toISOString(), players: active.players, leagueCategories };
      const indexed = indexSnapshot(complete, growthProfiles);
      if (!indexed.facets.genderKnown) throw invalidDatabase('저장된 선수와 리그 분류가 일치하지 않아요. 기존 선수 DB를 사용해요.');
      await writeSnapshot(file, complete, signal);
      active = indexed;
      return;
    }

    const pages = Math.ceil(total / SNAPSHOT_PAGE_SIZE);
    const checkpoint = readCheckpoint(pendingFile, date, total, pages);
    const players = checkpoint?.players ?? [];
    const ids = new Set(players.map(player => player.id));
    const snapshot = () => ({ version: DATABASE_VERSION, date, total, updatedAt: new Date().toISOString(), players, leagueCategories });
    progress = { page: checkpoint?.page ?? 0, pages, processed: checkpoint?.processed ?? 0, total };
    onProgress(progress);
    for (let page = progress.page + 1; page <= pages; page++) {
      const result = await send(requestSignal => provider.loadSnapshotPage(date, page, config, requestSignal));
      const expected = Math.min(SNAPSHOT_PAGE_SIZE, total - progress.processed);
      if ((result.total !== null && result.total !== total) ||
          (result.page != null && result.page !== page) || result.received !== expected) {
        throw invalidDatabase('FCRadar의 페이지 수와 스냅샷 선수 수가 일치하지 않아요.');
      }
      const previousCount = players.length;
      for (const player of result.players) {
        if (ids.has(player.id)) continue;
        ids.add(player.id);
        const old = active?.date === date ? active.byId.get(player.id) : null;
        players.push(old ? {
          ...player,
          name: /[가-힣]/.test(old.name) && !/[가-힣]/.test(player.name) ? old.name : player.name,
          playstyles: player.playstyles ?? old.playstyles,
          playstyle_plus: player.playstyle_plus ?? old.playstyle_plus,
          profile: { ...old.profile, ...player.profile },
        } : player);
      }
      if (result.players.length && players.length === previousCount) {
        throw invalidDatabase('FCRadar가 이전에 받은 선수 페이지만 반복해서 보내고 있어요.');
      }
      progress = { page, pages, processed: progress.processed + result.received, total };
      if (page % 10 === 0 && players.length) {
        await writeSnapshot(pendingFile, { ...snapshot(), page, order: CHECKPOINT_ORDER }, signal);
      }
      onProgress(progress);
    }

    const complete = snapshot();
    const indexed = indexSnapshot(complete, growthProfiles);
    if (!indexed.playstyleKnown) throw invalidDatabase('플레이스타일 항목을 확인하지 못했어요. 기존 선수 DB를 사용해요.');
    if (!indexed.bodyKnown) throw invalidDatabase('키와 몸무게 항목을 확인하지 못했어요. 기존 선수 DB를 사용해요.');
    if (leagueCategories.length && !indexed.facets.genderKnown) throw invalidDatabase('선수와 리그 분류가 일치하지 않아요. 기존 선수 DB를 사용해요.');
    if (active?.date === date && active.players.some(player => !indexed.byId.has(player.id))) {
      throw invalidDatabase('같은 스냅샷에서 누락된 선수가 있어요. 기존 선수 DB를 사용해요.');
    }
    await writeSnapshot(file, complete, signal);
    active = indexed;
    await fs.promises.unlink(pendingFile).catch(() => {});
  }

  function refresh(provider, config, onProgress = () => {}) {
    if (job) return job.promise;
    const controller = new AbortController();
    error = '';
    progress = null;
    const promise = load(provider, config, controller.signal, onProgress).catch(problem => {
      error = problem.public ? problem.message : controller.signal.aborted
        ? '선수 DB 적재가 중단됐어요.' : '선수 DB 파일을 저장하지 못했어요.';
      throw problem;
    }).finally(() => { job = null; progress = null; });
    job = { controller, promise };
    return promise;
  }

  function view(config) {
    if (!active) return null;
    const snapshot = active;
    const gender = row => row.profile?.league === 'Free Agents League'
      ? (/women/i.test(row.club) ? 'female' : 'male') : snapshot.categories.get(row.profile?.league) ?? null;
    const display = row => {
      const { hasImage, ...player } = row;
      return { ...player, imageUrl: portraitUrl(config, row.id.slice('fcradar-fc27-'.length), hasImage) };
    };
    return {
      date: snapshot.date,
      players: snapshot.players,
      facets: snapshot.facets,
      gender,
      get: id => snapshot.byId.get(id),
      display,
      search(input, filters = {}) {
        const params = queryParams(input);
        const term = params.get('search') ?? '';
        const original = input.search?.trim() ?? '';
        const inRange = (value, min, max) =>
          (min == null || (Number.isInteger(value) && value >= min)) &&
          (max == null || (Number.isInteger(value) && value <= max));
        const matches = snapshot.players.filter(player =>
          (!term || C.matchesSearch(player, original) || C.matchesSearch(player, term)) &&
          matchesFilters(player, params) &&
          (!filters.league || player.profile?.league === filters.league) &&
          (!filters.team || player.club === filters.team) &&
          (!filters.gender || gender(player) === filters.gender) &&
          inRange(player.age, filters.minAge, filters.maxAge) &&
          inRange(player.potential, filters.minPotential, filters.maxPotential) &&
          inRange(player.profile?.heightCm, filters.minHeight, filters.maxHeight) &&
          inRange(player.profile?.weightKg, filters.minWeight, filters.maxWeight));
        const order = params.get('dir') === 'asc' ? 1 : -1;
        matches.sort((a, b) => order * (a.overall - b.overall));
        const page = Number(params.get('page'));
        const pageSize = Number(params.get('per_page'));
        const end = page * pageSize;
        const players = matches.slice(end - pageSize, end).map(display);
        return {
          players, page, total: matches.length, received: players.length, mayHaveMore: end < matches.length,
          source: 'FCRadar FC27 로컬 DB', fetchedAt: snapshot.updatedAt, imageCdnConfigured: !!imageCdnBase(config),
        };
      },
    };
  }

  return { status, refresh, view, stop: () => job?.controller.abort() };
}

module.exports = { createPlayerDatabase };
