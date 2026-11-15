(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CareerDevelopment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SOURCES = Object.freeze({
    ea: 'https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-career-mode-deep-dive',
    scoutCapacity: 'https://www.ea.com/games/ea-sports-fc/fc-27/news/update-v1-1-pitch-notes',
    scoutValues: 'https://www.ea.com/games/ea-sports-fc/fc-27/news/fc27-title-update-v1-1-0',
    profiles: 'https://news.cmtracker.net/',
    eaBase: 'https://github.com/ViniMacacari/eafc-db-kit/tree/1464907bf4e726504d8b3ce15ffd0a552990565e/templates/FC%2027',
    cmtracker: 'https://cmtracker.net/',
  });
  // Peak windows are CMTracker's published data analysis, not EA's OVR formula.
  const PROFILES = Object.freeze({
    default: { name: '일반형', english: 'Default', peak: [27, 30], description: '꾸준히 발전해 전성기를 맞는 경향이에요.' },
    'explosive-start': { name: '초반 급성장형', english: 'Explosive Start', peak: [22, 27], description: '어린 시기에 빠르게 발전하고 전성기도 일찍 오는 경향이에요.' },
    'meteoric-peak': { name: '빠른 전성기형', english: 'Meteoric Peak', peak: [22, 30], description: '일찍 성장해 일반적인 전성기 나이까지 좋은 기량을 유지하는 경향이에요.' },
    'consistent-performer': { name: '장기 활약형', english: 'Consistent Performer', peak: [22, 34], description: '넓은 전성기 구간을 오래 유지하는 경향이에요.' },
    'complete-technician': { name: '완성형 테크니션', english: 'Complete Technician', peak: [27, 34], description: '점진적으로 발전하고 전성기를 오래 유지하는 경향이에요.' },
    'late-bloomer': { name: '대기만성형', english: 'Late Bloomer', peak: [30, 34], description: '초기 성장은 느리고 늦은 나이에 전성기를 맞는 경향이에요.' },
  });
  const DEPARTMENTS = { attack: '공격', midfield: '미드필더', defence: '수비', goalkeeping: '골키퍼' };
  const TYPES = { coach: '코치', senior: '이적시장 스카우트', youth: '유스 스카우트' };
  const STATUSES = { candidate: '고용 후보', hired: '고용 중', released: '계약 종료' };
  const text = (value, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const validNumber = (value, min, max) => value !== '' && value != null && ['number', 'string'].includes(typeof value) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : '';
  function department(position) {
    if (position === 'GK') return 'goalkeeping';
    if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return 'defence';
    if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return 'midfield';
    return 'attack';
  }
  function profile(value) {
    if (typeof value !== 'string' || !value) return '';
    if (Object.hasOwn(PROFILES, value)) return value;
    const key = String(value).trim().toLowerCase();
    return Object.entries(PROFILES).find(([id, entry]) =>
      [id, entry.name, entry.english].some(label => label.toLowerCase() === key))?.[0] ?? '';
  }
  function reference(raw) {
    const type = profile(raw?.type);
    if (!type || !['cmtracker', 'ea-base'].includes(raw.source)) return null;
    const result = { type, source: raw.source };
    if (typeof raw.snapshot === 'string' && /^20\d{6}$/.test(raw.snapshot)) result.snapshot = raw.snapshot;
    if (raw.source === 'cmtracker' && typeof raw.url === 'string' && raw.url.length <= 500) {
      try {
        const url = new URL(raw.url);
        if (url.protocol === 'https:' && ['cmtracker.net', 'www.cmtracker.net'].includes(url.hostname) &&
            !url.username && !url.password && !url.port && /^(?:\/[a-z]{2})?\/players\/\d{8}\/\d+(?:\/[a-z0-9-]+)?\/?$/.test(url.pathname)) {
          result.url = url.origin + url.pathname;
        }
      } catch {
        // The profile still has its provider attribution if a link is unavailable.
      }
    }
    return result;
  }
  function playerProfile(player, notes = {}, scenario = '') {
    const trial = profile(scenario);
    if (trial) return { type: trial, label: PROFILES[trial].name, source: 'scenario', url: null };
    if (notes.growthProfile) {
      const type = profile(notes.growthProfile);
      return { type, label: PROFILES[type]?.name ?? notes.growthProfile, source: 'save', url: null };
    }
    const data = reference(player.profile?.growth);
    return data ? { ...data, label: PROFILES[data.type].name, url: data.url ?? (data.source === 'cmtracker' ? SOURCES.cmtracker : SOURCES.eaBase) } : null;
  }
  const PROFILE_SOURCES = { save: '세이브 기록', scenario: '비교용 시나리오', cmtracker: 'CMTracker', 'ea-base': 'FC27 기본 로스터' };
  function peakWindow(type, age) {
    const peak = PROFILES[type]?.peak ?? null;
    if (!peak || age == null) return { peak, phase: '', yearsToPeak: null };
    return {
      peak, phase: age < peak[0] ? '성장 구간' : age <= peak[1] ? '전성기 구간' : '전성기 이후 구간',
      yearsToPeak: Math.max(0, peak[0] - age),
    };
  }
  function outlook(player, notes = {}, seasons = 4) {
    const origin = playerProfile(player, notes);
    const age = notes.saveAge ?? player.age;
    const timing = peakWindow(origin?.type, age);
    const latest = notes.checkpoints?.length ? checkpoints(notes.checkpoints).findLast(row => row.position === player.positions[0]) : null;
    const baseline = player.statEdit ? player.overall : latest?.overall ?? player.overall;
    const potential = notes.dynamicPot ?? player.potential ?? notes.potLow ?? null;
    const gap = potential == null ? null : Math.max(0, potential - baseline);
    const pastPeak = timing.peak && age != null && age > timing.peak[1];
    const overlap = timing.peak && age != null
      ? Math.max(0, Math.min(age + seasons, timing.peak[1] + 1) - Math.max(age, timing.peak[0])) : null;
    const timingWeight = timing.yearsToPeak == null ? .75 : Math.max(.35, Math.min(1, seasons / Math.max(1, timing.yearsToPeak)));
    const bonus = !gap || pastPeak ? 0 : Math.round((gap * (.55 + .60 * timingWeight) + .45 * (overlap ?? 0)) * 10) / 10;
    return { origin, age, baseline, recordedBaseline: !!latest, potential, gap, seasons, overlap, bonus, ...timing };
  }
  function staff(raw = []) {
    const ids = new Set();
    const list = [];
    for (const row of Array.isArray(raw) ? raw.slice(0, 100) : []) {
      if (!row || !text(row.id) || !text(row.name) || ids.has(row.id)) continue;
      ids.add(row.id);
      const next = {
        id: text(row.id), name: text(row.name, 80),
        type: Object.hasOwn(TYPES, row.type) ? row.type : 'coach',
        status: Object.hasOwn(STATUSES, row.status) ? row.status : 'candidate',
        department: Object.hasOwn(DEPARTMENTS, row.department) ? row.department : 'attack',
        head: row.head === true, date: validDate(row.date), country: text(row.country, 80),
        currency: ['eur', 'gbp', 'usd'].includes(row.currency) ? row.currency : 'eur',
        knowledge: text(row.knowledge, 80), mission: text(row.mission, 240), notes: text(row.notes, 1000),
      };
      for (const key of ['attack', 'midfield', 'defence', 'goalkeeping', 'experience', 'judgement']) {
        const value = validNumber(row[key], 1, 5);
        if (value !== null) next[key] = value;
      }
      for (const key of ['fee', 'weeklyWage', 'missionCost']) {
        const value = validNumber(row[key], 0, 1e10);
        if (value !== null) next[key] = value;
      }
      const capacity = validNumber(row.capacity, 0, 1000);
      if (capacity !== null) next.capacity = capacity;
      list.push(next);
    }
    return list;
  }
  function saveStaff(list, raw) {
    const next = staff([raw])[0];
    if (!next) throw new Error('스태프 이름과 기록을 확인해주세요.');
    if (list.length >= 100 && !list.some(row => row.id === next.id)) throw new Error('스태프 기록은 최대 100명까지 저장할 수 있어요.');
    const remaining = list.filter(row => row.id !== next.id);
    if (next.status === 'hired' && next.type === 'coach' && remaining.filter(row => row.type === 'coach' && row.status === 'hired').length >= 12) {
      throw new Error('고용 중인 코치가 12명이에요. 교체할 코치의 계약 상태를 먼저 변경해주세요.');
    }
    const updated = remaining.map(row => next.status === 'hired' && next.type === 'coach' && next.head && row.type === 'coach' &&
      row.status === 'hired' && row.department === next.department ? { ...row, head: false } : row);
    return [...updated, next];
  }
  function checkpoints(raw) {
    const result = new Map();
    for (const row of Array.isArray(raw) ? raw.slice(-120) : []) {
      const date = validDate(row?.date), overall = validNumber(row?.overall, 1, 99);
      const position = text(row?.position, 4);
      if (!date || overall === null || !/^[A-Z]{1,4}$/.test(position)) continue;
      const entry = { date, position, overall, assessor: text(row.assessor, 80), staffId: text(row.staffId),
        stars: validNumber(row.stars, 1, 5), potentialLow: validNumber(row.potentialLow, 1, 99),
        potentialHigh: validNumber(row.potentialHigh, 1, 99), profile: profile(row.profile) };
      if (entry.potentialLow != null && entry.potentialHigh != null && entry.potentialLow > entry.potentialHigh) continue;
      result.set(date + ':' + position, entry);
    }
    return [...result.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  function headCoach(list, position) {
    const group = department(position);
    return list.find(row => row.type === 'coach' && row.status === 'hired' && row.head && row.department === group) ?? null;
  }
  function assess(player, notes, list, position, scenario = '') {
    const origin = playerProfile(player, notes, scenario);
    const id = origin?.type ?? '';
    const selected = PROFILES[id] ?? null;
    const age = notes.saveAge ?? player.age;
    const timing = peakWindow(id, age);
    const coach = headCoach(list, position);
    const history = checkpoints(notes.checkpoints).filter(row => row.position === position);
    const latest = history.at(-1), previous = history.at(-2);
    const initial = position === player.positions[0] ? player.overall : null;
    const baseline = latest?.overall ?? initial;
    const potential = notes.dynamicPot ?? player.potential ?? notes.potHigh ?? null;
    const gap = baseline == null || potential == null ? null : Math.max(0, potential - baseline);
    const gain = previous && latest ? latest.overall - previous.overall : null;
    const days = previous && latest ? Math.round((Date.parse(latest.date) - Date.parse(previous.date)) / 86400000) : null;
    let projection = null;
    if (days > 0) {
      const change = gain * 365 / days;
      const ceiling = change > 0 ? Math.max(latest.overall, potential ?? 99) : 99;
      projection = Math.round(Math.max(1, Math.min(ceiling, latest.overall + change)) * 10) / 10;
    }
    return { profile: id, origin, selected, age, ...timing, coach, department: department(position),
      baseline, potential, gap, history, gain, days, projection };
  }
  return { SOURCES, PROFILES, PROFILE_SOURCES, DEPARTMENTS, TYPES, STATUSES, department, profile, reference, playerProfile,
    outlook, staff, saveStaff, checkpoints, headCoach, assess };
});
