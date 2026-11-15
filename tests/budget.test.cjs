'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const M=require('../src/career-market.js');
const X=require('../src/ai-context.js');
const T=require('../server/ai-tools.cjs');

function player(id,position,overall,fee,wage=1000){
  return C.normalizePlayer({id:'fcradar-fc27-'+id,name:'선수 '+id,positions:[position],overall,potential:overall,age:26,
    source:'import',club:'Market FC',attributes:Object.fromEntries(C.ATTRIBUTES.map(([key])=>[key,overall])),
    profile:{league:'Test League',marketValue:fee==null?{}:{eur:fee},wage:wage==null?{}:{eur:wage}}});
}
function setup(open=['CM','CDM']){
  const squad=C.newSquad(),players=[],counts=[...open];
  squad.slots.forEach((slot,i)=>{
    const at=counts.indexOf(slot.pos);if(at>=0){counts.splice(at,1);return;}
    const row=player(100+i,slot.pos,70,4000000);players.push(row);slot.playerId=row.id;slot.locked=true;
  });
  return {squad,players};
}
function catalog(players){const map=new Map(players.map(p=>[p.id,p]));return {players,get:id=>map.get(id),display:p=>p,gender:()=> 'male',facets:{genderKnown:true},date:'20261103'};}
const args={style:'possession',focus:'balanced',formation:'current',maxAge:null,minOverall:null,minPotential:null,
  excludedPlayerIds:[],fixedPlayerIds:[],squadFeeLimit:10000000,squadWageLimit:15000};
function run(fixture,market,override={}){
  return T.recommendForContext({...args,...override},X.prepare(fixture),catalog([...fixture.players,...market]));
}

test('whole squad search buys an affordable conversion and cover together rather than the strongest unaffordable source',()=>{
  const fixture=setup(),source=player(201,'CAM',82,7000000,2000),expensive=player(202,'CAM',90,9000000,2000),cover=player(203,'CDM',85,3000000,1000);
  const before=JSON.stringify(fixture),proposal=run(fixture,[source,expensive,cover]);
  const budget=proposal.plan.budget;
  assert.equal(proposal.plan.filled,11);
  assert.deepEqual(new Set(budget.incoming.map(row=>row.id)),new Set([source.id,cover.id]));
  assert.equal(budget.fee,10000000);assert.equal(budget.wage,12000);assert.equal(budget.feeRemaining,0);
  assert.equal(budget.packages.length,1);assert.equal(budget.packages[0].coverId,cover.id);
  const placed=proposal.squad.slots.find(slot=>slot.playerId===cover.id);
  assert.equal(placed.pos,'CDM');assert.deepEqual(placed.role,{id:'holding',focus:'defend'});
  assert.equal(JSON.stringify(fixture),before);
  assert.ok([...proposal.squad.bench,...proposal.squad.reserves].every(slot=>!slot.playerId));
});

test('anchor purchased from the market is charged, and API and AI return identical budget plans',()=>{
  const fixture=setup(),source=player(211,'CAM',85,7000000,2000),cover=player(212,'CDM',85,3000000,1000);
  C.setPlayerRole(fixture.squad.slots.find(slot=>slot.pos==='CDM'),'deep-lying-playmaker','defend');
  const override={anchorPlayerId:source.id,anchorPosition:'CM'},proposal=run(fixture,[source,cover],override);
  assert.equal(proposal.plan.budget.fee,10000000);
  assert.equal(proposal.squad.slots.find(slot=>slot.playerId===cover.id).role.id,'holding');
  const ai=T.execute('recommend_squad',{...args,...override},X.prepare(fixture),catalog([...fixture.players,source,cover]));
  assert.deepEqual(ai.result.budget,proposal.plan.budget);
  assert.equal(ai.result.budget.packages[0].sourceOwned,false);
  assert.throws(()=>run(fixture,[source,cover],{...override,squadFeeLimit:6000000}),/예산/);
});

test('shared cover is purchased once, retained bench wages count, and no duplicate players are assigned',()=>{
  const fixture=setup(['CM','CM','CDM']),sourceA=player(221,'CAM',82,7000000),sourceB=player(222,'CAM',83,7000000);
  fixture.squad.slots.filter(slot=>slot.pos==='CM').forEach((slot,i)=>{slot.playerId=[sourceA,sourceB][i].id;slot.locked=true;});
  const bench=player(223,'ST',65,5000000,5000);
  fixture.players.push(sourceA,sourceB,bench);fixture.squad.bench[0].playerId=bench.id;
  const cover=player(224,'CDM',85,3000000,1000);
  const proposal=run(fixture,[cover],{squadFeeLimit:3000000,squadWageLimit:16000}),budget=proposal.plan.budget;
  assert.equal(budget.packages.length,2);assert.ok(budget.packages.every(row=>row.coverId===cover.id));
  assert.equal(budget.incoming.length,1);assert.equal(budget.fee,3000000);assert.equal(budget.wage,16000);
  const ids=C.allSlots(proposal.squad).map(slot=>slot.playerId).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.includes(bench.id));
  assert.throws(()=>run(fixture,[cover],{squadWageLimit:14999}),/기존 선수단 주급/);
});

test('unknown prices are never zero under a hard budget, including saved currency and existing wages',()=>{
  const fixture=setup(),source=player(231,'CAM',85,null,2000),cover=player(232,'CDM',85,3000000,1000);
  assert.throws(()=>run(fixture,[source,cover],{anchorPlayerId:source.id,anchorPosition:'CM'}),/미확인/);
  fixture.squad.career=M.workspace({settings:{squadFeeLimit:10000000,squadWageLimit:15000},targets:[{
    player:source,list:'watch',observation:{expectedFee:7000000,currency:'eur'}}]},C.normalizePlayer);
  assert.equal(run(fixture,[source,cover],{anchorPlayerId:source.id,anchorPosition:'CM'}).plan.budget.fee,10000000);
  assert.throws(()=>run(fixture,[source,cover],{currency:'gbp'}),/주급이 미확인/);
  fixture.players[0].profile.wage={};
  assert.throws(()=>run(fixture,[source,cover]),/주급이 미확인/);
});

test('locked incompatible support roles and injured cover do not produce a false complete recommendation',()=>{
  const fixture=setup(['CM']),source=player(241,'CAM',85,7000000),cdm=fixture.squad.slots.find(slot=>slot.pos==='CDM');
  C.setPlayerRole(cdm,'deep-lying-playmaker','defend');
  assert.throws(()=>run(fixture,[source],{anchorPlayerId:source.id,anchorPosition:'CM'}),/조합을 찾지/);
  const open=setup(),cover=player(242,'CDM',85,3000000);
  open.squad.career=M.workspace({targets:[{player:cover,list:'watch',observation:{injury:'severe'}}]},C.normalizePlayer);
  const plan=run(open,[source,cover]).plan;
  assert.equal(plan.budget.complete,false);assert.ok(plan.filled<11);
  assert.equal(plan.budget.packages.length,0);
  assert.ok(plan.budget.fee<=args.squadFeeLimit);
});

test('zero budgets survive context normalization and cannot silently become unrestricted',()=>{
  const fixture=setup(['CM']),source=player(251,'CM',85,1,1);
  fixture.squad.career=M.workspace({settings:{squadFeeLimit:0,squadWageLimit:10000}},C.normalizePlayer);
  const context=X.prepare(fixture);assert.deepEqual(X.prepare(JSON.parse(JSON.stringify(context))),context);
  const proposal=T.recommendForContext({...args,squadFeeLimit:null,squadWageLimit:null},context,catalog([...fixture.players,source]));
  assert.equal(proposal.plan.filled,10);assert.equal(proposal.plan.budget.fee,0);
  assert.equal(proposal.plan.budget.feeLimit,0);assert.equal(proposal.plan.budget.incoming.length,0);
});

test('conversion-only wing is solved before its fullback slot is consumed',()=>{
  const fixture=setup(['LW','LB']),wing=player(261,'LM',85,6000000,2000),back=player(262,'LB',85,4000000,1000);
  const proposal=run(fixture,[wing,back]);
  assert.equal(proposal.plan.filled,11);
  assert.equal(proposal.plan.budget.packages[0].playerId,wing.id);
  assert.equal(proposal.plan.budget.packages[0].coverId,back.id);
  assert.equal(proposal.squad.slots.find(slot=>slot.playerId===back.id).role.id,'fullback');
});

test('HTTP recommendation preserves saved whole-squad limits and rejects missing authentication',async t=>{
  const {createApp}=require('../server.cjs'),{createMockProvider}=require('../server/mock-provider.cjs');
  const fixture=setup(),source=player(271,'CAM',82,7000000,2000),cover=player(272,'CDM',85,3000000,1000);
  fixture.squad.career=M.workspace({settings:{squadFeeLimit:10000000,squadWageLimit:15000}},C.normalizePlayer);
  const app=createApp({port:0,provider:createMockProvider(),playerDatabase:{view:()=>catalog([...fixture.players,source,cover]),status:()=>({count:11})}});
  const url=await app.listen();t.after(()=>new Promise(resolve=>{app.server.closeAllConnections();app.server.close(resolve);}));
  const body=JSON.stringify({options:{...args,squadFeeLimit:null,squadWageLimit:null},context:fixture});
  const denied=await fetch(url+'/api/squads/recommend',{method:'POST',headers:{'Content-Type':'application/json'},body});
  assert.equal(denied.status,403);
  const response=await fetch(url+'/api/squads/recommend',{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':app.token},body});
  assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.plan.budget.fee,10000000);assert.equal(result.plan.filled,11);
  assert.equal(result.plan.budget.packages[0].coverId,cover.id);
});

test('sale proceeds and released wages fund the conversion bundle without selling selected or fixed players',()=>{
  const fixture=setup(),surplus=player(281,'ST',65,10000000,8000);
  fixture.players.push(surplus);fixture.squad.bench[0].playerId=surplus.id;
  const source=player(282,'CAM',82,7000000,2000),cover=player(283,'CDM',85,3000000,1000);
  const before=JSON.stringify(fixture);
  const plan=run(fixture,[source,cover],{allowSales:true,squadFeeLimit:2000000,squadWageLimit:13000}).plan,b=plan.budget;
  assert.equal(plan.filled,11);assert.equal(b.conditional,true);
  assert.deepEqual(b.outgoing.map(row=>row.id),[surplus.id]);
  assert.equal(b.saleProceeds,8000000);assert.equal(b.reinvestedProceeds,8000000);
  assert.equal(b.availableFee,10000000);assert.equal(b.netSpend,2000000);
  assert.equal(b.wageSaved,8000);assert.equal(b.wage,12000);assert.equal(b.wageRemaining,1000);
  assert.ok(![...plan.slots,...plan.bench,...plan.reserves].some(slot=>slot.playerId===surplus.id));
  assert.ok(b.packages.every(row=>!b.outgoing.some(sold=>sold.id===row.playerId||sold.id===row.coverId)));
  assert.equal(JSON.stringify(fixture),before);
  fixture.squad.bench[0].locked=true;
  assert.throws(()=>run(fixture,[source,cover],{allowSales:true,squadFeeLimit:2000000,squadWageLimit:13000}),/예산|조합/);
});

test('sale estimates respect reinvestment percentage and saved net proceeds; unnecessary sales are avoided',()=>{
  const fixture=setup(),surplus=player(291,'ST',65,10000000,8000),source=player(292,'CAM',82,7000000,2000),cover=player(293,'CDM',85,3000000,1000);
  fixture.players.push(surplus);fixture.squad.bench[0].playerId=surplus.id;
  const noSale=run(fixture,[source,cover],{allowSales:true,squadFeeLimit:10000000,squadWageLimit:25000}).plan;
  assert.equal(noSale.budget.outgoing.length,0);
  fixture.squad.career=M.workspace({targets:[{player:surplus,list:'transfer',observation:{expectedSaleFee:12000000,currency:'eur'}}]},C.normalizePlayer);
  const plan=run(fixture,[source,cover],{allowSales:true,squadFeeLimit:7000000,squadWageLimit:13000,saleReinvestmentPercent:25}).plan;
  assert.equal(plan.filled,11);assert.equal(plan.budget.saleProceeds,12000000);assert.equal(plan.budget.reinvestedProceeds,3000000);
  assert.equal(plan.budget.outgoing[0].source,'save');
  assert.throws(()=>run(fixture,[source,cover],{allowSales:true,maxSales:0,squadWageLimit:13000}),/예산|조합/);
});

test('the only reserve goalkeeper and an unknown sale value cannot be used as imaginary funding',()=>{
  const fixture=setup(),backup=player(301,'GK',65,10000000,8000),source=player(302,'CAM',82,7000000,2000),cover=player(303,'CDM',85,3000000,1000);
  fixture.players.push(backup);fixture.squad.bench[0].playerId=backup.id;
  assert.throws(()=>run(fixture,[source,cover],{allowSales:true,squadFeeLimit:2000000,squadWageLimit:13000}),/조합/);
  backup.positions=['ST'];backup.profile.marketValue={};
  assert.throws(()=>run(fixture,[source,cover],{allowSales:true,squadFeeLimit:2000000,squadWageLimit:13000}),/예산|조합/);
});

test('saved club gender disambiguates identically named clubs when UI sends null',()=>{
  const fixture=setup([]),female=player(311,'CM',80,1000000);
  female.profile.league='Women Test League';
  fixture.squad.career=M.workspace({settings:{careerClub:'Market FC',gender:'male',careerStage:'fantasy',squadFeeLimit:0}},C.normalizePlayer);
  const cat=catalog([...fixture.players,female]);cat.gender=p=>p.profile.league==='Women Test League'?'female':'male';
  const result=T.recommendForContext({...args,gender:null,squadFeeLimit:null,squadWageLimit:null},X.prepare(fixture),cat);
  assert.equal(result.career.gender,'male');assert.equal(result.plan.filled,11);
});

test('applied local stats drive scouting, cover and sale-funded recommendations despite older catalog stats',async t=>{
  const {createApp}=require('../server.cjs'),{createMockProvider}=require('../server/mock-provider.cjs');
  const fixture=setup(),original=player(321,'CAM',70,7000000,2000),surplus=player(322,'ST',65,10000000,8000),cover=player(323,'CDM',90,3000000,1000);
  const edited=C.applyStatPlan(original,{source:original,draft:original,position:'CM',targetOverall:84,style:'possession',preferences:{archetype:'speed'},planId:'focused'});
  fixture.players.push(edited,surplus);fixture.squad.bench[0].playerId=surplus.id;
  Object.assign(fixture.squad.slots.find(s=>s.pos==='CM'),{playerId:edited.id,locked:true});
  fixture.squad.career=M.workspace({settings:{allowSales:true,squadFeeLimit:0,squadWageLimit:13000},targets:[{player:original,list:'watch'}]},C.normalizePlayer);
  const cat=catalog([...fixture.players.filter(p=>p.id!==edited.id),original,cover]);
  const app=createApp({port:0,provider:createMockProvider(),playerDatabase:{view:()=>cat,status:()=>({count:12})}});
  const url=await app.listen();t.after(()=>new Promise(resolve=>{app.server.closeAllConnections();app.server.close(resolve);}));
  async function post(path,body){const res=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':app.token},body:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;}
  const settings={position:'CM',scope:'squad',deployment:'any',excludeSquad:false};
  const scout=await post('/api/career/scout',{context:fixture,settings,targets:fixture.squad.career.targets});
  const row=scout.rows.find(r=>r.player.id===edited.id);assert(row);
  assert.deepEqual(row.player.attributes,edited.attributes);assert.equal(row.report.fit.estimate,C.estimateOverall(edited,'CM'));
  assert.notEqual(row.report.fit.estimate,C.estimateOverall(original,'CM'));
  const support=await post('/api/career/support',{context:fixture,settings,playerId:edited.id,targets:fixture.squad.career.targets});
  const cm=support.plans.find(p=>p.position==='CM');assert.equal(cm.ovr,row.report.fit.estimate);
  assert(cm.support.recruits.some(r=>r.player.id===cover.id));
  const proposal=await post('/api/squads/recommend',{context:fixture,options:{...args,squadFeeLimit:null,squadWageLimit:null,anchorPlayerId:edited.id,anchorPosition:'CM'}});
  assert.equal(proposal.plan.filled,11);assert.equal(proposal.plan.budget.fee,3000000);
  assert.deepEqual(proposal.plan.budget.outgoing.map(p=>p.id),[surplus.id]);assert.equal(proposal.plan.budget.wageSaved,8000);
  assert(proposal.plan.budget.packages.some(p=>p.playerId===edited.id&&p.coverId===cover.id));
  assert.equal(proposal.plan.budget.wage,12000);
});
