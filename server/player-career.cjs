'use strict';

const ENDPOINT = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'TouchlineFC27/2.0 (local personal football profile viewer)';
const QID = /^Q[1-9]\d*$/;
const nameKey = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const claims = (entity, property) => (entity?.claims?.[property] ?? []).filter(claim => claim.rank !== 'deprecated');
const itemId = claim => claim.mainsnak?.datavalue?.value?.id;
const nations = new Map(Object.entries({
  korearepublic: 'southkorea', republicofkorea: 'southkorea', koreadpr: 'northkorea',
  chinapr: 'china', peoplerepublicofchina: 'china', unitedstatesofamerica: 'unitedstates',
  usa: 'unitedstates', czechrepublic: 'czechia', republicofireland: 'ireland',
  ivorycoast: 'cotedivoire', turkiye: 'turkey', congord: 'democraticrepublicofthecongo',
}));
const nationKey = value => nations.get(nameKey(value)) ?? nameKey(value);

function dateLabel(snak, precision = 9) {
  const date = snak?.datavalue?.value;
  const parts = /^\+(\d{4})-(\d{2})-(\d{2})T/.exec(date?.time ?? '');
  if (!parts || date.precision < precision) return null;
  const [, year, month, day] = parts;
  if (date.precision >= 11 && day !== '00' && month !== '00') return `${year}-${month}-${day}`;
  if (precision >= 11) return null;
  if (date.precision >= 10 && month !== '00') return `${year}-${month}`;
  return year;
}

function identity(entity, player, snapshot) {
  const footballer = claims(entity, 'P106').some(claim => itemId(claim) === 'Q937857') ||
    claims(entity, 'P641').some(claim => itemId(claim) === 'Q2736');
  if (!footballer) return null;
  const births = claims(entity, 'P569').map(claim => ({ rank: claim.rank, date: dateLabel(claim.mainsnak, 11) }))
    .filter(entry => entry.date);
  const preferred = births.filter(entry => entry.rank === 'preferred');
  const birthDates = [...new Set((preferred.length ? preferred : births).map(entry => entry.date))];
  if (!birthDates.length || !Number.isInteger(player.age)) return null;
  const year = Number(snapshot.slice(0, 4));
  const fitsAge = birthDates.some(date => {
    const birthday = date.slice(5).replace('-', '');
    const age = year - Number(date.slice(0, 4)) - (snapshot.slice(4) < birthday ? 1 : 0);
    return Math.abs(age - player.age) <= 1;
  });
  if (!fitsAge) return null;
  const countries = [...new Set(['P1532', 'P27'].flatMap(prop => claims(entity, prop).map(itemId)).filter(id => QID.test(id ?? '')))];
  const teams = claims(entity, 'P54').map(claim => ({
    id: itemId(claim),
    from: dateLabel(claim.qualifiers?.P580?.[0]),
    to: dateLabel(claim.qualifiers?.P582?.[0]),
  })).filter(team => QID.test(team.id ?? '')).slice(0, 40);
  return { birthDates, countries, teams };
}

function createCareerProvider(fetchImpl = fetch) {
  const cache = new Map();
  async function lookup(player, snapshot) {
    const first = player.profile?.givenName, last = player.profile?.familyName;
    const fullName = first && last ? `${first} ${last}` : '';
    const names = [...new Set([fullName, player.englishName].filter(name => name?.trim().includes(' ')))];
    if (!names.length || !player.nationality || !/^\d{8}$/.test(snapshot ?? '')) return null;

    const signal = AbortSignal.timeout(11000);
    async function request(params) {
      const url = ENDPOINT + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
      const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, redirect: 'error', signal });
      if (!response.ok) throw new Error('Wikidata HTTP ' + response.status);
      const data = await response.json();
      if (data.error) throw new Error('Wikidata response error');
      return data;
    }

    const nameKeys = new Set([...names, first && last ? `${last} ${first}` : ''].filter(Boolean).map(nameKey));
    let ids = [];
    for (const name of names) {
      const data = await request({ action: 'wbsearchentities', search: name, language: 'en', limit: '6' });
      ids = (data.search ?? []).filter(result => QID.test(result.id) &&
        [result.label, result.match?.text].some(label => nameKeys.has(nameKey(label)))).map(result => result.id);
      if (ids.length) break;
    }
    if (!ids.length) return null;

    const { entities } = await request({ action: 'wbgetentities', ids: [...new Set(ids)].join('|'), props: 'claims' });
    const candidates = Object.entries(entities ?? {}).map(([id, entity]) => [id, identity(entity, player, snapshot)])
      .filter(([id, candidate]) => QID.test(id) && candidate?.countries.length);
    if (candidates.length !== 1) return null;
    const [sourceId, candidate] = candidates[0];
    const related = [...new Set([...candidate.countries, ...candidate.teams.map(team => team.id)])].slice(0, 50);
    const labels = (await request({ action: 'wbgetentities', ids: related.join('|'), props: 'labels|aliases', languages: 'ko|en' })).entities ?? {};
    const countryNames = candidate.countries.flatMap(id => {
      const entity = labels[id];
      return [...Object.values(entity?.labels ?? {}), ...Object.values(entity?.aliases ?? {}).flat()].map(label => label.value);
    });
    if (!countryNames.some(name => nationKey(name) === nationKey(player.nationality))) return null;

    const memberships = new Map();
    for (const team of candidate.teams) {
      const name = labels[team.id]?.labels?.ko?.value ?? labels[team.id]?.labels?.en?.value;
      if (typeof name !== 'string' || !name.trim()) continue;
      memberships.set(`${team.id}:${team.from}:${team.to}`, { name: name.trim().slice(0, 120), from: team.from, to: team.to });
    }
    return {
      sourceId,
      birthDates: candidate.birthDates,
      memberships: [...memberships.values()].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? '')),
    };
  }

  return {
    load(player, snapshot) {
      const key = `${snapshot}:${player.id}`;
      const previous = cache.get(key);
      if (previous && Date.now() < previous.expires) return previous.promise;
      const entry = { expires: Date.now() + 86400000 };
      entry.promise = lookup(player, snapshot).catch(() => {
        entry.expires = Date.now() + 60000;
        return { unavailable: true };
      });
      cache.delete(key);
      cache.set(key, entry);
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return entry.promise;
    },
  };
}

module.exports = { createCareerProvider };
