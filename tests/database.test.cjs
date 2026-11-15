'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../src/core.js');
const X = require('../src/ai-context.js');
const T = require('../server/ai-tools.cjs');
const { createFCRadarProvider } = require('../server/fcradar.cjs');
const { createPlayerDatabase } = require('../server/player-database.cjs');
const { createCareerProvider } = require('../server/player-career.cjs');
const { createApp, hashContext } = require('../server.cjs');

const date = '20261103';
const config = {
  model: 'fixture', effort: 'medium', keyConfigured: true,
  fcradarKeyConfigured: true, fcradarApiKey: 'fixture-key',
  fcradarImageCdnBaseUrl: 'https://pub-api.fcradar.gg/cdn/fixture-public-token/',
};
const record = (id, name = 'Fixture ' + id, position = 'CM') =>
  ({ id, name, position, positions: [position], overall_rating: 80, age: 21, potential: 89, has_image: true, playstyles: [], playstyle_plus: [],
    height_cm: 185, weight_kg: 75, league: { name: 'Fixture League' }, club: { name: 'Fixture Club' }, nation: { name: 'Korea Republic' } });
const player = id => ({ id: 'fcradar-fc27-' + id, source: 'import', name: 'Fixture ' + id, positions: ['CM'], overall: 80, playstyles: [], playstyle_plus: [],
  profile: { heightCm: 185, weightKg: 75 } });

function temporaryFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'touchline-catalog-'));
  t.after(() => {
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  return path.join(directory, 'catalog.json');
}
function emptyContext() {
  const state = C.initialState({ includeDemo: false });
  return X.prepare({ players: [], squad: state.squads[0] });
}
function fixtureProvider(records) {
  return createFCRadarProvider(async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://pub-api.fcradar.gg');
    assert.equal(options.headers.Authorization, 'Bearer ' + config.fcradarApiKey);
    if (target.pathname.endsWith('/snapshots')) {
      return Response.json({ data: [{ snapshot: date, playerCount: records.length, isActive: true }] });
    }
    if (target.pathname.endsWith('/leagues')) return Response.json({ data: [
      { leagueName: 'Fixture League', isWomenCompetition: false }, { leagueName: 'Women Fixture League', isWomenCompetition: true },
      { leagueName: 'Free Agents League', isWomenCompetition: false },
    ] });
    assert.equal(target.searchParams.get('snapshot'), date);
    assert.equal(target.searchParams.get('sort'), 'name');
    assert.equal(target.searchParams.get('per_page'), '100');
    return Response.json({ data: records, meta: { currentPage: 1, total: records.length } });
  });
}
test('free-agent gender follows the roster category for search and recommendation',async t=>{
  const db=createPlayerDatabase(temporaryFile(t),{intervalMs:0});
  await db.refresh(fixtureProvider([
    {...record(99001),league:{name:'Free Agents League'},club:{name:'NG - FA'}},
    {...record(99002),league:{name:'Free Agents League'},club:{name:'NG - FA Women'}},
  ]),config);
  const catalog=db.view(config);
  assert.equal(catalog.gender(catalog.get('fcradar-fc27-99002')),'female');
  assert.deepEqual(catalog.search({},{gender:'male'}).players.map(row=>row.id),['fcradar-fc27-99001']);
  assert.deepEqual(catalog.search({},{gender:'female'}).players.map(row=>row.id),['fcradar-fc27-99002']);
});
test('player database preserves LF and distinguishes supported weights from missing stats', async t => {
  const file = temporaryFile(t);
  const db = createPlayerDatabase(file, { intervalMs: 0 });
  const source = fixtureProvider([record(238794, 'Vini Jr.', 'LF'), record(200104, 'Son Heung Min', 'ST')]);
  await db.refresh(source, config);
  assert.deepEqual([db.status().count, db.status().unmodeled, db.status().skipped], [2, 0, 0]);
  const saved = fs.readFileSync(file, 'utf8');
  assert.ok(!saved.includes(config.fcradarApiKey) && !saved.includes('fixture-public-token'));
  const catalog = createPlayerDatabase(file).view(config);
  const [son] = catalog.search({ search: '손흥민' }, { maxAge: 22, minPotential: 88 }).players;
  assert.equal(son.name, '손흥민');
  assert.match(son.imageUrl, /FC27\/heads\/200104\.png$/);
  assert.equal(catalog.search({}, { maxAge: 20 }).total, 0);
  const vini = catalog.get('fcradar-fc27-238794');
  assert.equal(vini.name, '비니시우스 JR');
  assert.deepEqual(vini.positions, ['LF']);
  const analysis = T.execute('analyze_position', { playerId: vini.id, position: 'LW' }, emptyContext(), catalog);
  assert.equal(analysis.result.estimate, null);
  assert.ok(analysis.result.missing.length);
  assert.deepEqual(analysis.artifact.payload.players[0].positions, ['LF']);
  assert.equal(T.execute('get_player_details', { playerIds: [vini.id] }, emptyContext(), catalog).result[0].unsupportedBaseline, false);
});

test('verified growth sources join by EA player ID and authorized CMTracker data takes priority', async t => {
  const file = temporaryFile(t);
  const folder = path.dirname(file);
  const base = { game: 'FC27', version: 1, provider: 'ea-base', groups: { 1: [243780, 51] } };
  const cmtracker = { game: 'FC27', version: 1, provider: 'cmtracker', snapshot: date, players: [
    { playerId: 243780, growthProfile: 'Late Bloomer', url: 'https://cmtracker.net/en/players/20261103/243780/lee-kang-in' },
    { playerId: 51, growthProfile: 'Unknown profile' },
    { playerId: 52, growthProfile: 'Explosive Start', url: 'https://cmtracker.net/en/players/20261103/521/other-player' },
  ] };
  fs.writeFileSync(path.join(folder, 'fc27-growth-profiles.json'), JSON.stringify(base));
  fs.writeFileSync(path.join(folder, 'cmtracker-growth-profiles.json'), JSON.stringify(cmtracker));
  const db = createPlayerDatabase(file, { intervalMs: 0 });
  await db.refresh(fixtureProvider([record(243780), record(51), record(52), record(53)]), config);
  const reopened = createPlayerDatabase(file);
  const view = reopened.view(config);
  const lee = view.get('fcradar-fc27-243780');
  assert.deepEqual(lee.profile.growth, { type: 'late-bloomer', source: 'cmtracker', snapshot: date, url: cmtracker.players[0].url });
  assert.equal(view.get('fcradar-fc27-51').profile.growth.source, 'ea-base');
  assert.equal(view.get('fcradar-fc27-52').profile.growth.url, undefined);
  assert.equal(view.get('fcradar-fc27-53').profile.growth, undefined);
  assert.equal(reopened.status().growthKnown, 3);
  const [details] = T.execute('get_player_details', { playerIds: [lee.id] }, emptyContext(), view).result;
  assert.deepEqual(details.development.peakAges, [30, 34]);
});

test('an interrupted database sync resumes from a saved page and keeps the previous complete database on failure', async t => {
  const file = temporaryFile(t);
  const db = createPlayerDatabase(file, { intervalMs: 0 });
  const total = 1001;
  let fail = true;
  const pages = [];
  const source = {
    loadActiveSnapshot: async () => ({ date, total }),
    async loadSnapshotPage(_date, page) {
      pages.push(page);
      if (page === 11 && fail) throw new Error('fixture interruption');
      const count = Math.min(100, total - (page - 1) * 100);
      return { page, total, received: count, players: Array.from({ length: count }, (_, i) => player((page - 1) * 100 + i + 1)) };
    },
  };
  await assert.rejects(db.refresh(source, config), /fixture interruption/);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(file + '.pending'), true);
  fail = false;
  pages.length = 0;
  const resumed = createPlayerDatabase(file, { intervalMs: 0 });
  await resumed.refresh(source, config);
  assert.deepEqual(pages, [11]);
  assert.equal(resumed.status().count, total);
  assert.equal(fs.existsSync(file + '.pending'), false);

  const before = fs.readFileSync(file, 'utf8');
  const badUpdate = {
    loadActiveSnapshot: async () => ({ date: '20261110', total }),
    loadSnapshotPage: async () => ({ page: 1, total, received: 0, players: [] }),
  };
  await assert.rejects(resumed.refresh(badUpdate, config), /페이지 수/);
  assert.equal(resumed.status().date, date);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('a same-date version 2 snapshot gets both playstyle tiers without replacing an incomplete refresh', async t => {
  const file = temporaryFile(t);
  const { playstyles, playstyle_plus, profile, ...legacy } = player(200104);
  const before = JSON.stringify({ version: 2, date, total: 1, updatedAt: new Date().toISOString(), players: [legacy] });
  fs.writeFileSync(file, before);
  const db = createPlayerDatabase(file, { intervalMs: 0 });
  assert.equal(db.status().playstyleKnown, 0);
  const withoutTraits = { ...record(200104), playstyles: undefined, playstyle_plus: undefined };
  await assert.rejects(db.refresh(fixtureProvider([withoutTraits]), config), /플레이스타일/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  const regular = [{ id: 0, slug: 'finesse-shot' }];
  const plus = [{ id: 25, slug: 'quick-step' }];
  await db.refresh(fixtureProvider([{ ...record(200104), playstyles: regular, playstyle_plus: plus }]), config);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 5);
  assert.deepEqual(saved.players[0].playstyles, regular);
  assert.deepEqual(saved.players[0].playstyle_plus, plus);
  assert.equal(db.status().playstyleKnown, 1);
  assert.equal(db.status().playstylePlusCount, 1);
  assert.equal(db.status().bodyKnown, 1);
  assert.equal(db.status().genderKnown, 1);
});

test('the local catalog supports search, style and AI placement before any manual roster import', async t => {
  const file = temporaryFile(t);
  const db = createPlayerDatabase(file, { intervalMs: 0 });
  await db.refresh(fixtureProvider([
    record(222222, '검증미드필더', 'LF'),
    { ...record(333333, 'Unrelated Catalog Player', 'GK'), height_cm: 175, league: { name: 'Women Fixture League' }, club: { name: 'Women Fixture Club' } },
    { ...record(444444, 'Another Catalog Player', 'CM'), weight_kg: 90, club: { name: 'Another Club' } },
  ]), config);
  const context = emptyContext();
  const slot = context.squad.slots.find(slot => slot.pos === 'CM');
  const id = 'fcradar-fc27-222222';
  let requests = 0;
  const toolCall = (name, args) => ({ output: [{ type: 'function_call', call_id: 'fixture-' + name, name, arguments: JSON.stringify(args) }] });
  const provider = { mode: 'mock', async request(body) {
    requests++;
    const serialized = JSON.stringify(body.input);
    assert.ok(!serialized.includes('fixture-public-token'));
    assert.ok(!serialized.includes('Unrelated Catalog Player'));
    if (requests === 1) {
      assert.match(serialized, /catalogCount/);
      return toolCall('search_players', { query: '검증미드필더', position: null, maxAge: null, minOverall: null, minPotential: null, sort: 'overall', playstyles: [] });
    }
    if (requests === 2) {
      assert.match(serialized, /fcradar-fc27-222222/);
      return toolCall('propose_player_move', { playerId: id, targetSlotId: slot.id });
    }
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: 'DB 선수 배치안을 준비했어요.' }] }] };
  } };
  const app = createApp({ port: 0, provider, playerDatabase: db, configReader: () => config,
    careerProvider: { async load(row) {
      assert.equal(row.id, id);
      return { sourceId: 'Q439722', birthDates: ['1992-07-08'], memberships: [{ name: '공개 이력 검증 팀', from: '2015', to: '2025' }] };
    } },
    playerProvider: { async search() { assert.fail('catalog search must stay local'); } } });
  const url = await app.listen();
  t.after(() => new Promise(resolve => { app.server.closeAllConnections(); app.server.close(resolve); }));
  const status = await (await fetch(url + '/api/status')).json();
  const post = (route, body) => fetch(url + route, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Touchline-Token': status.token }, body: JSON.stringify(body) });
  const found = await (await post('/api/players/search', { search: '검증미드필더', maxAge: 22, minPotential: 88 })).json();
  assert.equal(found.mode, 'catalog');
  assert.equal(found.players[0].id, id);
  const { facets } = await (await fetch(url + '/api/players/database/filters')).json();
  assert.deepEqual(facets.leagues.find(league => league.gender === 'female').teams, ['Women Fixture Club']);
  assert.deepEqual(facets.ranges.height, [175,185]);
  const filtered = await (await post('/api/players/search', { gender: 'male', league: 'Fixture League', team: 'Fixture Club',
    nationality: '대한민국', minAge: '21', maxAge: '22', minPotential: 88, maxPotential: 89,
    minHeight: 180, maxHeight: 185, minWeight: 70, maxWeight: 75 })).json();
  assert.deepEqual(filtered.players.map(row => row.id), [id]);
  assert.equal((await post('/api/players/search', { minHeight: 185, maxHeight: 180 })).status, 400);
  const detail = await (await fetch(url + `/api/players/database/${id}/profile`)).json();
  assert.deepEqual([detail.player.profile.heightCm, detail.player.profile.weightKg, detail.gender, detail.snapshot], [185,75,'male',date]);
  assert.deepEqual(detail.career.birthDates, ['1992-07-08']);
  const styleOptions = {
    style: 'possession', focus: 'youth', formation: 'auto', maxAge: null, minOverall: null, minPotential: null,
    excludedPlayerIds: [], fixedPlayerIds: [],
  };
  const style = await (await post('/api/squads/recommend', { context, options: styleOptions })).json();
  assert.equal(style.eligibleCount, 3);
  assert.deepEqual(new Set(style.players.map(p => p.id)), new Set([id, 'fcradar-fc27-333333', 'fcradar-fc27-444444']));
  for (const [gender, expectedIds] of [['female', ['fcradar-fc27-333333']], ['male', [id, 'fcradar-fc27-444444']]]) {
    const response = await post('/api/squads/recommend', { context, options: { ...styleOptions, gender } });
    assert.equal(response.status, 200);
    const filtered = await response.json();
    assert.equal(filtered.eligibleCount, expectedIds.length);
    assert.deepEqual(new Set(filtered.players.map(p => p.id)), new Set(expectedIds));
  }
  const fixed = structuredClone(context);
  fixed.players.push(db.view(config).get(id));
  Object.assign(C.findSlot(fixed.squad, slot.id), { playerId: id, locked: true });
  const women = await (await post('/api/squads/recommend', { context: fixed, options: { ...styleOptions, gender: 'female' } })).json();
  assert.equal(women.eligibleCount, 2);
  assert.deepEqual(C.findSlot(women.squad, slot.id), C.findSlot(fixed.squad, slot.id));
  assert.deepEqual(women.players.map(p => p.id), ['fcradar-fc27-333333']);
  assert.equal((await post('/api/squads/recommend', { context, options: { ...styleOptions, gender: 'invalid' } })).status, 400);
  const chat = await post('/api/chat', { context, message: '검증미드필더를 CM에 배치해줘', snapshotHash: hashContext(context) });
  assert.equal(chat.status, 200);
  const done = (await chat.text()).trim().split('\n').map(JSON.parse).find(event => event.type === 'done');
  assert.equal(requests, 3);
  assert.equal(C.findSlot(done.artifacts[0].payload.squad, slot.id).playerId, id);
  assert.deepEqual(done.artifacts[0].payload.players.map(p => p.id), [id]);
  assert.deepEqual(done.artifacts[0].payload.players[0].positions, ['LF']);
  assert.equal(context.players.length, 0);
});

test('public career lookup requires matching football identity and caches a confirmed player', async () => {
  const item = id => ({ rank: 'normal', mainsnak: { datavalue: { value: { id } } } });
  const time = (iso, precision) => ({ datavalue: { value: { time: '+' + iso + 'T00:00:00Z', precision } } });
  const player = { id: 'fcradar-fc27-200104', englishName: 'Son Heung Min', nationality: 'Korea Republic', age: 34,
    profile: { givenName: 'Heung Min', familyName: 'Son' } };
  const entity = { claims: {
    P106: [item('Q937857')], P27: [item('Q884')],
    P569: [{ rank: 'normal', mainsnak: time('1992-07-08', 11) }],
    P54: [{ ...item('Q18741'), qualifiers: { P580: [time('2015-00-00', 9)], P582: [time('2025-00-00', 9)] } }],
  } };
  let requests = 0;
  const provider = createCareerProvider(async (input, options) => {
    requests++;
    const target = new URL(input);
    assert.equal(target.origin, 'https://www.wikidata.org');
    assert.ok(!options.headers.Authorization);
    if (target.searchParams.get('action') === 'wbsearchentities') {
      return Response.json({ search: [{ id: 'Q439722', label: 'Son Heung-min' }] });
    }
    if (target.searchParams.get('props') === 'claims') return Response.json({ entities: { Q439722: entity } });
    return Response.json({ entities: { Q884: { labels: { en: { value: 'South Korea' } } }, Q18741: { labels: { ko: { value: '토트넘 홋스퍼' } } } } });
  });
  const expected = { sourceId: 'Q439722', birthDates: ['1992-07-08'], memberships: [{ name: '토트넘 홋스퍼', from: '2015', to: '2025' }] };
  assert.deepEqual(await provider.load(player, date), expected);
  assert.deepEqual(await provider.load(player, date), expected);
  assert.equal(requests, 3);
  assert.equal(await provider.load({ ...player, id: 'fcradar-fc27-10000', age: 18 }, date), null);
});
