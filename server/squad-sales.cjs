'use strict';
const C=require('../src/core.js');
const D=require('../src/career-development.js');

// Sale receipts are conditional planning funds. Never infer contract termination
// costs or settled transfer proceeds from a roster change.
function createSalesPlanner({settings,owned,allById,fixedIds,entries,costFor,originalSquad}){
  const minimumSize=Math.min(18,owned.size);
  const keepers=[...owned].filter(id=>allById.get(id).positions.includes('GK')).length;
  const starterIds=new Set(originalSquad.slots.map(slot=>slot.playerId));
  const candidates=[];
  if(settings.allowSales&&settings.maxSales>0)for(const id of owned){
    if(fixedIds.has(id))continue;
    const player=allById.get(id),entry=entries.get(id),notes=entry?.observation??{},cost=costFor(player);
    const recorded=notes.currency===settings.currency?notes.expectedSaleFee:null;
    const market=player.profile?.marketValue?.[settings.currency];
    const proceeds=recorded??(market==null?null:Math.floor(market*settings.saleValuePercent/100));
    if(proceeds==null||!cost.wageKnown)continue;
    const growth=D.outlook(player,notes,settings.growthSeasons);
    const onList=entry?.list==='transfer';
    const loss=(onList?1:3)+(player.overall/20)+Math.max(0,growth.gap??0)/10+(starterIds.has(id)?2:0);
    candidates.push({id,name:player.name,positions:player.positions,proceeds,
      reinvested:Math.floor(proceeds*settings.saleReinvestmentPercent/100),weeklyWage:cost.wage,
      source:recorded!=null?'save':'market-discount',loss,
      reason:onList?'이적 명단에 등록한 선수':starterIds.has(id)?'선발 대체안을 함께 확보할 때 매각 검토':'후보·예비 또는 감독 구단의 잉여 자원',
      growthGap:growth.gap,overall:player.overall});
  }
  const picks=new Map();
  const add=rows=>rows.forEach(row=>picks.set(row.id,row));
  add([...candidates].sort((a,b)=>a.loss-b.loss||b.weeklyWage-a.weeklyWage).slice(0,6));
  add([...candidates].sort((a,b)=>b.weeklyWage-b.loss*1000-(a.weeklyWage-a.loss*1000)).slice(0,4));
  add([...candidates].sort((a,b)=>b.reinvested/b.loss-a.reinvested/a.loss).slice(0,4));
  const shortlist=[...picks.values()];
  const max=settings.allowSales?settings.maxSales:0;
  function possible(state){
    const available=shortlist.filter(row=>!state.used.has(row.id));
    const credit=[...available].sort((a,b)=>b.reinvested-a.reinvested).slice(0,max).reduce((sum,row)=>sum+row.reinvested,0);
    const wages=[...available].sort((a,b)=>b.weeklyWage-a.weeklyWage).slice(0,max).reduce((sum,row)=>sum+row.weeklyWage,0);
    return (settings.squadFeeLimit==null||state.fee<=settings.squadFeeLimit+credit)&&
      (settings.squadWageLimit==null||state.wage-wages<=settings.squadWageLimit);
  }
  function settle(state){
    const available=shortlist.filter(row=>!state.used.has(row.id));
    const incoming=[...state.used].filter(id=>!owned.has(id));
    const incomingKeepers=incoming.filter(id=>allById.get(id)?.positions.includes('GK')).length;
    let best=null;
    function visit(start,selected,proceeds,reinvested,wageSaved,loss,soldKeepers){
      const valid=(settings.squadFeeLimit==null||state.fee<=settings.squadFeeLimit+reinvested)&&
        (settings.squadWageLimit==null||state.wage-wageSaved<=settings.squadWageLimit)&&
        owned.size-selected.length+incoming.length>=minimumSize&&keepers-soldKeepers+incomingKeepers>=Math.min(2,keepers);
      if(valid){
        if(!best||loss<best.loss||(loss===best.loss&&selected.length<best.outgoing.length))
          best={outgoing:[...selected],proceeds,reinvested,wageSaved,loss};
        return;
      }
      if(selected.length>=max||(best&&loss>=best.loss))return;
      for(let i=start;i<available.length;i++){
        const row=available[i];
        visit(i+1,[...selected,row],proceeds+row.proceeds,reinvested+row.reinvested,wageSaved+row.weeklyWage,loss+row.loss,
          soldKeepers+Number(row.positions.includes('GK')));
      }
    }
    visit(0,[],0,0,0,0,0);return best;
  }
  return {possible,settle,candidates:shortlist,minimumSize};
}
module.exports={createSalesPlanner};
