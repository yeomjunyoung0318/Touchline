'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const M = require('../src/career-market.js');
const D = require('../src/career-development.js');
const R = require('../src/career-ranking.js');
const X = require('../src/ai-context.js');
const T = require('../server/ai-tools.cjs');
const { mapPlayer } = require('../server/fcradar.cjs');
const { createApp } = require('../server.cjs');
const { createMockProvider } = require('../server/mock-provider.cjs');

function player(id, patch = {}) {
  const original = C.demoPlayers()[3];
  return C.normalizePlayer({
    ...original, id: 'fcradar-fc27-' + id, source: 'import', name: '후보 ' + id, club: 'Example FC',
    positions: ['CM'], overall: 80, age: 21, potential: 88,
    profile: { league: 'England Premier League (1)', roleIds: [20], marketValue: { eur: 5000000 }, wage: { eur: 10000 }, ...patch.profile },
    ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'profile')),
  });
}
function catalog(players) {
  const byId = new Map(players.map(player => [player.id, player]));
  return { players, get: id => byId.get(id), display: player => player, gender: () => 'male',
    date: '20261103', facets: { genderKnown: players.length, leagues: [], teams: [], nationalities: [] } };
}
function scout(players, input = {}, saved = []) {
  return R.scout({ input: { position: 'CM', role: 'deep-lying-playmaker', roleFocus: 'build-up', ...input },
    squad: C.newSquad(), players: [], saved, catalog: catalog(players) });
}

test('FC27 mapping retains monetary zero, free agent status, original positions and actual role IDs', () => {
  const mapped = mapPlayer({
    id: 123456, name: 'Player', position: 'CM', positions: ['CM', 'CAM'], overall_rating: 80,
    market_value: { eur: 0, gbp: 250000, usd: 'bad' }, wage: { eur: 10000 },
    roles: [120, 31], free_agent: true, real_face: false, international_rep: 3,
  });
  assert.deepEqual(mapped.profile.marketValue, { eur: 0, gbp: 250000 });
  assert.deepEqual(mapped.profile.roleIds, [120, 31]);
  assert.equal(mapped.profile.freeAgent, true);
  assert.equal(mapped.profile.realFace, false);
  assert.deepEqual(mapped.profile.preferredPositions, ['CM', 'CAM']);
  assert.equal(C.FC_IQ.roleLevel(mapped.profile.roleIds, 'CM', 'deep-lying-playmaker'), 2);
  assert.equal(C.FC_IQ.roleLevel(mapped.profile.roleIds, 'CDM', 'deep-lying-playmaker'), 0);
  assert.equal(C.FC_IQ.roleLevel(undefined, 'CM', 'deep-lying-playmaker'), null);
});

test('scouting compares role mastery, keeps players unchanged and enforces position and money limits', () => {
  const regular = player(1), mastered = player(2, { profile: { roleIds: [120] } });
  const expensive = player(3, { profile: { marketValue: { eur: 90000000 } } });
  const keeper = player(4, { positions: ['GK'] });
  const records = [regular, mastered, expensive, keeper];
  const before = JSON.stringify(records);
  const result = scout(records, { roleLevel: 1, feeLimit: 6000000, wageLimit: 15000, naturalOnly: true });
  assert.equal(result.total, 2);
  assert.equal(result.overBudget, 1);
  assert.equal(result.rows[0].player.id, mastered.id);
  assert.equal(result.rows[0].report.role.level, 2);
  assert.equal(JSON.stringify(records), before);
  assert.equal(scout(records, { roleLevel: 2 }).rows.length, 1);
});

test('unknown fees do not pass a budget filter and recorded figures only apply in the recorded currency', () => {
  const unknown = player(1, { profile: { marketValue: {} } });
  assert.equal(scout([unknown], { feeLimit: 1000000 }).total, 0);
  assert.equal(scout([unknown], { feeLimit: 1000000 }).unknownBudget, 1);
  assert.equal(scout([unknown], { feeLimit: 1000000, allowUnknown: true }).rows[0].report.budget, 'unknown');
  const saved = [{ player: unknown, observation: { currency: 'eur', expectedFee: 900000 }, list: 'watch' }];
  assert.equal(scout([unknown], { currency: 'eur', feeLimit: 1000000 }, saved).total, 1);
  assert.equal(scout([unknown], { currency: 'gbp', feeLimit: 1000000 }, saved).total, 0);
});

test('loans keep unknown terms unknown, free agents have no club transfer fee and blocked targets stay excluded', () => {
  const free = player(1, { profile: { league: 'Free Agents League', freeAgent: false } });
  const regular = player(2);
  const result = scout([free, regular]);
  assert.equal(result.rows.find(row => row.player.id === free.id).report.route, 'free');
  assert.equal(result.rows.find(row => row.player.id === free.id).report.finance.upfront, 0);
  const loan = scout([regular], { route: 'loan', feeLimit: 1000000 });
  assert.equal(loan.total, 0);
  assert.equal(loan.unknownBudget, 1);
  assert.equal(scout([regular], {}, [{ player: regular, observation: {}, list: 'block' }]).total, 0);
});

test('Dynamic OVR is used for its recorded position and academy potential remains a range', () => {
  const original = player(1, { positions: ['CM', 'CAM'] });
  const notes = { dynamicOvr: 90, dynamicPosition: 'CM', potLow: 81, potHigh: 94 };
  const cm = R.evaluate(original, M.options({ position: 'CM', focus: 'ready' }), notes);
  const cam = R.evaluate(original, M.options({ position: 'CAM', focus: 'ready' }), notes);
  assert.equal(cm.dynamicOvr, 90);
  assert.equal(cam.dynamicOvr, null);
  assert.equal(original.overall, 80);
  assert.equal(cm.potential, 88);
  const academy = player(2, { potential: null });
  assert.equal(R.evaluate(academy, M.options({ position: 'CM' }), notes).potential, 81);
  assert.equal(academy.potential, null);
});

test('transfer accounting does not double-count installments, buy options or conditional bonuses', () => {
  const offer = M.deal({
    fee: 200000, deferred: 50000, installments: 2, weeklyWage: 10000, wageShare: 50,
    signingBonus: 1000, agentFee: 2000, route: 'loan-buy', buyOption: 1000000,
    performanceBonus: 25000, loanMonths: 12,
  });
  const summary = M.amounts(offer);
  assert.equal(summary.upfront, 153000);
  assert.equal(summary.guaranteed, 203000);
  assert.equal(summary.deferred, 50000);
  assert.equal(summary.wage, 5000);
  assert.equal(summary.totalWages, 260000);
  assert.equal(summary.option, 1000000);
  assert.equal(summary.bonuses, 25000);
  assert.throws(() => M.amounts(M.deal({ fee: 100, deferred: 200, installments: 2 })), /이하여야/);
  const free = M.amounts(M.deal({ route: 'free', fee: 1000000, deferred: 500000, signingBonus: 50000 }));
  assert.equal(free.upfront, 50000);
  assert.equal(free.deferred, 0);
});

test('parallel club and player agreements are required before completing a transfer and history survives edits', () => {
  assert.throws(() => M.saveOffer({ disposition: 'completed', playerTalk: 'agreed', fee: 100 }), /구단·선수 합의/);
  const agreed = M.saveOffer({ disposition: 'completed', clubTalk: 'agreed', playerTalk: 'agreed', fee: 100, date: '2026-11-11' });
  assert.equal(agreed.disposition, 'completed');
  const unchanged = M.saveOffer(agreed, agreed);
  assert.deepEqual(unchanged.history, agreed.history);
  assert.equal(M.saveOffer({ route: 'free', disposition: 'completed', playerTalk: 'agreed' }).disposition, 'completed');
});

test('career workspace survives a full backup while private scouting notes stay outside AI context', () => {
  const state = C.initialState({ includeDemo: false });
  const candidate = player(1);
  state.squads[0].career = M.workspace({
    settings: { careerClub: 'Example FC', feeLimit: 25000000 },
    targets: [{ player: candidate, list: 'watch', observation: { notes: 'Private save note', reports: ['finance'] }, deal: { fee: 5000000 } }],
    staff: [{ id: 'staff-1', name: '수석 코치', type: 'coach', status: 'hired', department: 'midfield', head: true, midfield: 5 }],
  }, C.normalizePlayer);
  const checked = C.validateBackup(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(checked.squads[0].career, state.squads[0].career);
  const context = X.prepare({ players: checked.players, squad: checked.squads[0] });
  assert.equal(context.squad.career, undefined);
  assert.ok(!JSON.stringify(context).includes('Private save note'));
});

test('hiring a new head coach updates the evaluator without manufacturing player growth', () => {
  const first = { id: 'first', name: '기존 미드필더 코치', type: 'coach', department: 'midfield', status: 'hired', head: true, midfield: 3 };
  const second = { id: 'second', name: '신규 미드필더 코치', type: 'coach', department: 'midfield', status: 'candidate', head: true, midfield: 5 };
  const candidates = D.saveStaff(D.saveStaff([], first), second);
  const afterHire = D.saveStaff(candidates, { ...second, status: 'hired' });
  assert.equal(D.headCoach(candidates, 'CM').id, 'first');
  assert.equal(D.headCoach(afterHire, 'CM').id, 'second');
  assert.equal(afterHire.find(row => row.id === 'first').head, false);
  const p = player(1);
  const before = D.assess(p, {}, candidates, 'CM');
  const after = D.assess(p, {}, afterHire, 'CM');
  assert.equal(before.gap, 8);
  assert.equal(after.gap, 8);
  assert.equal(after.projection, null);
  assert.equal(after.coach.midfield, 5);
  assert.equal(D.headCoach(afterHire, 'GK'), null);
});

test('development scenarios change the peak window and recorded growth compares the same position only', () => {
  const p = player(1);
  const notes = {
    saveAge: 28, growthProfile: 'Explosive Start',
    checkpoints: [
      { date: '2026-08-01', position: 'CM', overall: 80, assessor: '기존 코치', stars: 3 },
      { date: '2026-11-01', position: 'CM', overall: 82, assessor: '신규 코치', stars: 5 },
      { date: '2027-01-01', position: 'CAM', overall: 85 },
    ],
  };
  const exact = D.assess(p, notes, [], 'CM');
  const scenario = D.assess(p, notes, [], 'CM', 'late-bloomer');
  assert.equal(Object.keys(D.PROFILES).length, 6);
  assert.deepEqual(exact.selected.peak, [22, 27]);
  assert.deepEqual(scenario.selected.peak, [30, 34]);
  assert.equal(exact.phase, '전성기 이후 구간');
  assert.equal(scenario.phase, '성장 구간');
  assert.equal(exact.gain, 2);
  assert.equal(exact.history[0].stars, 3);
  assert.equal(exact.history[1].stars, 5);
  assert.equal(exact.projection, 88);
  assert.equal(scenario.projection, exact.projection);
  assert.equal(D.assess(p, {}, [], 'CM').selected, null);
});

test('youth scouting uses the verified profile, time to peak and saved main-position OVR', () => {
  const early = player(1, { profile: { growth: { type: 'Meteoric Peak', source: 'ea-base' } } });
  const late = player(2, { profile: { growth: { type: 'Late Bloomer', source: 'ea-base' } } });
  const pastPeak = player(3, { age: 35, profile: { growth: { type: 'default', source: 'ea-base' } } });
  const options = { focus: 'youth', growthSeasons: 4 };
  const { rows } = scout([late, early, pastPeak], options);
  assert.deepEqual(rows.map(row => row.player.id), [early.id, late.id, pastPeak.id]);
  const first = rows[0].report.development;
  assert.equal(first.origin.source, 'ea-base');
  assert.deepEqual(first.peak, [22, 30]);
  assert.equal(first.yearsToPeak, 1);
  assert.equal(first.overlap, 3);
  assert.equal(first.gap, 8);
  assert.equal(rows[2].report.development.bonus, 0);
  assert.ok(scout([late], { ...options, growthSeasons: 6 }).rows[0].report.score > rows[1].report.score);

  const observation = M.observation({
    growthProfile: 'complete-technician', dynamicPot: 91,
    checkpoints: [
      { date: '2027-08-01', position: 'CM', overall: 85 },
      { date: '2027-09-01', position: 'CAM', overall: 89 },
    ],
  });
  const saved = [{ player: early, list: 'watch', observation }];
  const [changed] = scout([early], { ...options, growthProfile: 'complete-technician', minGrowth: 6 }, saved).rows;
  assert.equal(changed.report.development.origin.source, 'save');
  assert.equal(changed.report.development.gap, 6);
  assert.equal(changed.report.development.baseline, 85);
  assert.deepEqual(changed.report.development.peak, [27, 34]);
  assert.equal(scout([early], { ...options, minGrowth: 7 }, saved).total, 0);
});

test('conversion-only scouting honors selected FC IQ roles and keeps locked places out of trial placement', () => {
  const converted = player(1, { positions: ['CAM'] });
  const preferred = player(2);
  const keeper = player(3, { positions: ['GK'] });
  const before = JSON.stringify(converted);
  const { rows, settings } = scout([converted, preferred, keeper], { deployment: 'conversion' });
  assert.deepEqual(rows.map(row => row.player.id), [converted.id]);
  assert.equal(rows[0].report.fit.kind, 'other');
  const squad = C.newSquad();
  const places = squad.slots.filter(slot => slot.pos === 'CM');
  places[0].playerId = preferred.id;
  places[0].locked = true;
  const find = id => id === preferred.id ? preferred : null;
  const [plan] = R.conversionPlans(converted, { ...settings, slotId: places[0].id }, squad, find);
  assert.equal(plan.position, 'CM');
  assert.equal(plan.role.id, 'deep-lying-playmaker');
  assert.equal(plan.role.focus, 'build-up');
  assert.equal(plan.slotId, places[1].id);
  assert.equal(plan.ovr, C.estimateOverall(converted, 'CM'));
  assert.match(plan.cover, /홀딩/);
  assert.equal(JSON.stringify(converted), before);
  assert.deepEqual(R.conversionPlans(keeper, settings, squad, find), []);
  places[1].playerId = converted.id;
  places[1].locked = true;
  assert.ok(R.conversionPlans(converted, settings, squad, find).every(plan => plan.slotId === null));
});

test('career scouting HTTP endpoint uses the existing local token and returns a usable report', async t => {
  const players = [player(1), player(2)];
  const app = createApp({
    provider: createMockProvider(), port: 0, configReader: () => ({ keyConfigured: false }),
    playerDatabase: { status: () => ({ count: players.length }), view: () => catalog(players) },
  });
  const base = await app.listen();
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const status = await fetch(base + '/api/status').then(response => response.json());
  const path = base + '/api/career/scout';
  const body = JSON.stringify({ settings: { position: 'CM', minOvr: 75 }, context: { players: [], squad: C.newSquad() }, targets: [] });
  assert.equal((await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Touchline-Token': status.token }, body });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.total, 2);
  assert.equal(report.rows[0].report.finance.currency, 'eur');
  assert.equal(report.rows[0].report.role.name.length > 0, true);
  const supportBody=JSON.stringify({settings:{position:'CAM'},playerId:players[0].id,context:{players:[],squad:C.newSquad()},targets:[]});
  assert.equal((await fetch(base+'/api/career/support',{method:'POST',headers:{'Content-Type':'application/json'},body:supportBody})).status,403);
  const support=await fetch(base+'/api/career/support',{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':status.token},body:supportBody});
  assert.equal(support.status,200);
  assert.ok((await support.json()).plans.some(plan=>plan.position==='CAM'&&plan.support));
});

test('scouting, squad selection and AI use the same saved growth and role assessment', () => {
  const players=[player(701,{profile:{growth:{type:'late-bloomer',source:'ea-base'}}}),player(702)];
  const squad=C.newSquad();
  const observation=M.observation({saveAge:23,dynamicPot:95,growthProfile:'meteoric-peak',
    notes:'private scout note',checkpoints:[{date:'2027-08-01',position:'CM',overall:83,assessor:'private coach'}]});
  const settings=M.options({focus:'youth',growthSeasons:6,position:'CM',role:'deep-lying-playmaker',roleFocus:'build-up'});
  squad.career=M.workspace({settings,targets:[{player:players[0],list:'watch',observation}]},C.normalizePlayer);
  const context=X.prepare({players,squad});
  assert.ok(!JSON.stringify(context).includes('private'));
  assert.deepEqual(X.prepare(JSON.parse(JSON.stringify(context))),context);
  const scored=R.evaluate(players[0],settings,observation);
  assert.equal(C.recommendationScore(players[0],'CM','possession','youth',observation,settings),scored.score);
  const ai=T.execute('scout_players',{position:'CM',query:'',role:'deep-lying-playmaker',roleFocus:'build-up',
    style:null,focus:null,deployment:null,growthSeasons:null,maxAge:null,minPotential:null,
    careerClub:null,careerStage:null,gender:null},context,catalog(players));
  const actual=ai.result.rows.find(row=>row.player.id===players[0].id);
  assert.equal(actual.report.score,scored.score);
  assert.equal(actual.report.development.baseline,83);
  assert.equal(actual.report.development.seasons,6);
  const args={style:'possession',focus:'youth',formation:'current',maxAge:null,minOverall:null,minPotential:null,
    excludedPlayerIds:[],fixedPlayerIds:[]};
  const direct=C.recommend(players,squad,'possession','youth','current');
  const remote=T.recommendForContext(args,context,catalog(players));
  assert.deepEqual(remote.plan.slots,direct.slots);
  assert.equal(remote.plan.score,direct.score);
});

test('conversion cover uses actual teammates, excludes the displaced player and respects combined budgets', () => {
  const main=player(801,{positions:['CAM']});
  const attributes=Object.fromEntries(C.ATTRIBUTES.map(([key])=>[key,85]));
  const local=player(802,{positions:['CDM','CM'],attributes});
  const cheap=player(803,{positions:['CDM','CM'],attributes,profile:{marketValue:{eur:2000000}}});
  const expensive=player(804,{positions:['CDM','CM'],attributes,profile:{marketValue:{eur:4000000}}});
  const squad=C.newSquad(),cdm=squad.slots.find(slot=>slot.pos==='CDM');
  cdm.playerId=local.id;
  const settings=M.options({position:'CM',deployment:'conversion',feeLimit:7000000,wageLimit:25000});
  const args={player:main,settings,squad,players:[local],catalog:catalog([main,local,cheap,expensive])};
  const covered=R.conversionSupport(args)[0].support;
  assert.equal(covered.status,'covered');
  assert.equal(covered.current[0].player.id,local.id);
  assert.equal(covered.current[0].position,'CDM');
  assert.equal(covered.recruits.length,0);
  const injured=R.conversionSupport({...args,saved:[{player:local,observation:{injury:'severe'}}]})[0].support;
  assert.equal(injured.status,'weak');
  assert.deepEqual(injured.recruits.map(row=>row.player.id),[cheap.id]);
  assert.equal(injured.recruits[0].combinedFee,7000000);
  assert.equal(injured.recruits[0].combinedWage,20000);
  cdm.playerId=null;
  squad.slots.find(slot=>slot.pos==='CM').playerId=local.id;
  const displaced=R.conversionSupport({...args,settings:{...settings,slotId:squad.slots.find(slot=>slot.playerId===local.id).id}})[0];
  assert.ok(displaced.support.current.every(row=>row.player.id!==local.id));
});
