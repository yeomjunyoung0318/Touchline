'use strict';
const { nameKey, searchText, clubNameAliases } = require('./fcradar-aliases.cjs');

const STAGES = {
  start: { label: '첫 시즌', improvement: 6, clubGap: 6, leagueGap: 6, divisionGap: 1 },
  build: { label: '승격·안착 후', improvement: 10, clubGap: 10, leagueGap: 9, divisionGap: 2 },
  contender: { label: '유럽대항전·우승 경쟁 단계', improvement: 15, clubGap: 15, leagueGap: 14, divisionGap: 3 },
  fantasy: { label: '자유 구성' },
};
const FIT = {
  current: { type: 'current', bonus: 12, reason: '현재 소속팀 · 잔류 우선' },
  currentUnrestricted: { type: 'current', bonus: 0, reason: '현재 소속팀' },
  domestic: { type: 'domestic', bonus: 5, reason: '국내 동급·인접 전력에서 보강' },
  comparable: { type: 'comparable', bonus: -4, reason: '해외의 비슷한 전력에서 문의할 후보' },
  unrestricted: { type: 'unrestricted', bonus: 0, reason: '사용자 요청 · 이적 현실성 제한 해제' },
  loan: { type: 'loan', bonus: -6, reason: '상위 전력 구단의 유망주 · 임대 문의 후보' },
  free: { type: 'free-agent', bonus: -3, reason: 'DB 기준 자유계약 · 영입 문의 후보' },
  freeDomestic: { type: 'free-agent', bonus: 3, reason: 'DB 기준 자유계약 · 국내 시장 후보' },
  fixed: { type: 'fixed', bonus: 0, reason: '사용자 지정 선수 · 영입 현실성 기준 예외' },
};
const FREE_AGENT_LEAGUE = 'Free Agents League';
const ASSOCIATION_NATIONALITY = { Korea: 'Korea Republic', Holland: 'Netherlands', USA: 'United States', 'Rep.': 'Republic of Ireland' };
const CAREER_CLUB_SUFFIX = /^(?:(?:여자|여성|남자|남성|우먼스|women)(?:팀|구단)?)?(?:(?:으로|로)(?:커리어|감독|시작|재건|리빌딩|맞추|맞춰)|(?:을|를)(?:챔결|챔스|챔피언스리그|유럽대항전|승격|끌어올|재건|리빌딩|유망주팀)|에(?:맞는|맞게|데려올|영입할|넣을|어울리)|에서(?:커리어|감독)|커리어|재건|리빌딩|첫시즌|career|rebuild|firstseason)/;
const indexedCatalogs = new WeakMap();
const intentKey = value => nameKey(value).normalize('NFC');

function clubIndex(catalog) {
  if (!catalog?.players?.length) return null;
  const cached = indexedCatalogs.get(catalog.players);
  if (cached) return cached;
  const teams = new Map(), owners = new Map(), byId = new Map();
  for (const player of catalog.players) {
    byId.set(player.id, player);
    const league = player.profile?.league;
    if (!player.club || !league || league === FREE_AGENT_LEAGUE || /\bcustom\b/i.test(league) || /\bclassic\b/i.test(player.club)) continue;
    const key = league + '\n' + player.club;
    if (!teams.has(key)) {
      const tier = league.match(/\((\d+)\)$/)?.[1];
      teams.set(key, { name: player.club, key: nameKey(player.club), league, association: tier ? league.split(' ')[0] : null,
        tier: tier ? Number(tier) : null, gender: catalog.gender?.(player) ?? null, ratings: [] });
    }
    const team = teams.get(key);
    team.ratings.push(player.overall);
    owners.set(player.id, team);
  }
  const clubs = [...teams.values()];
  const leagueRatings = new Map();
  for (const club of clubs) {
    club.ratings.sort((a, b) => b - a);
    const reference = club.ratings.slice(0, 11);
    club.strength = Math.round(reference.reduce((total, rating) => total + rating, 0) / reference.length);
    club.starterFloor = club.ratings[10] ?? null;
    club.ratingSample = reference.length;
    if (club.tier && club.ratingSample >= 8) {
      if (!leagueRatings.has(club.league)) leagueRatings.set(club.league, []);
      leagueRatings.get(club.league).push(club.strength);
    }
  }
  const leagueStrengths = new Map([...leagueRatings].filter(([, ratings]) => ratings.length >= 5).map(([league, ratings]) => {
    ratings.sort((a, b) => a - b);
    const middle = Math.floor(ratings.length / 2);
    return [league, (ratings[middle] + ratings[Math.floor((ratings.length - 1) / 2)]) / 2];
  }));
  const mentions = new Map(clubs.filter(club => club.key).map(club => [intentKey(club.key), club.name]));
  for (const alias of clubNameAliases) {
    const matches = clubMatches(clubs, alias);
    if (matches.length && matches.every(club => club.name === matches[0].name)) mentions.set(intentKey(alias), matches[0].name);
  }
  const index = { clubs, owners, byId, mentions, leagueStrengths };
  indexedCatalogs.set(catalog.players, index);
  return index;
}

function clubMatches(clubs, name, gender) {
  const key = nameKey(searchText('club', name));
  const available = gender ? clubs.filter(club => club.gender === gender) : clubs;
  const exact = available.filter(club => club.key === key);
  return exact.length || key.length < 4 ? exact : available.filter(club => club.key.startsWith(key) || club.key.endsWith(key));
}

function mentionedClub(message, catalog) {
  const index = clubIndex(catalog);
  if (!index) return null;
  const phrase = intentKey(message);
  const matches = new Set();
  for (const [alias, club] of index.mentions) {
    if (phrase.includes(alias) && phrase.split(alias).slice(1).some(tail => CAREER_CLUB_SUFFIX.test(tail))) matches.add(club);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

function careerStage(message) {
  const phrase = intentKey(message);
  if (/현실성(?:은|을)?(?:무시하고|빼고|없이|상관없이)|이적현실성제한없이|(?:판타지스쿼드|올스타(?:팀|스쿼드))(?:로|으로)?(?:바꿔|짜|꾸려|만들)/.test(phrase)) return 'fantasy';
  if (/(?:챔스|챔피언스리그|유럽대항전)(?:에)?(?:진출|출전)(?:한뒤|한후|하고나서|한상태|했|이후)|우승경쟁(?:단계에서|중|을하고있)|after(?:qualifyingfor|reaching)(?:the)?championsleague/.test(phrase)) return 'contender';
  if (/승격(?:한뒤|한후|하고나서|하고난뒤|해서|직후|했|한상태|이후)|(?:1부(?:리그)?|epl)(?:에|로)?(?:안착한뒤|안착했|올라왔|올라온)|afterpromotion/.test(phrase)) return 'build';
  if (/첫시즌|첫이적시장|시즌1|첫해|원년|(?:새|새로운)커리어|커리어(?:를)?시작/.test(phrase)) return 'start';
  return null;
}

function recruitmentFor(catalog, clubName, stage = 'start', gender = null, league = null) {
  const index = clubIndex(catalog);
  if (!index) throw new Error('구단에 맞춘 추천은 로컬 선수 DB를 적재한 뒤 사용할 수 있어요.');
  const matches = clubMatches(league ? index.clubs.filter(club => club.league === league) : index.clubs, clubName, gender);
  if (!matches.length) throw new Error('선수 DB에서 해당 구단을 확인하지 못했어요. 구단 이름과 남자·여자 분류를 확인해주세요.');
  if (matches.length !== 1) throw new Error('구단 이름이 겹쳐요. '+matches.slice(0, 4).map(club => club.name+' · '+club.league).join(', ')+' 중에서 구단을 지정해주세요.');
  const club = matches[0], stageRule = STAGES[stage];
  const maximumIncomingOverall = stage === 'fantasy' ? null : Math.min(99, club.strength + stageRule.improvement);
  const homeNation = ASSOCIATION_NATIONALITY[club.association] ?? club.association;
  const info = { club: club.name, league: club.league, gender: club.gender, stage, label: stageRule.label,
    baselineOverall: club.strength, ratingSample: club.ratingSample, maximumIncomingOverall, snapshot: catalog.date ?? null,
    note: '적재된 구단 전력과 소속을 기준으로 한 추정이에요. 실제 협상 가능 여부, 출전 시간, 이적료와 주급은 세이브에서 확인해야 해요.' };

  function fit(player) {
    const row = index.byId.get(player.id), owner = index.owners.get(player.id);
    if (owner === club) return stage === 'fantasy' ? FIT.currentUnrestricted : FIT.current;
    if (!row) return null;
    const freeAgent = row.profile?.league === FREE_AGENT_LEAGUE;
    const gender = freeAgent && /\bwomen\b/i.test(row.club) ? 'female' : catalog.gender?.(row);
    if (club.gender && gender !== club.gender) return null;
    if (stage === 'fantasy') return FIT.unrestricted;
    if (Math.max(row.overall, player.overall) > maximumIncomingOverall) return null;
    if (freeAgent) return homeNation && nameKey(row.nationality) === nameKey(homeNation) ? FIT.freeDomestic : FIT.free;
    if (!owner) return null;
    const sameAssociation = club.association && owner.association === club.association;
    const higherTier = sameAssociation && club.tier - owner.tier > stageRule.divisionGap;
    const strongerClub = owner.strength - club.strength > stageRule.clubGap;
    const sourceLeague = index.leagueStrengths.get(owner.league), targetLeague = index.leagueStrengths.get(club.league);
    const leagueGap = sourceLeague !== undefined && targetLeague !== undefined ? sourceLeague - targetLeague : 0;
    const strongerLeague = leagueGap > stageRule.leagueGap;
    if (stage === 'start' && !sameAssociation && (strongerClub || leagueGap > 3)) return null;
    if (higherTier || strongerClub || strongerLeague) {
      const depthPlayer = owner.starterFloor !== null && row.overall < owner.starterFloor;
      return row.age !== null && row.age <= 22 && depthPlayer ? FIT.loan : null;
    }
    return sameAssociation ? FIT.domestic : FIT.comparable;
  }
  return { info, fit, fixed: FIT.fixed };
}

function scoutingClubs(catalog) {
  return (clubIndex(catalog)?.clubs ?? []).filter(club => club.gender).map(club => ({
    name: club.name, league: club.league, gender: club.gender,
  }));
}

module.exports = { STAGES, mentionedClub, careerStage, recruitmentFor, scoutingClubs };
