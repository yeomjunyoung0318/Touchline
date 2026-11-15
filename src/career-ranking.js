(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./career-market.js'), require('./career-development.js'));
  } else root.CareerRanking = factory(root.SquadCore, root.CareerMarket, root.CareerDevelopment);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, Market, Development) {
  'use strict';

  const roleSkills = C.roleSkills;
  const GOALS = { balanced: '균형', youth: '유망주 육성', ready: '즉시 전력' };
  const ROUTE_LABELS = {
    buy: '완전 영입 후보', loan: '임대 문의 후보', 'loan-buy': '영입 옵션부 임대 문의',
    free: 'DB 자유계약', precontract: '계약 만료 접근 후보', academy: '유스 아카데미', current: '현재 선수단',
  };
  const archived = player => /\b(?:classic|historic|custom|icons?)\b/i.test(player.profile?.league ?? '') ||
    /\b(?:classic|historic|icons?)\b/i.test(player.club) || (C.isApiPlayer(player) && !player.profile?.league);
  const freeAgent = player => player.profile?.freeAgent === true || player.profile?.league === 'Free Agents League';

  function validOptions(input, squad) {
    const settings = Market.options(input);
    if (settings.slotId) {
      const slot = squad.slots.find(slot => slot.id === settings.slotId);
      if (!slot) throw new Error('현재 스쿼드에서 보강할 자리를 골라주세요.');
      settings.position = slot.pos;
    }
    if (!C.POSITIONS.includes(settings.position) || !Object.hasOwn(C.STYLES, settings.style) ||
        !Object.hasOwn(GOALS, settings.focus)) throw new Error('포지션과 추천 방향을 확인해주세요.');
    const role = C.FC_IQ.getRole(settings.position, settings.role);
    if (settings.role && (!role || (settings.roleFocus && !role.focuses.includes(settings.roleFocus)))) {
      throw new Error('이 포지션에서 사용할 수 있는 역할과 포커스를 선택해주세요.');
    }
    if (settings.roleLevel && !role) throw new Error('숙련도를 적용할 역할을 먼저 선택해주세요.');
    for (const [low, high, label] of [[settings.minAge, settings.maxAge, '나이'],
      [settings.minOvr, settings.maxOvr, 'OVR'], [settings.minPot, settings.maxPot, '잠재력']]) {
      if (low != null && high != null && low > high) throw new Error(label + ' 최소·최대 값을 확인해주세요.');
    }
    return settings;
  }

  function contract(player, notes, gameDate) {
    const year = player.profile?.contractYear >= 1900 && player.profile.contractYear <= 2200 ? player.profile.contractYear : null;
    const exact = notes.contractDate ?? '';
    const yearFromDate = gameDate ? Number(gameDate.slice(0, 4)) : null;
    if (exact && gameDate) {
      const remaining = Math.round((Date.parse(exact) - Date.parse(gameDate)) / 86400000);
      const deadline = new Date(gameDate);
      deadline.setUTCMonth(deadline.getUTCMonth() + 6);
      return { exact, year: Number(exact.slice(0, 4)), remaining, approaching: remaining >= 0 && Date.parse(exact) <= deadline.getTime() };
    }
    return { exact, year, remaining: null, approaching: yearFromDate !== null && (year === yearFromDate || year === yearFromDate + 1) };
  }
  function finance(player, notes, route, settings, gameDate) {
    const currency = settings.currency;
    const { marketValue, wage, releaseClause } = player.profile ?? {};
    const matchesCurrency = notes.currency === currency;
    const recordedFee = matchesCurrency ? notes.expectedFee ?? notes.xTV : null;
    const recordedWage = matchesCurrency ? notes.expectedWage : null;
    const loan = ['loan', 'loan-buy'].includes(route);
    const upfront = route === 'free' ? 0 : recordedFee ?? (route === 'buy' ? marketValue?.[currency] ?? null : null);
    const weeklyWage = recordedWage ?? (loan ? null : wage?.[currency] ?? null);
    return {
      currency, marketValue: marketValue?.[currency] ?? null, dbWage: wage?.[currency] ?? null,
      releaseClause: (matchesCurrency ? notes.releaseClause : null) ?? releaseClause?.[currency] ?? null,
      upfront, weeklyWage, feeSource: route === 'free' ? 'free' : recordedFee != null ? 'save' : upfront != null ? 'market' : '',
      wageSource: recordedWage != null ? 'save' : weeklyWage != null ? 'db' : '',
      contract: contract(player, notes, gameDate),
    };
  }
  function evaluate(player, settings, notes = {}, route = 'buy', gameDate = '', outlook) {
    const assessment = C.assessRecommendation(player, settings, notes, outlook);
    return assessment && { ...assessment, route, finance: finance(player, notes, route, settings, gameDate) };
  }
  function roleAndPosition(report, settings) {
    return (settings.deployment !== 'natural' || report.fit.kind !== 'other') &&
      (settings.deployment !== 'conversion' || report.fit.kind === 'other') &&
      (settings.roleLevel == null || (report.role.level ?? 0) >= settings.roleLevel);
  }
  function fitsRange(value, low, high) {
    return (low == null || (value != null && value >= low)) && (high == null || (value != null && value <= high));
  }
  function matches(player, development, settings, gender) {
    const profile = player.profile ?? {};
    const plus = player.playstyle_plus ?? [];
    const traits = settings.traitPlus ? plus : [...plus, ...(player.playstyles ?? [])];
    return (!settings.gender || gender === settings.gender) &&
      (!settings.league || profile.league === settings.league) && (!settings.club || player.club === settings.club) &&
      (!settings.nation || player.nationality === settings.nation) &&
      (!settings.foot || profile.preferredFoot === settings.foot) &&
      fitsRange(development.age, settings.minAge, settings.maxAge) &&
      fitsRange(player.overall, settings.minOvr, settings.maxOvr) && fitsRange(development.potential, settings.minPot, settings.maxPot) &&
      fitsRange(development.gap, settings.minGrowth, null) &&
      (!settings.growthProfile || development.origin?.type === settings.growthProfile) &&
      fitsRange(profile.heightCm, settings.minHeight, null) && fitsRange(profile.weakFoot, settings.minWeakFoot, null) &&
      fitsRange(profile.skillMoves, settings.minSkill, null) &&
      ((!settings.trait && !settings.traitPlus) || traits.some(trait => !settings.trait || trait.slug === settings.trait));
  }
  function transferRoute(player, notes, settings, gameDate, routeHint) {
    if (settings.scope === 'academy') return 'academy';
    if (settings.scope === 'squad') return 'current';
    const route = settings.route;
    if (freeAgent(player)) return ['any', 'free'].includes(route) ? 'free' : null;
    if (route === 'free') return null;
    if (route === 'precontract') return contract(player, notes, gameDate).approaching ? 'precontract' : null;
    if (['loan', 'loan-buy'].includes(route)) return route;
    if (routeHint === 'loan') return route === 'any' ? 'loan' : null;
    return 'buy';
  }
  function budgetMatch(finances, settings) {
    const values = [[finances.upfront, settings.feeLimit], [finances.weeklyWage, settings.wageLimit]];
    if (values.some(([amount, limit]) => limit != null && amount != null && amount > limit)) return 'over';
    if (values.some(([amount, limit]) => limit != null && amount == null)) return 'unknown';
    return 'within';
  }
  function compareDepth(player, report, squad, byId, settings) {
    const incumbents = [...new Set(C.allSlots(squad).map(slot => slot.playerId).filter(Boolean))]
      .map(id => byId.get(id)).filter(row => row && row.id !== player.id && row.positions.includes(settings.position))
      .map(row => ({ id: row.id, name: row.name, value: C.positionFit(row, settings.position).estimate }))
      .filter(row => row.value != null);
    const baseline = report.fit.estimate;
    const target = settings.slotId && squad.slots.find(slot => slot.id === settings.slotId);
    const samePosition = squad.slots.filter(slot => slot.pos === settings.position && slot.playerId && slot.playerId !== player.id);
    const incumbent = target ? byId.get(target.playerId) : samePosition.map(slot => byId.get(slot.playerId)).filter(Boolean)
      .sort((a, b) => (C.positionFit(a, settings.position).estimate ?? 100) - (C.positionFit(b, settings.position).estimate ?? 100))[0];
    const incumbentValue = incumbent && incumbent.id !== player.id ? C.positionFit(incumbent, settings.position).estimate : null;
    return {
      rank: baseline == null || !incumbents.length ? null : incumbents.filter(row => row.value > baseline).length + 1,
      size: incumbents.length + 1,
      incumbent: incumbentValue == null ? null : { name: incumbent.name, value: incumbentValue },
      delta: incumbentValue == null || baseline == null ? null : C.round(baseline - incumbentValue),
    };
  }
  const duties = {
    LB: ['defensiveAwareness', 'acceleration', 'stamina'], RB: ['defensiveAwareness', 'acceleration', 'stamina'],
    CB: ['defensiveAwareness', 'standingTackle', 'strength'], CDM: ['interceptions', 'defensiveAwareness', 'stamina'],
    CM: ['stamina', 'interceptions', 'shortPassing'], CAM: ['vision', 'ballControl', 'composure'],
    LM: ['stamina', 'crossing', 'acceleration'], RM: ['stamina', 'crossing', 'acceleration'],
    LW: ['dribbling', 'acceleration', 'positioning'], RW: ['dribbling', 'acceleration', 'positioning'],
    ST: ['finishing', 'positioning', 'composure'],
  };
  const cover = {
    LB: '옆 센터백과 수비형 미드필더가 전진할 때 생기는 측면 공간을 커버해요.',
    RB: '옆 센터백과 수비형 미드필더가 전진할 때 생기는 측면 공간을 커버해요.',
    CB: '옆에 수비 포커스 센터백을 두고, 첫 시험은 뒷공간 부담이 작은 수비 라인에서 해보세요.',
    CDM: '첫 시험은 더블 볼란치로 시작하고 옆의 홀딩에게 차단과 후방 보호를 맡겨요.',
    CM: '홀딩 CDM을 뒤에 두고 전개에 집중시키세요. 수비 전환 때는 옆 중원과 커버를 나눠요.',
    CAM: '침투형 ST가 앞에서 수비를 끌어주면 두 줄 사이에서 공을 받을 공간이 생겨요.',
    LM: '옆 풀백과 폭을 나누고, 공을 잃으면 측면 수비 복귀를 확인해요.',
    RM: '옆 풀백과 폭을 나누고, 공을 잃으면 측면 수비 복귀를 확인해요.',
    LW: '안으로 들어가는 역할이면 풀백에게 폭을 맡기고, 반대쪽에 박스 침투를 둬요.',
    RW: '안으로 들어가는 역할이면 풀백에게 폭을 맡기고, 반대쪽에 박스 침투를 둬요.',
    ST: '측면에 침투 자원을 둬서 공을 받으러 내려갈 때도 박스를 비우지 않게 해요.',
  };
  const roleCover = {
    'deep-lying-playmaker': '공을 받으러 내려와 전개를 맡겨요. 홀딩이나 볼 위닝 역할을 가까이 둬서 공을 잃었을 때 중앙을 보호해요.',
    'box-crasher': '박스 침투가 시작되면 다른 CDM을 뒤에 남겨 역습 통로를 막아요.',
    'ball-playing-defender': '짧은 패스 선택지를 만들어주고, 수비 포커스 센터백이 라인과 뒷공간을 지키게 해요.',
    'false-9': '양쪽 인사이드 포워드나 섀도 스트라이커가 비운 박스로 침투하게 해요.',
    'inverted-wingback': '윙어가 터치라인 쪽 폭을 잡고, 반대 풀백이나 CDM이 공을 잃은 직후를 대비해요.',
    'inside-forward': '풀백에게 바깥 폭을 맡기고, 선수가 안으로 들어올 때 ST와 침투 길이 겹치지 않게 해요.',
  };
  const CONVERSION_LEVELS = { trial: '시험 기용', cover: '커버 필요', risky: '실험용' };

  function conversionPlans(player, settings, squad, findPlayer, notes = {}) {
    if (player.positions.includes('GK')) return [];
    const origin = C.allSlots(squad).find(slot => slot.playerId === player.id);
    const outlook = Development.outlook(player, notes, settings.growthSeasons);
    const plans = [];
    for (const position of C.POSITIONS) {
      if (position === 'GK' || player.positions.includes(position)) continue;
      const atPosition = squad.slots.filter(slot => slot.pos === position && !slot.locked);
      const incumbents = atPosition.map(slot => {
        const incumbent = findPlayer(slot.playerId);
        return { slot, incumbent, rating: incumbent ? C.positionFit(incumbent, position).estimate : null };
      });
      const target = incumbents.find(({ slot }) => slot.id === settings.slotId) ??
        incumbents.find(({ slot }) => !slot.playerId) ??
        incumbents.sort((a, b) => (a.rating ?? 100) - (b.rating ?? 100))[0];
      const preference = position === settings.position && settings.role
        ? { id: settings.role, focus: settings.roleFocus } : target?.slot.role;
      const requested = C.FC_IQ.getRole(position, preference?.id);
      const report = evaluate(player, {
        ...settings, position, deployment: 'conversion', role: requested?.id ?? '',
        roleFocus: requested?.focuses.includes(preference?.focus) ? preference.focus : '',
      }, notes, undefined, '', outlook);
      if (!report) continue;
      const { role, delta } = report;
      const weakness = [...new Set([...duties[position], ...roleSkills[role.id].split(' ').slice(0, 3)])]
        .filter(key => Number.isFinite(player.attributes[key]) && player.attributes[key] < player.overall - 5)
        .sort((a, b) => player.attributes[a] - player.attributes[b])
        .slice(0, 3).map(key => ({ key, value: player.attributes[key] }));
      const needsCover = weakness.some(stat => stat.value < player.overall - 13);
      const level = delta < -8 ? 'risky' : delta < -3 || needsCover ? 'cover' : 'trial';
      const squadDelta = target?.rating == null ? null : C.round(report.fit.estimate - target.rating);
      const score = report.score + (target ? 2 : 0) + (squadDelta == null ? 0 : C.clamp(squadDelta, -8, 8) * .3) - (needsCover ? 2 : 0);
      plans.push({
        position, role, ovr: report.fit.estimate, delta, level, score, weakness,
        cover: roleCover[role.id] ?? cover[position],
        slotId: origin?.locked ? null : target?.slot.id ?? null,
        blocked: origin?.locked ? '현재 자리 고정' : !target && squad.slots.some(slot => slot.pos === position) ? '이 포지션의 자리 고정' : '',
        incumbent: target?.incumbent ? { name: target.incumbent.name, rating: target.rating } : null,
        squadDelta,
      });
    }
    plans.sort((a, b) => b.score - a.score || b.ovr - a.ovr || a.position.localeCompare(b.position));
    const requested = plans.find(plan => plan.position === settings.position);
    return requested ? [requested, ...plans.filter(plan => plan !== requested).slice(0, 3)] : plans.slice(0, 4);
  }
  function supportNeed(plan) {
    if (plan.position === 'ST') return { positions:['LW','RW','LM','RM','CAM'], role:'inside-forward',
      skills:['positioning','acceleration','finishing'], label:'박스 침투 지원' };
    if (['LB','RB','CB'].includes(plan.position)) return { positions:['CB'], role:'defender',
      skills:['defensiveAwareness','standingTackle','acceleration'], label:'수비 라인과 뒷공간 보호' };
    if (['LW','RW','LM','RM'].includes(plan.position)) return {
      positions:[['LW','LM'].includes(plan.position)?'LB':'RB'], role:'fullback',
      skills:['defensiveAwareness','standingTackle','stamina'], label:'같은 측면 후방 커버' };
    return { positions:['CDM','CM'], role:'holding',
      skills:['interceptions','defensiveAwareness','standingTackle'], label:'중앙 차단과 후방 보호' };
  }
  function supportEvidence(player, candidate, need, notes = {}) {
    const threshold = Math.max(55, player.overall - 12);
    const stats = need.skills.map(key => ({key, value:candidate.attributes[key] ?? null}));
    const known = stats.every(stat => stat.value != null);
    const strength = known ? C.round(stats.reduce((sum,stat) => sum + stat.value, 0) / stats.length) : null;
    const available = !['medium','severe'].includes(notes.injury) && notes.fitness !== 'unfit';
    return {threshold, stats, strength, available,
      sufficient:known && strength >= threshold && stats.every(stat => stat.value >= threshold - 8) && available};
  }
  function conversionSupport({ player, settings, squad, players, saved=[], catalog, recruitment }) {
    const byId=new Map((catalog?.players??[]).map(row=>[row.id,row]));
    for(const row of players)byId.set(row.id,{...byId.get(row.id),...row,profile:{...row.profile,...byId.get(row.id)?.profile}});
    const notes=new Map(saved.map(row=>[row.player.id,row.observation??{}]));
    const listed=new Map(C.allSlots(squad).filter(slot=>slot.playerId).map(slot=>[slot.playerId,slot]));
    const sourceNotes=notes.get(player.id)??{};
    const plans=conversionPlans(player,settings,squad,id=>byId.get(id),sourceNotes);
    return plans.map(plan=>{
      const need=supportNeed(plan);
      const target=C.findSlot(squad,plan.slotId)??squad.slots.find(slot=>slot.playerId===player.id&&slot.pos===plan.position);
      const slots=squad.slots.filter(slot=>slot.id!==target?.id&&need.positions.includes(slot.pos)&&
        C.FC_IQ.getRole(slot.pos,need.role));
      slots.sort((a,b)=>need.positions.indexOf(a.pos)-need.positions.indexOf(b.pos)||
        Math.abs(a.x-(target?.x??50))-Math.abs(b.x-(target?.x??50)));
      const floor=Math.max(55,player.overall-12);
      const evidence=candidate=>supportEvidence(player,candidate,need,notes.get(candidate.id));
      const current=[];
      for(const [id,origin] of listed){
        const candidate=byId.get(id);
        if(!candidate||id===player.id||id===target?.playerId)continue;
        const slot=slots.find(slot=>slot.id===origin.id&&(!slot.locked||slot.role?.id===need.role))??
          (!origin.locked&&slots.find(slot=>!slot.locked&&candidate.positions.includes(slot.pos)));
        if(!slot||!candidate.positions.includes(slot.pos))continue;
        const role=C.FC_IQ.getRole(slot.pos,need.role);
        const roleFocus=role.focuses.includes('defend')?'defend':role.focuses[0];
        if(slot.locked&&slot.role?.focus!==roleFocus)continue;
        const report=evaluate(candidate,{...settings,position:slot.pos,role:role.id,roleFocus},notes.get(id));
        if(!report)continue;
        current.push({player:candidate,slotId:slot.id,position:slot.pos,role:report.role,
          score:report.score,...evidence(candidate),placement:origin.id===slot.id?'현재 자리':origin.pos==='SUB'||origin.pos==='RES'?'후보에서 기용':'선발 자리 이동 필요'});
      }
      current.sort((a,b)=>Number(b.sufficient)-Number(a.sufficient)||b.score-a.score);
      const covered=current.some(row=>row.sufficient);
      const openSlot=slots.find(slot=>!slot.locked);
      const support={label:need.label,threshold:floor,status:covered?'covered':current.length?'weak':'missing',
        current:current.slice(0,3),recruits:[],position:openSlot?.pos??slots[0]?.pos??need.positions[0],
        message:'',catalogAvailable:!!catalog};
      if(covered)return {...plan,support};
      if(!openSlot){support.message='커버할 자리를 포메이션에 추가하거나 자리 고정을 해제해주세요.';return {...plan,support};}
      if(!catalog){support.message='선수 DB에 연결하면 커버 영입 후보를 함께 찾아요.';return {...plan,support};}
      const sourceReport=evaluate(player,settings,sourceNotes,transferRoute(player,sourceNotes,settings,settings.gameDate)??'buy');
      const cost=!listed.has(player.id)&&settings.scope==='market'?sourceReport?.finance:null;
      const unknownCost=cost&&((settings.feeLimit!=null&&cost.upfront==null)||(settings.wageLimit!=null&&cost.weeklyWage==null));
      if(unknownCost&&!settings.allowUnknown){
        support.message='전환 선수의 영입비·주급을 기록하면 두 선수의 합계 예산으로 비교할 수 있어요.';
        return {...plan,support};
      }
      const feeLimit=settings.feeLimit==null?null:settings.feeLimit-(cost?.upfront??0);
      const wageLimit=settings.wageLimit==null?null:settings.wageLimit-(cost?.weeklyWage??0);
      if(feeLimit<0||wageLimit<0){support.message='전환 선수의 비용이 예산을 초과해요.';return {...plan,support};}
      const role=C.FC_IQ.getRole(openSlot.pos,need.role);
      const input={...settings,scope:'market',slotId:openSlot.id,position:openSlot.pos,role:role.id,
        roleFocus:role.focuses.includes('defend')?'defend':role.focuses[0],deployment:'natural',
        query:'',trait:'',traitPlus:false,roleLevel:null,growthProfile:'',excludeSquad:true,
        feeLimit,wageLimit,sort:'fit',gender:settings.gender||catalog.gender?.(player)||''};
      const result=scout({input,squad,players,saved,catalog,recruitment,
        accept:candidate=>candidate.id!==player.id&&evidence(candidate).sufficient});
      support.recruits=result.rows.slice(0,3).map(row=>({...row,slotId:openSlot.id,position:openSlot.pos,
        ...evidence(row.player),combinedFee:(cost&&cost.upfront==null)||row.report.finance.upfront==null?null:(cost?.upfront??0)+(row.report.finance.upfront??0),
        combinedWage:(cost&&cost.weeklyWage==null)||row.report.finance.weeklyWage==null?null:(cost?.weeklyWage??0)+(row.report.finance.weeklyWage??0)}));
      support.message=unknownCost?'전환 선수의 미확인 비용은 합계 예산 확인이 필요해요.':
        support.recruits.length?'설정한 구단·영입 조건과 두 선수의 합계 예산으로 비교했어요.':'현재 구단·영입 조건에서 커버 기준을 만족하는 후보가 없어요.';
      return {...plan,support};
    });
  }
  function order(a, b, key) {
    const values = {
      ovr: row => row.report.fit.estimate, potential: row => row.report.potential, growth: row => row.report.growth,
      age: row => row.report.development.age, value: row => row.report.finance.upfront, wage: row => row.report.finance.weeklyWage,
    };
    const value = values[key];
    if (value) {
      const left = value(a), right = value(b);
      if (left == null && right != null) return 1;
      if (left != null && right == null) return -1;
      if (left != null && right != null && left !== right) return (left - right) * (['age', 'value', 'wage'].includes(key) ? 1 : -1);
    }
    return b.report.score - a.report.score || b.player.overall - a.player.overall || a.player.id.localeCompare(b.player.id);
  }
  function scout({ input, squad, players, saved = [], catalog, recruitment, page, accept = () => true }) {
    const settings = validOptions(input, squad);
    const observations = new Map(saved.map(target => [target.player.id, target]));
    const listed = new Set(C.allSlots(squad).map(slot => slot.playerId).filter(Boolean));
    const byId = new Map(players.map(player => [player.id, player]));
    for (const target of saved) if (!byId.has(target.player.id)) byId.set(target.player.id, target.player);
    for (const row of catalog?.players ?? []) {
      const local = byId.get(row.id);
      byId.set(row.id, local ? { ...row, ...local, profile: { ...local.profile, ...row.profile } } : row);
    }
    const source = settings.scope === 'academy' ? saved.filter(target => target.list === 'academy').map(target => byId.get(target.player.id)) :
      settings.scope === 'squad' ? [...listed].map(id => byId.get(id)).filter(Boolean) : byId.values();
    const gameDate = settings.gameDate || (catalog?.date ? catalog.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : '');
    const matchesList = [];
    let unknownBudget = 0, overBudget = 0;
    for (const player of source) {
      const entry = observations.get(player.id), notes = entry?.observation ?? {};
      if (settings.scope === 'market' && (entry?.list === 'block' || entry?.list === 'academy' ||
          (settings.excludeSquad && listed.has(player.id)) || (!settings.includeHistoric && archived(player)))) continue;
      if (settings.query && !C.matchesSearch(player, settings.query)) continue;
      const isFree = freeAgent(player);
      const gender = isFree && player.profile?.league === 'Free Agents League'
        ? (/women/i.test(player.club) ? 'female' : 'male') : catalog?.gender?.(player);
      const development = Development.outlook(player, notes, settings.growthSeasons);
      if (!matches(player, development, settings, gender)) continue;
      const path = recruitment?.fit(player);
      if (settings.scope === 'market' && recruitment && (!path || path.type === 'current')) continue;
      const route = transferRoute(player, notes, settings, gameDate, path?.type);
      if (!route) continue;
      const report = evaluate(player, settings, notes, route, gameDate, development);
      if (!report || !roleAndPosition(report, settings) || !accept(player, report)) continue;
      if (settings.scope === 'market') {
        const budget = budgetMatch(report.finance, settings);
        if (budget === 'over') { overBudget++; continue; }
        if (budget === 'unknown') {
          unknownBudget++;
          if (!settings.allowUnknown) continue;
        }
        report.budget = budget;
      }
      matchesList.push({ player, report, path: path?.reason ?? '' });
    }
    matchesList.sort((a, b) => order(a, b, settings.sort));
    const size = 18, pages = Math.max(1, Math.ceil(matchesList.length / size));
    const currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(page) ? page : 1));
    const rows = matchesList.slice((currentPage - 1) * size, currentPage * size).map(({ player, report, path }) => {
      const catalogRow = catalog?.get(player.id);
      const display = catalogRow && catalog.display(catalogRow);
      return {
        player: display ? { ...player, imageUrl: display.imageUrl || player.imageUrl } : player,
        report: { ...report, path, depth: compareDepth(player, report, squad, byId, settings) },
      };
    });
    return { rows, total: matchesList.length, page: currentPage, pages, unknownBudget, overBudget, date: gameDate,
      snapshot: catalog?.date ?? null, settings, career: recruitment?.info ?? null };
  }
  return { GOALS, ROUTE_LABELS, CONVERSION_LEVELS, validOptions, scout, evaluate, contract, conversionPlans, conversionSupport,
    supportNeed, supportEvidence, finance, transferRoute, matches, archived };
});
