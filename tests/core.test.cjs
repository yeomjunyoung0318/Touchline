'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../src/core.js');
const A=require('../src/data-adapter.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const uniqueSquad=s=>{const ids=C.allSlots(s).map(slot=>slot.playerId).filter(Boolean);assert.equal(ids.length,new Set(ids).size);};

test('FC27 model preserves published coefficients, source, sample counts and 100% totals',()=>{
  assert.equal(C.RATING_MODEL.dataDate,'2026-09-19');assert.equal(C.RATING_MODEL.sampleCount,19789);assert.equal(C.RATING_MODEL.officialFormula,false);assert.equal(C.RATING_MODEL.inGameVerified,false);
  assert.equal(C.WEIGHTS.ST.finishing,13.701);assert.equal(C.WEIGHTS.CM.shortPassing,15.6803);assert.equal(C.WEIGHTS.GK.gkReflexes,29.3815);
  assert.notDeepEqual(C.WEIGHTS.LB,C.WEIGHTS.RB);
  const keys=new Set(C.ATTRIBUTES.map(([key])=>key));
  for(const pos of C.POSITIONS){assert.ok(C.RATING_MODEL.profiles[pos].sampleSize>0);assert.ok(Math.abs(Object.values(C.WEIGHTS[pos]).reduce((a,b)=>a+b,0)-100)<.0001);assert.ok(Object.keys(C.WEIGHTS[pos]).every(key=>keys.has(key)));}
});

test('an imported LF uses a fitted baseline for placement, impact and stat plans',()=>{
  const player=C.normalizePlayer({
    ...C.demoPlayers()[0],id:'fcradar-fc27-123456',source:'import',positions:['LF','CAM'],
  });
  const profile=C.RATING_MODEL.profiles.LF;
  assert.equal(profile.sampleSize,537);
  assert.equal(profile.validationFolds,5);
  assert.ok(profile.validationMAE>0&&profile.validationMAE<1);
  assert.ok(Math.abs(Object.values(C.WEIGHTS.LF).reduce((sum,weight)=>sum+weight,0)-100)<.0001);
  const impact=C.positionImpact(player,'CM');
  assert.ok(Number.isFinite(impact.estimate));
  assert.equal(C.positionFit(player,'CM').estimate,impact.estimate);
  assert.ok(C.editorPlans(player,'CM',Math.round(impact.estimate)+2).every(plan=>plan.before===impact.estimate));
  assert.deepEqual(player.positions,['LF','CAM']);
  delete player.attributes.ballControl;
  assert.equal(C.estimateOverall(player,'CM'),null);
});

test('29 FC27 presets each have eleven valid slots and one goalkeeper',()=>{
  assert.equal(C.FORMATIONS.length,29);
  assert.equal(new Set(C.FORMATIONS.map(f=>f.id)).size,29);
  assert.ok(C.FORMATION_MAP.has('4-2-3-1'));
  for(const formation of C.FORMATIONS){
    const slots=C.makeSlots(formation.id);assert.equal(slots.length,11,formation.id);
    assert.equal(slots.filter(s=>s.pos==='GK').length,1,formation.id);
    assert.equal(new Set(slots.map(s=>s.id)).size,11);
    assert.ok(slots.every(s=>C.POSITIONS.includes(s.pos)&&s.x>=8&&s.x<=92&&s.y>=10&&s.y<=92));
  }
});

test('FC IQ role and focus belong to the slot and survive formation changes and backup',()=>{
  const state=C.initialState(),squad=state.squads[0];
  const [left,right]=squad.slots.filter(slot=>slot.pos==='CB');
  C.setPlayerRole(left,'ball-playing-defender','build-up');
  C.setPlayerRole(right,'stopper','aggressive');
  C.movePlayer(squad,left.playerId,right.id);
  assert.deepEqual(left.role,{id:'ball-playing-defender',focus:'build-up'});
  assert.deepEqual(right.role,{id:'stopper',focus:'aggressive'});
  C.changeFormation(squad,'4-4-2',state.players);
  const defenders=squad.slots.filter(slot=>slot.pos==='CB');
  assert.deepEqual(defenders.map(slot=>slot.role),[left.role,right.role]);
  const restored=C.validateBackup(clone(state)).squads[0];
  assert.deepEqual(restored.slots.filter(slot=>slot.pos==='CB').map(slot=>slot.role),[left.role,right.role]);
  const plan=C.recommend(state.players,squad,'possession','balanced','4-3-3 (2)');
  assert.deepEqual(plan.slots.filter(slot=>slot.pos==='CB').map(slot=>slot.role),[left.role,right.role]);
  assert.throws(()=>C.setPlayerRole(defenders[0],'deep-lying-playmaker','build-up'),/역할과 포커스/);
  assert.throws(()=>C.setPlayerRole(squad.bench[0],'stopper','balanced'),/선발 자리/);
  C.setSlotPosition(defenders[0],'CM');
  assert.equal(defenders[0].role,undefined);
  C.setPlayerRole(defenders[0],'deep-lying-playmaker','build-up');
  C.setSlotPosition(defenders[0],'CDM');
  assert.deepEqual(defenders[0].role,{id:'deep-lying-playmaker',focus:'build-up'});
  C.setPlayerRole(defenders[0],null,null);
  assert.equal(defenders[0].role,undefined);
});
test('demo data and full backups survive validated JSON round trips',()=>{
  const state=C.initialState();assert.equal(state.players.length,28);assert.ok(state.players.every(p=>p.source==='demo'));
  assert.deepEqual(C.validateBackup(JSON.parse(JSON.stringify(state))),state);uniqueSquad(state.squads[0]);
});
test('swapping starter and substitute retains each player and their recommendation lock',()=>{
  const state=C.initialState(),s=state.squads[0],starter=s.slots[1],sub=s.bench[0],first=starter.playerId,second=sub.playerId;
  starter.locked=true;C.movePlayer(s,first,sub.id);
  assert.equal(sub.playerId,first);assert.equal(sub.locked,true);assert.equal(starter.playerId,second);assert.equal(starter.locked,false);uniqueSquad(s);
  assert.equal(C.movePlayer(s,first,sub.id),false);
});
test('placing an unused player replaces only the selected slot',()=>{
  const state=C.initialState(),s=state.squads[0],before=C.allSlots(s).filter(slot=>slot.playerId).length;
  C.movePlayer(s,'demo-28',s.slots[0].id);assert.equal(s.slots[0].playerId,'demo-28');assert.equal(C.allSlots(s).filter(slot=>slot.playerId).length,before);uniqueSquad(s);
});
test('free positioning persists coordinates and infers an editable role',()=>{
  const s=C.initialState().squads[0];const id=s.slots[4].playerId;
  C.moveToPoint(s,s.slots[4].id,48,13);assert.equal(s.slots[4].pos,'ST');assert.equal(s.slots[4].playerId,id);assert.equal(s.custom,true);
  C.moveToPoint(s,s.slots[4].id,-30,130);assert.equal(s.slots[4].x,8);assert.equal(s.slots[4].y,92);
});
test('optimal matching avoids the greedy assignment trap and handles shortages',()=>{
  const assignment=C.optimalAssignment([[100,99],[99,0]]);assert.equal(assignment.reduce((sum,col,row)=>sum+[[100,99],[99,0]][row][col],0),198);
  const scarce=C.optimalAssignment([[5],[7],[6]]);assert.equal(scarce.filter(col=>col>=0).length,1);assert.equal(scarce[1],0);
});
test('switching through every formation preserves all eleven starters and locks',()=>{
  const state=C.initialState(),s=state.squads[0];s.slots[5].locked=true;
  const ids=s.slots.map(slot=>slot.playerId).sort(),locked=s.slots[5].playerId;
  for(const f of C.FORMATIONS){C.changeFormation(s,f.id,state.players);assert.deepEqual(s.slots.map(slot=>slot.playerId).sort(),ids);assert.equal(s.slots.find(slot=>slot.playerId===locked).locked,true);uniqueSquad(s);}
});
test('all styles and priorities produce valid squads without duplicate or outfield goalkeepers',()=>{
  const state=C.initialState(),s=state.squads[0],map=new Map(state.players.map(p=>[p.id,p]));
  for(const style of Object.keys(C.STYLES))for(const focus of ['balanced','youth','ready']){
    const plan=C.recommend(state.players,s,style,focus);
    assert.equal(plan.filled,11,style+' '+focus);uniqueSquad({...s,...plan});
    for(const slot of plan.slots){assert.equal(map.get(slot.playerId).positions.includes('GK'),slot.pos==='GK');assert.ok(plan.reasons[slot.id].length>=2);}
    C.validateBackup({...state,squads:[{...s,...plan}]});
  }
});
test('recommendation preserves locked starters, bench and reserves with exact custom coordinates',()=>{
  const state=C.initialState(),s=state.squads[0];s.slots[2].locked=true;C.moveToPoint(s,s.slots[2].id,42,72);s.bench[0].locked=true;s.reserves[0].playerId='demo-28';s.reserves[0].locked=true;
  const before=clone(s),plan=C.recommend(state.players,s,'press','youth');
  assert.equal(plan.formation,s.formation);assert.deepEqual(plan.slots[2],before.slots[2]);assert.deepEqual(plan.bench[0],before.bench[0]);assert.deepEqual(plan.reserves[0],before.reserves[0]);uniqueSquad({...s,...plan});assert.deepEqual(s,before);
});
test('youth and immediate-impact priorities make different choices for a vacant striker',()=>{
  const state=C.initialState(),s=state.squads[0],target=s.slots.find(slot=>slot.pos==='ST');
  s.slots.forEach(slot=>{slot.locked=slot.id!==target.id;});s.bench.forEach(slot=>slot.playerId=null);
  const old=C.demoPlayers()[0],attributes=Object.fromEntries(C.ATTRIBUTES.map(([key])=>[key,80]));
  const young={...old,id:'young',overall:78,potential:99,age:18,attributes},ready={...old,id:'ready',overall:90,potential:90,age:31,attributes};
  const players=[...state.players.filter(p=>s.slots.some(slot=>slot.locked&&slot.playerId===p.id)),young,ready];
  assert.equal(C.recommend(players,s,'counter','youth').slots.find(slot=>slot.id===target.id).playerId,'young');
  assert.equal(C.recommend(players,s,'counter','ready').slots.find(slot=>slot.id===target.id).playerId,'ready');
});
test('a missing goalkeeper is left empty instead of being filled with an outfield player',()=>{
  const state=C.initialState(),s=C.newSquad();const players=state.players.filter(p=>!p.positions.includes('GK'));const plan=C.recommend(players,s,'counter');assert.equal(plan.slots.find(slot=>slot.pos==='GK').playerId,null);assert.equal(plan.filled,10);
});
test('position estimates are anchored to input OVR and missing stats remain unknown',()=>{
  const p=C.demoPlayers()[0];assert.equal(C.estimateOverall(p,'ST'),p.overall);
  const sparse=C.normalizePlayer({name:'직접 입력',position:'CM',overall:80});assert.equal(C.estimateOverall(sparse,'CAM'),null);assert.equal(C.positionFit(sparse,'CM').estimate,80);
  assert.throws(()=>C.editorPlans(sparse,'CAM',85),/스탯/);
});
test('all-position comparison exposes OVR deltas while leaving detailed attributes untouched',()=>{
  const p=C.demoPlayers()[0],before=clone(p),comparison=C.positionComparison(p);
  assert.equal(comparison.length,12);assert.equal(comparison.find(row=>row.position==='ST').estimate,p.overall);assert.equal(comparison.find(row=>row.position==='ST').source,'input');
  for(const row of comparison)if(row.estimate!==null)assert.equal(row.delta,C.round(row.estimate-p.overall));
  assert.deepEqual(p,before);
});
test('attribute contribution breakdown sums exactly to the modeled position difference',()=>{
  const p=C.demoPlayers()[0],before=clone(p);
  for(const pos of C.POSITIONS){const impact=C.positionImpact(p,pos);assert.notEqual(impact.estimate,null);assert.ok(Math.abs(impact.rows.reduce((sum,row)=>sum+row.contribution,0)-impact.rawDelta)<1e-8,pos);assert.ok(impact.rows.every(row=>row.value===p.attributes[row.key]));}
  assert.deepEqual(p,before);
});
test('zero-weight fields are not invented or required and missing required fields stay unknown',()=>{
  const p=C.demoPlayers()[0],zeroKeys=C.ATTRIBUTES.map(([key])=>key).filter(key=>!C.WEIGHTS.ST[key]);for(const key of zeroKeys)delete p.attributes[key];assert.equal(C.estimateOverall(p,'ST'),p.overall);
  delete p.attributes.finishing;assert.equal(C.estimateOverall(p,'ST'),null);assert.ok(C.positionImpact(p,'ST').missing.includes('finishing'));
});
test('FC27 preferred positions are limited to one main and six secondary positions',()=>{
  assert.throws(()=>C.normalizePlayer({name:'테스트',positions:C.POSITIONS.slice(0,8),overall:80}),/최대 7/);
});
test('three editor plans reach both higher and lower goals without mutating source stats',()=>{
  const p=C.demoPlayers()[0],before=clone(p);
  for(const target of [80,87]){
    const plans=C.editorPlans(p,'ST',target,'counter');assert.equal(plans.length,3);
    for(const plan of plans){assert.ok(plan.reached);assert.ok(Math.abs(plan.after-target)<=.3);assert.ok(Object.values(plan.attributes).every(value=>value>=1&&value<=99));for(const c of plan.changes)assert.equal(c.after-c.before,c.delta);}
  }
  assert.deepEqual(p,before);
});
test('editor reports an unreachable target at the attribute ceiling',()=>{
  const p={...C.demoPlayers()[0],overall:1,attributes:Object.fromEntries(C.ATTRIBUTES.map(([key])=>[key,99]))};
  const plans=C.editorPlans(p,'ST',99);assert.ok(plans.every(plan=>!plan.reached&&plan.after===1));
});
test('CSV accepts BOM, Korean headers, quoted comma, newline and escaped quote',()=>{
  const csv='\uFEFFid,이름,포지션,능력치,잠재력,소속팀\r\np1,"가상, 선수",CM/CAM,80,90,"예시 ""구단""\n두 번째 줄"\r\n';
  const {players}=A.fromCSV(csv);assert.equal(players[0].name,'가상, 선수');assert.equal(players[0].club,'예시 "구단"\n두 번째 줄');assert.deepEqual(players[0].positions,['CM','CAM']);
  assert.throws(()=>A.fromCSV('name,positions,overall\n"미완성,CM,80'),/따옴표/);
  assert.throws(()=>A.fromCSV('name,positions,overall\n선수,CM,80,추가'),/열 수/);
});
test('JSON and CSV reject malformed or duplicate player IDs before any mutation',()=>{
  const state=C.initialState(),before=clone(state);
  assert.throws(()=>A.fromJSON('{broken'),/JSON/);
  assert.throws(()=>A.fromJSON(JSON.stringify([{id:'x',name:'a',position:'CM',overall:80},{id:'x',name:'b',position:'ST',overall:85}])),/중복/);
  assert.throws(()=>A.fromJSON(JSON.stringify([{name:'a',position:'CF',overall:80}])),/포지션/);
  assert.throws(()=>A.fromCSV('name,position,overall\na,CM,100'),/범위/);
  assert.deepEqual(state,before);
});
test('CSV preserves the fictional-data label from the downloadable demo template',()=>{
  const {players}=A.fromCSV('id,name,positions,overall,source\nexample,가상 예시 선수,CM,80,demo');assert.equal(players[0].source,'demo');
});
test('backup validation rejects duplicate assignments, IDs and unsupported schema versions',()=>{
  const state=C.initialState();let malformed=clone(state);malformed.squads[0].slots[1].playerId=malformed.squads[0].slots[0].playerId;assert.throws(()=>C.validateBackup(malformed),/중복/);
  malformed=clone(state);malformed.squads[0].slots[0].id='unexpected';assert.throws(()=>C.validateBackup(malformed),/ID/);
  malformed=clone(state);malformed.version=999;assert.throws(()=>C.validateBackup(malformed),/버전/);
});
test('photos accept permitted URLs or embedded raster data and reject script/image SVG URLs',()=>{
  assert.equal(C.safeImageUrl('javascript:alert(1)'), '');assert.equal(C.safeImageUrl('data:image/svg+xml;base64,PHN2Zz4='),'');assert.equal(C.safeImageUrl('https://example.com/photo.png'),'https://example.com/photo.png');assert.ok(C.safeImageUrl('data:image/png;base64,iVBORw0KGgo='));
  const p=C.normalizePlayer({name:'사진 테스트',position:'CM',overall:80,portraitUrl:'https://example.com/p.png'});assert.equal(p.imageUrl,'https://example.com/p.png');
});
test('search supports Korean, Hangul initials, English and accented imported names',()=>{
  const p=C.demoPlayers()[0];assert.ok(C.matchesSearch(p,'ㄱㄷㅇ'));assert.ok(C.matchesSearch(p,'doyun'));assert.ok(C.matchesSearch(p,'서울'));
  assert.ok(C.matchesSearch({...p,name:'Álvaro'},'alvaro'));
});
test('normal roster starts empty and migration removes only built-in examples and their assignments', () => {
  const empty = C.initialState({ includeDemo: false });
  assert.equal(empty.players.length, 0);
  assert.ok(C.allSlots(empty.squads[0]).every(slot => !slot.playerId));
  const legacy = C.initialState();
  legacy.players[0].source = 'custom';
  legacy.players[0].name = '내가 수정한 선수';
  const imported = C.normalizePlayer({ id: 'fcradar-fc27-123', name: 'API 골키퍼', position: 'GK', overall: 85 });
  legacy.players.push(imported);
  const keeper = legacy.squads[0].slots[0];
  keeper.playerId = imported.id;
  keeper.locked = true;
  const migrated = C.withoutSeedPlayers(legacy);
  assert.deepEqual(migrated.players.map(player => player.id), ['demo-1', imported.id]);
  assert.deepEqual(migrated.squads[0].slots[0], keeper);
  assert.ok(C.allSlots(migrated.squads[0]).every(slot => !slot.playerId || migrated.players.some(player => player.id === slot.playerId)));
  assert.equal(legacy.players.length, 29);
  assert.deepEqual(C.validateBackup(migrated), migrated);
});
test('the distributable is standalone and core/adapter also initialize as browser scripts',()=>{
  const file=path.resolve(__dirname,'..','index.html'),html=fs.readFileSync(file,'utf8');
  assert.ok(!/\b(?:src|href)="(?:\.\/)?(?:src\/|https?:\/\/[^\"]+\.(?:js|css))/i.test(html));
  assert.ok(!/https:\/\/api\.openai\.com|XMLHttpRequest|api[_-]?key\s*[:=]\s*["'][^"']+/i.test(html));
  assert.ok(!html.includes('/* TOUCHLINE_APP */'));assert.ok(!html.includes('/* TOUCHLINE_CORE */'));
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal(scripts.length,13);
  scripts.forEach(script=>new vm.Script(script));
  const context=vm.createContext({URL,console});for(const script of scripts.slice(0,10))vm.runInContext(script,context);assert.equal(context.SquadCore.FORMATIONS.length,29);assert.equal(context.PlayerDataAdapter.fromJSON('[{"name":"test","positions":["CM"],"overall":80}]').players.length,1);assert.ok(context.AIContext);
  assert.equal(Object.keys(context.CareerDevelopment.PROFILES).length,6);
  assert.ok(context.CareerMarket.workspace);
  assert.ok(context.CareerRanking.scout);
  assert.ok(context.SquadCore.FC_IQ.getRole('CB','ball-playing-defender').focuses.includes('build-up'));
  const badges=context.PlayerPlaystyles.badges({playstyles:[{id:0,slug:'finesse-shot'}],playstyle_plus:[{id:25,slug:'quick-step'}]},true);
  assert.match(badges,/traits_colored_sm0\.png/);
  assert.match(badges,/traits_icon_colored_sm25\.png/);
  assert.match(badges,/퀵 스텝\+/);
  assert.match(badges,/data-playstyle-effect="폭발적인 질주/);
  assert.deepEqual([59,60,70,80,90,null].map(context.PlayerProfile.band),['base','low','mid','high','elite','unknown']);
});
