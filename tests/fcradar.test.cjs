'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mapPlayer,queryParams,createFCRadarProvider}=require('../server/fcradar.cjs');
const { createFCOnlineNameLoader } = require('../server/fconline-names.cjs');
const {createApp,hashContext}=require('../server.cjs');
const {createMockProvider}=require('../server/mock-provider.cjs');
const C=require('../src/core.js'),X=require('../src/ai-context.js');
const A = require('../src/data-adapter.js');
const raw=()=>({id:123,name:'Fixture Player',position:'CM',positions:['CAM','CM'],overall_rating:80,potential:null,age:null,club:{name:'Fixture Club'},nation:{name:'Fixture Nation'},attributes:{pace:90,dribbling:99},stats:{attacking:{short_passing:84},skill:{fk_accuracy:75,dribbling:82},mentality:{attack_position:78},goalkeeping:{gk_diving:12}}});
const config={apiKey:'fake-openai-test-key',keyConfigured:true,model:'test',effort:'medium',fcradarApiKey:'fake-fcradar-test-key',fcradarKeyConfigured:true};
test('official nested fields map without inventing missing stats, POT, age or photos',()=>{
 const p=mapPlayer(raw());assert.equal(p.id,'fcradar-fc27-123');assert.deepEqual(p.positions,['CM','CAM']);assert.equal(p.attributes.shortPassing,84);assert.equal(p.attributes.freeKickAccuracy,75);assert.equal(p.attributes.positioning,78);assert.equal(p.attributes.dribbling,82);assert.equal(p.attributes.acceleration,undefined);assert.equal(p.potential,null);assert.equal(p.age,null);assert.equal(p.imageUrl,'');assert.equal(C.estimateOverall(p,'ST'),null);
 assert.throws(()=>mapPlayer({...raw(),id:null}));assert.throws(()=>mapPlayer({...raw(),position:'LWB'}));
 assert.equal(p.playstyles,undefined);
 const quickStep={id:25,slug:'quick-step'};
 const withTraits=mapPlayer({...raw(),playstyles:[{id:0,slug:'finesse-shot'},quickStep],playstyle_plus:[quickStep]});
 assert.deepEqual(withTraits.playstyles,[{id:0,slug:'finesse-shot'}]);
 assert.deepEqual(withTraits.playstyle_plus,[quickStep]);
 assert.equal(mapPlayer({...raw(),playstyles:[{id:0,slug:'<script>'}]}).playstyles,undefined);
});
test('portraits use the documented CDN base and never place an API key in a player image URL', () => {
  const player = { ...raw(), has_image: true };
  const base = 'https://pub-api.fcradar.gg/cdn/test-public-image-token/';
  const mapped = mapPlayer(player, { ...config, fcradarImageCdnBaseUrl: base });
  assert.equal(mapped.imageUrl, base + 'FC27/heads/123.png');
  assert.equal(mapPlayer({ ...player, has_image: false }, { ...config, fcradarImageCdnBaseUrl: base }).imageUrl, '');
  const rejected = [
    'https://other.example/cdn/test-public-image-token/',
    'https://pub-api.fcradar.gg/cdn/' + config.fcradarApiKey,
    'https://pub-api.fcradar.gg/cdn/' + config.apiKey,
    base + '?credential=' + config.fcradarApiKey,
  ];
  for (const fcradarImageCdnBaseUrl of rejected) {
    assert.equal(mapPlayer(player, { ...config, fcradarImageCdnBaseUrl }).imageUrl, '');
  }
  const state = C.initialState();
  const context = X.prepare({ players: [mapped, ...state.players], squad: state.squads[0] });
  assert.equal(context.players[0].imageUrl, undefined);
});
test('query is restricted and auth is server-only on fixed origin with redirects blocked',async()=>{
 assert.throws(()=>queryParams({url:'https://example.com'}));assert.throws(()=>queryParams({page:0}));assert.throws(()=>queryParams({minRating:100}));
 let calls=0;const provider=createFCRadarProvider(async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://pub-api.fcradar.gg');assert.equal(u.searchParams.get('search'),'a & b');assert.equal(u.searchParams.get('per_page'),'25');assert.equal(options.headers.Authorization,'Bearer '+config.fcradarApiKey);assert.equal(options.redirect,'error');return Response.json({data:[raw()],meta:{private:'ignored'}});});
 await assert.rejects(()=>provider.search({},{}),e=>e.code==='FCRADAR_KEY_REQUIRED');assert.equal(calls,0);const result=await provider.search({search:'a & b'},config);assert.equal(result.players.length,1);assert.ok(!JSON.stringify(result).includes(config.fcradarApiKey));assert.equal(result.meta,undefined);
});
test('Korean aliases and documented detailed filters map to one player request', async () => {
  let calls = 0;
  const provider = createFCRadarProvider(async url => {
    calls++;
    const filters = new URL(url).searchParams;
    assert.equal(filters.get('search'), 'Courtois');
    assert.equal(filters.get('club'), 'Real Madrid');
    assert.equal(filters.get('nationality'), 'Belgium');
    assert.equal(filters.get('minRating'), '80');
    assert.equal(filters.get('maxRating'), '95');
    assert.equal(filters.get('position'), 'GK');
    assert.equal(filters.get('dir'), 'asc');
    return Response.json({ data: [{ ...raw(), name: 'Thibaut Courtois', position: 'GK', positions: ['GK'] }] });
  });
  const result = await provider.search({
    search: '쿠르투아', club: '레알 마드리드', nationality: '벨기에',
    minRating: 80, maxRating: 95, position: 'GK', dir: 'asc',
  }, config);
  assert.equal(calls, 1);
  assert.equal(result.players[0].name, '티보 쿠르투아');
  assert.equal(result.players[0].englishName, 'Thibaut Courtois');
  assert.equal(C.isApiPlayer(result.players[0]), true);
  assert.equal(queryParams({ search: '미등록 한글 이름' }).get('search'), '미등록 한글 이름');
  assert.throws(() => queryParams({ minRating: 91, maxRating: 80 }), /최대 OVR/);
  assert.throws(() => queryParams({ minPotential: 90 }), /지원하지/);
});
test('a broad SON search keeps readable players and pages past invalid or duplicate rows', async () => {
  const son = {
    ...raw(), id: '200104', name: 'Heung Min Son', position: ' ls ',
    positions: 'ST / CAM, CF', overall_rating: '84', potential: 0, age: '34',
    stats: { skill: { dribbling: '82', fk_accuracy: 0 } },
  };
  const records = [
    son, { ...raw(), position: 'LWB' }, son, { ...raw(), id: 124, overall_rating: 0 },
    ...Array(21).fill(null),
  ];
  const provider = createFCRadarProvider(async url => {
    assert.equal(new URL(url).searchParams.get('search'), 'SON');
    return Response.json({ data: records });
  });
  const result = await provider.search({ search: 'SON' }, config);
  assert.deepEqual([result.received, result.skipped, result.mayHaveMore], [25, 24, true]);
  const [player] = result.players;
  assert.equal(result.players.length, 1);
  assert.equal(player.name, '손흥민');
  assert.equal(player.englishName, 'Heung Min Son');
  assert.deepEqual(player.positions, ['ST', 'CAM']);
  assert.deepEqual([player.overall, player.potential, player.age], [84, null, 34]);
  assert.deepEqual(player.attributes, { dribbling: 82 });
});
test('FC Online names are indexed once, match by player ID, and allow exact Korean search', async () => {
  let metadataCalls = 0;
  const loadNames = createFCOnlineNameLoader(async (url, options) => {
    metadataCalls++;
    assert.equal(url, 'https://open.api.nexon.com/static/fconline/meta/spid.json');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    return Response.json([
      { id: 300188545, name: '레반도프스키' },
      { id: 886188545, name: '레반도프스키' },
      { id: 300247635, name: '크바라츠헬리아' },
      { id: 300238794, name: '비니시우스' },
      { id: 300000123, name: '한글 이름' },
      { id: 886000123, name: '충돌하는 이름' },
    ]);
  });
  const calls = [];
  const provider = createFCRadarProvider(async (url, options) => {
    const path = new URL(url).pathname;
    calls.push(path);
    assert.equal(options.headers.Authorization, 'Bearer ' + config.fcradarApiKey);
    if (path.endsWith('/188545')) {
      return Response.json({ data: {
        ...raw(), id: 188545, name: 'Robert Lewandowski', position: 'ST',
        positions: ['ST'], overall_rating: 89, club: { name: 'FC Barcelona' }, nation: { name: 'Poland' },
      } });
    }
    assert.equal(path, '/v1/games/fc27/players');
    return Response.json({ data: [
      { ...raw(), id: 247635, name: 'Khvicha Kvaratskhelia' },
      { ...raw(), id: 238794, name: 'Vini Jr.' }, raw(),
    ] });
  }, loadNames);
  const [list, exact] = await Promise.all([
    provider.search({}, config),
    provider.search({ search: '레반도프스키', position: 'ST', minRating: 88,
      club: '바르셀로나', nationality: 'Poland' }, config),
  ]);
  assert.deepEqual(list.players.map(p => p.name), ['크바라츠헬리아', '비니시우스 JR', 'Fixture Player']);
  assert.equal(exact.players[0].name, '레반도프스키');
  assert.equal(exact.players[0].englishName, 'Robert Lewandowski');
  assert.equal(exact.mayHaveMore, false);
  assert.deepEqual(calls.sort(), ['/v1/games/fc27/players', '/v1/games/fc27/players/188545']);
  const filtered = await provider.search({ search: '레반도프스키', position: 'GK' }, config);
  assert.equal(filtered.players.length, 0);
  assert.equal(metadataCalls, 1);
  assert.equal(queryParams({ search: '비니시우스 JR' }).get('search'), 'Vinícius');
});
test('search keeps working if the public name catalog is unavailable', async () => {
  const loadNames = createFCOnlineNameLoader(async () => new Response(null, { status: 503 }));
  const provider = createFCRadarProvider(async () => Response.json({
    data: [{ ...raw(), id: 200104, name: 'Son', first_name: 'Heung-Min', last_name: 'Son' }],
  }), loadNames);
  const result = await provider.search({ search: '손흥민' }, config);
  assert.equal(result.players[0].name, '손흥민');
  assert.equal(result.players[0].englishName, 'Son');
});
test('Korean homonyms page through distinct player IDs with a bounded number of requests', async () => {
  const ids = [101, 102, 103, 104, 105];
  const name = '공식 표기';
  const loadNames = createFCOnlineNameLoader(async () =>
    Response.json(ids.map(id => ({ id: 300000000 + id, name }))));
  const queried = [];
  const provider = createFCRadarProvider(async url => {
    const id = Number(new URL(url).pathname.split('/').at(-1));
    queried.push(id);
    return id === 102 ? new Response(null, { status: 404 }) :
      Response.json({ data: { ...raw(), id, name: 'Fixture ' + id } });
  }, loadNames);
  const first = await provider.search({ search: name }, config);
  assert.deepEqual(queried, ids.slice(0, 4));
  assert.equal(first.mayHaveMore, true);
  assert.equal(first.players.length, 3);
  const second = await provider.search({ search: name, page: 2 }, config);
  assert.deepEqual(queried, ids);
  assert.equal(second.mayHaveMore, false);
  assert.equal(second.players[0].id, 'fcradar-fc27-105');
});
test('reimport adds missing photos while preserving roster edits and existing photos', () => {
  const incoming = mapPlayer({ ...raw(), has_image: true }, {
    ...config, fcradarImageCdnBaseUrl: 'https://pub-api.fcradar.gg/cdn/test-public-image-token',
  });
  const edited = { ...incoming, name: '내가 정한 선수 이름', overall: 83, notes: '내 메모', imageUrl: '' };
  const preservedPhoto = { ...edited, id: 'fcradar-fc27-124', imageUrl: 'https://example.com/my-photo.png' };
  const fresh = { ...incoming, id: 'fcradar-fc27-125' };
  const merged = A.mergeApiPlayers([edited, preservedPhoto], [incoming, { ...incoming, id: preservedPhoto.id }, fresh]);
  assert.deepEqual({ added: merged.added, photos: merged.photos, skipped: merged.skipped }, { added: 1, photos: 1, skipped: 1 });
  assert.deepEqual(merged.players[0], { ...edited, imageUrl: incoming.imageUrl });
  assert.deepEqual(merged.players[1], preservedPhoto);
  assert.deepEqual(merged.players[2], fresh);
  assert.equal(edited.imageUrl, '');
});
test('reimport refreshes a sourced Korean name while preserving manually edited names and ratings', () => {
  const oldPlayer = { ...mapPlayer({ ...raw(), id: 238794, name: 'Vini Jr.' }), name: '비니시우스' };
  const edited = { ...oldPlayer, id: 'fcradar-fc27-123', source: 'custom', name: '내가 붙인 이름', overall: 97 };
  const localized = { ...oldPlayer, name: '비니시우스 JR', overall: 91 };
  const merged = A.mergeApiPlayers([oldPlayer, edited], [localized, { ...localized, id: edited.id }]);
  assert.deepEqual(merged.players, [{ ...oldPlayer, name: '비니시우스 JR' }, edited]);
  assert.deepEqual([merged.added, merged.photos, merged.names, merged.skipped], [0, 0, 1, 1]);
});
test('empty, malformed, duplicate, rate limit and upstream messages are handled safely',async()=>{
 assert.deepEqual((await createFCRadarProvider(async()=>Response.json({data:[]})).search({},config)).players,[]);
 await assert.rejects(()=>createFCRadarProvider(async()=>Response.json({players:[raw()]})).search({},config),e=>e.code==='FCRADAR_RESPONSE');
 const duplicate=await createFCRadarProvider(async()=>Response.json({data:[raw(),raw()]})).search({},config);
 assert.deepEqual([duplicate.players.length,duplicate.skipped],[1,1]);
 for(const status of [401,403,429,500])await assert.rejects(()=>createFCRadarProvider(async()=>Response.json({error:config.fcradarApiKey},{status})).search({},config),e=>!e.message.includes(config.fcradarApiKey)&&e.code==='FCRADAR_UPSTREAM');
});
test('local HTTP search to imported player to AI tool response, with token and origin protection',async t=>{
 let calls=0;const app=createApp({port:0,configReader:()=>config,provider:createMockProvider(),playerProvider:createFCRadarProvider(async()=>{calls++;return Response.json({data:[raw()]});})});
 const url=await app.listen();t.after(()=>new Promise(r=>{app.server.closeAllConnections();app.server.close(r);}));
 const status=await(await fetch(url+'/api/status')).json();const readiness=await(await fetch(url+'/api/players/status')).json();assert.deepEqual(readiness,{configured:true,imageCdnConfigured:false,verified:false,mode:'fcradar'});
 const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':status.token,...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/players/search',{}, {'X-Touchline-Token':'bad'})).status,403);assert.equal((await post('/api/players/search',{}, {Origin:'https://example.com'})).status,403);assert.equal(calls,0);
 const response=await post('/api/players/search',{search:'Fixture'});assert.equal(response.status,200);const data=await response.json();assert.equal(calls,1);assert.ok(!JSON.stringify(data).includes(config.fcradarApiKey));
 const state=C.initialState();state.players.push(...data.players);const context=X.prepare({players:state.players,squad:state.squads[0]});assert.ok(context.players.some(p=>p.id==='fcradar-fc27-123'));
 const chat=await post('/api/chat',{message:'현재 포메이션에서 Fixture Player를 CM에 배치하면 어때?',context,snapshotHash:hashContext(context)});assert.equal(chat.status,200);const events=(await chat.text()).trim().split('\n').map(JSON.parse);const done=events.find(e=>e.type==='done');assert.ok(done?.trace.some(entry=>entry.name==='analyze_position'&&entry.ok));assert.match(done.reply,/Fixture Player/);assert.ok(!events.some(e=>e.type==='error'));
});
test('mock mode provides both APIs and two pages of fictional players without configured credentials', async t => {
  const app = createApp({
    port: 0,
    provider: createMockProvider(),
    configReader: () => ({ model: 'test', effort: 'medium', keyConfigured: false, fcradarKeyConfigured: false }),
  });
  const url = await app.listen();
  t.after(() => new Promise(resolve => { app.server.closeAllConnections(); app.server.close(resolve); }));
  const status = await (await fetch(url + '/api/status')).json();
  const readiness = await (await fetch(url + '/api/players/status')).json();
  assert.equal(status.mode, 'mock');
  assert.deepEqual(readiness, { configured: true, imageCdnConfigured: false, verified: false, mode: 'mock' });
  const search = async page => {
    const response = await fetch(url + '/api/players/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Touchline-Token': status.token },
      body: JSON.stringify({ page }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await search(1);
  const second = await search(2);
  assert.equal(first.mode, 'mock');
  assert.equal(first.players.length, 25);
  assert.equal(first.mayHaveMore, true);
  assert.equal(second.players.length, 3);
  assert.equal(second.mayHaveMore, false);
  const players = [...first.players, ...second.players];
  assert.ok(players.every(player => player.source === 'demo' && !player.imageUrl));
  assert.equal(new Set(players.map(player => player.id)).size, 28);
});
