'use strict';
const crypto=require('node:crypto');
const C=require('../src/core.js');
const X=require('../src/ai-context.js');
const P=require('../src/playstyles.js');
const D=require('../src/career-development.js');
const R=require('../src/career-ranking.js');
const {recommendBudget}=require('./squad-budget.cjs');
const {searchText}=require('./fcradar-aliases.cjs');
const {STAGES,recruitmentFor}=require('./career-recruitment.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const text=(max=120)=>({type:'string',maxLength:max});
const nullableInteger=(min,max)=>({type:['integer','null'],minimum:min,maximum:max});
const stringArray=(max=7)=>({type:'array',items:text(),maxItems:max});
const CAREER_DEFAULTS={careerClub:null,careerStage:null,gender:null};
const CAREER_FIELDS={
  careerClub:{type:['string','null'],maxLength:100},
  careerStage:{type:['string','null'],enum:[...Object.keys(STAGES),null]},
  gender:{type:['string','null'],enum:['male','female',null]},
};
const RECOMMEND_DEFAULTS={preferredPlaystyles:[],anchorPlayerId:null,anchorPosition:null,squadFeeLimit:null,squadWageLimit:null,currency:null,
  allowSales:null,maxSales:null,saleValuePercent:null,saleReinvestmentPercent:null,...CAREER_DEFAULTS};
function tool(name,description,properties){return {type:'function',name,description,strict:true,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};}
const DEFINITIONS=[
  tool('get_current_squad','현재 스쿼드의 실제 선수 ID·자리 ID·포메이션·추천 고정 상태를 확인한다.',{}),
  tool('list_formations','지원하는 FC27 포메이션 29종과 각 포지션을 확인한다.',{}),
  tool('search_players','이름, 포지션, 나이, OVR, POT, 플레이스타일로 로컬 DB와 내 선수를 검색한다. 이름 없는 검색은 query를 빈 문자열로 둔다. playstyles는 필수 특성이다. 감아차기+는 플러스만, 감아차기는 두 등급, base:finesse-shot은 일반만, +는 아무 플러스, []는 제한 없음이다. 구단별 영입 후보 검색에는 careerClub에 데려올 구단의 DB 이름을 넣는다. 특정 선수의 정보 조회에는 careerClub과 careerStage를 null로 둔다.',{
    query:text(100),position:{type:['string','null'],enum:[...Object.keys(C.WEIGHTS),null]},
    maxAge:nullableInteger(14,65),minOverall:nullableInteger(1,99),minPotential:nullableInteger(1,99),
    sort:{type:'string',enum:['overall','potential','age']},playstyles:stringArray(6),...CAREER_FIELDS,
  }),
  tool('scout_players','개별 영입·유망주·사파 후보를 스카우팅 화면과 같은 성장·역할 기준으로 추천한다. 지정하지 않은 조건은 null로 보내 세이브 설정을 사용한다. 사파 커버는 추천 후 analyze_position으로 조회한다.',{
    position:{type:'string',enum:C.POSITIONS},query:text(100),
    role:{type:['string','null'],maxLength:32},roleFocus:{type:['string','null'],maxLength:20},
    style:{type:['string','null'],enum:[...Object.keys(C.STYLES),null]},
    focus:{type:['string','null'],enum:['balanced','youth','ready',null]},
    deployment:{type:['string','null'],enum:['any','natural','conversion',null]},
    growthSeasons:{type:['integer','null'],enum:[2,4,6,null]},
    maxAge:nullableInteger(14,65),minPotential:nullableInteger(1,99),...CAREER_FIELDS,
  }),
  tool('get_player_details','검색 결과의 선수 ID로 플레이스타일, 세부 스탯, 성장 유형과 전성기 나이, POT 여지, 포지션별 OVR 추정을 확인한다. 전성기 나이는 성장 유형별 분석 범위이며, POT 여지는 스냅샷 POT와 기준 OVR의 차이다. null은 DB 미확인, 빈 배열은 보유 특성 없음이다.',{playerIds:stringArray(3)}),
  tool('recommend_squad','적용 가능한 전체 스쿼드를 계산한다. 구단 커리어에는 careerClub에 운영할 구단의 DB 이름을 넣는다. careerStage는 start(첫 시즌), build(승격·안착 후), contender(유럽대항전·우승 경쟁), fantasy(현실성 제한을 명시적으로 해제)이며, 구단 미지정은 둘 다 null이다. 남자·여자 동명 구단은 gender로 구분한다. 이미 배치한 추가 고정은 fixedPlayerIds, 지정 포지션에 둘 선수는 검색한 anchorPlayerId와 anchorPosition이다. 금특 선호는 preferredPlaystyles에 ["+"], 선호 없음은 []를 넣는다.',{
    style:{type:'string',enum:Object.keys(C.STYLES)},focus:{type:'string',enum:['balanced','youth','ready']},
    formation:{type:'string',enum:['auto','current',...C.FORMATIONS.map(f=>f.id)]},
    maxAge:nullableInteger(14,65),minOverall:nullableInteger(1,99),minPotential:nullableInteger(1,99),
    excludedPlayerIds:stringArray(30),fixedPlayerIds:stringArray(20),preferredPlaystyles:stringArray(6),
    squadFeeLimit:nullableInteger(0,1e10),squadWageLimit:nullableInteger(0,1e8),
    allowSales:{type:['boolean','null']},maxSales:nullableInteger(0,5),
    saleValuePercent:nullableInteger(10,100),saleReinvestmentPercent:nullableInteger(0,100),
    currency:{type:['string','null'],enum:['eur','gbp','usd',null]},
    anchorPlayerId:{type:['string','null'],maxLength:120},anchorPosition:{type:['string','null'],enum:[...C.POSITIONS,null]},...CAREER_FIELDS,
  }),
  tool('analyze_position','선수를 다른 포지션에 배치할 때 같은 세부 스탯 기준으로 OVR 추정과 가중치 기여도를 계산한다. 사파 전환에는 현재 팀의 커버 선수와 부족할 때의 영입 후보도 반환한다. 실제 게임의 비선호 포지션 페널티·Dynamic OVR는 모른다.',{playerId:text(),position:{type:'string',enum:C.POSITIONS}}),
  tool('calculate_stat_plan','선수 ID·목표 포지션·OVR·원하는 장단점으로 세 가지 실제 스탯 변경안을 계산한다. archetype은 유형, constraints는 구체적 스탯 하한/상한이며 같은 스탯은 유형 기본값을 덮어쓴다. 숫자를 말하지 않은 빠른 피지컬·패스 약점은 fast-physical-poor-passing을 사용하고 기본 기준임을 설명한다. 목표 불가능 시 reachableRange와 blockers를 설명하며 조건을 몰래 풀지 않는다.',{
    playerId:text(),position:{type:'string',enum:C.POSITIONS},targetOverall:{type:'integer',minimum:1,maximum:99},style:{type:'string',enum:Object.keys(C.STYLES)},
    archetype:{type:'string',enum:Object.keys(C.STAT_PRESETS)},
    constraints:{type:'array',maxItems:C.ATTRIBUTES.length,items:{type:'object',additionalProperties:false,
      required:['attribute','min','max','priority'],properties:{attribute:{type:'string',enum:Object.keys(C.ATTRIBUTE_NAMES)},
        min:nullableInteger(1,99),max:nullableInteger(1,99),priority:{type:'integer',minimum:1,maximum:5}}}},
  }),
  tool('propose_player_move','선수 DB나 개인 목록의 선수를 현재 경기장·후보·예비의 특정 slotId에 배치하는 변경안을 준비한다. 이미 선수가 있으면 교체한다. 기존 고정 선수는 이동시키지 않는다.',{playerId:text(),targetSlotId:text(30)}),
  tool('list_player_roles','FC IQ 포지션별 역할 ID와 허용 포커스를 조회한다. 필요한 포지션을 한 번에 보낸다. 빈 목록은 전 포지션이다.',{
    positions:{type:'array',items:{type:'string',enum:C.POSITIONS},maxItems:12},
  }),
  tool('propose_player_roles','현재 스쿼드의 선발 자리에 역할과 포커스를 지정하는 변경안을 준비한다. 앱 요약의 slotId와 역할 목록에서 확인한 ID를 사용한다. 해제는 roleId와 focus를 모두 null로 보낸다. 원하는 변경을 한 호출에 모아 보낸다.',{
    assignments:{type:'array',minItems:1,maxItems:11,items:{
      type:'object',additionalProperties:false,required:['slotId','roleId','focus'],
      properties:{slotId:text(30),roleId:{type:['string','null'],maxLength:32},focus:{type:['string','null'],maxLength:24}},
    }},
  }),
];
const BY_NAME=new Map(DEFINITIONS.map(t=>[t.name,t]));
function validateValue(value,schema,key){
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  if(value===null){if(types.includes('null'))return;throw new Error(key+' 값이 필요해요.');}
  if(types.includes('boolean')){if(typeof value!=='boolean')throw new Error(key+' 선택값을 확인해주세요.');return;}
  if(schema.enum&&!schema.enum.includes(value))throw new Error(key+' 선택값이 올바르지 않아요.');
  if(types.includes('integer')){if(!Number.isInteger(value)||value<schema.minimum||value>schema.maximum)throw new Error(key+' 숫자 범위를 확인해주세요.');return;}
  if(types.includes('string')){if(typeof value!=='string'||value.length>(schema.maxLength||1000))throw new Error(key+' 문자열을 확인해주세요.');return;}
  if(types.includes('array')){
    if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>schema.maxItems)throw new Error(key+' 목록을 확인해주세요.');
    value.forEach(v=>validateValue(v,schema.items,key));return;
  }
  if(types.includes('object'))validateFields(value,schema.properties);
}
function validateFields(args,properties){
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('기능 호출의 입력 형식이 올바르지 않아요.');
  const keys=Object.keys(properties);
  if(Object.keys(args).some(key=>!Object.hasOwn(properties,key))||keys.some(key=>!Object.hasOwn(args,key)))throw new Error('기능 호출에 필요한 입력값을 확인해주세요.');
  for(const key of keys)validateValue(args[key],properties[key],key);
}
function validateArguments(name,args){
  const definition=BY_NAME.get(name);if(!definition)throw new Error('지원하지 않는 기능 호출이에요.');
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('기능 호출의 입력 형식이 올바르지 않아요.');
  if(name==='recommend_squad')args={...RECOMMEND_DEFAULTS,...args};
  if(name==='calculate_stat_plan')args={archetype:'custom',constraints:[],...args};
  if(name==='search_players')args={...CAREER_DEFAULTS,...args};
  validateFields(args,definition.parameters.properties);
  return args;
}
function playerPool(context,catalog){
  const saved=new Map(context.players.map(player=>{
    const row=catalog?.get?.(player.id);
    return [player.id,row?{...player,profile:{...player.profile,...row.profile},playstyles:row.playstyles??player.playstyles,playstyle_plus:row.playstyle_plus??player.playstyle_plus}:player];
  }));
  const find=id=>saved.get(id)||catalog?.get(id);
  const get=id=>{const p=find(id);if(!p)throw new Error('등록된 선수나 로컬 DB에 없는 ID예요. 먼저 선수를 검색해주세요.');return p;};
  const all=()=>catalog?[...saved.values(),...catalog.players.filter(p=>!saved.has(p.id))]:context.players;
  const extra=ids=>catalog?[...new Set(ids)].filter(id=>!saved.has(id)).map(id=>catalog.display(get(id))):[];
  const gender=id=>{const row=catalog?.get?.(id);return row?catalog.gender?.(row):null;};
  return {find,get,all,extra,gender,hasGender:!!catalog?.facets?.genderKnown};
}
function addPlayers(payload,players){return players.length?{...payload,players}:payload;}
function squadPlayerIds(squad){return C.allSlots(squad).map(slot=>slot.playerId).filter(Boolean);}
function matchesLimits(player,args,outlook){
  const age=outlook?.age??player.age,potential=outlook?.potential??player.potential;
  return (args.maxAge===null||(age!==null&&age<=args.maxAge))&&
    (args.minOverall===null||player.overall>=args.minOverall)&&
    (args.minPotential===null||(potential!==null&&potential>=args.minPotential));
}
function placeAnchor(squad,args,pool){
  if(args.anchorPlayerId===null&&args.anchorPosition===null)return;
  if(!args.anchorPlayerId||!args.anchorPosition)throw new Error('선수 ID와 고정할 포지션을 함께 지정해주세요.');
  const player=pool.get(args.anchorPlayerId),position=args.anchorPosition;
  const slots=C.allSlots(squad);
  const keepShape=args.formation==='current'||slots.some(slot=>slot.locked&&slot.playerId);
  if(!keepShape){
    const options=args.formation==='auto'?[...C.STYLES[args.style].formations,...C.FORMATIONS.map(shape=>shape.id)]:[args.formation];
    const formation=options.find(id=>C.FORMATION_MAP.get(id).slots.some(slot=>slot.pos===position));
    if(!formation)throw new Error(position+' 자리가 있는 포메이션을 골라주세요.');
    if(formation!==squad.formation||squad.custom){squad.slots=C.makeSlots(formation,squad.slots);squad.formation=formation;squad.custom=false;}
  }
  const origin=C.allSlots(squad).find(slot=>slot.playerId===player.id);
  const available=squad.slots.filter(slot=>slot.pos===position&&(!slot.locked||slot.playerId===player.id));
  const target=available.find(slot=>slot.playerId===player.id)||available.find(slot=>!slot.playerId)||available[0];
  if(!target)throw new Error('현재 포메이션에 사용할 수 있는 '+position+' 자리가 없어요.');
  if(origin?.locked&&origin.id!==target.id)throw new Error('이미 고정된 선수의 자리를 옮길 수 없어요.');
  C.movePlayer(squad,player.id,target.id);
  target.locked=true;
}
function buildRecommendation(args,context,pool,catalog){
  const gender=args.gender??(context.recommendation?.settings.gender||pool.gender(args.anchorPlayerId));
  if(gender&&!pool.hasGender)throw new Error('남자·여자 분류가 적재된 선수 DB가 필요해요.');
  const club=args.careerClub??context.recommendation?.settings.careerClub;
  const league=club===context.recommendation?.settings.careerClub?context.recommendation?.settings.careerLeague:null;
  const recruitment=club?recruitmentFor(catalog,club,args.careerStage??context.recommendation?.settings.careerStage??'start',gender,league||null):null;
  const settings={...context.recommendation?.settings,
    allowSales:args.allowSales??context.recommendation?.settings.allowSales,
    maxSales:args.maxSales??context.recommendation?.settings.maxSales,
    saleValuePercent:args.saleValuePercent??context.recommendation?.settings.saleValuePercent,
    saleReinvestmentPercent:args.saleReinvestmentPercent??context.recommendation?.settings.saleReinvestmentPercent,
    gender,
    maxAge:args.maxAge??context.recommendation?.settings.maxAge,
    minOvr:args.minOverall??context.recommendation?.settings.minOvr,
    minPot:args.minPotential??context.recommendation?.settings.minPot,
    squadFeeLimit:args.squadFeeLimit??context.recommendation?.settings.squadFeeLimit,
    squadWageLimit:args.squadWageLimit??context.recommendation?.settings.squadWageLimit,
    currency:args.currency??context.recommendation?.settings.currency};
  const budgeted=settings.squadFeeLimit!=null||settings.squadWageLimit!=null||settings.allowSales;
  const current=clone(context.squad);
  for(const id of args.fixedPlayerIds){
    pool.get(id);
    const slot=C.allSlots(current).find(s=>s.playerId===id);
    if(!slot)throw new Error('현재 스쿼드에 배치한 선수만 추가로 고정할 수 있어요.');
    slot.locked=true;
  }
  placeAnchor(current,args,pool);
  const locked=new Set(C.allSlots(current).filter(s=>s.locked&&s.playerId).map(s=>s.playerId));
  if(args.excludedPlayerIds.some(id=>locked.has(id)))throw new Error('고정 선수는 추천에서 제외할 수 없어요. 먼저 스쿼드에서 고정을 해제해주세요.');
  const excluded=new Set(args.excludedPlayerIds);args.excludedPlayerIds.forEach(pool.get);
  const observations=new Map((context.recommendation?.targets??[]).map(row=>[row.player.id,row.observation]));
  let eligible=pool.all().filter(p=>locked.has(p.id)||(
    !excluded.has(p.id)&&(recruitment||!gender||pool.gender(p.id)===gender)&&matchesLimits(p,args,D.outlook(p,observations.get(p.id)))));
  const routes=new Map();
  if(recruitment)eligible=eligible.filter(player=>{
    const route=recruitment.fit(player)??(locked.has(player.id)?recruitment.fixed:null);
    if(route)routes.set(player.id,route);
    return !!route;
  });
  const preferences=args.preferredPlaystyles.map(P.filter), matchedTraits=new Set(), bonuses=new Map();
  const traitBonus=recruitment&&recruitment.info.stage!=='fantasy'?4:12;
  if(recruitment||preferences.length)for(const player of eligible){
    const preferred=preferences.some(preference=>P.matches(player,preference));
    if(preferred)matchedTraits.add(player.id);
    const bonus=(routes.get(player.id)?.bonus??0)+(preferred?traitBonus:0);
    if(bonus)bonuses.set(player.id,bonus);
  }
  const plan=budgeted?recommendBudget({players:eligible,squad:current,originalSquad:context.squad,settings,
    saved:context.recommendation?.targets,catalog,recruitment,style:args.style,focus:args.focus,
    formationChoice:args.formation,bonuses,routes,ownedPlayers:pool.all(),excluded}):
    C.recommend(eligible,current,args.style,args.focus,args.formation,bonuses,context.recommendation);
  for(const slot of plan.slots){
    if(args.anchorPlayerId&&slot.playerId===args.anchorPlayerId)plan.reasons[slot.id][0]='요청한 포지션에 고정';
    if(routes.has(slot.playerId))plan.reasons[slot.id].push(routes.get(slot.playerId).reason);
    if(matchedTraits.has(slot.playerId))plan.reasons[slot.id].push('선호한 플레이스타일 보유 우선');
  }
  const squad={...current,formation:plan.formation,slots:plan.slots,bench:plan.bench,reserves:plan.reserves,custom:plan.custom,style:args.style,focus:args.focus};
  const ids=squadPlayerIds(squad);
  const coverReports=[];
  for(const slot of budgeted?[]:plan.slots){
    const player=pool.find(slot.playerId);
    if(!player||player.positions.includes(slot.pos)||slot.pos==='GK')continue;
    const settings=R.validOptions({...context.recommendation?.settings,position:slot.pos,slotId:slot.id,
      role:slot.role?.id??'',roleFocus:slot.role?.focus??'',style:args.style,focus:args.focus,scope:'squad'},squad);
    const report=R.conversionSupport({player,settings,squad,players:ids.map(pool.get),
      saved:context.recommendation?.targets,catalog,recruitment}).find(row=>row.position===slot.pos);
    if(!report)continue;
    const support=report.support;
    const partners=support.current.filter(row=>row.sufficient);
    plan.reasons[slot.id].push(partners.length?'제안 스쿼드 커버 · '+partners.map(row=>row.player.name+' '+row.position).join(', '):
      '제안 스쿼드 커버 보완 필요'+(support.recruits.length?' · 영입 후보 '+support.recruits.map(row=>row.player.name).join(', '):''));
    coverReports.push({playerId:player.id,position:slot.pos,support});
  }
  plan.cover=coverReports;

  C.validateBackup({app:'touchline-fc27',version:1,players:ids.map(pool.get),squads:[squad],activeSquadId:squad.id});
  return {plan,squad,players:pool.extra(ids),eligibleCount:eligible.length,matchedTraits,routes,career:recruitment?.info??null};
}
function recommendForContext(input,context,catalog){
  const {matchedTraits,routes,...proposal}=buildRecommendation(validateArguments('recommend_squad',input),context,playerPool(context,catalog),catalog);
  return proposal;
}
function execute(name,input,context,catalog){
  const args=validateArguments(name,input),pool=playerPool(context,catalog);
  const getPlayer=pool.get;
  const saved=(context.recommendation?.targets??[]).map(row=>({...row,player:pool.find(row.player.id)})).filter(row=>row.player);
  const artifact=(type,title,payload)=>({id:crypto.randomUUID(),type,title,payload});
  switch(name){
    case 'get_current_squad':return {label:'현재 스쿼드 확인',result:{...X.squadSummary(context),catalogCount:catalog?.players.length??0}};
    case 'list_formations':return {label:'포메이션 확인',result:C.FORMATIONS.map(f=>({id:f.id,label:f.label,positions:f.slots.map(s=>s.pos)}))};
    case 'list_player_roles':{
      const positions=args.positions.length?[...new Set(args.positions)]:C.POSITIONS;
      return {label:'포지션별 역할·포커스 확인',result:{
        positions:Object.fromEntries(positions.map(pos=>[pos,C.FC_IQ.byPosition[pos]])),
        focuses:Object.fromEntries(Object.entries(C.FC_IQ.focuses).map(([id,{name}])=>[id,name])),
      }};
    }
    case 'propose_player_roles':{
      const next=clone(context.squad);
      if(new Set(args.assignments.map(({slotId})=>slotId)).size!==args.assignments.length)throw new Error('같은 자리에 역할을 한 번만 지정해주세요.');
      const changes=args.assignments.map(({slotId,roleId,focus})=>{
        const slot=next.slots.find(item=>item.id===slotId);
        C.setPlayerRole(slot,roleId,focus);
        const role=C.FC_IQ.getRole(slot.pos,roleId);
        return {slotId,position:slot.pos,player:pool.find(slot.playerId)?.name??null,
          role:role?{id:roleId,name:role.name,focus,focusName:C.FC_IQ.focuses[focus].name}:null};
      });
      const label='선수 역할 변경안 · '+changes.length+'자리';
      return {label,result:{changes},artifact:artifact('squad',label,{squad:next})};
    }
    case 'search_players':{
      const alias=searchText('search',args.query);
      const filters=args.playstyles.map(P.filter);
      const recruitment=args.careerClub?recruitmentFor(catalog,args.careerClub,args.careerStage??'start',args.gender):null;
      const routes=new Map();
      const candidates=pool.all().filter(p=>{
        if(!(C.matchesSearch(p,args.query)||C.matchesSearch(p,alias))||
          (args.position&&!p.positions.includes(args.position))||(!recruitment&&args.gender&&pool.gender(p.id)!==args.gender)||!matchesLimits(p,args))return false;
        if(!recruitment)return true;
        const route=recruitment.fit(p);
        if(!route||route.type==='current')return false;
        routes.set(p.id,route);
        return true;
      });
      const found=filters.length?candidates.filter(player=>filters.every(filter=>P.matches(player,filter))):candidates;
      found.sort((a,b)=>args.sort==='age'?(a.age??100)-(b.age??100):args.sort==='potential'?(b.potential??-1)-(a.potential??-1):b.overall-a.overall);
      const players=found.slice(0,20).map(player=>{
        const route=routes.get(player.id);
        return {...X.brief(player),...(filters.length?P.describe(player):{}),
          ...(route?{recruitment:route.type,recruitmentReason:route.reason}:{})};
      });
      const coverage=filters.length?{playstyleCoverage:{known:candidates.filter(player=>player.playstyles&&player.playstyle_plus).length,total:candidates.length}}:{};
      return {label:(recruitment?recruitment.info.club+' · '+recruitment.info.label+' 영입 후보':'선수 검색')+' · '+found.length+'명',result:{total:found.length,shown:players.length,players,...coverage,...(recruitment?{career:recruitment.info}:{})}};
    }
    case 'scout_players':{
      const overrides=Object.fromEntries(Object.entries(args).filter(([,value])=>value!==null));
      delete overrides.minPotential;
      if(args.careerClub!==null&&args.careerClub!==context.recommendation?.settings.careerClub)overrides.careerLeague='';
      const settings=R.validOptions({...context.recommendation?.settings,...overrides,scope:'market',slotId:'',
        role:args.role??'',roleFocus:args.roleFocus??'',minPot:args.minPotential??context.recommendation?.settings.minPot,
        sort:'fit'},context.squad);
      const recruitment=settings.careerClub?recruitmentFor(catalog,settings.careerClub,settings.careerStage,settings.gender||null,settings.careerLeague||null):null;
      const result=R.scout({input:settings,squad:context.squad,players:pool.all(),catalog,
        saved,recruitment});
      return {label:'공통 기준 선수 추천',result:{...result,rows:result.rows.slice(0,6).map(row=>({...row,player:X.brief(row.player)}))}};
    }
    case 'get_player_details':return {label:'선수 세부 정보 확인',result:args.playerIds.map(id=>{
      const p=getPlayer(id);
      const growth=catalog?.get(id)?.profile?.growth??p.profile?.growth;
      const notes=context.recommendation?.targets.find(row=>row.player.id===id)?.observation;
      const outlook=D.outlook({...p,profile:{...p.profile,growth}},notes,context.recommendation?.settings.growthSeasons);
      return {...X.brief(p),...P.describe(p),attributes:p.attributes,unsupportedBaseline:!C.WEIGHTS[p.positions[0]],
        statModification:p.statEdit?{applied:true,targetPosition:p.statEdit.targetPosition,targetOverall:p.statEdit.targetOverall,achievedOverall:C.estimateOverall(p,p.statEdit.targetPosition),originalOverall:p.statEdit.original.overall,note:'내 선수에 적용한 스탯 · 원본 DB와 다를 수 있음'}:null,
        development:{growthType:outlook.origin?.label??null,source:D.PROFILE_SOURCES[outlook.origin?.source]??null,
          peakAges:outlook.peak,potentialGap:outlook.gap},
        positionEstimates:C.positionComparison(p).map(r=>({position:r.position,estimate:r.estimate,delta:r.delta,natural:r.natural}))};
    })};
    case 'recommend_squad':{
      const {plan,squad,players,eligibleCount,matchedTraits,routes,career}=buildRecommendation(args,context,pool,catalog);
      const members=plan.slots.map(slot=>{
        const p=pool.find(slot.playerId);
        const route=routes.get(slot.playerId);
        const traits=p&&args.preferredPlaystyles.length?{preferredPlaystyleMatch:matchedTraits.has(p.id),playstylePlus:P.describe(p).playstyle_plus?.map(style=>style.name)??null}:{};
        return {slotId:slot.id,position:slot.pos,locked:slot.locked,player:p?{...X.brief(p),...traits}:null,
          ...(route?{recruitment:route.type}:{}),reasons:plan.reasons[slot.id]||[]};
      });
      const currentFormationPreserved=plan.fixedShape&&squad.formation===context.squad.formation&&squad.custom===context.squad.custom;
      const title=career?career.club+' · '+career.label:'추천 스쿼드';
      return {label:title+' · 선발 '+plan.filled+'/11',result:{formation:plan.formation,style:plan.style,focus:plan.focus,filled:plan.filled,currentFormationPreserved,eligiblePlayers:eligibleCount,gender:career?.gender??args.gender,fixedPlayersOverrideFilters:true,starters:members,...(plan.budget?{budget:plan.budget}:{}),cover:plan.cover.map(row=>({playerId:row.playerId,position:row.position,status:row.support.status,label:row.support.label,current:row.support.current.map(candidate=>({name:candidate.player.name,position:candidate.position,sufficient:candidate.sufficient,stats:candidate.stats})),recruits:row.support.recruits.map(candidate=>({player:X.brief(candidate.player),finance:candidate.report.finance})),message:row.support.message})),...(career?{career}:{}),note:'로컬 선수 데이터 기준. 고정 선수도 전체 예산과 커버 배치 조건을 충족해야 합니다.'},artifact:artifact('squad',title+' · '+plan.formation,addPlayers({squad},players))};
    }
    case 'analyze_position':{
      const p=getPlayer(args.playerId),impact=C.positionImpact(p,args.position);
      const {weights,...baseline}=C.RATING_MODEL.profiles[impact.primary]??{};
      const settings=R.validOptions({...context.recommendation?.settings,position:args.position,slotId:'',role:'',roleFocus:''},context.squad);
      const recruitment=settings.careerClub&&catalog?recruitmentFor(catalog,settings.careerClub,settings.careerStage,settings.gender||null,settings.careerLeague||null):null;
      const plans=R.conversionSupport({player:p,settings,squad:context.squad,players:context.players,
        saved:context.recommendation?.targets,catalog,recruitment});
      const support=plans.find(plan=>plan.position===args.position)?.support;
      const compact=row=>({player:X.brief(row.player),position:row.position,role:row.role??row.report?.role,
        sufficient:row.sufficient,stats:row.stats,placement:row.placement,finance:row.report?.finance});
      const cover=support?{...support,current:support.current.map(compact),recruits:support.recruits.map(compact)}:null;
      return {label:p.name+' · '+args.position+' 전환 분석',result:{player:X.brief(p),cover,position:args.position,estimate:impact.estimate,delta:impact.delta,missing:impact.missing.map(k=>C.ATTRIBUTE_NAMES[k]),mainContributions:impact.rows.slice(0,8).map(r=>({attribute:r.name,value:r.value,fromWeight:C.round(r.fromWeight),toWeight:C.round(r.toWeight),ovrContribution:C.round(r.contribution)})),source:C.RATING_MODEL.sourceUrl,modelDate:C.RATING_MODEL.dataDate,...(baseline.source?{baseline}:{}),officialFormula:false,limitations:impact.unsupportedBaseline?'원본 '+impact.primary+' 포지션의 가중치가 없어 전환 OVR는 알 수 없어요.':'같은 세부 스탯의 기준 OVR 추정. 실제 비선호 페널티·폼·사기·경기 체력 미반영.'},artifact:artifact('editor',p.name+' · '+args.position+' 포지션 분석',addPlayers({playerId:p.id,position:args.position,targetOverall:Math.round(impact.estimate??p.overall),style:'possession',calculate:false},pool.extra([p.id])))};
    }
    case 'calculate_stat_plan':{
      const p=getPlayer(args.playerId),statPreferences=C.statPreferences(args),plans=C.editorPlans(p,args.position,args.targetOverall,args.style,statPreferences);
      const payload=addPlayers({playerId:p.id,position:args.position,targetOverall:args.targetOverall,style:args.style,statPreferences,calculate:true},pool.extra([p.id]));
      return {label:p.name+' · 스탯 변경안 계산',result:{player:X.brief(p),position:args.position,targetOverall:args.targetOverall,
        archetype:C.STAT_PRESETS[statPreferences.archetype].name,constraints:plans[0].constraints,
        reachableRange:plans[0].reachableRange,blockers:plans[0].blockers,relaxation:plans[0].relaxation,
        plans:plans.map(plan=>({name:plan.name,before:plan.before,after:plan.after,reached:plan.reached,changedAttributes:plan.changes.length,totalChange:plan.totalChange,mainChanges:plan.changes})),officialFormula:false,note:'선택한 장단점·스탯 범위 안에서 계산한 계획용 추정. 원본과 실제 게임은 변경하지 않음.'},artifact:artifact('editor',p.name+' · 목표 OVR '+args.targetOverall,payload)};
    }
    case 'propose_player_move':{
      const p=getPlayer(args.playerId),next=clone(context.squad),target=C.findSlot(next,args.targetSlotId),origin=C.allSlots(next).find(s=>s.playerId===p.id);
      if(!target)throw new Error('현재 스쿼드에 없는 자리예요. get_current_squad로 자리 ID를 확인해주세요.');
      if((origin?.locked||target.locked)&&origin?.id!==target.id)throw new Error('고정된 선수의 자리는 변경할 수 없어요. 직접 고정을 해제해주세요.');
      C.movePlayer(next,p.id,target.id);
      return {label:p.name+' · 자리 이동안',result:{player:X.brief(p),targetSlotId:target.id,targetPosition:target.pos,swappedWith:pool.find(origin?.playerId)?X.brief(pool.find(origin.playerId)):null,note:'적용 버튼을 누르면 스쿼드에서 이동 또는 교체.'},artifact:artifact('squad',p.name+' → '+target.pos,addPlayers({squad:next},pool.extra(squadPlayerIds(next))))};
    }
    default:throw new Error('지원하지 않는 기능 호출이에요.');
  }
}
module.exports={DEFINITIONS,validateArguments,execute,recommendForContext};
