'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),T=require('../server/ai-tools.cjs'),X=require('../src/ai-context.js');
function fixture(){return C.normalizePlayer({id:'custom-physical',name:'가상 테스트 선수',source:'custom',club:'Example FC',positions:['CB'],overall:70,
  attributes:Object.fromEntries(C.ATTRIBUTES.map(([key])=>[key,70]))});}
test('fast physical poor-passing plans keep both strengths and weaknesses even when OVR 89 is impossible',()=>{
  const p=fixture(),before=JSON.stringify(p);
  const plans=C.editorPlans(p,'CM',89,'counter',{archetype:'fast-physical-poor-passing'});
  for(const plan of plans){
    assert.ok(plan.attributes.acceleration>=90&&plan.attributes.sprintSpeed>=90&&plan.attributes.strength>=90);
    assert.ok(plan.attributes.shortPassing<=55&&plan.attributes.longPassing<=50&&plan.attributes.vision<=55);
    assert.equal(plan.reached,false);assert.ok(plan.reachableRange[1]<89);assert.ok(plan.after<=plan.reachableRange[1]);
    assert.ok(plan.blockers.some(row=>row.attribute==='shortPassing'));
    assert.equal(plan.after,C.estimateOverall(p,'CM',plan.attributes));
    if(plan.relaxation){
      const relaxed=C.editorPlans(p,'CM',89,'counter',{archetype:'fast-physical-poor-passing',constraints:plan.relaxation.constraints});
      assert.ok(relaxed[0].reachableRange[1]>=89);
      assert.ok(plan.attributes.shortPassing<=55);
    }
    assert.ok(plan.changes.some(row=>row.attribute==='shortPassing'||row.key==='shortPassing'));
  }
  assert.equal(JSON.stringify(p),before);
});
test('explicit limits and fixed attributes override presets and survive AI editor handoff',()=>{
  const p=fixture(),context=X.prepare({players:[p],squad:C.newSquad()});
  const args={playerId:p.id,position:'CM',targetOverall:80,style:'counter',archetype:'speed',constraints:[
    {attribute:'shortPassing',min:40,max:45,priority:1},{attribute:'strength',min:92,max:92,priority:5},
    {attribute:'acceleration',min:93,max:96,priority:3}]};
  const output=T.execute('calculate_stat_plan',args,context);
  const payload=output.artifact.payload;
  const local=C.editorPlans(p,payload.position,payload.targetOverall,payload.style,payload.statPreferences);
  assert.deepEqual(local[0].constraints,output.result.constraints);
  assert.equal(local[0].after,output.result.plans[0].after);
  assert.ok(local.every(plan=>plan.attributes.strength===92&&plan.attributes.shortPassing<=45&&plan.attributes.acceleration>=93&&plan.attributes.acceleration<=96));
  assert.deepEqual(payload.statPreferences.constraints,args.constraints);
  const applied=C.applyStatPlan(p,{source:p,draft:p,position:payload.position,targetOverall:payload.targetOverall,style:payload.style,preferences:payload.statPreferences,planId:local[0].id});
  assert.deepEqual(applied.attributes,local[0].attributes);
  assert.equal(C.estimateOverall(applied,'CM'),local[0].after);
});
test('invalid, duplicate and missing-stat conditions fail rather than inventing numbers',()=>{
  const p=fixture();
  assert.throws(()=>C.editorPlans(p,'CM',89,'counter',{constraints:[{attribute:'vision',min:80,max:50}]}),/최소/);
  assert.throws(()=>C.editorPlans(p,'CM',89,'counter',{constraints:[{attribute:'vision',min:1,max:20},{attribute:'vision',min:1,max:30}]}),/중복/);
  assert.throws(()=>C.editorPlans(p,'CM',89,'counter',{constraints:[{attribute:'madeUp',min:1,max:20}]}),/스탯 이름/);
  delete p.attributes.jumping;
  assert.throws(()=>C.editorPlans(p,'CM',89,'counter',{archetype:'fast-physical-poor-passing'}),/스탯/);
});

function apply(p,position='CM',targetOverall=89,preferences={archetype:'fast-physical-poor-passing'}){
  return C.applyStatPlan(p,{source:p,draft:p,position,targetOverall,style:'counter',preferences,planId:'focused'});
}
test('applied stats keep exact target estimates across clipping, reload, AI context and repeat application',()=>{
  const p={...fixture(),positions:['ST'],overall:99},plan=C.editorPlans(p,'CM',89,'counter',{archetype:'fast-physical-poor-passing'})[1];
  const edited=apply(p),snapshot=JSON.stringify(p);
  assert.equal(edited.overall,99); // Primary ST rating clips, while the CM rating must not shift.
  assert.equal(C.estimateOverall(edited,'CM'),plan.after);
  assert.deepEqual(edited.attributes,plan.attributes);assert.deepEqual(edited.positions,p.positions);
  const squad=C.newSquad(),backup=C.validateBackup({app:'touchline-fc27',version:1,players:[edited],squads:[squad],activeSquadId:squad.id});
  const reloaded=backup.players[0],context=X.prepare({players:[reloaded],squad});
  assert.equal(C.estimateOverall(context.players[0],'CM'),plan.after);
  const again=apply(reloaded);
  assert.deepEqual(again.attributes,edited.attributes);assert.equal(C.estimateOverall(again,'CM'),plan.after);
  assert.deepEqual(C.restoreStatPlan(again),p);assert.equal(JSON.stringify(p),snapshot);
  const cat={get:()=>p,players:[p],display:row=>row};
  const details=T.execute('get_player_details',{playerIds:[p.id]},context,cat).result[0];
  assert.deepEqual(details.attributes,edited.attributes);assert.equal(details.statModification.applied,true);
  assert.equal(details.positionEstimates.find(row=>row.position==='CM').estimate,plan.after);
});
test('stale or mismatched plans cannot overwrite a newer player and missing restore data is rejected',()=>{
  const p=fixture(),options={source:p,draft:p,position:'CM',targetOverall:85,style:'counter',planId:'focused'};
  const changed={...p,attributes:{...p.attributes,strength:90}};
  assert.throws(()=>C.applyStatPlan(changed,options),/다시 계산/);
  assert.throws(()=>C.applyStatPlan(p,{...options,draft:{...p,id:'different'}}),/일치/);
  assert.throws(()=>C.restoreStatPlan(p),/복원/);
  assert.throws(()=>C.normalizePlayer({...p,statEdit:{offset:Infinity}}),/변경 기록/);
});
test('old dynamic OVR and growth checkpoints cannot override applied ability in recommendation scoring',()=>{
  const p=fixture(),edited=apply(p),notes={dynamicPosition:'CM',dynamicOvr:40,checkpoints:[{date:'2026-11-01',position:'CB',overall:40}]};
  const input={position:'CM',focus:'ready'};
  const current=C.assessRecommendation(edited,input,notes),withoutNotes=C.assessRecommendation(edited,input,{});
  assert.equal(current.dynamicOvr,null);assert.equal(current.score,withoutNotes.score);
  assert.equal(current.development.gap,withoutNotes.development.gap);
  assert.equal(C.assessRecommendation(p,input,notes).dynamicOvr,40);
});
