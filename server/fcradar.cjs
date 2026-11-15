'use strict';
const C=require('../src/core.js');
const {PublicError}=require('./ai-engine.cjs');
const { nameKey, searchText, playerName } = require('./fcradar-aliases.cjs');
const ORIGIN = 'https://pub-api.fcradar.gg';
const PLAYERS_URL = ORIGIN + '/v1/games/fc27/players';
const NAME_MATCHES_PER_PAGE = 4;
const SNAPSHOT_PAGE_SIZE = 100;
const fail=(message,code='FCRADAR_RESPONSE',status=502)=>new PublicError(message,code,status);
const groups={attacking:['crossing','finishing','headingAccuracy','shortPassing','volleys'],skill:['dribbling','curve','fkAccuracy','longPassing','ballControl'],movement:['acceleration','sprintSpeed','agility','reactions','balance'],power:['shotPower','jumping','stamina','strength','longShots'],mentality:['aggression','interceptions','attackPosition','vision','penalties','composure'],defending:['defensiveAwareness','standingTackle','slidingTackle'],goalkeeping:['gkDiving','gkHandling','gkKicking','gkPositioning','gkReflexes']};
function imageCdnBase(config) {
  if (!config.fcradarImageCdnBaseUrl) return '';
  let base;
  try {
    base = new URL(config.fcradarImageCdnBaseUrl);
  } catch {
    return '';
  }
  if (base.origin !== ORIGIN || base.username || base.password || base.search || base.hash) return '';

  const token = base.pathname.match(/^\/cdn\/([A-Za-z0-9._~-]{1,256})\/?$/)?.[1];
  // FCRadar issues a public image token separately from the API credentials.
  if (!token || token === config.fcradarApiKey || token === config.apiKey) return '';
  return ORIGIN + '/cdn/' + token + '/';
}

function portraitUrl(config, playerId, available) {
  const base = available ? imageCdnBase(config) : '';
  return base ? base + 'FC27/heads/' + playerId + '.png' : '';
}

function integerInRange(value, minimum, maximum) {
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

const positionFamilies = {
  LS: 'ST', RS: 'ST', LAM: 'CAM', RAM: 'CAM', LCM: 'CM', RCM: 'CM',
  LDM: 'CDM', RDM: 'CDM', LCB: 'CB', RCB: 'CB',
};

function positionCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return positionFamilies[code] || code;
}

function mapPlayer(player, config = {}, koreanNames, includeOriginalPosition = false) {
  const id = integerInRange(player?.id, 1, Number.MAX_SAFE_INTEGER);
  if (id === null) throw fail('선수 ID 형식을 확인할 수 없어요.');
  const fullName = [player.first_name, player.last_name]
    .filter(value => typeof value === 'string' && value.trim()).join(' ');
  const originalName = [player.name, player.common_name, fullName]
    .find(value => typeof value === 'string' && value.trim())?.trim();
  const overall = integerInRange(player.overall_rating, 1, 99);
  if (!originalName || overall === null) throw fail('선수 이름 또는 현재 OVR가 빠져 있어요.');

  const codes = Array.isArray(player.positions) ? player.positions :
    typeof player.positions === 'string' ? player.positions.split(/[,/;|\s]+/) : [];
  const normalizedCodes = codes.map(positionCode).filter(Boolean);
  const primary = positionCode(player.position) || normalizedCodes[0];
  const supported = !!C.WEIGHTS[primary];
  if (!supported && (!includeOriginalPosition || !/^[A-Z]{1,6}$/.test(primary || ''))) {
    throw fail('지원 범위 밖의 주 포지션이에요.');
  }
  const secondary = normalizedCodes.filter(code => C.WEIGHTS[code]);
  const positions = [...new Set([primary, ...secondary])].slice(0, 7);

  const attributes = {};
  const attributeNames = { fkAccuracy: 'freeKickAccuracy', attackPosition: 'positioning' };
  for (const [group, keys] of Object.entries(groups)) {
    for (const key of keys) {
      const snake = key.replace(/[A-Z]/g, char => '_' + char.toLowerCase());
      const value = integerInRange(player.stats?.[group]?.[snake], 1, 99);
      if (value !== null) attributes[attributeNames[key] || key] = value;
    }
  }
  // Keep optional unavailable values empty, including face-card aggregates.
  return C.normalizePlayer({
    id: 'fcradar-fc27-' + id,
    name: playerName(id, koreanNames?.byId.get(id), originalName, fullName, player.common_name),
    englishName: originalName,
    positions,
    overall,
    potential: integerInRange(player.potential, 1, 99),
    age: integerInRange(player.age, 14, 65),
    club: player.club?.name,
    nationality: player.nation?.name,
    attributes,
    profile: {
      league: player.league?.name,
      givenName: player.first_name,
      familyName: player.last_name,
      heightCm: integerInRange(player.height_cm, 100, 250),
      weightKg: integerInRange(player.weight_kg, 25, 220),
      contractYear: integerInRange(player.contract_expires_year, 1900, 2200),
      preferredFoot: player.preferred_foot,
      skillMoves: integerInRange(player.skill_moves, 1, 5),
      weakFoot: integerInRange(player.weak_foot, 1, 5),
      internationalRep: integerInRange(player.international_rep, 1, 5),
      freeAgent: player.free_agent,
      realFace: player.real_face,
      marketValue: player.market_value,
      wage: player.wage,
      releaseClause: player.release_clause,
      roleIds: player.roles,
      preferredPositions: [...new Set([player.position, ...codes]
        .filter(code => typeof code === 'string' && /^[A-Z]{1,6}$/.test(code)))].slice(0, 7),
    },
    playstyles: player.playstyles,
    playstyle_plus: player.playstyle_plus,
    imageUrl: portraitUrl(config, id, player.has_image === true),
    source: 'import',
    notes: 'FCRadar FC27 · 가져온 시점의 데이터. PS5 세이브와 자동 동기화하지 않습니다.',
  });
}
function queryParams(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('검색 조건을 확인해주세요.','INVALID_SEARCH',400);
  const params=new URLSearchParams({per_page:'25',page:'1',sort:'overall',dir:'desc'});
  for(const [key,value] of Object.entries(input)){
    if(!['search','position','minRating','maxRating','club','nationality','dir','page'].includes(key))throw fail('지원하지 않는 검색 조건이에요.','INVALID_SEARCH',400);
    if(value===''||value==null)continue;
    if(['search','club','nationality'].includes(key)){
      if(typeof value!=='string'||value.length>100)throw fail('이름·소속팀·국적은 100자 이내로 입력해주세요.','INVALID_SEARCH',400);
      const text = searchText(key, value);
      if (text) params.set(key, text);
    }
    else if(key==='position'){if(!C.WEIGHTS[value])throw fail('포지션을 확인해주세요.','INVALID_SEARCH',400);params.set(key,value);}
    else if(key==='dir'){if(!['asc','desc'].includes(value))throw fail('정렬 조건을 확인해주세요.','INVALID_SEARCH',400);params.set(key,value);}
    else {const n=Number(value);if(!Number.isInteger(n)||n<1||n>(key==='page'?1000:99))throw fail('페이지 또는 OVR 범위를 확인해주세요.','INVALID_SEARCH',400);params.set(key,String(n));}
  }
  if (params.has('minRating') && params.has('maxRating') && Number(params.get('minRating')) > Number(params.get('maxRating'))) {
    throw fail('최대 OVR는 최소 OVR 이상으로 입력해주세요.','INVALID_SEARCH',400);
  }
  return params;
}
function matchesFilters(player, params) {
  const namesMatch = (filter, value, compare) => !params.has(filter) ||
    params.get(filter).split(',').some(name => compare(nameKey(value), nameKey(name)));
  return (!params.has('position') || player.positions.includes(params.get('position'))) &&
    player.overall >= Number(params.get('minRating') ?? 1) &&
    player.overall <= Number(params.get('maxRating') ?? 99) &&
    namesMatch('club', player.club, (value, filter) => value.includes(filter)) &&
    namesMatch('nationality', player.nationality, (value, filter) => value === filter);
}

function createFCRadarProvider(fetchImpl = fetch, loadKoreanNames) {
  async function request(url, config, signal, allowMissing = false) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: 'Bearer ' + config.fcradarApiKey, Accept: 'application/json' },
        redirect: 'error',
        signal,
      });
    } catch {
      throw fail('FCRadar 연결이 중단되었어요. 잠시 후 다시 검색해주세요.', 'FCRADAR_NETWORK');
    }
    if (allowMissing && response.status === 404) return undefined;
    if (!response.ok) {
      const messages = {
        401: 'FCRadar 키가 유효하지 않아요.',
        403: 'FCRadar players:read 권한을 확인해주세요.',
        404: 'FC27 데이터가 제공되는지 확인해주세요.',
        429: 'FCRadar 요청 한도에 도달했어요. 잠시 후 다시 검색해주세요.',
      };
      const error = fail(messages[response.status] || 'FCRadar 서비스가 응답하지 못했어요.',
        'FCRADAR_UPSTREAM', response.status === 429 ? 429 : 502);
      if (response.status === 429) error.retryAfter = Number(response.headers.get('retry-after'));
      error.retryable = response.status >= 500;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      throw fail('FCRadar 응답을 읽지 못했어요.', 'FCRADAR_READ');
    }
  }

  async function listResponse(params, config, signal) {
    const response = await request(PLAYERS_URL + '?' + params, config, signal);
    if (!Array.isArray(response?.data) || response.data.length > 100) {
      throw fail('FCRadar 응답 형식이 변경되었어요.');
    }
    return response;
  }

  async function recordsById(ids, config, signal) {
    const results = await Promise.all(ids.map(async id => {
      const response = await request(PLAYERS_URL + '/' + id, config, signal, true);
      if (response === undefined) return [];
      const record = response?.data;
      return [integerInRange(record?.id, 1, Number.MAX_SAFE_INTEGER) === id ? record : null];
    }));
    return results.flat();
  }

  async function loadActiveSnapshot(config, signal) {
    if (!config.fcradarKeyConfigured) {
      throw fail('.env에 승인된 FCRADAR_API_KEY를 설정해주세요.', 'FCRADAR_KEY_REQUIRED', 400);
    }
    const response = await request(ORIGIN + '/v1/games/fc27/snapshots', config, signal);
    const active = Array.isArray(response?.data) &&
      response.data.find(snapshot => [true, 1, '1', 'true'].includes(snapshot?.isActive));
    const date = String(active?.snapshot ?? '');
    const total = integerInRange(active?.playerCount, 1, Number.MAX_SAFE_INTEGER);
    if (!/^\d{8}$/.test(date) || total === null) throw fail('FC27 활성 스냅샷과 선수 수를 확인하지 못했어요.');
    return { date, total };
  }

  async function loadLeagueCategories(config, signal) {
    const response = await request(ORIGIN + '/v1/games/fc27/leagues', config, signal);
    if (!Array.isArray(response?.data)) throw fail('FCRadar 리그 분류를 읽지 못했어요.');
    const groups = new Map();
    for (const row of response.data) {
      if (typeof row?.leagueName !== 'string' || typeof row.isWomenCompetition !== 'boolean') continue;
      const name = row.leagueName.trim();
      if (!name) continue;
      const category = row.isWomenCompetition ? 'female' : 'male';
      groups.set(name, groups.has(name) && groups.get(name) !== category ? null : category);
    }
    const categories = [...groups].filter(([, category]) => category);
    if (!categories.length) throw fail('FCRadar 리그의 남자·여자 분류를 확인하지 못했어요.');
    return categories;
  }

  async function loadSnapshotPage(date, page, config, signal) {
    const params = new URLSearchParams({
      snapshot: date, page: String(page), per_page: String(SNAPSHOT_PAGE_SIZE), sort: 'name', dir: 'asc',
    });
    const [response, koreanNames] = await Promise.all([
      listResponse(params, config, signal), loadKoreanNames?.(),
    ]);
    const players = [];
    for (const record of response.data) {
      try {
        players.push({ ...mapPlayer(record, {}, koreanNames, true), hasImage: record.has_image === true });
      } catch (error) {
        if (!(error instanceof PublicError) || error.code !== 'FCRADAR_RESPONSE') throw error;
      }
    }
    return {
      players,
      received: response.data.length,
      total: integerInRange(response.meta?.total, 1, Number.MAX_SAFE_INTEGER),
      page: integerInRange(response.meta?.currentPage, 1, Number.MAX_SAFE_INTEGER),
    };
  }

  return { loadActiveSnapshot, loadLeagueCategories, loadSnapshotPage, async search(input, config, signal) {
    const params = queryParams(input);
    if (!config.fcradarKeyConfigured) {
      throw fail('.env에 승인된 FCRADAR_API_KEY를 설정해주세요.', 'FCRADAR_KEY_REQUIRED', 400);
    }
    const page = Number(params.get('page'));
    const names = loadKoreanNames?.();
    const search = params.get('search') || '';
    const ids = /[가-힣]/.test(search) ? (await names)?.byName.get(nameKey(search)) || [] : [];
    const start = (page - 1) * NAME_MATCHES_PER_PAGE;
    const end = start + NAME_MATCHES_PER_PAGE;
    const [records, koreanNames] = await Promise.all([
      ids.length ? recordsById(ids.slice(start, end), config, signal) :
        listResponse(params, config, signal).then(response => response.data),
      names,
    ]);
    const players = [];
    const seen = new Set();
    let skipped = 0;
    for (const record of records) {
      try {
        const player = mapPlayer(record, config, koreanNames);
        if (seen.has(player.id)) {
          skipped++;
          continue;
        }
        seen.add(player.id);
        if (!ids.length || matchesFilters(player, params)) players.push(player);
      } catch (error) {
        if (!(error instanceof PublicError) || error.code !== 'FCRADAR_RESPONSE') throw error;
        skipped++;
      }
    }
    if (ids.length) {
      const direction = params.get('dir') === 'asc' ? 1 : -1;
      players.sort((a, b) => direction * (a.overall - b.overall));
    }
    return {
      players, skipped, received: records.length, page,
      mayHaveMore: ids.length ? ids.length > end : records.length === Number(params.get('per_page')),
      source: 'FCRadar FC27', fetchedAt: new Date().toISOString(), imageCdnConfigured: !!imageCdnBase(config),
    };
  }};
}
module.exports={mapPlayer,imageCdnBase,portraitUrl,queryParams,matchesFilters,SNAPSHOT_PAGE_SIZE,createFCRadarProvider};
