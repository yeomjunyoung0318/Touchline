'use strict';
const C = require('../src/core.js');
const M = require('../src/career-market.js');
const D = require('../src/career-development.js');
const R = require('../src/career-ranking.js');
const {createSalesPlanner}=require('./squad-sales.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const WIDTH = 120;
const rowKey = row => row.player.id + ':' + row.report.role.id + ':' + row.report.role.focus;
const byScore = (a,b) => b.score-a.score || a.player.id.localeCompare(b.player.id);

// Keep cheap alternatives as well as strong candidates: individual rank alone
// would discard the complementary purchases that make a whole team affordable.
function shortlist(rows, count = 12) {
  const selected = new Map();
  const add = values => values.forEach(row => selected.set(rowKey(row),row));
  add([...rows].sort(byScore).slice(0,count));
  for(const key of ['fee','wage']) {
    add([...rows].sort((a,b) => a.cost[key]-b.cost[key] || byScore(a,b)).slice(0,6));
    add([...rows].sort((a,b) => b.score/(1+b.cost[key])-a.score/(1+a.cost[key]) || byScore(a,b)).slice(0,6));
  }
  add(rows.filter(row=>row.cost.owned).sort(byScore).slice(0,8));
  return [...selected.values()].sort(byScore);
}

function recommendBudget({players, squad, originalSquad, settings:raw, saved=[], catalog, recruitment,
  style, focus, formationChoice, bonuses, routes=new Map(), ownedPlayers=players, excluded=new Set()}) {
  const settings=M.options({...raw,style,focus});
  const feeLimit=settings.squadFeeLimit, wageLimit=settings.squadWageLimit;
  const entries=new Map(saved.map(row=>[row.player.id,row]));
  const notes=id=>entries.get(id)?.observation??{};
  const byId=new Map(players.map(player=>[player.id,player]));
  const owned=new Set(C.allSlots(originalSquad).map(slot=>slot.playerId).filter(Boolean));
  for(const player of ownedPlayers)if(recruitment?.fit(player)?.type==='current')owned.add(player.id);
  const allById=new Map(ownedPlayers.map(player=>[player.id,player]));
  const gameDate=settings.gameDate||(catalog?.date??'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  const costs=new Map();
  let excludedUnknown=0;
  function costFor(player) {
    if(costs.has(player.id))return costs.get(player.id);
    const isOwned=owned.has(player.id);
    const route=isOwned?'current':R.transferRoute(player,notes(player.id),{...settings,scope:'market'},gameDate,routes.get(player.id)?.type);
    const finance=R.finance(player,notes(player.id),route,settings,gameDate);
    const fee=isOwned?0:finance.upfront,wage=finance.weeklyWage;
    const cost={owned:isOwned,route,fee:fee??0,wage:wage??0,feeKnown:fee!=null,wageKnown:wage!=null,finance};
    costs.set(player.id,cost);return cost;
  }
  let baseWage=0,baseWageKnown=true;
  for(const id of owned){
    const player=allById.get(id);
    if(!player)throw new Error('기존 선수의 정보를 불러온 뒤 다시 추천해주세요.');
    const cost=costFor(player);baseWage+=cost.wage;baseWageKnown&&=cost.wageKnown;
    if(wageLimit!=null&&!cost.wageKnown)throw new Error(player.name+'의 주급이 미확인이에요. 같은 통화의 예상 주급을 저장해야 선수단 전체 주급을 확인할 수 있어요.');
  }
  if(!settings.allowSales&&wageLimit!=null&&baseWage>wageLimit)throw new Error('기존 선수단 주급만으로 전체 주급 한도를 초과해요. 매각 반영을 켜거나 주급 한도를 조정해주세요.');
  const locked=C.allSlots(squad).filter(slot=>slot.locked&&slot.playerId);
  const fixedIds=new Set(locked.map(slot=>slot.playerId));
  const sales=createSalesPlanner({settings,owned,allById,fixedIds,entries,costFor,originalSquad});
  const outlooks=new Map();
  const eligible=players.filter(player=>{
    const fixed=fixedIds.has(player.id),cost=costFor(player),entry=entries.get(player.id),observation=notes(player.id);
    if((!cost.owned&&!cost.route)||(feeLimit!=null&&!cost.feeKnown)||(wageLimit!=null&&!cost.wageKnown)){
      excludedUnknown++;
      if(fixed)throw new Error(player.name+'의 영입 비용 또는 주급이 미확인이거나 영입 경로가 맞지 않아요. 고정 선수도 전체 예산 확인이 필요해요.');
      return false;
    }
    if(fixed)return true;
    if(['medium','severe'].includes(observation.injury)||observation.fitness==='unfit')return false;
    if(!cost.owned&&(entry?.list==='block'||entry?.list==='academy'||(!settings.includeHistoric&&R.archived(player))))return false;
    const outlook=D.outlook(player,observation,settings.growthSeasons);outlooks.set(player.id,outlook);
    return cost.owned||R.matches(player,outlook,{...settings,query:'',club:'',league:'',nation:'',roleLevel:null},catalog?.gender?.(player));
  });
  const within=state=>sales.possible(state);
  const reportCache=new Map();
  function rowFor(player,slot,role=slot.role) {
    const key=player.id+'|'+slot.pos+'|'+(role?.id??'')+'|'+(role?.focus??'');
    if(!reportCache.has(key)){
      const report=R.evaluate(player,{...settings,position:slot.pos,role:role?.id??'',roleFocus:role?.focus??'',deployment:'any'},
        notes(player.id),costFor(player).route,gameDate,outlooks.get(player.id));
      reportCache.set(key,report?{player,report,cost:costFor(player),score:report.score+(bonuses?.get(player.id)??0)}:null);
    }
    return reportCache.get(key);
  }
  const fixedShape=locked.length>0||formationChoice==='current';
  const formations=fixedShape?[squad.formation]:formationChoice==='auto'?C.STYLES[style].formations:[formationChoice];
  const solutions=[];
  let explored=0;
  for(const formation of formations){
    const slots=fixedShape?clone(squad.slots):C.makeSlots(formation,squad.slots);
    const options=new Map(),supportRows=new Map();
    for(const slot of slots){
      if(slot.locked)continue;
      const natural=[],conversion=[];
      for(const player of eligible){
        if(fixedIds.has(player.id))continue;
        const isNatural=player.positions.includes(slot.pos);
        if(!isNatural&&(settings.deployment==='natural'||player.positions.includes('GK')||slot.pos==='GK'))continue;
        const row=rowFor(player,slot);
        if(!row)continue;
        if(isNatural)natural.push(row);else if(row.report.delta>=-8)conversion.push(row);
      }
      options.set(slot.id,[...shortlist(natural),...shortlist(conversion,6).slice(0,12)]);
      for(const roleId of ['holding','defender','fullback','inside-forward']){
        const role=C.FC_IQ.getRole(slot.pos,roleId);
        if(!role)continue;
        const roleFocus=role.focuses.includes('defend')?'defend':role.focuses[0];
        const rows=natural.map(row=>rowFor(row.player,slot,{id:roleId,focus:roleFocus})).filter(Boolean);
        supportRows.set(slot.id+'|'+roleId,rows);
        options.set(slot.id,[...options.get(slot.id),...shortlist(rows,5)]);
      }
      options.set(slot.id,[...new Map(options.get(slot.id).map(row=>[rowKey(row),row])).values()]);
    }
    let initial={rows:Array(slots.length).fill(null),used:new Set(),fee:0,wage:baseWage,
      feeKnown:true,wageKnown:baseWageKnown,score:0,filled:0,skipped:new Set()};
    function add(state,index,row){
      if(state.rows[index]||state.used.has(row.player.id))return null;
      const cost=row.cost;
      const next={...state,rows:state.rows.slice(),used:new Set(state.used),
        fee:state.fee+(cost.owned?0:cost.fee),wage:state.wage+(cost.owned?0:cost.wage),
        feeKnown:state.feeKnown&&cost.feeKnown,wageKnown:state.wageKnown&&cost.wageKnown,
        score:state.score+row.score,filled:state.filled+1};
      next.rows[index]=row;next.used.add(row.player.id);
      if(!within(next))return null;
      return next;
    }
    for(const slot of locked){
      const player=byId.get(slot.playerId);
      if(!player)throw new Error('고정 선수의 데이터를 확인해주세요.');
      if(slot.pos==='SUB'||slot.pos==='RES'){
        const cost=costFor(player);initial.used.add(player.id);
        if(!cost.owned){initial.fee+=cost.fee;initial.wage+=cost.wage;initial.feeKnown&&=cost.feeKnown;initial.wageKnown&&=cost.wageKnown;}
      }else{
        const index=slots.findIndex(row=>row.id===slot.id),row=rowFor(player,slot);
        if(!row)throw new Error(player.name+'의 고정 포지션을 계산할 수 없어요.');
        initial=add(initial,index,row);
        if(!initial)break;
      }
    }
    if(!initial||!within(initial))throw new Error('고정 선수까지 포함하면 전체 예산을 초과해요. 예산이나 고정 선수를 조정해주세요.');
    function compatible(source,candidate,index,sourceIndex){
      if(index===sourceIndex||!candidate||!candidate.player.positions.includes(slots[index].pos))return false;
      if(slots[index].locked&&!slots[index].role)return false;
      const need=R.supportNeed({position:slots[sourceIndex].pos});
      const role=C.FC_IQ.getRole(slots[index].pos,need.role);
      const focus=role?.focuses.includes('defend')?'defend':role?.focuses[0];
      return need.positions.includes(slots[index].pos)&&candidate.report.role.id===need.role&&candidate.report.role.focus===focus&&
        R.supportEvidence(source.player,candidate.player,need,notes(candidate.player.id)).sufficient;
    }
    function missingCover(state){
      return state.rows.findIndex((row,index)=>row&&!row.player.positions.includes(slots[index].pos)&&
        !state.rows.some((candidate,j)=>compatible(row,candidate,j,index)));
    }
    const coverCache=new Map();
    function coverOptions(state,index){
      const source=state.rows[index],need=R.supportNeed({position:slots[index].pos}),result=[];
      slots.forEach((slot,j)=>{
        if(state.rows[j]||state.skipped.has(j)||slot.locked||!need.positions.includes(slot.pos))return;
        const key=source.player.id+'|'+index+'|'+slot.id;
        if(!coverCache.has(key))coverCache.set(key,shortlist((supportRows.get(slot.id+'|'+need.role)??[])
          .filter(row=>compatible(source,row,j,index)),12));
        for(const row of coverCache.get(key)){
          const next=add(state,j,row);if(next)result.push(next);
        }
      });
      return result;
    }
    const compare=(a,b)=>a.skipped.size-b.skipped.size||
      (b.score+(11-b.filled-b.skipped.size)*75)-(a.score+(11-a.filled-a.skipped.size)*75)||a.fee-b.fee||a.wage-b.wage;
    function prune(states){
      const unique=new Map();
      for(const state of states){
        const key=state.rows.map(row=>row?rowKey(row):'').join('|')+';'+[...state.skipped].join(',');
        if(!unique.has(key))unique.set(key,state);
      }
      const all=[...unique.values()].sort(compare);
      const keep=new Set(all.slice(0,WIDTH/2));
      // Diversity by both budgets prevents an expensive early pick from erasing
      // affordable completions. This is bounded search, not an exact solver.
      const groups=new Map();
      for(const state of all){
        const key=state.filled+'|'+Math.floor(8*state.fee/Math.max(1,feeLimit??1e9))+'|'+Math.floor(8*state.wage/Math.max(1,wageLimit??1e6));
        if(!groups.has(key))groups.set(key,[]);
        if(groups.get(key).length<3)groups.get(key).push(state);
      }
      for(const values of groups.values())for(const state of values){if(keep.size<WIDTH)keep.add(state);}
      // Preserve low-spend completions even when most buckets are identical.
      for(const key of ['fee','wage'])for(const state of [...all].sort((a,b)=>a.skipped.size-b.skipped.size||a[key]-b[key]||b.score-a.score).slice(0,12))keep.add(state);
      return [...keep];
    }
    let beam=[initial];
    for(let step=0;step<11&&beam.some(state=>missingCover(state)>=0);step++){
      beam=prune(beam.flatMap(state=>{
        const missing=missingCover(state);return missing<0?[state]:coverOptions(state,missing);
      }));
    }
    // Resolve positions that need a conversion before consuming their support
    // slots. FC snapshots can use LF/RF rather than LW/RW, making this material.
    const priority=['LW','RW','LM','RM','CAM','CM','ST','LB','RB','CB','CDM','GK'];
    const order=slots.map((slot,index)=>({index,slot,natural:(options.get(slot.id)??[]).filter(row=>row.player.positions.includes(slot.pos)).length}))
      .sort((a,b)=>Number(a.natural>0)-Number(b.natural>0)||priority.indexOf(a.slot.pos)-priority.indexOf(b.slot.pos));
    for(const {index} of order){
      if(!beam.length)break;
      const next=[];
      for(const state of beam){
        if(state.rows[index]){next.push(state);continue;}
        // Conversions consume two slots atomically: never retain an unsupported
        // conversion as a completed result or spend its cover budget elsewhere.
        for(const row of options.get(slots[index].id)??[]){
          explored++;
          const candidate=add(state,index,row);if(!candidate)continue;
          const gap=missingCover(candidate);
          if(gap>=0)next.push(...coverOptions(candidate,gap));else next.push(candidate);
        }
        next.push({...state,skipped:new Set([...state.skipped,index])});
      }
      beam=prune(next);
    }
    for(const state of beam)if(missingCover(state)<0){
      const sale=sales.settle(state);
      if(sale)solutions.push({state,sale,slots,formation,fixedShape});
    }
  }
  solutions.sort((a,b)=>b.state.filled-a.state.filled||(b.state.score-b.sale.loss)-(a.state.score-a.sale.loss)||
    a.sale.outgoing.length-b.sale.outgoing.length||(a.state.fee-a.sale.reinvested)-(b.state.fee-b.sale.reinvested));
  const best=solutions[0];
  if(!best)throw new Error('예산과 고정 배치를 지키면서 사파 커버까지 구성할 조합을 찾지 못했어요. 고정 위치나 예산을 조정해주세요.');
  const {state,slots}=best;
  const reasons={};
  const finalSlots=slots.map((slot,i)=>{
    const row=state.rows[i];
    if(!row)return {...slot,playerId:null,locked:false};
    const role={id:row.report.role.id,focus:row.report.role.focus};
    reasons[slot.id]=[...(slot.locked?['직접 고정한 선수 · 현재 위치 유지']:[]),
      ...C.recommendationReasons(row.player,slot.pos,style,focus,notes(row.player.id),settings,row.report),
      row.cost.owned?'기존 선수 활용 · 이적료 없음':'영입 조합에 포함 · '+M.money(row.cost.feeKnown?row.cost.fee:null,settings.currency)];
    return {...slot,playerId:row.player.id,role:slot.locked?slot.role:role};
  });
  const used=new Set(finalSlots.map(slot=>slot.playerId).filter(Boolean));
  locked.forEach(slot=>used.add(slot.playerId));
  const sold=new Set(best.sale.outgoing.map(row=>row.id));
  const remaining=[...owned].map(id=>allById.get(id)).filter(player=>player&&!used.has(player.id)&&!sold.has(player.id)&&!excluded.has(player.id)).sort((a,b)=>b.overall-a.overall);
  function retain(original){return original.map(slot=>slot.locked?{...slot}:{...slot,playerId:remaining.shift()?.id??null,locked:false});}
  const bench=retain(squad.bench),reserves=retain(squad.reserves);
  function finances(solution){
    const ids=new Set(solution.state.rows.filter(Boolean).map(row=>row.player.id));
    locked.forEach(slot=>ids.add(slot.playerId));
    const incoming=[...ids].filter(id=>!owned.has(id)).map(id=>{
      const player=byId.get(id),cost=costFor(player);
      return {id,name:player.name,fee:cost.feeKnown?cost.fee:null,weeklyWage:cost.wageKnown?cost.wage:null,route:cost.route};
    });
    const sale=solution.sale;
    return {incoming,outgoing:sale.outgoing,fee:solution.state.feeKnown?solution.state.fee:null,
      wage:solution.state.wageKnown?solution.state.wage-sale.wageSaved:null,
      saleProceeds:sale.proceeds,reinvestedProceeds:sale.reinvested,wageSaved:sale.wageSaved,
      availableFee:feeLimit==null?null:feeLimit+sale.reinvested,
      netSpend:solution.state.feeKnown?solution.state.fee-sale.reinvested:null,conditional:sale.outgoing.length>0,
      feeRemaining:feeLimit==null?null:feeLimit+sale.reinvested-solution.state.fee,
      wageRemaining:wageLimit==null?null:wageLimit-solution.state.wage+sale.wageSaved};
  }
  const packageRows=[];
  finalSlots.forEach((slot,i)=>{
    const source=state.rows[i];if(!source||source.player.positions.includes(slot.pos))return;
    const need=R.supportNeed({position:slot.pos});
    const coverIndex=state.rows.findIndex((row,j)=>j!==i&&row&&row.player.positions.includes(slots[j].pos)&&
      need.positions.includes(slots[j].pos)&&row.report.role.id===need.role&&
      R.supportEvidence(source.player,row.player,need,notes(row.player.id)).sufficient);
    if(coverIndex<0)throw new Error('최종 사파 커버 검증에 실패했어요. 다시 추천해주세요.');
    const partner=state.rows[coverIndex];
    const pair={playerId:source.player.id,name:source.player.name,position:slot.pos,coverId:partner.player.id,
      coverName:partner.player.name,coverPosition:slots[coverIndex].pos,coverRole:partner.report.role.name,
      sourceOwned:source.cost.owned,coverOwned:partner.cost.owned};
    packageRows.push(pair);
    reasons[slot.id].push('함께 배치 · '+pair.coverName+' '+pair.coverPosition+' '+pair.coverRole);
  });
  const alternatives=[],seen=new Set();
  for(const solution of solutions){
    const key=solution.state.rows.map(row=>row?.player.id??'').sort().join('|')+';'+solution.sale.outgoing.map(row=>row.id).sort().join('|');
    if(seen.has(key))continue;seen.add(key);
    alternatives.push({formation:solution.formation,filled:solution.state.filled,score:C.round((solution.state.score-solution.sale.loss)/11),...finances(solution)});
    if(alternatives.length===3)break;
  }
  return {formation:best.formation,slots:finalSlots,bench,reserves,reasons,score:C.round((state.score-best.sale.loss)/11),filled:state.filled,
    fixedShape:best.fixedShape,style,focus,custom:best.fixedShape?squad.custom:false,cover:[],
    budget:{...finances(best),currency:settings.currency,feeLimit,wageLimit,baseWage:baseWageKnown?baseWage:null,
      ownedCount:owned.size,packages:packageRows,alternatives,excludedUnknown,explored,
      minimumRetained:sales.minimumSize,salesEnabled:settings.allowSales,
      saleValuePercent:settings.saleValuePercent,saleReinvestmentPercent:settings.saleReinvestmentPercent,
      complete:state.filled===11,method:'bounded-bundle-search',
      note:'후보를 추려 전력과 선수층 손실을 비교한 제한 탐색이며 전역 최적해를 보장하지 않아요. 매각 수입과 절감 주급은 매각 성사 가정입니다. 선수 삭제·실제 이적·예산 정산은 하지 않으며, 계약 해지금과 미입력 보너스는 계산하지 않아요.'}};
}
module.exports={recommendBudget};
