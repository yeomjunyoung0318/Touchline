(function (root, factory) {
  const commonJS = typeof module === 'object' && module.exports;
  const model = commonJS ? require('./rating-model.js') : root.FC27RatingModel;
  const tactics = commonJS ? require('./fc-iq.js') : root.FC27Roles;
  const careerMarket = commonJS ? require('./career-market.js') : root.CareerMarket;
  const development = commonJS ? require('./career-development.js') : root.CareerDevelopment;
  const api = factory(model, tactics, careerMarket, development);
  if (commonJS) module.exports = api;
  else root.SquadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ratingModel, FC_IQ, CareerMarket, Development) {
  'use strict';

  const VERSION = 1;
  const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'RM', 'CAM', 'LW', 'RW', 'ST'];
  const POSITION_NAMES = { GK:'골키퍼', LB:'왼쪽 풀백', CB:'중앙 수비수', RB:'오른쪽 풀백', CDM:'수비형 미드필더', LM:'왼쪽 미드필더', CM:'중앙 미드필더', RM:'오른쪽 미드필더', CAM:'공격형 미드필더', LW:'왼쪽 윙', RW:'오른쪽 윙', ST:'스트라이커' };
  const ATTRIBUTE_GROUPS = [
    ['pace', '속도', [['acceleration','가속력'],['sprintSpeed','전력 질주 속도']]],
    ['shooting', '슈팅', [['positioning','공격 위치 선정'],['finishing','골 결정력'],['shotPower','슛 파워'],['longShots','중거리 슛'],['volleys','발리 슛'],['penalties','페널티킥']]],
    ['passing', '패스', [['vision','시야'],['crossing','크로스'],['freeKickAccuracy','프리킥 정확도'],['shortPassing','짧은 패스'],['longPassing','긴 패스'],['curve','커브']]],
    ['dribbling', '드리블', [['agility','민첩성'],['balance','밸런스'],['reactions','반응 속도'],['ballControl','볼 컨트롤'],['dribbling','드리블'],['composure','침착성']]],
    ['defending', '수비', [['interceptions','가로채기'],['headingAccuracy','헤딩 정확도'],['defensiveAwareness','수비 인식'],['standingTackle','스탠딩 태클'],['slidingTackle','슬라이딩 태클']]],
    ['physical', '피지컬', [['jumping','점프'],['stamina','스태미나'],['strength','몸싸움'],['aggression','적극성']]],
    ['goalkeeping', '골키핑', [['gkDiving','GK 다이빙'],['gkHandling','GK 핸들링'],['gkKicking','GK 킥'],['gkReflexes','GK 반사 신경'],['gkPositioning','GK 위치 선정']]]
  ];
  const ATTRIBUTES = ATTRIBUTE_GROUPS.flatMap(group => group[2]);
  const ATTRIBUTE_NAMES = Object.fromEntries(ATTRIBUTES);
  if(!ratingModel?.profiles)throw new Error('FC27 rating model is missing.');
  const RATING_MODEL=ratingModel;
  // The model includes baseline-only positions that are not squad slots.
  // OVR changes remain estimates; Dynamic OVR and unfamiliar-position penalties are unknown.
  const WEIGHTS=Object.create(null);
  for(const [pos,profile] of Object.entries(ratingModel.profiles)){
    WEIGHTS[pos]=Object.fromEntries(Object.entries(profile.weights).filter(([,weight])=>weight>0));
  }
  const STYLES = {
    possession:{ name:'점유율 축구', short:'점유율', description:'패스로 경기를 설계하는 팀', attributes:{shortPassing:28,ballControl:23,vision:20,composure:16,longPassing:13}, formations:['4-3-3 (2)','4-2-3-1','4-1-2-1-2 (2)'] },
    counter:{ name:'빠른 역습', short:'역습', description:'공간을 발견하면, 빠르게 앞으로', attributes:{acceleration:25,sprintSpeed:25,vision:18,longPassing:16,finishing:16}, formations:['4-2-3-1 (2)','4-4-2','4-2-1-3'] },
    press:{ name:'높은 압박', short:'압박', description:'앞에서 되찾고, 다시 공격하는 팀', attributes:{stamina:30,aggression:22,interceptions:20,reactions:15,acceleration:13}, formations:['4-3-3 (4)','4-2-1-3','4-1-4-1'] }
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = value => Math.round(value * 10) / 10;
  function uid(prefix='id') { return prefix + '-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,10)); }
  const row = (positions, y, xs) => positions.map((pos, i) => ({pos, x:xs ? xs[i] : positions.length===1 ? 50 : 12 + i*76/(positions.length-1), y}));
  const back4 = () => row(['LB','CB','CB','RB'],75,[12,37,63,88]);
  const back3 = () => row(['CB','CB','CB'],75,[25,50,75]);
  const back5 = () => [{pos:'LB',x:9,y:65},...row(['CB','CB','CB'],76,[30,50,70]),{pos:'RB',x:91,y:65}];
  function shape(id, label, group, rows) {
    return { id, label, group, slots:[{pos:'GK',x:50,y:91},...(group===3?back3():group===5?back5():back4()),...rows.flat()] };
  }
  // 29 distinct shapes; numbered variants follow the FIFACM FC 27 builder labels.
  const FORMATIONS = [
    shape('4-3-3','4-3-3 · 플랫',4,[row(['CM','CM','CM'],48,[25,50,75]),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('4-3-3 (2)','4-3-3 (2) · 홀딩',4,[row(['CDM'],61),row(['CM','CM'],41,[30,70]),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('4-3-3 (3)','4-3-3 (3) · 수비형',4,[row(['CDM','CDM'],59,[30,70]),row(['CM'],36),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('4-3-3 (4)','4-3-3 (4) · 공격형',4,[row(['CM','CM'],56,[30,70]),row(['CAM'],35),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('4-2-3-1','4-2-3-1 · 좁게',4,[row(['CDM','CDM'],57,[30,70]),row(['CAM','CAM','CAM'],35,[19,50,81]),row(['ST'],13)]),
    shape('4-2-3-1 (2)','4-2-3-1 (2) · 넓게',4,[row(['CDM','CDM'],57,[32,68]),row(['LM','CAM','RM'],34,[13,50,87]),row(['ST'],13)]),
    shape('4-4-2','4-4-2 · 플랫',4,[row(['LM','CM','CM','RM'],48,[12,37,63,88]),row(['ST','ST'],16,[34,66])]),
    shape('4-4-2 (2)','4-4-2 (2) · 홀딩',4,[row(['CDM','CDM'],59,[37,63]),row(['LM','RM'],38,[12,88]),row(['ST','ST'],16,[34,66])]),
    shape('4-4-1-1 (2)','4-4-1-1 (2) · 미드필드',4,[row(['LM','CM','CM','RM'],52,[12,37,63,88]),row(['CAM'],33),row(['ST'],13)]),
    shape('4-1-2-1-2','4-1-2-1-2 · 넓게',4,[row(['CDM'],61),row(['LM','RM'],40,[14,86]),row(['CAM'],31),row(['ST','ST'],12,[34,66])]),
    shape('4-1-2-1-2 (2)','4-1-2-1-2 (2) · 좁게',4,[row(['CDM'],61),row(['CM','CM'],44,[28,72]),row(['CAM'],31),row(['ST','ST'],12,[34,66])]),
    shape('4-1-3-2','4-1-3-2',4,[row(['CDM'],61),row(['LM','CM','RM'],39,[14,50,86]),row(['ST','ST'],14,[34,66])]),
    shape('4-1-4-1','4-1-4-1',4,[row(['CDM'],62),row(['LM','CM','CM','RM'],40,[12,37,63,88]),row(['ST'],14)]),
    shape('4-2-1-3','4-2-1-3',4,[row(['CDM','CDM'],57,[30,70]),row(['CAM'],35),row(['LW','ST','RW'],14,[14,50,86])]),
    shape('4-2-2-2','4-2-2-2',4,[row(['CDM','CDM'],57,[32,68]),row(['CAM','CAM'],34,[24,76]),row(['ST','ST'],13,[35,65])]),
    shape('4-2-4','4-2-4',4,[row(['CM','CM'],49,[34,66]),row(['LW','RW'],26,[12,88]),row(['ST','ST'],12,[36,64])]),
    shape('4-3-1-2','4-3-1-2',4,[row(['CM','CM','CM'],53,[23,50,77]),row(['CAM'],32),row(['ST','ST'],12,[34,66])]),
    shape('4-3-2-1','4-3-2-1',4,[row(['CM','CM','CM'],54,[23,50,77]),row(['CAM','CAM'],32,[29,71]),row(['ST'],12)]),
    shape('4-5-1','4-5-1 · 공격형',4,[row(['CM'],59),row(['LM','CAM','CAM','RM'],36,[12,37,63,88]),row(['ST'],13)]),
    shape('4-5-1 (2)','4-5-1 (2) · 플랫',4,[row(['CM','CM','CM'],52,[28,50,72]),row(['LM','RM'],32,[12,88]),row(['ST'],13)]),
    shape('3-1-4-2','3-1-4-2',3,[row(['CDM'],59),row(['LM','CM','CM','RM'],37,[12,37,63,88]),row(['ST','ST'],14,[34,66])]),
    shape('3-4-1-2','3-4-1-2',3,[row(['LM','CM','CM','RM'],53,[12,37,63,88]),row(['CAM'],32),row(['ST','ST'],12,[34,66])]),
    shape('3-4-2-1','3-4-2-1',3,[row(['LM','CM','CM','RM'],54,[12,37,63,88]),row(['CAM','CAM'],32,[29,71]),row(['ST'],12)]),
    shape('3-4-3','3-4-3',3,[row(['LM','CM','CM','RM'],49,[12,37,63,88]),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('3-5-2','3-5-2',3,[row(['CDM','CDM'],59,[35,65]),row(['LM','CAM','RM'],35,[12,50,88]),row(['ST','ST'],13,[34,66])]),
    shape('5-2-1-2','5-2-1-2',5,[row(['CM','CM'],51,[33,67]),row(['CAM'],32),row(['ST','ST'],13,[34,66])]),
    shape('5-2-3','5-2-3',5,[row(['CM','CM'],48,[34,66]),row(['LW','ST','RW'],15,[15,50,85])]),
    shape('5-3-2','5-3-2',5,[row(['CM','CM','CM'],43,[24,50,76]),row(['ST','ST'],15,[34,66])]),
    shape('5-4-1','5-4-1',5,[row(['LM','CM','CM','RM'],40,[12,37,63,88]),row(['ST'],14)])
  ];
  const FORMATION_MAP = new Map(FORMATIONS.map(f => [f.id,f]));
  function makeSlots(formationId, previous = []) {
    const formation = FORMATION_MAP.get(formationId);
    if (!formation) throw new Error('지원하지 않는 포메이션이에요.');
    const slots=formation.slots.map((slot,i) => ({id:'xi-'+i,...slot,playerId:null,locked:false}));
    const assigned=previous.filter(slot=>slot.role);
    if(assigned.length){
      const matches=optimalAssignment(slots.map(slot=>assigned.map(source=>
        slot.pos===source.pos?500-Math.hypot(slot.x-source.x,slot.y-source.y):-1000)));
      slots.forEach((slot,index)=>{
        const source=assigned[matches[index]];
        if(source?.pos===slot.pos)slot.role={...source.role};
      });
    }
    return slots;
  }
  function makeBench(prefix, count) { return Array.from({length:count},(_,i)=>({id:prefix+'-'+i,pos:prefix==='sub'?'SUB':'RES',playerId:null,locked:false})); }
  function newSquad(name='새 커리어', formation='4-3-3 (2)') { return {id:uid('squad'),name,formation,slots:makeSlots(formation),bench:makeBench('sub',9),reserves:makeBench('res',9),notes:'',style:'possession',focus:'balanced',custom:false}; }
  const allSlots = squad => [...squad.slots,...squad.bench,...squad.reserves];
  const findSlot = (squad,id) => allSlots(squad).find(slot=>slot.id===id);
  function setPlayerRole(slot,id,focus) {
    if(!slot||!POSITIONS.includes(slot.pos))throw new Error('선발 자리의 역할을 지정해주세요.');
    if(id===null&&focus===null){
      delete slot.role;
      return;
    }
    if(!FC_IQ.getRole(slot.pos,id)?.focuses.includes(focus))throw new Error(slot.pos+'에서 사용할 수 있는 역할과 포커스를 골라주세요.');
    slot.role={id,focus};
  }
  function setSlotPosition(slot,position) {
    if(!POSITIONS.includes(position))throw new Error('자리의 포지션을 확인해주세요.');
    slot.pos=position;
    if(slot.role&&!FC_IQ.getRole(position,slot.role.id)?.focuses.includes(slot.role.focus))delete slot.role;
  }
  function weightedScore(attrs, weights, requireAll=true) {
    let sum=0,total=0;
    for (const [key,weight] of Object.entries(weights)) {
      if(weight<=0)continue;
      if (typeof attrs?.[key] !== 'number' || !Number.isFinite(attrs[key])) { if(requireAll) return null; continue; }
      sum+=attrs[key]*weight; total+=weight;
    }
    return total ? sum/total : null;
  }
  const positionScore = (player,pos) => WEIGHTS[pos] ? weightedScore(player.attributes,WEIGHTS[pos]) : null;
  const ratingOffset = player => player.statEdit?.offset ?? (player.overall-positionScore(player,player.positions[0]));
  function estimateOverall(player,pos,attributes=player.attributes) {
    const base=positionScore(player,player.positions[0]);
    const score=WEIGHTS[pos] ? weightedScore(attributes,WEIGHTS[pos]) : null;
    return base===null || score===null ? null : round(clamp(ratingOffset(player)+score,1,99));
  }
  function positionComparison(player){
    return POSITIONS.map(pos=>{
      const estimate=pos===player.positions[0]?player.overall:estimateOverall(player,pos);
      return {position:pos,estimate,delta:estimate===null?null:round(estimate-player.overall),natural:player.positions.includes(pos),primary:pos===player.positions[0],source:pos===player.positions[0]?'input':'model',profile:RATING_MODEL.profiles[pos]};
    });
  }
  function positionImpact(player,target){
    if(!WEIGHTS[target])throw new Error('목표 포지션을 확인해주세요.');
    const primary=player.positions[0],baseScore=positionScore(player,primary),targetScore=positionScore(player,target);
    if(!WEIGHTS[primary])return {primary,target,estimate:null,delta:null,rows:[],missing:[],unsupportedBaseline:true};
    const keys=[...new Set([...Object.keys(WEIGHTS[primary]),...Object.keys(WEIGHTS[target])])];
    const missing=keys.filter(key=>typeof player.attributes?.[key]!=='number');
    if(baseScore===null||targetScore===null)return {primary,target,estimate:null,delta:null,rows:[],missing};
    const baseTotal=Object.values(WEIGHTS[primary]).reduce((a,b)=>a+b,0),targetTotal=Object.values(WEIGHTS[target]).reduce((a,b)=>a+b,0);
    const rows=keys.map(key=>{
      const fromWeight=(WEIGHTS[primary][key]??0)/baseTotal*100,toWeight=(WEIGHTS[target][key]??0)/targetTotal*100;
      // Centering at the primary score keeps the exact total while explaining relative weaknesses.
      return {key,name:ATTRIBUTE_NAMES[key],value:player.attributes[key],fromWeight,toWeight,contribution:(player.attributes[key]-baseScore)*(toWeight-fromWeight)/100};
    }).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
    const estimate=estimateOverall(player,target),rawDelta=targetScore-baseScore;
    return {primary,target,estimate,delta:round(estimate-player.overall),baseScore,targetScore,rawDelta,rows,missing:[],clipped:Math.abs((player.overall+rawDelta)-clamp(player.overall+rawDelta,1,99))>.00001};
  }
  function positionFit(player,pos) {
    if (player.positions[0]===pos) return {kind:'primary',label:'주 포지션',estimate:player.overall};
    if (player.positions.includes(pos)) return {kind:'secondary',label:'보조 포지션',estimate:estimateOverall(player,pos)};
    return {kind:'other',label:'포지션 전환',estimate:estimateOverall(player,pos)};
  }
  function roleAt(x,y) {
    if(y>=85) return 'GK';
    if(y>=68) return x<23?'LB':x>77?'RB':'CB';
    if(y>=54) return x<22?'LM':x>78?'RM':'CDM';
    if(y>=39) return x<22?'LM':x>78?'RM':'CM';
    if(y>=25) return x<22?'LW':x>78?'RW':'CAM';
    return x<28?'LW':x>72?'RW':'ST';
  }
  function movePlayer(squad,playerId,targetId) {
    const target=findSlot(squad,targetId);
    if(!target) throw new Error('먼저 배치할 자리를 선택해주세요.');
    const origin=allSlots(squad).find(slot=>slot.playerId===playerId);
    if(origin?.id===target.id) return false;
    if(origin) { const old=target.playerId, oldLock=target.locked; target.playerId=playerId; target.locked=origin.locked; origin.playerId=old; origin.locked=old?oldLock:false; }
    else { target.playerId=playerId; target.locked=false; }
    return true;
  }
  function moveToPoint(squad,slotId,x,y) {
    const slot=squad.slots.find(s=>s.id===slotId);
    if(!slot) throw new Error('자유 배치는 경기장 위 선수에게 사용할 수 있어요.');
    slot.x=round(clamp(x,8,92)); slot.y=round(clamp(y,10,92));
    setSlotPosition(slot,roleAt(slot.x,slot.y)); squad.custom=true;
    return slot;
  }
  // Rectangular Hungarian matching, maximizing total score without duplicate players.
  function optimalAssignment(matrix) {
    const n=matrix.length;
    if(!n) return [];
    const realM=matrix[0].length, m=Math.max(n,realM);
    const u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
    for(let i=1;i<=n;i++) {
      p[0]=i; let j0=0;
      const minv=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
      do {
        used[j0]=true; const i0=p[j0]; let delta=Infinity,j1=0;
        for(let j=1;j<=m;j++) if(!used[j]) {
          const value=j<=realM?matrix[i0-1][j-1]:-100000;
          const cur=-value-u[i0]-v[j];
          if(cur<minv[j]) { minv[j]=cur;way[j]=j0; }
          if(minv[j]<delta) {delta=minv[j];j1=j;}
        }
        for(let j=0;j<=m;j++) {if(used[j]) {u[p[j]]+=delta;v[j]-=delta;} else minv[j]-=delta;}
        j0=j1;
      } while(p[j0]!==0);
      do {const j1=way[j0];p[j0]=p[j1];j0=j1;} while(j0);
    }
    const answer=Array(n).fill(-1);
    for(let j=1;j<=m;j++) if(p[j] && j<=realM) answer[p[j]-1]=j-1;
    return answer;
  }
  function changeFormation(squad,formationId,players) {
    const old=squad.slots.filter(s=>s.playerId), map=new Map(players.map(p=>[p.id,p]));
    const next=makeSlots(formationId,squad.slots);
    const assignment=optimalAssignment(next.map(slot=>old.map(source=>{
      const p=map.get(source.playerId);
      return (p?.positions.includes(slot.pos)?300:0)+(source.pos===slot.pos?150:0)-Math.hypot(source.x-slot.x,source.y-slot.y);
    })));
    next.forEach((slot,i)=>{const source=old[assignment[i]];if(source) {slot.playerId=source.playerId;slot.locked=source.locked;} });
    squad.slots=next;squad.formation=formationId;squad.custom=false;
  }
  const roleSkills = {
    goalkeeper: 'gkReflexes gkPositioning gkDiving gkHandling reactions',
    'sweeper-keeper': 'gkPositioning gkReflexes reactions acceleration gkKicking',
    'ball-playing-keeper': 'gkKicking gkPositioning shortPassing composure longPassing',
    fullback: 'defensiveAwareness standingTackle interceptions stamina acceleration',
    wingback: 'stamina sprintSpeed crossing dribbling standingTackle',
    falseback: 'shortPassing ballControl interceptions composure defensiveAwareness',
    'attacking-wingback': 'crossing acceleration stamina dribbling positioning',
    'inverted-wingback': 'ballControl shortPassing stamina positioning dribbling',
    defender: 'defensiveAwareness standingTackle interceptions strength headingAccuracy',
    stopper: 'standingTackle aggression interceptions strength reactions',
    'ball-playing-defender': 'longPassing shortPassing composure defensiveAwareness interceptions',
    'wide-back': 'defensiveAwareness acceleration standingTackle longPassing stamina',
    holding: 'interceptions defensiveAwareness standingTackle reactions shortPassing',
    'centre-half': 'defensiveAwareness interceptions strength standingTackle shortPassing',
    'deep-lying-playmaker': 'longPassing shortPassing vision composure ballControl',
    'wide-half': 'stamina interceptions shortPassing defensiveAwareness crossing',
    'box-crasher': 'positioning stamina finishing reactions interceptions',
    'box-to-box': 'stamina shortPassing interceptions ballControl positioning',
    playmaker: 'vision shortPassing ballControl longPassing composure',
    'half-winger': 'crossing ballControl shortPassing stamina vision',
    winger: 'acceleration sprintSpeed dribbling crossing ballControl',
    'wide-midfielder': 'stamina crossing shortPassing defensiveAwareness ballControl',
    'wide-playmaker': 'vision crossing shortPassing ballControl curve',
    'inside-forward': 'dribbling acceleration positioning finishing curve',
    'shadow-striker': 'positioning finishing acceleration reactions ballControl',
    'classic-10': 'vision shortPassing ballControl composure longShots',
    'advanced-forward': 'positioning finishing acceleration reactions ballControl',
    poacher: 'finishing positioning reactions composure volleys',
    'false-9': 'shortPassing vision ballControl composure dribbling',
    'target-forward': 'strength headingAccuracy ballControl jumping shortPassing',
  };
  const focusSkills = {
    defend: 'defensiveAwareness interceptions standingTackle', 'build-up': 'shortPassing longPassing composure',
    support: 'shortPassing stamina vision', attack: 'positioning acceleration finishing',
    aggressive: 'aggression reactions standingTackle', roaming: 'vision stamina ballControl',
    'ball-winning': 'interceptions aggression standingTackle', wide: 'crossing acceleration dribbling',
  };
  function roleAssessment(player, position, role, focus) {
    const roleLevel = FC_IQ.roleLevel(player.profile?.roleIds, position, role.id);
    const keys = roleSkills[role.id].split(' ');
    const weights = Object.fromEntries(keys.map((key, i) => [key, 6 - i]));
    const additions = position === 'GK' && focus === 'build-up' ? 'gkKicking shortPassing composure' : focusSkills[focus];
    if (additions) for (const key of additions.split(' ')) weights[key] = (weights[key] ?? 0) + 2;
    const strengths = Object.keys(weights).filter(key => Number.isFinite(player.attributes[key]))
      .sort((a, b) => player.attributes[b] * weights[b] - player.attributes[a] * weights[a]).slice(0, 4)
      .map(key => ({ key, value: player.attributes[key] }));
    return {
      id: role.id, name: role.name, focus, level: roleLevel,
      score: strengths.length >= 2 ? round(weightedScore(player.attributes, weights, false)) : null,
      strengths,
    };
  }
  function selectRole(player, settings) {
    const roles = FC_IQ.byPosition[settings.position];
    if (settings.role) {
      const role = FC_IQ.getRole(settings.position, settings.role);
      return roleAssessment(player, settings.position, role, settings.roleFocus || role.focuses[0]);
    }
    const styleFocus = { possession: 'build-up', counter: 'attack', press: 'ball-winning' }[settings.style];
    const assessed = roles.map(role => roleAssessment(player, settings.position, role,
      role.focuses.includes(styleFocus) ? styleFocus : role.focuses[0]));
    return assessed.sort((a, b) => ((b.score ?? player.overall) + 4 * (b.level ?? 0)) -
      ((a.score ?? player.overall) + 4 * (a.level ?? 0)))[0];
  }
  function assessRecommendation(player, input = {}, notes = {}, outlook) {
    if(input.position&&!POSITIONS.includes(input.position))return null;
    const settings = CareerMarket.options(input);
    const position = settings.position;
    if (!FC_IQ.byPosition[position] || !STYLES[settings.style]) return null;
    const fit = positionFit(player, position);
    if ((position === 'GK') !== player.positions.includes('GK') || (fit.kind === 'other' && fit.estimate == null)) return null;
    const development = outlook ?? Development.outlook(player, notes, settings.growthSeasons);
    const role = selectRole(player, settings);
    const styleWeights = position === 'GK' ? WEIGHTS.GK : STYLES[settings.style].attributes;
    const styleScore = weightedScore(player.attributes, styleWeights, false);
    const baseline = fit.estimate ?? player.overall;
    const dynamicOvr = !player.statEdit&&notes.dynamicPosition === position ? notes.dynamicOvr ?? null : null;
    const matchRating = settings.focus === 'ready' ? dynamicOvr ?? baseline : baseline;
    let score = matchRating * .6 + (role.score ?? baseline) * .25 + (styleScore ?? baseline) * .15;
    const delta = fit.estimate == null ? null : round(fit.estimate - player.overall);
    const fitAdjustment = fit.kind === 'primary' ? 3 : fit.kind === 'secondary' ? 1 :
      settings.deployment === 'conversion' ? clamp(delta ?? -20, -20, 8) : -10;
    score += (role.level ?? 0) * 2.5 + fitAdjustment;
    if (fit.estimate == null) score -= 3;
    if (settings.focus === 'youth') score += development.bonus + (development.age == null ? 0 : clamp(24 - development.age, -10, 8));
    if (settings.focus === 'balanced') score += development.bonus * .25;
    if (settings.focus === 'ready' && ['severe', 'medium'].includes(notes.injury)) score -= 6;
    if (settings.focus === 'ready' && notes.fitness === 'unfit') score -= 4;
    if (notes.interest === 'very-high') score += 2;
    if (notes.interest === 'low') score -= 2;
    return {
      score: round(score), fit, role, styleScore: styleScore === null ? null : round(styleScore),
      dynamicOvr, potential: development.potential, growth: development.gap, development, delta,

    };
  }
  function recommendationContext(raw={}) {
    const keys=['saveAge','dynamicPot','potLow','potHigh','growthProfile','dynamicPosition','dynamicOvr',
      'form','morale','fitness','injury','interest','expectedFee','expectedWage','expectedSaleFee','xTV','currency','contractDate'];
    const targets=(raw?.targets??[]).slice(0,150).filter(row=>typeof row?.player?.id==='string').map(row=>{
      const observation=CareerMarket.observation(row.observation);
      const safe=Object.fromEntries(keys.filter(key=>observation[key]!=null).map(key=>[key,observation[key]]));
      safe.growthProfile=Development.profile(safe.growthProfile);
      safe.checkpoints=Development.checkpoints(observation.checkpoints).map(({date,position,overall,potentialLow,potentialHigh})=>
        ({date,position,overall,potentialLow,potentialHigh}));
      return {player:{id:row.player.id},list:row.list,observation:safe};
    });
    return {settings:CareerMarket.options(raw?.settings),targets};
  }
  function recommendationScore(player,pos,styleId,focus,notes={},settings={}) {
    return assessRecommendation(player,{...settings,position:pos,style:styleId,focus},notes)?.score ?? -10000;
  }
  function recommendationReasons(player,pos,styleId,focus,notes={},settings={},report) {
    const assessment=report??assessRecommendation(player,{...settings,position:pos,style:styleId,focus},notes);
    if(!assessment)return [pos+' 전환 능력치 미확인'];
    const {role,development,fit}=assessment;
    const reasons=[fit.kind==='other'?pos+' 전환 후보 · 실제 게임에서 확인 필요':pos+' 주·보조 포지션에 맞는 선수',
      role.name+' · '+FC_IQ.focuses[role.focus].name+' · 적합도 '+(role.score??'미확인')];
    if(development.peak)reasons.push(development.origin.label+' · 전성기 '+development.peak.join('–')+'세');
    if(focus==='youth')reasons.push('POT 여지 '+(development.gap??'미확인')+' · '+development.seasons+'시즌 육성 기준');
    if(fit.estimate==null)reasons.push('세부 능력치 미확인 · 기준 OVR로 평가');
    return reasons;
  }
  function recommend(players,squad,styleId='possession',focus='balanced',formationChoice='auto',bonuses,preferences=squad.career) {
    if(!STYLES[styleId]) throw new Error('플레이 스타일을 골라주세요.');
    const settings=CareerMarket.options({...preferences?.settings,style:styleId,focus});
    const notes=new Map((preferences?.targets??[]).map(row=>[row.player.id,row.observation]));
    const outlooks=new Map(players.map(player=>[player.id,Development.outlook(player,notes.get(player.id),settings.growthSeasons)]));
    const reports=new Map();
    const report=(player,slot)=>{
      const key=player.id+'|'+slot.pos+'|'+(slot.role?.id??'')+'|'+(slot.role?.focus??'');
      if(!reports.has(key))reports.set(key,assessRecommendation(player,{
        ...settings,position:slot.pos,role:slot.role?.id??'',roleFocus:slot.role?.focus??'',
      },notes.get(player.id),outlooks.get(player.id)));
      return reports.get(key);
    };
    const score=(player,slot)=>(report(player,slot)?.score??-10000)+(bonuses?.get(player.id)??0);
    const locked=allSlots(squad).filter(s=>s.locked&&s.playerId);
    const excluded=new Set(locked.map(s=>s.playerId));
    const fixedShape=locked.length>0 || formationChoice==='current';
    const formations=fixedShape?[squad.formation]:formationChoice==='auto'?STYLES[styleId].formations:[formationChoice];
    const byId=new Map(players.map(p=>[p.id,p]));
    const pool=players.filter(p=>!excluded.has(p.id));
    const bestForPosition=new Map();
    let best=null;
    for(const formation of formations) {
      const slots=fixedShape?JSON.parse(JSON.stringify(squad.slots)):makeSlots(formation,squad.slots);
      slots.forEach(s=>{if(!s.locked) {s.playerId=null;s.locked=false;} });
      const open=slots.filter(s=>!s.locked);
      const shortlist=new Set();
      for(const slot of open) {
        const pos=slot.pos+'|'+(slot.role?.id??'')+'|'+(slot.role?.focus??'');
        if(!bestForPosition.has(pos)) {
          const best=pool.map(p=>[p.id,score(p,slot)])
            .filter(([,score])=>score>-9000).sort((a,b)=>b[1]-a[1]).slice(0,40);
          bestForPosition.set(pos,best.map(([id])=>id));
        }
        bestForPosition.get(pos).forEach(id=>shortlist.add(id));
      }
      const candidates=pool.filter(p=>shortlist.has(p.id));
      const matrix=open.map(slot=>candidates.map(p=>score(p,slot)));
      const assignment=optimalAssignment(matrix);
      let total=0,filled=slots.filter(s=>s.locked&&s.playerId).length;
      open.forEach((slot,i)=>{
        const player=candidates[assignment[i]];
        if(!player||matrix[i][assignment[i]]<=-9000)return;
        const picked=report(player,slot).role;
        slot.playerId=player.id;
        slot.role={id:picked.id,focus:picked.focus};
        filled++;
        total+=matrix[i][assignment[i]];
      });
      const why={};
      slots.forEach(slot=>{
        const player=byId.get(slot.playerId);
        if(player)why[slot.id]=[...(slot.locked?['직접 고정한 선수 · 현재 위치 유지']:[]),
          ...recommendationReasons(player,slot.pos,styleId,focus,notes.get(player.id),settings,report(player,slot))];
      });
      const candidate={formation,slots,reasons:why,score:round(total/Math.max(1,open.length)),filled,fixedShape,style:styleId,focus,custom:fixedShape?squad.custom:false};
      if(!best || filled>best.filled || (filled===best.filled&&candidate.score>best.score)) best=candidate;
    }
    if(!best) throw new Error('추천에 사용할 포메이션을 찾지 못했어요.');
    const used=new Set(best.slots.filter(s=>s.playerId).map(s=>s.playerId));
    locked.forEach(s=>used.add(s.playerId));
    const remaining=players.filter(p=>!used.has(p.id))
      .map(player=>{
        const natural=POSITIONS.filter(pos=>player.positions.includes(pos));
        const available=natural.length?natural:POSITIONS;
        return [player,Math.max(...available.map(pos=>score(player,{pos})))];
      })
      .sort((a,b)=>b[1]-a[1]).slice(0,squad.bench.length).map(([p])=>p);
    best.bench=squad.bench.map(slot=>slot.locked?{...slot}:{...slot,playerId:remaining.shift()?.id??null,locked:false});
    const assigned=new Set([...best.slots,...best.bench].filter(s=>s.playerId).map(s=>s.playerId));
    best.reserves=squad.reserves.map(slot=>assigned.has(slot.playerId)?{...slot,playerId:null,locked:false}:{...slot});
    return best;
  }
  const STAT_PRESETS={
    custom:{name:'별도 조건 없음',bounds:{}},
    'fast-physical-poor-passing':{name:'빠르고 피지컬 강함 · 패스 약점',bounds:{
      acceleration:[90,99,3],sprintSpeed:[90,99,3],strength:[90,99,3],stamina:[85,99,2],
      jumping:[85,99,2],aggression:[85,99,2],shortPassing:[1,55,1],longPassing:[1,50,1],vision:[1,55,1],crossing:[1,55,1]}},
    speed:{name:'빠른 선수',bounds:{acceleration:[90,99,3],sprintSpeed:[90,99,3]}},
    playmaker:{name:'패스 중심 플레이메이커',bounds:{shortPassing:[90,99,3],longPassing:[88,99,3],vision:[90,99,3]}},
    'ball-winner':{name:'피지컬형 볼 탈취',bounds:{strength:[90,99,3],stamina:[88,99,2],interceptions:[85,99,3],standingTackle:[85,99,3]}},
  };
  function statPreferences(raw={}){
    const archetype=raw.archetype??'custom';
    if(!Object.hasOwn(STAT_PRESETS,archetype))throw new Error('선수 유형을 확인해주세요.');
    const constraints=raw.constraints??[];
    if(!Array.isArray(constraints)||constraints.length>ATTRIBUTES.length)throw new Error('스탯 조건 목록을 확인해주세요.');
    const seen=new Set();
    return {archetype,constraints:constraints.map(row=>{
      if(!row||!Object.hasOwn(ATTRIBUTE_NAMES,row.attribute)||seen.has(row.attribute))throw new Error('스탯 이름이 없거나 조건이 중복됐어요.');
      seen.add(row.attribute);
      const min=row.min??1,max=row.max??99,priority=row.priority??1;
      if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max>99||min>max||!Number.isInteger(priority)||priority<1||priority>5)
        throw new Error('스탯 최소·최대는 1~99, 우선순위는 1~5 범위여야 해요.');
      return {attribute:row.attribute,min,max,priority};
    })};
  }
  function statBounds(raw={}){
    const preferences=statPreferences(raw),bounds={};
    for(const [key,[min,max,priority]] of Object.entries(STAT_PRESETS[preferences.archetype].bounds))bounds[key]={min,max,priority};
    for(const {attribute,...rule} of preferences.constraints)bounds[attribute]=rule;
    return {preferences,bounds};
  }
  function editorPlans(player,targetPosition,targetOverall,styleId='possession',input={}) {
    if(!WEIGHTS[targetPosition]) throw new Error('목표 포지션을 골라주세요.');
    if(!WEIGHTS[player.positions[0]])throw new Error('원본 '+player.positions[0]+' 포지션의 가중치가 없어요. 계산할 기준 포지션을 골라주세요.');
    const before=estimateOverall(player,targetPosition);
    if(before===null) {
      const required=new Set([...Object.keys(WEIGHTS[player.positions[0]]),...Object.keys(WEIGHTS[targetPosition])]);
      const missing=[...required].filter(key=>typeof player.attributes?.[key]!=='number');
      throw new Error('계산에 필요한 스탯을 입력해주세요: '+missing.map(k=>ATTRIBUTE_NAMES[k]).join(', '));
    }
    if(!Number.isFinite(targetOverall)||targetOverall<1||targetOverall>99) throw new Error('목표 OVR는 1~99로 입력해주세요.');
    const weights=WEIGHTS[targetPosition],style=STYLES[styleId]?.attributes??{};
    const {preferences,bounds}=statBounds(input);
    for(const key of Object.keys(bounds))if(!Number.isFinite(player.attributes[key]))throw new Error(ATTRIBUTE_NAMES[key]+'의 현재 스탯이 없어 변경 조건을 계산할 수 없어요.');
    const base=positionScore(player,player.positions[0]);
    const minimum={...player.attributes},maximum={...player.attributes};
    for(const key of Object.keys(weights)){minimum[key]=bounds[key]?.min??1;maximum[key]=bounds[key]?.max??99;}
    const reachableRange=[estimateOverall(player,targetPosition,minimum),estimateOverall(player,targetPosition,maximum)];
    const weightTotal=Object.values(weights).reduce((sum,value)=>sum+value,0);
    const blockers=Object.entries(bounds).filter(([key,rule])=>weights[key]>0&&rule.max<99).map(([key,rule])=>{
      let requiredCap=null;
      for(let cap=rule.max+1;cap<=99;cap++)if(estimateOverall(player,targetPosition,{...maximum,[key]:cap})>=targetOverall){requiredCap=cap;break;}
      return {attribute:key,name:ATTRIBUTE_NAMES[key],max:rule.max,ovrCost:round((99-rule.max)*weights[key]/weightTotal),requiredCap};
    }).sort((a,b)=>b.ovrCost-a.ovrCost);
    let relaxation=null;
    if(reachableRange[1]<targetOverall)for(let increment=1;increment<99;increment++){
      const relaxed={...maximum},constraints=[];
      for(const row of blockers){
        const max=Math.min(99,row.max+increment);relaxed[row.attribute]=max;
        constraints.push({attribute:row.attribute,name:row.name,min:bounds[row.attribute].min,max,priority:bounds[row.attribute].priority});
      }
      const maximumOverall=estimateOverall(player,targetPosition,relaxed);
      if(maximumOverall>=targetOverall){relaxation={increment,maximumOverall,constraints,label:'상한을 같은 폭으로 완화하는 별도 예시 · 원래 변경안에는 미적용'};break;}
    }
    return [
      {id:'balanced',name:'고르게 조정',description:'여러 핵심 스탯에 변화를 분산',power:.9},
      {id:'focused',name:'핵심 스탯 집중',description:'포지션 가중치가 높은 스탯부터 조정',power:.03},
      {id:'style',name:'스타일 우선',description:STYLES[styleId].short+' 관련 스탯에 우선순위',power:.55}
    ].map(mode=>{
      const attrs={...player.attributes},changes={};
      for(const [key,rule] of Object.entries(bounds)){
        attrs[key]=clamp(attrs[key],rule.min,rule.max);
        if(attrs[key]!==player.attributes[key])changes[key]=attrs[key]-player.attributes[key];
      }
      const rawScore=()=>ratingOffset(player)+weightedScore(attrs,weights);
      const direction=targetOverall>rawScore()?1:-1;
      let iterations=0;
      while((direction>0?rawScore()<targetOverall-.045:rawScore()>targetOverall+.045)&&iterations++<10000) {
        let choice=null,priority=-Infinity;
        for(const [key,weight] of Object.entries(weights)) {
          if((direction>0&&attrs[key]>=(bounds[key]?.max??99))||(direction<0&&attrs[key]<=(bounds[key]?.min??1))) continue;
          const boost=mode.id==='style'?1+(style[key]??0)/15:1;
          const score=weight*boost*(bounds[key]?.priority??1)/Math.pow(1+Math.abs(changes[key]??0),mode.power);
          if(score>priority) {choice=key;priority=score;}
        }
        if(!choice) break;
        attrs[choice]+=direction;changes[choice]=(changes[choice]??0)+direction;
      }
      const after=estimateOverall(player,targetPosition,attrs);
      return {...mode,before,after,target:targetOverall,reached:Math.abs(after-targetOverall)<.55,preferences,
        constraints:Object.entries(bounds).map(([attribute,rule])=>({attribute,name:ATTRIBUTE_NAMES[attribute],...rule})),
        reachableRange,blockers,relaxation,attributes:attrs,changes:Object.entries(changes).filter(([,delta])=>delta!==0).map(([key,delta])=>({key,name:ATTRIBUTE_NAMES[key],before:player.attributes[key],after:attrs[key],delta})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)),totalChange:Object.values(changes).reduce((a,b)=>a+Math.abs(b),0)};
    });
  }
  function safeImageUrl(value) {
    if(typeof value!=='string'||value.length>900000) return '';
    if(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(value)) return value;
    try {const url=new URL(value);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))?url.href:'';} catch {return '';}
  }
  const optionalNumber = (value,min,max,label) => {
    if(value===null||value===undefined||String(value).trim()==='') return null;
    const number=Number(value);
    if(!Number.isFinite(number)||number<min||number>max) throw new Error(label+' 값은 '+min+'~'+max+' 범위여야 해요.');
    return number;
  };
  function normalizePlaystyles(raw) {
    if(!Array.isArray(raw)||raw.length>64)return undefined;
    const entries=new Map();
    for(const entry of raw){
      if(!Number.isInteger(entry?.id)||entry.id<0||entry.id>999||
         typeof entry.slug!=='string'||entry.slug.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug))return undefined;
      entries.set(entry.id,{id:entry.id,slug:entry.slug});
    }
    return [...entries.values()];
  }
  function normalizeProfile(raw) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
    const profile={};
    for(const key of ['league','givenName','familyName']){
      if(typeof raw[key]==='string'&&raw[key].trim())profile[key]=raw[key].trim().slice(0,100);
    }
    const ranges={heightCm:[100,250],weightKg:[25,220],contractYear:[1900,2200],skillMoves:[1,5],weakFoot:[1,5],internationalRep:[1,5]};
    for(const [key,[min,max]] of Object.entries(ranges)){
      if(Number.isInteger(raw[key])&&raw[key]>=min&&raw[key]<=max)profile[key]=raw[key];
    }
    if(['Right','Left','Both'].includes(raw.preferredFoot))profile.preferredFoot=raw.preferredFoot;
    for (const key of ['marketValue','wage','releaseClause']) {
      const amounts={};
      for (const currency of ['eur','gbp','usd']) {
        const value=raw[key]?.[currency];
        if(Number.isSafeInteger(value)&&value>=0&&value<=1e10)amounts[currency]=value;
      }
      if(Object.keys(amounts).length)profile[key]=amounts;
    }
    for (const key of ['freeAgent','realFace']) {
      if(typeof raw[key]==='boolean')profile[key]=raw[key];
    }
    if(Array.isArray(raw.roleIds)&&raw.roleIds.length<=80&&raw.roleIds.every(id=>Number.isInteger(id)&&id>=1&&id<=9999)) {
      profile.roleIds=[...new Set(raw.roleIds)];
    }
    if(Array.isArray(raw.preferredPositions)&&raw.preferredPositions.length<=7) {
      const positions=raw.preferredPositions.filter(code=>typeof code==='string'&&/^[A-Z]{1,6}$/.test(code));
      if(positions.length)profile.preferredPositions=[...new Set(positions)];
    }
    const growth = Development.reference(raw.growth);
    if (growth) profile.growth = growth;
    return Object.keys(profile).length?profile:undefined;
  }
  function normalizePlayer(raw,index=0) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error((index+1)+'번째 선수 형식을 확인해주세요.');
    const name=String(raw.name??raw.koreanName??'').trim().slice(0,80);
    if(!name) throw new Error((index+1)+'번째 선수 이름이 비어 있어요.');
    const id=String(raw.id??uid('player')).trim();
    if(!id||id.length>120) throw new Error(name+': 선수 ID를 확인해주세요.');
    const apiPlayer=isApiPlayer({id,source:raw.source});
    let positions=raw.positions??raw.position;
    if(typeof positions==='string') positions=positions.toUpperCase().split(/[,;/|\s]+/).filter(Boolean);
    const validPosition=pos=>!!WEIGHTS[pos]||(apiPlayer&&typeof pos==='string'&&/^[A-Z]{1,6}$/.test(pos));
    if(!Array.isArray(positions)||!positions.length||positions.some(pos=>!validPosition(pos))) throw new Error(name+': 포지션을 확인해주세요. 예: CM, CAM');
    positions=[...new Set(positions)];
    if(positions.length>7)throw new Error(name+': FC27 선호 포지션은 주 포지션 포함 최대 7개로 입력해주세요.');
    const overall=optionalNumber(raw.overall??raw.ovr,1,99,name+' OVR');
    if(overall===null||!Number.isInteger(overall)) throw new Error(name+': 현재 OVR는 1~99의 정수로 입력해주세요.');
    const potential=optionalNumber(raw.potential??raw.pot,1,99,name+' POT');
    const age=optionalNumber(raw.age,14,65,name+' 나이');
    if((potential!==null&&!Number.isInteger(potential))||(age!==null&&!Number.isInteger(age))) throw new Error(name+': POT와 나이는 정수로 입력해주세요.');
    const attributes={};
    for(const [key,label] of ATTRIBUTES) {
      const value=optionalNumber(raw.attributes?.[key]??raw[key],1,99,name+' '+label);
      if(value!==null) {if(!Number.isInteger(value)) throw new Error(name+': 스탯은 정수로 입력해주세요.'); attributes[key]=value;}
    }
    const player={id,name,englishName:String(raw.englishName??'').slice(0,100),positions,overall,potential,age,club:String(raw.club??'').slice(0,100),nationality:String(raw.nationality??'').slice(0,60),imageUrl:safeImageUrl(raw.imageUrl??raw.photoUrl??raw.portraitUrl??''),attributes,source:['demo','custom','import'].includes(raw.source)?raw.source:'import',notes:String(raw.notes??'').slice(0,1000)};
    const plus=normalizePlaystyles(raw.playstyle_plus),regular=normalizePlaystyles(raw.playstyles);
    if(plus)player.playstyle_plus=plus;
    if(regular)player.playstyles=regular.filter(style=>!plus?.some(upgraded=>upgraded.id===style.id));
    const profile=normalizeProfile(raw.profile);
    if(profile)player.profile=profile;
    if(raw.statEdit!=null){
      const edit=raw.statEdit;
      if(!edit||!Number.isFinite(edit.offset)||Math.abs(edit.offset)>98||!POSITIONS.includes(edit.targetPosition)||
        !Number.isInteger(edit.targetOverall)||edit.targetOverall<1||edit.targetOverall>99||!edit.original)throw new Error(name+': 저장한 스탯 변경 기록을 확인해주세요.');
      const original=normalizePlayer({...player,...edit.original,statEdit:undefined});
      player.statEdit={offset:edit.offset,targetPosition:edit.targetPosition,targetOverall:edit.targetOverall,
        original:{attributes:original.attributes,overall:original.overall,positions:original.positions}};
    }
    return player;
  }
  function statSignature(player){
    return JSON.stringify([player.id,player.overall,player.positions,ATTRIBUTES.map(([key])=>player.attributes[key]??null),player.statEdit??null]);
  }
  function applyStatPlan(current,{source,draft,position,targetOverall,style,preferences,planId}){
    if(!current||!source||statSignature(current)!==statSignature(source))throw new Error('선수 능력치가 바뀌었어요. 변경안을 다시 계산해주세요.');
    if(draft?.id!==current.id)throw new Error('변경안을 적용할 선수가 일치하지 않아요.');
    const baseline=normalizePlayer(draft);
    const plan=editorPlans(baseline,position,targetOverall,style,preferences).find(row=>row.id===planId);
    if(!plan)throw new Error('적용할 변경안을 다시 선택해주세요.');
    // Preserve the model calibration even when the primary-position rating clips at 99.
    const offset=ratingOffset(baseline),attributes={...plan.attributes};
    const score=weightedScore(attributes,WEIGHTS[current.positions[0]]);
    if(score===null)throw new Error('주 포지션 OVR 계산에 필요한 스탯이 부족해요.');
    return normalizePlayer({...current,attributes,overall:Math.round(clamp(score+offset,1,99)),statEdit:{offset,targetPosition:position,targetOverall,
      original:current.statEdit?.original??{attributes:current.attributes,overall:current.overall,positions:current.positions}}});
  }
  function restoreStatPlan(player){
    if(!player?.statEdit)throw new Error('복원할 스탯 변경 기록이 없어요.');
    return normalizePlayer({...player,...player.statEdit.original,statEdit:undefined});
  }
  function validateSquad(raw,playerIds) {
    if(!raw||typeof raw!=='object'||!FORMATION_MAP.has(raw.formation)) throw new Error('스쿼드 포메이션을 확인해주세요.');
    if(typeof raw.id!=='string'||!raw.id||raw.id.length>120) throw new Error('스쿼드 ID를 확인해주세요.');
    const used=new Set(),ids=new Set();
    function slots(items,kind,count) {
      if(!Array.isArray(items)||items.length!==count) throw new Error('스쿼드의 '+kind+' 자리 수를 확인해주세요.');
      return items.map((slot,i)=>{
        if(!slot||typeof slot.id!=='string'||ids.has(slot.id)||slot.id!==kind+'-'+i) throw new Error('선수 자리 ID가 올바르지 않아요.');
        ids.add(slot.id);
        const playerId=slot.playerId===null||slot.playerId===undefined?null:String(slot.playerId);
        if(playerId&&(!playerIds.has(playerId)||used.has(playerId))) throw new Error('스쿼드에 중복되거나 존재하지 않는 선수가 있어요.');
        if(playerId) used.add(playerId);
        const result={id:slot.id,pos:kind==='xi'?slot.pos:kind==='sub'?'SUB':'RES',playerId,locked:!!slot.locked&&!!playerId};
        if(kind==='xi') {if(!POSITIONS.includes(slot.pos)||!Number.isFinite(slot.x)||!Number.isFinite(slot.y)||slot.x<0||slot.x>100||slot.y<0||slot.y>100) throw new Error('경기장 좌표와 포지션을 확인해주세요.'); result.x=clamp(slot.x,8,92);result.y=clamp(slot.y,10,92);}
        if(slot.role!=null){
          if(typeof slot.role.id!=='string'||typeof slot.role.focus!=='string')throw new Error('저장한 역할과 포커스를 확인해주세요.');
          setPlayerRole(result,slot.role.id,slot.role.focus);
        }
        return result;
      });
    }
    const squad = {id:raw.id,name:String(raw.name||'내 스쿼드').slice(0,50),formation:raw.formation,slots:slots(raw.slots,'xi',11),bench:slots(raw.bench,'sub',9),reserves:slots(raw.reserves,'res',9),notes:String(raw.notes??'').slice(0,5000),style:STYLES[raw.style]?raw.style:'possession',focus:['balanced','youth','ready'].includes(raw.focus)?raw.focus:'balanced',custom:!!raw.custom};
    if(raw.career) squad.career=CareerMarket.workspace(raw.career,normalizePlayer);
    return squad;
  }
  function validateBackup(raw) {
    if(raw?.app!=='touchline-fc27'||raw.version!==VERSION) throw new Error('터치라인 FC 27 백업 파일이 아니거나 지원하지 않는 버전이에요.');
    if(!Array.isArray(raw.players)||raw.players.length>20000) throw new Error('선수 데이터는 최대 20,000명까지 지원해요.');
    const players=raw.players.map(normalizePlayer),playerIds=new Set(players.map(p=>p.id));
    if(playerIds.size!==players.length) throw new Error('중복된 선수 ID가 있어요.');
    if(!Array.isArray(raw.squads)||!raw.squads.length||raw.squads.length>100) throw new Error('스쿼드는 1~100개까지 저장할 수 있어요.');
    const squads=raw.squads.map(s=>validateSquad(s,playerIds));
    if(new Set(squads.map(s=>s.id)).size!==squads.length) throw new Error('중복된 스쿼드 ID가 있어요.');
    return {app:'touchline-fc27',version:VERSION,players,squads,activeSquadId:squads.some(s=>s.id===raw.activeSquadId)?raw.activeSquadId:squads[0].id};
  }
  function searchKey(text) {return String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase().replace(/\s/g,'');}
  function initials(text) {const letters='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';return [...String(text)].map(ch=>{const code=ch.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?letters[Math.floor(code/588)]:ch;}).join('');}
  function matchesSearch(player,query) {const value=[player.name,player.englishName,player.club,player.nationality].join(' ');return searchKey(value).includes(searchKey(query))||(/^[ㄱ-ㅎ]+$/.test(query)&&initials(player.name).includes(query));}
  function demoPlayers() {
    const records=[
      ['강도윤','Doyun Kang','ST',84,92,22],['한지호','Jiho Han','LW/LM',82,90,23],['이서준','Seojun Lee','RW/RM',83,93,21],['윤태오','Taeo Yun','CM/CAM',81,88,25],['박시우','Siwoo Park','CM/CAM',80,91,20],['정현우','Hyunwoo Jung','CDM/CM',82,87,27],['김유찬','Yuchan Kim','LB/LM',79,88,22],['오지훈','Jihoon Oh','CB',83,89,25],['백도현','Dohyun Baek','CB/CDM',81,90,23],['문지완','Jiwan Moon','RB/RM',80,87,24],['서준혁','Junhyeok Seo','GK',82,90,23],
      ['최이안','Ian Choi','ST/LW',77,94,18],['임하준','Hajun Lim','CAM/CM',78,92,19],['장우진','Woojin Jang','CM/CDM',79,85,28],['홍승우','Seungwoo Hong','CB/RB',78,84,26],['배로운','Rowoon Bae','RW/LW',76,91,18],['조민재','Minjae Cho','GK',76,89,20],['신유준','Yujun Shin','LB/RB',78,86,24],['송재윤','Jaeyun Song','CDM/CB',80,84,29],['류시온','Sion Ryu','LM/LW',79,90,21],['안도겸','Dogyeom Ahn','RM/CAM',77,88,22],['유건우','Gunwoo Yoo','ST',86,86,30],['남태준','Taejun Nam','CM/CAM',85,85,31],['권성민','Seongmin Kwon','CB',85,86,29],['허준서','Junseo Heo','GK',85,86,29],['양은호','Eunho Yang','CDM/CM',74,93,17],['진서우','Seowoo Jin','LW/RW',75,94,18],['도하람','Haram Do','RB/LB',75,90,19]
    ];
    return records.map((record,i)=>{
      const [name,englishName,positions,overall,potential,age]=record;
      const primary=positions.split('/')[0],attributes={};
      for(const [key] of ATTRIBUTES) {
        const relevant=(WEIGHTS[primary][key]??0)>=3;
        const keeper=key.startsWith('gk');
        const noise=((i*7+key.length*11+key.charCodeAt(0))%17)-8;
        attributes[key]=clamp(overall+(relevant?2:-15)+noise+(keeper&&primary!=='GK'?-45:0),10,96);
      }
      return normalizePlayer({id:'demo-'+(i+1),name,englishName,positions,overall,potential,age,club:['서울 시티','한강 유나이티드','부산 애슬레틱','인천 FC'][i%4],nationality:'대한민국',attributes,source:'demo',notes:'기능 체험을 위한 가상 선수입니다. 실제 FC 27 선수·능력치와 관계없습니다.'});
    });
  }
  function isApiPlayer(player) {
    return player?.source !== 'demo' && /^fcradar-fc27-[1-9]\d*$/.test(player?.id);
  }
  function withoutSeedPlayers(state) {
    const removed = new Set(state.players.filter(player => player.source === 'demo' &&
      /^demo-(?:[1-9]|1\d|2[0-8])$/.test(player.id)).map(player => player.id));
    if (!removed.size) return state;
    const clear = slots => slots.map(slot => removed.has(slot.playerId)
      ? { ...slot, playerId: null, locked: false } : slot);
    return {
      ...state,
      players: state.players.filter(player => !removed.has(player.id)),
      squads: state.squads.map(squad => ({
        ...squad, slots: clear(squad.slots), bench: clear(squad.bench), reserves: clear(squad.reserves),
      })),
    };
  }
  function initialState({ includeDemo = true } = {}) {
    const players = includeDemo ? demoPlayers() : [];
    const squad = newSquad('나의 첫 커리어');
    if (includeDemo) {
      const ids=[11,7,8,9,10,6,4,5,2,1,3];
      squad.slots.forEach((slot,i)=>{slot.playerId='demo-'+ids[i];});
      squad.bench.forEach((slot,i)=>{slot.playerId='demo-'+(12+i);});
    }
    return {app:'touchline-fc27',version:VERSION,players,squads:[squad],activeSquadId:squad.id};
  }
  return Object.freeze({applyStatPlan,restoreStatPlan,statSignature,STAT_PRESETS,statPreferences,statBounds,recommendationContext,assessRecommendation,roleSkills,VERSION,POSITIONS,POSITION_NAMES,ATTRIBUTE_GROUPS,ATTRIBUTES,ATTRIBUTE_NAMES,RATING_MODEL,WEIGHTS,STYLES,FORMATIONS,FORMATION_MAP,FC_IQ,clamp,round,uid,makeSlots,newSquad,allSlots,findSlot,setPlayerRole,setSlotPosition,weightedScore,positionScore,estimateOverall,positionComparison,positionImpact,positionFit,roleAt,movePlayer,moveToPoint,optimalAssignment,changeFormation,recommendationScore,recommendationReasons,recommend,editorPlans,safeImageUrl,normalizePlayer,validateBackup,matchesSearch,demoPlayers,initialState,isApiPlayer,withoutSeedPlayers});
});
