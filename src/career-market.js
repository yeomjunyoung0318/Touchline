(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./career-development.js') : root.CareerDevelopment);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CareerMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Development) {
  'use strict';

  const CURRENCIES = { eur: 'EUR (€)', gbp: 'GBP (£)', usd: 'USD ($)' };
  const STAGES = { start: '첫 시즌', build: '승격·안착', contender: '우승·유럽 대항전', fantasy: '제한 없이' };
  const ROUTES = {
    any: '전체 영입 경로', buy: '완전 영입', loan: '임대', 'loan-buy': '완전 영입 옵션부 임대',
    free: '자유계약', precontract: '계약 만료 접근',
  };
  const LISTS = { watch: '관심 명단', transfer: '이적 명단', loan: '임대 명단', block: '제안 차단', academy: '유스 아카데미' };
  const REPORTS = { tactics: '전술 적합도', future: '성장 전망', finance: '재정 평가', status: '선수 상태' };
  const LEVELS = { low: '낮음', medium: '보통', high: '높음', 'very-high': '매우 높음' };
  const FORM = { poor: '부진', normal: '보통', good: '좋음', excellent: '매우 좋음' };
  const MORALE = { unhappy: '불만', neutral: '보통', happy: '만족', excellent: '매우 만족' };
  const FITNESS = { unfit: '출전 곤란', recovering: '회복 중', good: '양호', peak: '최상' };
  const INJURY = { none: '없음', light: '경미', medium: '중간', severe: '심각', recovery: '회복 중' };
  const SQUAD_ROLES = { prospect: '유망주', sporadic: '간헐적 출전', rotation: '로테이션', important: '중요', crucial: '핵심' };
  const TIMING = { now: '즉시', window: '다음 이적시장', season: '다음 시즌 시작' };
  const WINDOWS = { open: '이적시장 열림', closed: '이적시장 닫힘', disabled: '이적 활동 비활성화' };
  const DIRECTIONS = { incoming: '영입', outgoing: '방출·임대', renewal: '재계약' };
  const ENQUIRY = { planned: '문의 예정', sent: '문의 발송', permitted: '협상 허가', declined: '문의 거절' };
  const TALKS = { pending: '대기', active: '협상 중', agreed: '합의', counter: '재협상', declined: '결렬' };
  const DISPOSITION = { open: '진행 중', completed: '완료', withdrawn: '철회' };
  const TERM_NUMBERS = {
    fee: [1e10, '이적료 / 임대료'], deferred: [1e10, '이적료 중 분할 지급액'], installments: [12, '분할 횟수'],
    weeklyWage: [1e8, '계약 주급'], years: [10, '계약 기간 (년)'], signingBonus: [1e10, '계약 보너스'],
    agentFee: [1e10, '에이전트 수수료'], achievementBonus: [1e10, '업적 보너스'], performanceBonus: [1e10, '성과 보너스 상한'],
    sellOn: [100, '재판매 수익 (%)'], buyBack: [1e10, '바이백 금액'], buyOption: [1e10, '완전 영입 옵션 금액'],
    releaseClause: [1e10, '바이아웃 금액'], loanMonths: [24, '임대 기간 (개월)'], loanBackMonths: [24, '재임대 기간 (개월)'],
    wageShare: [100, '임대 주급 부담 (%)'], promotionRaise: [100, '승격·대륙 대회 진출 시 주급 인상 (%)'],
    relegationCut: [100, '강등 시 주급 인하 (%)'],
  };
  const MAX_TARGETS = 150;
  const text = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const choice = (value, options, fallback = '') => typeof value === 'string' && Object.hasOwn(options, value) ? value : fallback;
  const number = (value, min, max) => value !== '' && value != null && ['number', 'string'].includes(typeof value) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const timestamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : '';
  }
  function options(raw = {}) {
    raw ??= {};
    return {
      slotId: /^xi-(?:[0-9]|10)$/.test(raw.slotId ?? '') ? raw.slotId : '',
      position: ['GK','LB','CB','RB','CDM','LM','CM','RM','CAM','LW','RW','ST'].includes(raw.position) ? raw.position : 'CM',
      role: text(raw.role, 32), roleFocus: text(raw.roleFocus, 20),
      roleLevel: number(raw.roleLevel, 1, 2), naturalOnly: raw.naturalOnly === true,
      deployment: ['any', 'natural', 'conversion'].includes(raw.deployment) ? raw.deployment : raw.naturalOnly === true ? 'natural' : 'any',
      style: text(raw.style, 20) || 'possession', focus: text(raw.focus, 20) || 'balanced',
      growthSeasons: [2, 4, 6].includes(Number(raw.growthSeasons)) ? Number(raw.growthSeasons) : 4,
      careerClub: text(raw.careerClub), careerLeague: text(raw.careerLeague), careerStage: choice(raw.careerStage, STAGES, 'start'),
      gameDate: date(raw.gameDate), window: choice(raw.window, WINDOWS, 'open'),
      currency: choice(raw.currency, CURRENCIES, 'eur'),
      feeLimit: number(raw.feeLimit, 0, 1e10), wageLimit: number(raw.wageLimit, 0, 1e8), allowUnknown: raw.allowUnknown === true,
      squadFeeLimit: number(raw.squadFeeLimit, 0, 1e10), squadWageLimit: number(raw.squadWageLimit, 0, 1e8),
      allowSales: raw.allowSales === true,
      maxSales: number(raw.maxSales, 0, 5) ?? 3,
      saleValuePercent: number(raw.saleValuePercent, 10, 100) ?? 80,
      saleReinvestmentPercent: number(raw.saleReinvestmentPercent, 0, 100) ?? 100,
      query: text(raw.query), gender: ['male', 'female'].includes(raw.gender) ? raw.gender : '',
      league: text(raw.league), club: text(raw.club), nation: text(raw.nation),
      minAge: number(raw.minAge, 14, 65), maxAge: number(raw.maxAge, 14, 65),
      minOvr: number(raw.minOvr, 1, 99), maxOvr: number(raw.maxOvr, 1, 99),
      minPot: number(raw.minPot, 1, 99), maxPot: number(raw.maxPot, 1, 99), minGrowth: number(raw.minGrowth, 0, 98),
      growthProfile: Development.profile(raw.growthProfile),
      minHeight: number(raw.minHeight, 100, 250), minWeakFoot: number(raw.minWeakFoot, 1, 5), minSkill: number(raw.minSkill, 1, 5),
      foot: ['Right', 'Left', 'Both'].includes(raw.foot) ? raw.foot : '',
      trait: /^[a-z0-9-]{1,64}$/.test(raw.trait ?? '') ? raw.trait : '', traitPlus: raw.traitPlus === true,
      route: choice(raw.route, ROUTES, 'any'), excludeSquad: raw.excludeSquad !== false,
      scope: ['market', 'academy', 'squad'].includes(raw.scope) ? raw.scope : 'market',
      includeHistoric: raw.includeHistoric === true,
      sort: ['fit', 'ovr', 'potential', 'growth', 'age', 'value', 'wage'].includes(raw.sort) ? raw.sort : 'fit',
    };
  }
  function observation(raw = {}) {
    raw ??= {};
    const result = {};
    const enums = { interest: LEVELS, form: FORM, morale: MORALE, fitness: FITNESS, injury: INJURY, squadRole: SQUAD_ROLES };
    for (const [key, values] of Object.entries(enums)) {
      const value = choice(raw[key], values);
      if (value) result[key] = value;
    }
    const bounds = {
      dynamicOvr: [1, 99], dynamicPot: [1, 99], potLow: [1, 99], potHigh: [1, 99], energy: [0, 100],
      scoutExperience: [1, 5], scoutJudgement: [1, 5], games: [0, 500], goals: [0, 500], assists: [0, 500],
      minutes: [0, 60000], injuredWeeks: [0, 104], expectedFee: [0, 1e10], expectedWage: [0, 1e8], expectedSaleFee: [0, 1e10],
      xTV: [0, 1e10], releaseClause: [0, 1e10], saveAge: [14, 65],
    };
    for (const [key, [min, max]] of Object.entries(bounds)) {
      const value = number(raw[key], min, max);
      if (value !== null) result[key] = value;
    }
    for (const [key, limit] of [['dynamicPosition', 4], ['growthProfile', 80], ['developmentPhase', 80], ['scout', 60], ['scoutId', 100], ['notes', 1200]]) {
      const value = text(raw[key], limit);
      if (value) result[key] = value;
    }
    const contractDate = date(raw.contractDate);
    if (contractDate) result.contractDate = contractDate;
    const currency = choice(raw.currency, CURRENCIES);
    if (currency) result.currency = currency;
    if (Array.isArray(raw.reports)) result.reports = Object.keys(REPORTS).filter(key => raw.reports.includes(key));
    if (Array.isArray(raw.checkpoints)) result.checkpoints = Development.checkpoints(raw.checkpoints);
    return result;
  }
  function deal(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const result = {
      direction: choice(raw.direction, DIRECTIONS, 'incoming'), route: choice(raw.route, ROUTES, 'buy'),
      currency: choice(raw.currency, CURRENCIES, 'eur'), timing: choice(raw.timing, TIMING, 'now'),
      enquiry: choice(raw.enquiry, ENQUIRY, 'planned'), clubTalk: choice(raw.clubTalk, TALKS, 'pending'),
      playerTalk: choice(raw.playerTalk, TALKS, 'pending'), disposition: choice(raw.disposition, DISPOSITION, 'open'),
      squadRole: choice(raw.squadRole, SQUAD_ROLES), date: date(raw.date),
      delegate: raw.delegate === true, firstRefusal: raw.firstRefusal === true,
      competingClub: text(raw.competingClub), swapPlayer: text(raw.swapPlayer), bonusTerms: text(raw.bonusTerms, 500),
      notes: text(raw.notes, 1200), tension: number(raw.tension, 0, 100),
    };
    if (result.route === 'any') result.route = 'buy';
    for (const [key, [max]] of Object.entries(TERM_NUMBERS)) {
      const value = number(raw[key], ['installments', 'years', 'loanMonths'].includes(key) ? 1 : 0, max);
      if (value !== null) result[key] = value;
    }
    result.history = (Array.isArray(raw.history) ? raw.history : []).filter(entry => entry && text(entry.label, 300))
      .slice(-40).map(entry => ({ date: date(entry.date), label: text(entry.label, 300) }));
    return result;
  }
  function amounts(offer) {
    const clubFeeApplies = offer.direction !== 'renewal' && !['free', 'precontract'].includes(offer.route);
    const fee = clubFeeApplies ? (offer.fee ?? 0) : 0;
    const deferred = clubFeeApplies ? (offer.deferred ?? 0) : 0;
    if (deferred > fee) throw new Error('분할 지급액은 총 이적료 이하여야 해요.');
    if (deferred && !offer.installments) throw new Error('분할 지급 횟수를 입력해주세요.');
    const loan = offer.direction !== 'renewal' && ['loan', 'loan-buy'].includes(offer.route);
    const wage = offer.weeklyWage == null ? null : Math.round(offer.weeklyWage * (loan ? (offer.wageShare ?? 100) / 100 : 1));
    const playerCosts = offer.direction !== 'outgoing' ? (offer.signingBonus ?? 0) + (offer.agentFee ?? 0) : 0;
    const upfront = fee - deferred + playerCosts;
    const guaranteed = fee + playerCosts;
    const bonuses = (offer.achievementBonus ?? 0) + (offer.performanceBonus ?? 0);
    const weeks = loan ? (offer.loanMonths ?? 0) * 52 / 12 : (offer.years ?? 0) * 52;
    return {
      upfront, guaranteed, deferred, installments: deferred ? offer.installments : 0,
      perInstallment: deferred ? Math.floor(deferred / offer.installments) : 0,
      installmentRemainder: deferred ? deferred % offer.installments : 0,
      wage, bonuses, option: offer.route === 'loan-buy' ? (offer.buyOption ?? 0) : 0,
      loan, cashKnown: !clubFeeApplies || offer.fee != null,
      totalWages: wage == null || !weeks ? null : Math.round(wage * weeks),
    };
  }
  function saveOffer(raw, previous) {
    const next = deal(raw);
    amounts(next);
    const needsClub = next.direction !== 'renewal' && !['free', 'precontract'].includes(next.route);
    if (next.disposition === 'completed' && (next.playerTalk !== 'agreed' || (needsClub && next.clubTalk !== 'agreed'))) {
      throw new Error('완료를 기록하려면 필요한 구단·선수 합의를 먼저 표시해주세요.');
    }
    const changes = [];
    for (const [key, values, label] of [
      ['enquiry', ENQUIRY, '문의'], ['clubTalk', TALKS, '구단'], ['playerTalk', TALKS, '선수'], ['disposition', DISPOSITION, '진행'],
    ]) {
      if (next[key] !== previous?.[key]) changes.push(label + ' ' + values[next[key]]);
    }
    if (next.competingClub && next.competingClub !== previous?.competingClub) changes.push('경쟁 구단 ' + next.competingClub);
    next.history = [...(previous?.history ?? []), ...(changes.length ? [{ date: next.date, label: changes.join(' · ') }] : [])].slice(-40);
    return next;
  }
  function workspace(raw, normalizePlayer) {
    const targets = [];
    const ids = new Set();
    for (const item of (Array.isArray(raw?.targets) ? raw.targets.slice(0, MAX_TARGETS) : [])) {
      try {
        const row = normalizePlayer(item.player);
        if (ids.has(row.id)) continue;
        ids.add(row.id);
        if (row.imageUrl.startsWith('data:')) row.imageUrl = '';
        targets.push({
          player: row, list: choice(item.list, LISTS, 'watch'), position: text(item.position, 4),
          role: text(item.role, 32), roleFocus: text(item.roleFocus, 20), route: choice(item.route, ROUTES, 'buy'),
          observation: observation(item.observation), deal: deal(item.deal),
        });
      } catch {
        // One stale shortlist record should not prevent the squad from loading.
      }
    }
    return { settings: options(raw?.settings), targets, staff: Development.staff(raw?.staff) };
  }
  function money(value, currency) {
    if (value == null) return '미확인';
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value);
  }
  return {
    CURRENCIES, STAGES, ROUTES, LISTS, REPORTS, LEVELS, FORM, MORALE, FITNESS, INJURY, SQUAD_ROLES,
    TIMING, WINDOWS, DIRECTIONS, ENQUIRY, TALKS, DISPOSITION, TERM_NUMBERS, MAX_TARGETS,
    options, observation, deal, amounts, saveOffer, workspace, money,
  };
});
