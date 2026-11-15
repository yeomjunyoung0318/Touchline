(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.AIContext=factory(root.SquadCore);})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function safePlayer(p){
    const {playstyles,playstyle_plus}=p;
    const profile=Object.fromEntries(Object.entries({roleIds:p.profile?.roleIds,growth:p.profile?.growth,
      marketValue:p.profile?.marketValue,wage:p.profile?.wage,freeAgent:p.profile?.freeAgent,league:p.profile?.league}).filter(([,value])=>value!=null));
    return {...(p.statEdit?{statEdit:p.statEdit}:{}),id:p.id,name:p.name,englishName:p.englishName,positions:p.positions,overall:p.overall,potential:p.potential,age:p.age,club:p.club,nationality:p.nationality,source:p.source,attributes:p.attributes,...(Object.keys(profile).length?{profile}:{}),...(playstyles?{playstyles}:{}),...(playstyle_plus?{playstyle_plus}:{})};
  }
  function prepare(raw){
    if(!raw||!Array.isArray(raw.players)||!raw.squad)throw new Error('현재 선수 목록과 스쿼드가 필요해요.');
    const {career, ...squad}=raw.squad;
    const normalized=C.validateBackup({app:'touchline-fc27',version:1,players:raw.players.map(safePlayer),squads:[{...squad,notes:''}],activeSquadId:squad.id});
    return {players:normalized.players.map(safePlayer),squad:normalized.squads[0],recommendation:C.recommendationContext(career??raw.recommendation)};
  }
  function brief(p){return {id:p.id,name:p.name,englishName:p.englishName,positions:p.positions,overall:p.overall,potential:p.potential,age:p.age,club:p.club,fictional:p.source==='demo'};}
  function squadSummary(context){
    const map=new Map(context.players.map(p=>[p.id,p]));
    const describe=slot=>({
      slotId:slot.id,position:slot.pos,locked:slot.locked,
      ...(slot.x!==undefined?{x:slot.x}:{}),
      ...(slot.role?{role:slot.role}:{}),
      player:map.has(slot.playerId)?brief(map.get(slot.playerId)):null,
    });
    return {name:context.squad.name,formation:context.squad.formation,custom:context.squad.custom,style:context.squad.style,focus:context.squad.focus,starters:context.squad.slots.map(describe),substitutes:context.squad.bench.map(describe),reserves:context.squad.reserves.map(describe),playerCount:context.players.length,fictionalPlayerCount:context.players.filter(p=>p.source==='demo').length,ratingModel:{id:C.RATING_MODEL.id,source:C.RATING_MODEL.sourceUrl,officialFormula:false}};
  }
  return Object.freeze({prepare,brief,squadSummary});
});
