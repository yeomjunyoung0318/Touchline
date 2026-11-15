(function(){
  'use strict';
  const C=window.SquadCore,A=window.PlayerDataAdapter,P=window.PlayerPlaystyles,Profile=window.PlayerProfile;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const icon=name=>'<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  document.addEventListener('load',event=>{
    if(event.target.matches?.('img.playstyle-icon'))event.target.classList.add('is-loaded');
  },true);
  document.addEventListener('error',event=>{
    if(event.target.matches?.('img.playstyle-icon'))event.target.remove();
  },true);
  const percent=value=>Number(value.toFixed(2)).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%';
  const signed=value=>(value>0?'+':'')+Number(value.toFixed(1));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const STORAGE='touchline-fc27-v1';
  const views=['board','search','recommend','editor','ai'];
  let state,storageIssue='',recoveryRaw='',saveTimer,toastTimer,drag=null,suppressClickUntil=0;
  let aiController=null,playerSearchController=null,playerProfile=null,careerController=null;
  const past=[],future=[];
  const ui={view:'board',pitchView:'players',library:'list',selectedSlot:null,selectedPlayer:null,moveSource:null,query:'',position:'',sort:'overall',maxAge:'',minOvr:'',minPot:'',limit:100,style:'possession',focus:'balanced',recommendFormation:'auto',recommendGender:null,recommendation:null,editorPlayer:null,editorDraft:null,plans:[],planIndex:0,pendingImport:null,photoData:null};
  let removedExamples = false;
  try {
    const saved = localStorage.getItem(STORAGE);
    const loaded = saved ? C.validateBackup(JSON.parse(saved)) : C.initialState({ includeDemo: false });
    state = C.withoutSeedPlayers(loaded);
    removedExamples = state !== loaded;
  }
  catch(error) {state=C.initialState({includeDemo:false});storageIssue='기존 저장 내용을 불러오지 못했어요. 원본 백업을 보관한 뒤 데이터를 확인해주세요.';try{recoveryRaw=localStorage.getItem(STORAGE)||'';}catch{} }
  let playerMap=new Map(state.players.map(p=>[p.id,p]));
  const squad=()=>state.squads.find(s=>s.id===state.activeSquadId)||state.squads[0];
  const player=id=>playerMap.get(id);
  const profilePlayer=id=>player(id)??squad().career?.targets.find(record=>record.player.id===id)?.player;
  const activeSlot=()=>C.findSlot(squad(),ui.selectedSlot);
  const aiContext=()=>window.AIContext.prepare({players:state.players,squad:squad()});
  function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className='toast'+(error?' error':'');toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
  function showStorageIssue(){const banner=$('#storage-banner');banner.classList.toggle('hidden',!storageIssue);banner.innerHTML=storageIssue?esc(storageIssue)+' <button class="text-button" data-action="backup">백업 파일 저장</button>'+(recoveryRaw?' <button class="text-button" data-action="recovery">이전 저장 원본 내려받기</button>':''):'';}
  function persist(){
    clearTimeout(saveTimer);
    try {localStorage.setItem(STORAGE,JSON.stringify(state));if(!recoveryRaw)storageIssue='';$('#save-status').textContent='브라우저에 자동 저장됨';$('#save-status').className='save-status saved';}
    catch {storageIssue='브라우저 저장 공간이 부족하거나 저장이 차단되어 있어요. 변경 내용은 현재 창에만 있으니 백업 파일로 보관해주세요.';$('#save-status').textContent='파일 백업 필요';$('#save-status').className='save-status';}
    showStorageIssue();
  }
  function queueSave(){clearTimeout(saveTimer);$('#save-status').textContent='저장 중…';saveTimer=setTimeout(persist,350);}
  function commit(change,message,options={}){
    const before=clone(state);
    try {change();}catch(error){state=before;playerMap=new Map(state.players.map(p=>[p.id,p]));toast(error.message,true);return false;}
    past.push(before);if(past.length>15)past.shift();future.length=0;
    playerMap=new Map(state.players.map(p=>[p.id,p]));ui.recommendation=null;ui.statImpact=null;if(options.dataChanged)careerController?.invalidate();
    if(options.dataChanged){ui.plans=[];ui.editorDraft=null;if(ui.editorPlayer&&!player(ui.editorPlayer))ui.editorPlayer=null;}
    persist();renderAll();if(message)toast(message);return true;
  }
  function travelHistory(forward=false){
    const from=forward?future:past,to=forward?past:future;
    if(!from.length)return;
    to.push(clone(state));state=from.pop();playerMap=new Map(state.players.map(p=>[p.id,p]));ui.recommendation=null;ui.plans=[];ui.editorDraft=null;ui.statImpact=null;careerController?.invalidate();
    persist();renderAll();toast(forward?'다시 실행했어요.':'이전 상태로 되돌렸어요.');
  }
  function avatar(p,card=false){return '<span class="avatar'+(card?' card-avatar':'')+'">'+icon('person')+(p?.imageUrl?'<img src="'+esc(p.imageUrl)+'" alt="'+esc(p.name)+' 사진" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">':'')+'</span>';}
  function slotRoleLabel(slot){
    if(!slot.role)return '';
    const role=C.FC_IQ.getRole(slot.pos,slot.role.id);
    return role.name+' · '+C.FC_IQ.focuses[slot.role.focus].name;
  }
  function cardHtml(slot){
    const p=player(slot.playerId);
    const picked=C.FC_IQ.getRole(slot.pos,slot.role?.id);
    const role=picked?
      '<span class="card-tactic"><span class="card-role-name">'+esc(picked.name)+'</span><span class="card-role-focus">'+esc(C.FC_IQ.focuses[slot.role.focus].name)+'</span></span>':
      '<span class="card-tactic empty-role"><span class="card-role-name">역할 선택</span></span>';
    if(!p)return '<div class="empty-card">'+icon('plus')+'<span>'+esc(slot.pos)+'</span></div>'+role;
    const fit=C.positionFit(p,slot.pos),converted=slot.pos!==p.positions[0],value=converted?fit.estimate:p.overall,delta=value===null?null:C.round(value-p.overall);
    const estimated=converted?' <span class="fit-estimate">'+(delta===null?'미계산':signed(delta))+'</span>':'';
    return '<div class="player-card"><div class="card-top"><b class="card-rating">'+(value===null?'—':value)+'<small>'+(converted?'OVR 추정':'OVR')+'</small></b>'+avatar(p,true)+'<button class="card-lock'+(slot.locked?' locked':'')+'" data-action="lock" data-slot="'+slot.id+'" aria-label="'+esc(p.name)+' 추천 시 '+(slot.locked?'고정 해제':'고정')+'" aria-pressed="'+slot.locked+'" title="추천 시 '+(slot.locked?'고정 해제':'고정')+'">'+icon(slot.locked?'lock':'unlock')+'</button></div><span class="card-name">'+esc(p.name)+'</span></div><span class="card-position"><i class="fit-dot '+fit.kind+'"></i>'+slot.pos+estimated+'</span>'+role;
  }
  function renderBoard(){
    const s=squad();
    const roles=ui.pitchView==='roles';
    $('#pitch').classList.toggle('roles-view',roles);
    $('#pitch-hint').textContent=roles?'자리를 선택해 역할과 포커스를 지정하세요.':'드래그해 이동 · 선수 위에 놓아 교체';
    $$('[data-pitch-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pitchView===ui.pitchView)));
    if(document.activeElement!==$('#squad-name'))$('#squad-name').value=s.name;
    if(document.activeElement!==$('#squad-notes'))$('#squad-notes').value=s.notes;
    $('#formation-select').value=s.formation;
    const xi=s.slots.map(slot=>player(slot.playerId)).filter(Boolean);
    const average=key=>{const values=xi.map(p=>p[key]).filter(v=>v!==null);return values.length?C.round(values.reduce((a,b)=>a+b,0)/values.length):'—';};
    const conversions=s.slots.filter(slot=>{const p=player(slot.playerId);return p&&!p.positions.includes(slot.pos);}).length;
    const placement=s.slots.filter(slot=>slot.playerId).map(slot=>{const p=player(slot.playerId);return p?(slot.pos===p.positions[0]?p.overall:C.estimateOverall(p,slot.pos)):null;});
    const anyEstimated=s.slots.some(slot=>{const p=player(slot.playerId);return p&&slot.pos!==p.positions[0];});
    const placementMean=placement.length&&placement.every(v=>v!==null)?(anyEstimated?'~':'')+C.round(placement.reduce((a,b)=>a+b,0)/placement.length):'—';
    const items=[['배치 OVR 평균',placementMean,'입력 OVR 평균 '+average('overall'),true],['평균 잠재력',average('potential'),'입력된 POT 기준',false],['평균 나이',average('age'),'선발 선수 기준',false],['선발 구성',xi.length+'<small>/ 11</small>',conversions?'포지션 전환 '+conversions+'명':'주·보조 포지션 구성',false]];
    $('#squad-summary').innerHTML=items.map(([label,value,sub,accent])=>'<div class="summary-item"><span class="summary-label">'+label+'</span><b class="summary-number'+(accent?' accent':'')+'">'+value+'</b><span class="summary-sub">'+sub+'</span></div>').join('');
    $('#pitch-slots').innerHTML=s.slots.map(slot=>{
      const p=player(slot.playerId),role=slotRoleLabel(slot);
      const label=slot.pos+' 자리, '+(p?p.name+', 원본 OVR '+p.overall:roles?'빈 자리':'선수 추가')+
        (role?', '+role:'')+(roles?', 역할 설정':'');
      const title=slot.pos+' · '+(p?p.name+' · '+C.positionFit(p,slot.pos).label:roles?'역할 설정':'클릭해서 선수 추가')+(role?' · '+role:'');
      return '<div class="pitch-slot'+(ui.selectedSlot===slot.id?' selected':'')+'" role="button" tabindex="0" data-slot-id="'+slot.id+'" style="left:'+slot.x+'%;top:'+slot.y+'%" aria-pressed="'+(ui.selectedSlot===slot.id)+'" aria-label="'+esc(label)+'" title="'+esc(title)+'">'+cardHtml(slot)+'</div>';
    }).join('');
    function benchHtml(slots){return slots.map((slot,i)=>{const p=player(slot.playerId);return '<div class="bench-slot'+(!p?' empty':'')+(ui.selectedSlot===slot.id?' selected':'')+'" role="button" tabindex="0" data-slot-id="'+slot.id+'" aria-label="'+esc((slot.pos==='SUB'?'후보':'예비')+' '+(i+1)+', '+(p?p.name:'선수 추가'))+'" aria-pressed="'+(ui.selectedSlot===slot.id)+'">'+(p?'<button class="card-lock'+(slot.locked?' locked':'')+'" data-action="lock" data-slot="'+slot.id+'" aria-pressed="'+slot.locked+'" aria-label="'+esc(p.name)+' 추천 시 '+(slot.locked?'고정 해제':'고정')+'">'+icon(slot.locked?'lock':'unlock')+'</button>'+avatar(p)+'<b class="bench-name">'+esc(p.name)+'</b><span class="bench-rating">'+p.positions[0]+' · '+p.overall+'</span>':icon('plus')+'<span>'+slot.pos+' '+(i+1)+'</span>')+'</div>';}).join('');}
    $('#bench-slots').innerHTML=benchHtml(s.bench);$('#reserve-slots').innerHTML=benchHtml(s.reserves);
    $('#bench-count').textContent=s.bench.filter(slot=>slot.playerId).length+' / 9';$('#reserve-count').textContent=s.reserves.filter(slot=>slot.playerId).length+' / 9';
    $('#custom-indicator').classList.toggle('hidden',!s.custom);
    $('[data-action="undo"]').disabled=!past.length;$('[data-action="redo"]').disabled=!future.length;
  }
  function renderPlayerList(){
    const used=new Set(C.allSlots(squad()).filter(s=>s.playerId).map(s=>s.playerId));
    let list=state.players.filter(p=>C.matchesSearch(p,ui.query)&&(!ui.position||p.positions.includes(ui.position))&&(!ui.maxAge||(p.age!==null&&p.age<=Number(ui.maxAge)))&&(!ui.minOvr||p.overall>=Number(ui.minOvr))&&(!ui.minPot||(p.potential!==null&&p.potential>=Number(ui.minPot))));
    list.sort((a,b)=>ui.sort==='age'?(a.age??100)-(b.age??100):ui.sort==='name'?a.name.localeCompare(b.name,'ko'):ui.sort==='potential'?(b.potential??-1)-(a.potential??-1):b.overall-a.overall);
    $('#result-count').textContent=list.length+'명 검색됨';
    const selected=activeSlot();
    $('#placement-hint').textContent=ui.moveSource?'이동할 자리를 클릭해주세요. Esc로 취소할 수 있어요.':selected?(selected.pos==='SUB'?'후보':selected.pos==='RES'?'예비':selected.pos)+' 자리에 배치 · 선수의 + 버튼을 눌러주세요.':'';
    $('#player-results').innerHTML=list.slice(0,ui.limit).map(p=>'<div class="player-row" data-action="player-detail" data-player="'+esc(p.id)+'" data-drag-player="'+esc(p.id)+'" role="button" tabindex="0" aria-label="'+esc(p.name)+' 선수 정보"><span>'+avatar(p)+'</span><div class="player-info"><b class="player-name">'+esc(p.name)+'</b><span class="player-sub"><span class="player-pos">'+esc(p.positions.join(' / '))+'</span><span>'+(p.age===null?'나이 미입력':p.age+'세')+'</span><span>'+(p.source==='demo'?'모의':esc(p.club))+(C.isApiPlayer(p)?'<span class="api-source">API</span>':'')+'</span></span></div><span class="rating-pair">'+p.overall+'<i>/</i><span class="pot">'+(p.potential??'—')+'</span></span><button class="assign-button'+(used.has(p.id)?' assigned':'')+'" data-action="assign" data-player="'+esc(p.id)+'" aria-label="'+esc(p.name)+' 선택한 자리에 배치" title="'+(used.has(p.id)?'이미 배치됨 · 클릭하면 선택한 자리로 이동':'선택한 자리에 배치')+'">'+icon(used.has(p.id)?'check':'plus')+'</button></div>').join('')+(list.length>ui.limit?'<button class="load-more" data-action="more-players">'+Math.min(100,list.length-ui.limit)+'명 더 보기</button>':'');
    if(!state.players.length) {
      $('#player-results').innerHTML='<div class="empty-state"><h3>선수를 추가해보세요.</h3><p>선수 검색에서 전체 DB를 보고 스쿼드에 바로 배치할 수 있어요.</p><button class="btn primary small" data-view="search">선수 검색 열기</button></div>';
    } else if(!list.length)$('#player-results').innerHTML='<div class="empty-state"><h3>선수를 찾지 못했어요.</h3><p>검색어나 필터를 바꿔보세요.<br>선수를 직접 추가할 수도 있어요.</p><button class="btn secondary small" data-action="reset-filters">검색·필터 초기화</button><button class="btn ghost small" data-action="add-player">선수 추가</button></div>';
  }
  function renderDetail(){
    const p=player(ui.selectedPlayer),slot=activeSlot();
    if(!p){$('#library-detail').innerHTML='<div class="empty-state"><h3>어떤 선수가 궁금한가요?</h3><p>경기장의 선수나 선수 목록을 클릭하면<br>상세 정보를 확인할 수 있어요.</p></div>';return;}
    const located=C.allSlots(squad()).find(s=>s.playerId===p.id);
    const fit=slot&&C.POSITIONS.includes(slot.pos)?C.positionFit(p,slot.pos):null;
    const bars=C.ATTRIBUTE_GROUPS.filter(g=>g[0]!=='goalkeeping'||p.positions.includes('GK')).map(group=>{const values=group[2].map(([key])=>p.attributes[key]).filter(v=>typeof v==='number');return {name:group[1],score:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null};});
    $('#library-detail').innerHTML='<div class="detail-hero">'+avatar(p)+'<div><h3>'+esc(p.name)+'</h3><p class="detail-english">'+esc(p.englishName||p.positions.join(' / '))+'</p><span class="detail-source">'+(C.isApiPlayer(p)?'API로 가져온 선수':p.source==='demo'?'모의 선수':p.source==='custom'?'직접 입력한 선수':'파일로 가져온 선수')+'</span></div></div><div class="detail-meta"><div><span>현재 OVR</span><b class="accent">'+p.overall+'</b></div><div><span>잠재력 POT</span><b>'+(p.potential??'—')+'</b></div><div><span>나이</span><b>'+(p.age??'—')+'</b></div></div><div class="detail-row"><span>포지션</span><b>'+esc(p.positions.join(' / '))+'</b></div><div class="detail-row"><span>소속팀</span><b>'+esc(p.club||'미입력')+'</b></div><div class="detail-row"><span>국적</span><b>'+esc(p.nationality||'미입력')+'</b></div>'+(fit?'<div class="fit-panel'+(fit.kind==='other'?' warning':'')+'"><p class="eyebrow">'+esc(slot.pos)+' POSITION CHECK</p><h4>'+fit.label+'</h4><div class="fit-numbers">'+(fit.estimate??'—')+' <small>'+(fit.kind==='primary'?'현재 입력 OVR':'전환 OVR 추정')+'</small></div><p>'+(fit.kind==='primary'?'현재 주 포지션에 배치되어 있어요.':fit.estimate===null?(!C.WEIGHTS[p.positions[0]]?'원본 포지션의 가중치가 없어 전환 OVR는 비워둬요.':'세부 스탯이 부족해 전환 수치를 추정할 수 없어요.'):'FC27 DB 학습 가중치로 계산한 추정치입니다. 실제 FC 27의 전환 결과와 다를 수 있어요.')+'</p></div>':'')+'<div class="mini-bars">'+bars.map(b=>'<div class="mini-bar"><div><span>'+b.name+'</span><b>'+(b.score??'—')+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+(b.score??0)+'%"></div></div></div>').join('')+'</div><p class="muted fine-print">항목별 입력 스탯의 단순 평균입니다. 게임의 PAC·SHO 등 카드 수치와 다를 수 있어요.</p><div class="detail-actions"><button class="btn primary small" data-action="assign" data-player="'+esc(p.id)+'">'+icon('plus')+'선택한 자리에 배치</button><button class="btn secondary small" data-action="edit-player" data-player="'+esc(p.id)+'">'+icon('edit')+'수정</button></div><div class="detail-actions"><button class="btn secondary small" data-action="open-editor-player" data-player="'+esc(p.id)+'">스탯 계산기로</button>'+(located?'<button class="btn ghost small" data-action="start-move" data-slot="'+located.id+'">'+icon('move')+'자리 이동</button><button class="btn ghost small" data-action="remove-slot" data-slot="'+located.id+'">배치 해제</button>':'')+'</div>'+(located&&C.POSITIONS.includes(located.pos)?'<label class="muted fine-print" style="display:block">자리의 포지션 지정<select id="slot-position" style="width:100%;margin-top:5px" aria-label="선택한 선수 자리의 포지션">'+positionOptions(located.pos)+'</select></label>':'')+'<p class="muted fine-print">'+esc(p.notes)+'</p><button class="text-button" style="margin-top:18px" data-action="delete-player" data-player="'+esc(p.id)+'">선수 목록에서 삭제</button>';
    $('#library-detail .detail-hero').insertAdjacentHTML('afterend','<button class="btn secondary small" data-action="open-player-profile" data-player="'+esc(p.id)+'">선수 상세 페이지 '+icon('arrow')+'</button>');
    if(C.isApiPlayer(p)||p.playstyles||p.playstyle_plus){
      const styles=document.createElement('div');
      styles.innerHTML=P.badges(p,true);
      $('#library-detail .detail-meta').after(styles);
      if(ui.library==='detail'&&C.isApiPlayer(p)&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)){
        fetch('/api/players/database/'+p.id+'/playstyles',{signal:AbortSignal.timeout(3000)})
          .then(response=>response.ok?response.json():null)
          .then(data=>{if(data&&styles.isConnected)styles.innerHTML=P.badges({...p,...data},true);})
          .catch(()=>{});
      }
    }
    if(located&&C.POSITIONS.includes(located.pos)){
      $('#library-detail').insertAdjacentHTML('beforeend','<div class="role-current"><div><span>선수 역할 · '+located.pos+'</span><b>'+esc(slotRoleLabel(located)||'미지정')+'</b></div><button class="btn secondary small" data-action="player-roles" data-slot="'+located.id+'">역할 설정</button></div>');
    }
    $('#library-detail').insertAdjacentHTML('beforeend','<div class="section-heading compact"><h3>포지션별 OVR</h3><span class="model-chip">DB 학습 추정</span></div>'+positionGrid(p,slot?.pos,'position-editor')+'<p class="muted fine-print">입력 OVR를 기준으로 비교한 추정치예요. 포지션을 누르면 계산기에서 가중치와 증감 근거를 확인할 수 있어요.</p><button class="text-button" data-action="weights">포지션별 가중치 전체표 보기</button>');
  }
  function positionGrid(p,selected,action){
    const unavailable=C.WEIGHTS[p.positions[0]]?'스탯 부족':'가중치 없음';
    return '<div class="position-grid">'+C.positionComparison(p).map(item=>'<button class="position-tile'+(item.position===selected?' active':'')+(item.natural?' natural':'')+'" data-action="'+action+'" data-position="'+item.position+'" data-player="'+esc(p.id)+'" aria-label="'+esc(p.name)+' '+item.position+' OVR '+(item.estimate===null?'추정 불가':item.estimate)+', '+(item.delta===null?unavailable:signed(item.delta))+'"><span>'+item.position+(item.primary?'<i>주</i>':item.natural?'<i>보조</i>':'')+'</span><b>'+(item.estimate===null?'—':(item.source==='model'?'~':'')+item.estimate)+'</b><small class="'+(item.delta<0?'delta-down':item.delta>0?'delta-up':'')+'">'+(item.delta===null?unavailable:item.primary?'입력 OVR':signed(item.delta))+'</small></button>').join('')+'</div>';
  }
  function modelSourceHtml(pos){
    const model=C.RATING_MODEL,profile=model.profiles[pos];
    if(profile.validationMAE!==undefined){
      return '<div class="model-source"><p><b>'+pos+' 기준 · '+esc(profile.source)+'</b> · 스냅샷 '+profile.dataDate+'</p><p>표본 '+profile.sampleSize.toLocaleString('ko-KR')+'명 · '+profile.validationFolds+'겹 교차검증 MAE '+profile.validationMAE+' OVR. 주 포지션 OVR의 오차입니다.</p></div>';
    }
    return '<div class="model-source"><p><b>'+esc(model.name)+'</b> · <a href="'+esc(model.sourceUrl)+'" target="_blank" rel="noopener noreferrer">FCCareer 출처</a> · 데이터 '+model.dataDate+'</p><p>'+pos+' 표본 '+profile.sampleSize.toLocaleString('ko-KR')+'명 · 제공처 보고 MAE '+profile.reportedMAE+' OVR. 주 포지션 표본에 대한 오차이며, 포지션 전환 정확도를 보장하지 않습니다.</p><p>계수 확인 '+model.checkedDate+' · EA 공식 산식·PS5 검증값이 아닙니다.</p></div>';
  }
  function renderPositionAnalysis(draft){
    const target=$('#editor-position').value,impact=C.positionImpact(draft,target);
    $('#position-comparison').innerHTML=positionGrid(draft,target,'editor-target-position');
    $('#rating-model-info').innerHTML=modelSourceHtml(target)+(C.RATING_MODEL.profiles[impact.primary]?.validationMAE!==undefined?modelSourceHtml(impact.primary):'');
    if(impact.estimate===null){
      $('#position-impact').textContent=impact.unsupportedBaseline?
        '원본 '+impact.primary+' 포지션의 가중치가 없어요. 다른 기준으로 계산하려면 기준 포지션을 골라주세요.':
        '전환 근거를 계산하려면 '+impact.missing.map(k=>C.ATTRIBUTE_NAMES[k]).join(', ')+' 스탯이 필요해요.';
      return;
    }
    const rows=impact.rows.filter(row=>Math.abs(row.contribution)>.0005).slice(0,8);
    $('#position-impact').innerHTML='<div class="impact-heading"><b>'+impact.primary+' '+draft.overall+' → '+target+' '+impact.estimate+'</b><span class="'+(impact.delta<0?'delta-down':'delta-up')+'">'+signed(impact.delta)+' OVR 추정</span></div><p class="muted fine-print">세부 스탯 값은 그대로 두고, 포지션별 반영 비중이 바뀌는 효과를 비교합니다.</p>'+(rows.length?'<div class="table-scroll"><table class="changes-table impact-table"><thead><tr><th>스탯 (유지)</th><th>비중 전 → 후</th><th>OVR 차이 기여</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+row.name+' <b>'+row.value+'</b></td><td>'+percent(row.fromWeight)+' → '+percent(row.toWeight)+'</td><td class="'+(row.contribution<0?'delta-down':'delta-up')+'">'+signed(row.contribution)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted fine-print">주 포지션과 같은 가중치를 적용해요. 저장 OVR는 정수이므로 추정치와 반올림 차이가 날 수 있어요.</p>')+'<p class="muted fine-print">영향이 큰 '+rows.length+'개 항목만 표시합니다. 합산 전 전체 기여 '+signed(impact.rawDelta)+' OVR'+(impact.clipped?' · 1~99 상하한 적용':'')+'. 실제 비선호 포지션 페널티, 폼·사기·경기 체력 보정은 포함하지 않았습니다.</p><button class="text-button" data-action="weights">목표 포지션의 전체 가중치 보기 '+icon('arrow')+'</button>';
  }
  function openWeights(pos=$('#editor-position').value||'ST'){
    const profile=C.RATING_MODEL.profiles[pos],rows=C.ATTRIBUTES.map(([key,name])=>({key,name,weight:profile.weights[key]??0})).sort((a,b)=>b.weight-a.weight);
    const options=positionOptions(pos==='LF'?null:pos)+'<option value="LF"'+(pos==='LF'?' selected':'')+'>LF · DB 기준 포지션</option>';
    openDialog('FC27 포지션별 가중치','<p class="dialog-copy">FCCareer 공개 가중치와 FCRadar 선수 DB로 학습한 LF 기준을 확인할 수 있어요.</p><select id="weight-position" aria-label="가중치를 볼 포지션" style="width:100%">'+options+'</select>'+modelSourceHtml(pos)+'<table class="changes-table"><thead><tr><th>세부 스탯</th><th>OVR 반영 비중</th><th>스탯 +1의 영향</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+row.name+'</td><td>'+percent(row.weight)+'</td><td>+'+Number((row.weight/100).toFixed(4))+'</td></tr>').join('')+'</tbody></table><p class="muted fine-print">전체 비중은 계산 내부에서 100%로 정규화합니다. 화면의 반올림된 백분율 합계는 100%와 조금 다를 수 있어요.</p><div class="dialog-actions"><button class="btn secondary small" data-action="weights-csv">전체 가중치 CSV</button><button class="btn primary small" data-action="weights-json">출처 포함 JSON</button></div>','weights');
  }
  function renderPlayerSources() {
    const api = state.players.filter(C.isApiPlayer).length;
    $('#data-indicator').textContent = '내 선수 ' + state.players.length + '명 · API ' + api + '명';
    const saved = $('#player-api-saved');
    if (saved) saved.textContent = '내 목록에 저장한 API 선수 ' + api + '명';
  }
  function renderLibrary(){
    $('#player-total').textContent=state.players.length;
    renderPlayerSources();
    $$('.library-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.library===ui.library));
    $('#library-list').classList.toggle('hidden',ui.library!=='list');$('#library-detail').classList.toggle('hidden',ui.library!=='detail');renderPlayerList();renderDetail();
  }
  function formationOptions(includeCurrent=false){return C.FORMATIONS.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.label)+'</option>').join('');}
  function positionOptions(selected){
    const original=selected&&!C.POSITIONS.includes(selected)?'<option value="'+esc(selected)+'" selected>'+esc(selected)+' · 원본</option>':'';
    return original+C.POSITIONS.map(pos=>'<option value="'+pos+'"'+(pos===selected?' selected':'')+'>'+pos+' · '+C.POSITION_NAMES[pos]+'</option>').join('');
  }
  function renderRecommendControls(){
    $('#style-options').innerHTML=Object.entries(C.STYLES).map(([id,style],i)=>'<button class="style-option'+(ui.style===id?' active':'')+'" data-style="'+id+'" aria-pressed="'+(ui.style===id)+'"><span class="style-symbol">'+['◉','↗','⇈'][i]+'</span><div><b>'+style.name+'</b><p>'+style.description+'</p></div><i class="radio-dot"></i></button>').join('');
    $$('#focus-options button').forEach(b=>{b.classList.toggle('active',b.dataset.focus===ui.focus);b.setAttribute('aria-pressed',String(b.dataset.focus===ui.focus));});
    const locked=C.allSlots(squad()).filter(s=>s.locked&&s.playerId).length;
    $('#recommend-lock-hint').textContent=locked?locked+'명의 선수가 고정되어 있어요. '+(ui.recommendGender?'분류는 새 후보에 적용하고, 고정 선수의 자리는 유지해요.':'추천은 현재 포메이션과 고정 선수의 위치를 유지해요.'):'경기장의 자물쇠를 누르면 추천 시 그 선수와 위치를 유지해요.';
    $('#recommend-formation').value=ui.recommendFormation;$('#recommend-formation').disabled=!!locked;
    $('#recommend-gender').value=ui.recommendGender??'';$('#recommend-gender').disabled=location.protocol==='file:';
    const budget=window.CareerMarket.options(squad().career?.settings);
    $('#squad-fee-budget').value=budget.squadFeeLimit==null?'':budget.squadFeeLimit/1e6;
    $('#squad-wage-budget').value=budget.squadWageLimit==null?'':budget.squadWageLimit/1e3;
    $('#squad-budget-currency').value=budget.currency;
    $('#squad-allow-sales').checked=budget.allowSales;
    $('#squad-max-sales').value=budget.maxSales;$('#squad-sale-value').value=budget.saleValuePercent;$('#squad-reinvestment').value=budget.saleReinvestmentPercent;
  }
  function budgetMarkup(budget){
    if(!budget)return '';
    const money=value=>esc(window.CareerMarket.money(value,budget.currency));
    const limit=value=>value==null?'한도 없음':money(value);
    const metric=(label,value)=>'<div class="career-metric"><span>'+label+'</span><b>'+value+'</b></div>';
    const incoming=budget.incoming.map(row=>'<li><b>'+esc(row.name)+'</b><span>이적료 '+money(row.fee)+' · 주급 '+money(row.weeklyWage)+'</span></li>').join('');
    return '<section class="squad-budget-result" aria-label="전체 예산 영입 조합"><p class="eyebrow">SQUAD TRANSFER PLAN</p><h3>전체 예산 안의 영입 조합</h3>'+
      '<div class="career-metrics">'+metric('총 영입비 / 가용 예산',money(budget.fee)+' / '+limit(budget.availableFee??budget.feeLimit))+
      metric('선수단 주급 / 한도',money(budget.wage)+' / '+limit(budget.wageLimit))+
      metric('남은 영입 예산',budget.feeRemaining==null?'한도 없음':money(budget.feeRemaining))+
      metric('남은 주급 여력',budget.wageRemaining==null?'한도 없음':money(budget.wageRemaining))+'</div>'+
      '<p class="muted fine-print">기존 '+budget.ownedCount+'명 주급 '+money(budget.baseWage)+' 포함 · 신규 영입 '+budget.incoming.length+'명 · 비용 미확인/경로 불일치 후보 '+budget.excludedUnknown+'명 제외</p>'+
      (!budget.complete?'<p class="recommend-warning">이 예산과 배치 조건으로 선발 11명 조합을 찾지 못했어요. 아래 빈자리를 확인하고 예산·고정 배치를 조정해주세요.</p>':'')+
      (budget.salesEnabled?'<div class="squad-sale-summary"><h4>방출·매각과 예산 재편</h4><p>예상 매각 수령액 '+money(budget.saleProceeds)+' · 영입 예산 반영 '+money(budget.reinvestedProceeds)+' · 절감 주급 '+money(budget.wageSaved)+'</p><p class="muted fine-print">시세의 '+budget.saleValuePercent+'% 가정 · 수익의 '+budget.saleReinvestmentPercent+'% 재투입 · 최소 선수단 '+budget.minimumRetained+'명 유지</p>'+(budget.outgoing.length?'<p class="recommend-warning">아래 선수의 매각이 성사돼야 가능한 조합입니다. 실제 이적이나 예산 정산은 하지 않아요.</p><ul class="squad-package-list">'+budget.outgoing.map(row=>'<li><b>'+esc(row.name)+'</b><span>매각 수령 '+money(row.proceeds)+' · 주급 절감 '+money(row.weeklyWage)+'</span><span>'+esc(row.reason)+' · '+(row.source==='save'?'저장한 예상 수령액':'시세 기반 추정')+'</span></li>').join('')+'</ul>':'<p>이 조합은 매각 없이 구성할 수 있어요.</p>')+'</div>':'')+
      '<h4>사파 + 커버 동시 배치</h4>'+(budget.packages.length?'<ul class="squad-package-list">'+budget.packages.map(row=>
        '<li><b>'+esc(row.name)+' · '+row.position+' <small>'+(row.sourceOwned?'기존':'영입')+'</small></b><span>↳ '+esc(row.coverName)+' · '+row.coverPosition+' '+esc(row.coverRole)+' <small>'+(row.coverOwned?'기존':'영입')+'</small></span></li>').join('')+'</ul>':'<p class="muted">이번 조합은 선호 포지션으로 구성했어요.</p>')+
      '<details open><summary>영입 명단 · '+budget.incoming.length+'명</summary>'+(incoming?'<ul class="squad-package-list">'+incoming+'</ul>':'<p class="muted">새 영입 없이 기존 선수로 구성했어요.</p>')+'</details>'+
      (budget.alternatives.length>1?'<details><summary>다른 영입 조합 비교</summary><ul class="squad-package-list">'+budget.alternatives.slice(1).map(row=>
        '<li><b>'+esc(row.formation)+' · 선발 '+row.filled+'/11 · 적합도 '+row.score+'</b><span>이적료 '+money(row.fee)+' · 전체 주급 '+money(row.wage)+'</span><span>'+esc(row.incoming.map(player=>player.name).join(', ')||'기존 선수 활용')+(row.outgoing?.length?'<br>매각: '+esc(row.outgoing.map(player=>player.name).join(', ')):'')+'</span></li>').join('')+'</ul></details>':'')+
      '<p class="muted fine-print">'+esc(budget.note)+'</p></section>';
  }
  function renderRecommendation(){
    renderRecommendControls();const plan=ui.recommendation;if(!plan)return;
    const proposed=new Map((plan.proposal?.players??[]).map(p=>[p.id,p]));
    const find=id=>player(id)||proposed.get(id);
    const members=plan.slots.map(s=>find(s.playerId)).filter(Boolean),mean=members.length?C.round(members.reduce((a,b)=>a+b.overall,0)/members.length):'—';
    $('#recommend-output').innerHTML='<div class="recommend-result-header"><div><p class="eyebrow">YOUR '+C.STYLES[plan.style].short+' ELEVEN</p><h3>'+esc(C.FORMATION_MAP.get(plan.formation).label)+'</h3><p>'+C.STYLES[plan.style].name+' · '+({balanced:'균형 있게',youth:'유망주 중심',ready:'즉시 전력'}[plan.focus])+' · 선발 '+plan.filled+'/11</p></div><div class="result-score"><b>'+mean+'</b><span>현재 OVR 평균</span></div></div>'+(plan.filled<11?'<p class="recommend-warning">선수 또는 포지션별 후보가 부족해 '+(11-plan.filled)+'자리가 비어 있어요. 추천 조건과 포지션을 확인해주세요.</p>':'')+(plan.gender?'<p class="notice">새 후보 분류 · '+(plan.gender==='female'?'여자':'남자')+'</p>':'')+(plan.fixedShape?'<p class="notice">현재 포메이션을 유지했어요. 고정한 선수의 배치도 그대로입니다.</p>':'')+budgetMarkup(plan.budget)+'<div>'+plan.slots.map(slot=>{const p=find(slot.playerId);return '<div class="recommend-player"><span class="rec-pos">'+slot.pos+'</span>'+(p?avatar(p)+'<div class="rec-info"><b>'+esc(p.name)+'</b>'+(slot.locked?'<span class="locked-label">고정</span>':'')+'<p>'+plan.reasons[slot.id].map(esc).join('<br>')+'</p></div><b class="rec-rating">'+p.overall+'</b>':'<div class="rec-info"><b>적합한 후보가 부족해요</b><p>이 자리는 비워두었습니다.</p></div>')+'</div>';}).join('')+'</div><p class="muted fine-print">'+(plan.proposal?'전체 선수 DB와 개인 선수 목록':'개인 선수 목록')+'에서 계산한 규칙 기반 추천입니다. 실제 경기 성능을 보장하지 않으며, 후보 선수도 함께 구성합니다.</p><button class="btn primary wide" data-action="apply-recommendation">'+icon('check')+'이 구성으로 스쿼드에 적용</button>';
  }
  function renderAll(){
    if(!C.findSlot(squad(),ui.selectedSlot))ui.selectedSlot=null;
    renderBoard();renderLibrary();renderRecommendControls();
    if(!ui.recommendation)$('#recommend-output').innerHTML='<div class="empty-state large"><span class="empty-icon">'+icon('spark')+'</span><h3>생각한 축구를 그려보세요.</h3><p>스타일을 고르고 추천을 눌러주세요.<br>선수마다 선택한 이유를 함께 보여드릴게요.</p></div>';else renderRecommendation();
    renderEditorPlayerSelect();if(ui.view==='editor'&&!ui.editorDraft)loadEditorPlayer(ui.editorPlayer||state.players[0]?.id);
    renderAppliedStats();
    showStorageIssue();aiController?.refreshContext();if(ui.view==='recommend')careerController?.sync();
  }
  function setView(view){
    const changed=ui.view!==view;
    if(ui.view==='player'&&view!=='player'){
      playerProfile?.controller?.abort();playerProfile=null;
      if(profileId())history.replaceState(null,'',location.href.split('#')[0]);
    }
    const tab=view==='player'?(playerProfile?.returnView??'search'):view;
    ui.view=view;document.body.dataset.currentView=view;
    $$('.view-tab').forEach(b=>{b.classList.toggle('active',b.dataset.view===tab);if(b.dataset.view===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $$('.view-panel').forEach(panel=>panel.classList.toggle('hidden',panel.id!=='view-'+view));
    if(changed)window.scrollTo({top:0,behavior:'instant'});
    if(view==='recommend'){ui.style=squad().style;ui.focus=squad().focus;renderRecommendControls();careerController?.enter();}
    if(view==='editor'){renderEditorPlayerSelect();if(!ui.editorDraft)loadEditorPlayer(ui.editorPlayer||ui.selectedPlayer||state.players[0]?.id);}
    if(view==='ai')aiController?.refresh();
    if(view==='search')playerSearchController?.refreshDatabase();
  }
  function selectSlot(id){
    if(Date.now()<suppressClickUntil)return;
    if(ui.moveSource){const origin=C.findSlot(squad(),ui.moveSource),p=origin?.playerId;ui.moveSource=null;if(p)commit(()=>C.movePlayer(squad(),p,id),'선수 자리를 옮겼어요.');ui.selectedSlot=id;renderBoard();renderLibrary();return;}
    if(ui.pitchView==='roles'&&squad().slots.some(slot=>slot.id===id)){
      ui.selectedSlot=id;openRoleEditor(id);return;
    }
    ui.selectedSlot=id;const slot=activeSlot();if(slot?.playerId){ui.selectedPlayer=slot.playerId;ui.library='detail';}else ui.library='list';renderBoard();renderLibrary();
  }
  function assignPlayer(id,targetId){
    const p=player(id);if(!p)return;
    const target=targetId?C.findSlot(squad(),targetId):activeSlot()||squad().slots.find(s=>!s.playerId)||squad().bench.find(s=>!s.playerId);
    if(!target){toast('먼저 선수를 배치할 자리를 클릭해주세요.',true);return;}
    ui.selectedSlot=target.id;ui.selectedPlayer=id;
    if(target.playerId===id){toast('이미 이 자리에 배치되어 있어요.');return;}
    commit(()=>C.movePlayer(squad(),id,target.id),p.name+' 선수를 '+(target.pos==='SUB'?'후보':target.pos==='RES'?'예비':target.pos)+'에 배치했어요.');
  }
  function mergeCatalogPlayers(rows=[]){
    if(!rows.length)return state.players;
    if(rows.some(row=>!C.isApiPlayer(row)))throw new Error('선수 DB의 선수 ID를 확인할 수 없어요.');
    return A.mergeApiPlayers(state.players,rows).players;
  }
  function applySquadProposal(raw,rows,message){
    const current=squad(),players=mergeCatalogPlayers(rows);
    const checked=C.validateBackup({app:'touchline-fc27',version:1,players,squads:[{...raw,notes:current.notes,career:current.career}],activeSquadId:raw.id}).squads[0];
    if(checked.id!==current.id)throw new Error('현재 스쿼드와 다른 변경안이에요.');
    for(const slot of C.allSlots(current).filter(s=>s.locked&&s.playerId)){
      const next=C.findSlot(checked,slot.id);
      if(!next||next.playerId!==slot.playerId||!next.locked||next.pos!==slot.pos||next.x!==slot.x||next.y!==slot.y){
        throw new Error('고정 선수와 위치를 유지하지 못하는 변경안이에요. 다시 추천해주세요.');
      }
    }
    const dataChanged=players!==state.players;
    const ok=commit(()=>{
      state.players=players;
      state.squads[state.squads.findIndex(s=>s.id===current.id)]=checked;
    },message,{dataChanged});
    if(ok)setView('board');
    return ok;
  }
  function profileId(){
    const match=/^#player\/([^/]+)$/.exec(location.hash);
    if(!match)return null;
    try{const id=decodeURIComponent(match[1]);return id.length<=120?id:null;}catch{return null;}
  }
  function trialRole(entry,slot){
    const plan=entry?.conversion;
    if(!plan||!slot||slot.id!==entry.targetSlot||slot.pos!==plan.position)return null;
    const role=C.FC_IQ.getRole(slot.pos,plan.role);
    return role?.focuses.includes(plan.focus)?role:null;
  }
  function syncPlacementTrial(form){
    const slot=C.findSlot(squad(),form.elements.targetSlot.value),role=trialRole(playerProfile,slot);
    const preview=form.querySelector('[data-placement-trial]');
    preview.classList.toggle('hidden',!role);
    preview.textContent=role?slot.pos+' · '+role.name+' · '+C.FC_IQ.focuses[playerProfile.conversion.focus].name:'';
    form.querySelector('[data-placement-label]').textContent=role?'스쿼드에 시험 배치':'스쿼드에 배치';
  }
  function placementForm(shown){
    const current=squad(),origin=C.allSlots(current).find(slot=>slot.playerId===shown.id);
    if(origin?.locked)return '<p class="muted">현재 자리가 고정되어 있어요. 스쿼드 보드에서 고정을 해제하면 옮길 수 있어요.</p>';
    if(!C.isApiPlayer(shown)&&!profilePlayer(shown.id))return '<p class="muted">선수 목록에 추가하면 여기서 배치할 수 있어요.</p>';
    const slots=C.allSlots(current).filter(slot=>!slot.locked);
    if(!slots.length)return '<p class="muted">스쿼드에서 고정을 해제하면 선수를 배치할 수 있어요.</p>';
    const suggested=slots.find(slot=>slot.id===(playerProfile?.targetSlot||ui.selectedSlot))||
      slots.find(slot=>!slot.playerId&&shown.positions.includes(slot.pos))||
      slots.find(slot=>!slot.playerId)||slots[0];
    const options=slots.map(slot=>{
      const label=slot.pos==='SUB'?'후보 '+(current.bench.indexOf(slot)+1):slot.pos==='RES'?
        '예비 '+(current.reserves.indexOf(slot)+1):slot.pos;
      const occupant=player(slot.playerId);
      return '<option value="'+esc(slot.id)+'"'+(slot===suggested?' selected':'')+'>'+esc(label+' · '+(occupant?.name||'빈 자리'))+'</option>';
    }).join('');
    return '<form id="catalog-placement"><label>배치할 자리<select name="targetSlot" required>'+options+'</select></label>'+
      '<p class="profile-trial hidden" data-placement-trial aria-live="polite"></p>'+
      '<button class="btn primary wide" type="submit">'+icon('plus')+'<span data-placement-label>스쿼드에 배치</span></button></form>';
  }
  function renderPlayerProfile(focus=false){
    const entry=playerProfile,content=$('#player-profile-content');
    const samePlayer=content.dataset.profileId===entry.id;
    content.dataset.profileId=entry.id;
    if(!entry.row){
      content.innerHTML='<div class="panel profile-panel"><h2 id="profile-heading" tabindex="-1">선수 상세</h2><p class="muted" role="status">'+
        (entry.loading?'선수 정보를 불러오는 중이에요…':'선수 정보를 찾지 못했어요. 검색 목록에서 다시 열어주세요.')+'</p></div>';
    }else{
      const row=entry.row,saved=player(row.id);
      const shown=saved?{...saved,imageUrl:saved.imageUrl||row.imageUrl,profile:{...saved.profile,...row.profile},
        playstyles:row.playstyles??saved.playstyles,playstyle_plus:row.playstyle_plus??saved.playstyle_plus}:row;
      const previous=samePlayer&&!focus?content.querySelector('[name="targetSlot"]'):null,selected=previous?.value;
      const keepFocus=previous&&document.activeElement===previous;
      const growthObservation=squad().career?.targets.find(target=>target.player.id===row.id)?.observation;
      content.innerHTML=Profile.render(shown,{...entry,growthObservation},avatar,placementForm(shown));
      const next=content.querySelector('[name="targetSlot"]');
      if(next&&[...next.options].some(option=>option.value===selected))next.value=selected;
      if(next)syncPlacementTrial(next.form);
      if(next&&keepFocus)next.focus({preventScroll:true});
    }
    if(focus){$('#view-player').scrollIntoView({block:'start'});$('#profile-heading')?.focus({preventScroll:true});}
  }
  function openPlayerProfile(id,row,route=history.state){
    playerProfile?.controller?.abort();
    const loading=/^fcradar-fc27-[1-9]\d{0,15}$/.test(id)&&['http:','https:'].includes(location.protocol)&&
      ['127.0.0.1','localhost'].includes(location.hostname);
    const entry={id,row,loading,returnView:['board','recommend'].includes(route?.returnView)?route.returnView:'search',scroll:route?.scroll??0,
      squadId:squad().id,targetSlot:route?.targetSlot,conversion:route?.conversion};
    playerProfile=entry;setView('player');
    $('#profile-back-label').textContent=entry.returnView==='board'?'스쿼드 보드로':entry.returnView==='recommend'?'선수 추천으로':'선수 검색으로';
    renderPlayerProfile(true);
    if(!loading)return;
    entry.controller=new AbortController();
    fetch('/api/players/database/'+id+'/profile',{signal:AbortSignal.any([entry.controller.signal,AbortSignal.timeout(14000)])})
      .then(async response=>{
        if(!response.ok)throw new Error('프로필 조회를 완료하지 못했어요.');
        const data=await response.json();
        if(playerProfile!==entry)return;
        const row=C.normalizePlayer(data.player);
        if(row.id!==id)throw new Error('선수 ID가 일치하지 않아요.');
        Object.assign(entry,{row,snapshot:data.snapshot,gender:data.gender,career:data.career,loading:false});
        const focus=document.activeElement?.id==='profile-heading';
        renderPlayerProfile();
        if(focus)$('#profile-heading')?.focus({preventScroll:true});
      }).catch(()=>{
        if(playerProfile!==entry)return;
        entry.loading=false;entry.career={unavailable:true};renderPlayerProfile();
      });
  }
  function showCatalogPlayer(raw,targetSlot,conversion){
    const row=C.normalizePlayer(raw);
    const route={touchlinePlayer:row.id,returnView:['board','recommend'].includes(ui.view)?ui.view:'search',scroll:window.scrollY,
      targetSlot:typeof targetSlot==='string'?targetSlot:null,conversion};
    history.pushState(route,'','#player/'+encodeURIComponent(row.id));
    openPlayerProfile(row.id,row,route);
  }
  function leavePlayerProfile(fromHistory=false){
    if(!playerProfile)return;
    const {id,returnView,scroll}=playerProfile;
    if(!fromHistory&&history.state?.touchlinePlayer===id&&profileId()===id){history.back();return;}
    setView(returnView);
    requestAnimationFrame(()=>{
      window.scrollTo({top:scroll,behavior:'instant'});
      $$('[data-profile-return],[data-action="open-player-profile"]').find(button=>
        (button.dataset.profileReturn??button.dataset.player)===id)?.focus({preventScroll:true});
    });
  }
  function placeCatalogPlayer(form){
    const draft=playerProfile,current=squad();
    if(!draft?.row||draft.squadId!==current.id){toast('현재 스쿼드에서 다시 자리를 골라주세요.',true);return;}
    const target=C.findSlot(current,String(new FormData(form).get('targetSlot')));
    const origin=C.allSlots(current).find(slot=>slot.playerId===draft.row.id);
    if(!target||target.locked||(origin?.locked&&origin.id!==target.id)){
      toast('고정된 자리는 스쿼드에서 먼저 고정을 해제해주세요.',true);
      return;
    }
    const merge=C.isApiPlayer(draft.row);
    const role=trialRole(draft,target);
    const ok=commit(()=>{
      if(merge)state.players=mergeCatalogPlayers([draft.row]);
      else if(!player(draft.row.id)){
        if(state.players.length>=20000)throw new Error('선수는 최대 20,000명까지 저장할 수 있어요.');
        state.players.push(C.normalizePlayer(draft.row));
      }
      C.movePlayer(current,draft.row.id,target.id);
      if(role){
        C.setPlayerRole(target,role.id,draft.conversion.focus);
        ui.pitchView='roles';
      }
      ui.selectedPlayer=draft.row.id;
      ui.selectedSlot=target.id;
      ui.library='detail';
    },role?draft.row.name+' 선수를 '+target.pos+' '+role.name+'로 시험 배치했어요.':draft.row.name+' 선수를 배치했어요.',{dataChanged:true});
    if(ok){setView('board');$('#view-board').scrollIntoView({block:'start'});}
  }
  async function requestCatalogRecommendation(options,context){
    if(!['http:','https:'].includes(location.protocol)||!['localhost','127.0.0.1'].includes(location.hostname))return null;
    let status;
    try{
      const response=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(2000)});
      if(response.ok)status=await response.json();
    }catch{return null;}
    if(status?.app!=='touchline-fc27'||!status.catalogCount)return null;
    const response=await fetch('/api/squads/recommend',{method:'POST',
      headers:{'Content-Type':'application/json','X-Touchline-Token':status.token},
      body:JSON.stringify({options,context}),signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message||'선수 DB에서 스쿼드를 계산하지 못했어요.');
    return data;
  }
  function download(filename,content,type='application/json'){
    const blob=new Blob([content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function backup(){persist();download('터치라인-FC27-백업-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({...state,calculationModel:{id:C.RATING_MODEL.id,dataDate:C.RATING_MODEL.dataDate,sourceUrl:C.RATING_MODEL.sourceUrl},exportedAt:new Date().toISOString()},null,2));toast('전체 선수와 모든 스쿼드를 백업 파일로 저장했어요.');}
  function openDialog(title,body,type='generic'){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;$('#app-dialog').dataset.type=type;if(!$('#app-dialog').open)$('#app-dialog').showModal();$('#app-dialog').scrollTop=0;}
  function closeDialog(){$('#app-dialog').close();ui.pendingImport=null;ui.photoData=null;}
  function roleSlotOptions(selected){
    const slots=squad().slots;
    return slots.map((slot,index)=>{
      const repeated=slots.some(other=>other!==slot&&other.pos===slot.pos);
      const side=repeated?(slot.x<42?'왼쪽 ':slot.x>58?'오른쪽 ':'중앙 '):'';
      const label=(index+1)+'번 · '+side+slot.pos+' · '+(player(slot.playerId)?.name??'빈 자리');
      const role=slotRoleLabel(slot);
      return '<option value="'+slot.id+'"'+(slot.id===selected?' selected':'')+'>'+esc(label+(role?' · '+role:''))+'</option>';
    }).join('');
  }
  function openRoleEditor(slotId){
    const slots=squad().slots;
    const slot=slots.find(item=>item.id===(slotId||ui.selectedSlot))??slots.find(item=>item.playerId)??slots[0];
    openDialog('선수 역할과 포커스',
      '<form id="roles-form"><p class="dialog-copy">선발 자리마다 역할과 포커스를 정해요. 교체 선수는 그 자리에 설정한 역할을 맡아요.</p>'+
      '<label class="role-field">선발 자리<select id="role-slot">'+roleSlotOptions(slot.id)+'</select></label>'+
      '<div class="role-fields"><label class="role-field">역할<select id="role-select"></select></label>'+
      '<label class="role-field">포커스<select id="role-focus"></select></label></div>'+
      '<div class="role-description" id="role-description"></div>'+
      '<p class="muted fine-print"><a href="https://www.ea.com/games/ea-sports-fc/fc-27/news/fc-27-closed-beta-feedback-update" target="_blank" rel="noopener noreferrer">EA FC 27 선수 역할 안내</a></p>'+
      '<p class="role-save-status" id="role-save-status" role="status"></p>'+
      '<div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">완료</button>'+
      '<button type="submit" class="btn primary small" id="role-save">이 자리에 저장</button></div></form>','roles');
    renderRoleEditor();
  }
  function renderRoleEditor(){
    const slot=C.findSlot(squad(),$('#role-slot').value);
    $('#role-select').innerHTML='<option value="">미지정</option>'+C.FC_IQ.byPosition[slot.pos].map(role=>
      '<option value="'+role.id+'"'+(slot.role?.id===role.id?' selected':'')+'>'+esc(role.name+' · '+role.english)+'</option>').join('');
    renderRoleFocus(slot.role?.focus);
  }
  function renderRoleFocus(preferred){
    const slot=C.findSlot(squad(),$('#role-slot').value),role=C.FC_IQ.getRole(slot.pos,$('#role-select').value);
    const focus=role?.focuses.includes(preferred)?preferred:role?.focuses[0];
    $('#role-focus').disabled=!role;
    $('#role-focus').innerHTML=role?role.focuses.map(id=>{
      const option=C.FC_IQ.focuses[id];
      return '<option value="'+id+'"'+(id===focus?' selected':'')+'>'+esc(option.name+' · '+option.english)+'</option>';
    }).join(''):'<option value="">역할 선택 후 표시</option>';
    $('#role-description').innerHTML=role?'<p>'+esc(role.description)+'</p><p><b>'+esc(C.FC_IQ.focuses[focus].name)+'</b> · '+
      esc(C.FC_IQ.focuses[focus].description)+'</p>':'<p>'+slot.pos+'에서 맡길 역할을 선택해보세요.</p>';
    $('#role-save').disabled=slot.role?.id===role?.id&&slot.role?.focus===focus;
    $('#role-save-status').textContent='';
  }
  function saveRole(){
    const slot=C.findSlot(squad(),$('#role-slot').value),id=$('#role-select').value||null,focus=$('#role-focus').value||null;
    if(commit(()=>C.setPlayerRole(slot,id,focus))){
      $('#role-slot').innerHTML=roleSlotOptions(slot.id);
      renderRoleEditor();
      $('#role-save-status').textContent=slot.pos+' · '+(slotRoleLabel(slot)||'역할 미지정')+' 저장됨';
    }
  }
  function openSquads(){
    openDialog('내 스쿼드','<p class="dialog-copy">스쿼드마다 포메이션, 선수 배치, 고정 선수와 감독 노트를 따로 보관해요.</p><div class="squad-list">'+state.squads.map(s=>'<div class="saved-squad'+(s.id===state.activeSquadId?' active':'')+'"><div class="saved-squad-info"><b>'+esc(s.name)+'</b><p>'+esc(s.formation)+(s.custom?' · 자유 배치':'')+' · 선발 '+s.slots.filter(slot=>slot.playerId).length+'/11</p></div><button class="btn secondary small" data-action="load-squad" data-id="'+esc(s.id)+'">'+(s.id===state.activeSquadId?'사용 중':'열기')+'</button><button class="icon-btn" data-action="duplicate-squad" data-id="'+esc(s.id)+'" aria-label="'+esc(s.name)+' 복제">'+icon('plus')+'</button><button class="icon-btn" data-action="delete-squad" data-id="'+esc(s.id)+'" aria-label="'+esc(s.name)+' 삭제">'+icon('trash')+'</button></div>').join('')+'</div><form id="new-squad-form" class="new-squad-form"><input name="name" aria-label="새 스쿼드 이름" maxlength="50" placeholder="새 스쿼드 이름" required><button class="btn primary small" type="submit">'+icon('plus')+'빈 스쿼드 만들기</button></form><div class="dialog-actions"><button class="btn secondary small" data-action="choose-import">백업 복원</button><button class="btn primary small" data-action="backup">전체 백업 저장</button></div>','squads');
  }
  function openHelp(){
    openDialog('터치라인 사용 안내','<div class="help-list"><div><h3>1. 스쿼드 보드</h3><ol><li>빈 자리를 클릭한 뒤 선수의 + 버튼을 누르세요. 선수 목록에서 경기장으로 드래그해도 됩니다.</li><li>선수를 다른 선수 위에 놓으면 자리를 서로 바꿔요. 빈 경기장으로 드래그하면 자유 배치와 위치별 포지션을 조정해요.</li><li>세부 포지션은 선수 정보의 ‘자리의 포지션 지정’에서 바꿀 수 있어요. ‘기본 배치’로 프리셋 위치를 복원해요.</li><li>선수의 자물쇠는 추천 시 고정하는 기능입니다. 수동 이동과 포메이션 변경은 직접 할 수 있어요.</li><li>마우스 없이 이동하려면 선수 정보의 ‘자리 이동’을 누른 뒤 이동할 자리를 클릭하거나 Tab·Enter로 선택하세요.</li></ol></div><div><h3>2. 스타일 추천과 스탯 계산</h3><p>스타일 추천은 내 선수 목록 안에서 세부 스탯·포지션·OVR·POT·나이를 비교하는 로컬 규칙 기반 기능입니다. 고정 선수가 있으면 현재 포메이션과 위치를 유지합니다. 스탯 계산기는 FC27 DB 학습 가중치 모델이며 EA의 공식 산식이 아닙니다. 변경안은 게임 에디터에 직접 입력할 때 참고하는 용도입니다. AI 축구 상담에서는 대화로 같은 기능을 호출하고 변경안을 확인할 수 있어요. .env에 OpenAI 키를 저장하고 시작.cmd로 열면 사용할 수 있습니다.</p></div><div><h3>3. 저장과 백업</h3><p>같은 브라우저의 같은 주소에서 자동 저장됩니다. HTML 직접 실행과 시작.cmd의 로컬 주소는 저장 공간이 다르므로 이동할 때 백업·복원해주세요. 브라우저 데이터 삭제, 시크릿 창, 파일 위치 변경이나 저장 용량 제한에 영향을 받을 수 있으니 ‘백업 저장’으로 전체 데이터를 보관하세요. JSON 백업에는 선수, 업로드 사진, 모든 스쿼드와 감독 노트가 포함됩니다. 외부 사진 주소는 주소만 저장하므로 표시할 때 인터넷이 필요합니다. Ctrl+Z / Ctrl+Shift+Z로 최근 변경을 되돌릴 수 있어요.</p></div><div><h3>4. 선수 데이터와 사진</h3><p>선수 검색에서 필요한 선수를 찾아 내 목록에 추가하세요. 직접 입력하거나 JSON·CSV를 가져올 수도 있어요. API 키를 HTML이나 백업 파일에 넣지 마세요. 이미지 주소(imageUrl·photoUrl·portraitUrl)와 PC에서 업로드한 사진을 표시할 수 있습니다.</p></div><div><h3>5. FC 27 포메이션 출처와 범위</h3><p>프리셋 29종과 번호 표기는 <a href="https://www.fifacm.com/squad-builder" target="_blank" rel="noopener noreferrer">FIFACM FC 27 커리어 빌더</a>의 공개 목록을 참고했습니다. 명칭은 <a href="https://www.fut.gg/tactics/" target="_blank" rel="noopener noreferrer">FUT.GG 포메이션 목록</a>도 대조했습니다. 확인일: 2026-11-08. 경기장 좌표와 한국어 설명은 이 도구를 위한 배치입니다. 실제 PS5 게임 화면과 모든 좌표를 대조한 것은 아닙니다.</p></div><div><h3>6. PS5 커리어 모드</h3><p>게임 세이브를 읽거나 실제 스탯을 자동 변경하지 않습니다. 커리어에서 성장한 능력치, 생성 선수, 소속팀과 포지션은 직접 수정해서 관리할 수 있어요. 실제 게임의 포지션별 OVR·훈련 결과는 게임 안에서 확인해주세요.</p></div></div>','help');
  }
  function openData(){
    const api = state.players.filter(C.isApiPlayer).length;
    openDialog('나의 선수 데이터','<p class="dialog-copy">개인용 데이터를 직접 관리하세요. 가져온 선수는 ID가 같으면 갱신하고, 새로운 ID면 추가합니다.</p><div class="data-stats"><div><b>'+state.players.length+'</b><span>전체 선수</span></div><div><b>'+api+'</b><span>API 선수</span></div><div><b>'+state.squads.length+'</b><span>저장된 스쿼드</span></div></div><div class="data-buttons"><button class="btn primary small" data-action="choose-import">'+icon('upload')+'JSON / CSV 가져오기</button><button class="btn secondary small" data-action="add-player">'+icon('plus')+'선수 직접 입력</button><button class="btn secondary small" data-action="template">예제 JSON 받기</button><button class="btn ghost small" data-action="csv-template">CSV 양식 받기</button></div><div class="data-instructions"><h3>파일에 들어갈 내용</h3><p>필수: <code>name</code>, <code>positions</code>, <code>overall</code><br>선택: <code>id</code>, <code>englishName</code>, <code>age</code>, <code>potential</code>, <code>club</code>, <code>nationality</code>, <code>imageUrl</code>, <code>attributes</code><br>주 포지션은 positions의 첫 번째 값입니다. 빈 스탯은 미입력으로 보관합니다. 상세 스탯 키는 예제 JSON에서 확인할 수 있어요.</p><pre class="code-example">'+esc(JSON.stringify({players:[{id:'my-player-1',name:'직접 입력한 선수',positions:['CM','CAM'],overall:80,potential:90,age:21,imageUrl:'',attributes:{shortPassing:85,vision:82,ballControl:84}}]},null,2))+'</pre><h3>선수 사진과 FCRadar</h3><p>선수 수정에서 사진 파일을 올리거나 HTTPS 이미지 주소를 넣을 수 있어요. <code>photoUrl</code>, <code>portraitUrl</code>도 imageUrl로 읽어옵니다. 승인된 FCRadar 이미지 CDN 주소를 설정하면 사진이 제공되는 선수도 같은 카드에서 볼 수 있어요. 선수 검색 탭에서 전체 DB를 보고 스쿼드에 배치할 수 있습니다. 승인된 키는 서버의 .env에 설정하세요. OpenAI 대화는 시작.cmd로 실행한 로컬 서버에서만 호출하며, 키는 .env에 저장합니다. 선수 사진·감독 노트는 AI에 보내지 않습니다.</p><h3>백업 복원</h3><p>이 도구에서 받은 전체 백업 JSON도 같은 버튼으로 가져오세요. 복원 확인 화면에서 전체 선수·스쿼드를 바꾸기 전에 내용을 확인할 수 있어요. 파일은 최대 15MB까지 지원합니다.</p></div>','data');
  }
  function attributeInputs(attributes,prefix){return C.ATTRIBUTE_GROUPS.map((group,index)=>'<details class="attribute-group"'+(index===0||index===2?' open':'')+'><summary>'+group[1]+'<span>'+group[2].filter(([key])=>typeof attributes[key]==='number').length+' / '+group[2].length+'</span></summary><div class="attribute-input-grid">'+group[2].map(([key,label])=>'<label>'+label+'<input type="number" min="1" max="99" step="1" data-attribute="'+key+'" name="'+prefix+key+'" value="'+(attributes[key]??'')+'" placeholder="미입력" aria-label="'+esc((prefix==='edit_'?'선수 수정 ':'현재 스탯 ')+label)+'"></label>').join('')+'</div></details>').join('');}
  function openPlayerForm(id){
    const p=player(id);ui.photoData=p?.imageUrl||'';
    openDialog(p?'선수 정보 수정':'내 선수 직접 추가','<form id="player-form" data-id="'+esc(p?.id||'')+'"><div class="photo-edit"><span id="photo-preview">'+avatar(p)+'</span><div class="photo-actions"><label for="photo-url">사진 이미지 주소 (선택)</label><input id="photo-url" name="imageUrl" type="url" placeholder="https://…" value="'+esc(p?.imageUrl?.startsWith('https:')?p.imageUrl:'')+'"><div class="photo-actions-row"><input id="photo-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="선수 사진 업로드"><button type="button" class="text-button" data-action="clear-photo">사진 지우기</button><span>PNG·JPG·WebP, 최대 10MB · 작게 저장</span></div></div></div><div class="form-grid"><label>이름 *<input name="name" maxlength="80" required value="'+esc(p?.name||'')+'" placeholder="선수 이름"></label><label>영문 이름<input name="englishName" maxlength="100" value="'+esc(p?.englishName||'')+'" placeholder="English name"></label><label>현재 OVR *<input name="overall" type="number" min="1" max="99" step="1" required value="'+(p?.overall??75)+'"></label><label>잠재력 POT<input name="potential" type="number" min="1" max="99" step="1" value="'+(p?.potential??'')+'" placeholder="미입력 가능"></label><label>나이<input name="age" type="number" min="14" max="65" step="1" value="'+(p?.age??'')+'" placeholder="미입력 가능"></label><label>주 포지션 *<select name="primary">'+positionOptions(p?.positions[0]||'CM')+'</select></label><div class="full"><label>보조 포지션</label><div class="position-checkboxes">'+C.POSITIONS.map(pos=>'<label class="position-check"><input type="checkbox" name="secondary" value="'+pos+'"'+(p?.positions.slice(1).includes(pos)?' checked':'')+'>'+pos+'</label>').join('')+'</div></div><label>소속팀<input name="club" maxlength="100" value="'+esc(p?.club||'')+'"></label><label>국적<input name="nationality" maxlength="60" value="'+esc(p?.nationality||'')+'"></label><label class="full">선수 메모<textarea name="notes" maxlength="1000" rows="2">'+esc(p?.notes||'')+'</textarea></label><label class="position-check full"><input type="checkbox" name="demo"'+(p?.source==='demo'?' checked':'')+'>가상 선수입니다 (예시 데이터 표시)</label></div><div class="section-heading compact"><h3>세부 스탯 (선택)</h3><span class="muted" style="font-size:9px">추천·포지션 추정·스탯 계산에 사용</span></div><p class="muted fine-print">입력하지 않은 스탯은 빈 값으로 보관해요. 정확히 아는 값만 입력하세요.</p>'+attributeInputs(p?.attributes||{},'edit_')+'<p id="player-form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">취소</button><button type="submit" class="btn primary small">'+icon('check')+'선수 저장</button></div></form>','player');
  }
  function confirmAction(title,copy,action,id){openDialog(title,'<p class="dialog-copy">'+esc(copy)+'</p><p class="muted fine-print">변경 후 ‘실행 취소’로 되돌릴 수 있어요.</p><div class="dialog-actions"><button class="btn secondary small" data-action="close-dialog">취소</button><button class="btn danger small" data-action="'+action+'" data-id="'+esc(id||'')+'">확인</button></div>','confirm');}
  async function readImport(file){
    if(!file)return;if(file.size>15*1024*1024){toast('파일은 15MB 이하로 가져와주세요.',true);return;}
    try {
      const text=await file.text(),result=/\.csv$/i.test(file.name)?A.fromCSV(text):A.fromJSON(text);ui.pendingImport=result;
      let summary;
      if(result.kind==='backup')summary='<b>전체 백업 복원</b><br>선수 '+result.state.players.length+'명 · 스쿼드 '+result.state.squads.length+'개<br>현재 선수·사진·스쿼드를 이 백업으로 교체합니다.';
      else {const updates=result.players.filter(p=>playerMap.has(p.id)).length;summary='<b>선수 '+result.players.length+'명 가져오기</b><br>새 선수 '+(result.players.length-updates)+'명 · 기존 선수 갱신 '+updates+'명<br>기존 스쿼드와 다른 선수들은 유지됩니다.';}
      openDialog('가져올 내용 확인','<p class="dialog-copy">파일: '+esc(file.name)+'</p><div class="import-summary">'+summary+'</div><p class="muted fine-print">사진 주소는 허용되는 형식만 가져옵니다. 잘못된 형식이 있으면 전체 가져오기를 취소합니다.</p><div class="dialog-actions"><button class="btn secondary small" data-action="close-dialog">취소</button><button class="btn primary small" data-action="confirm-import">'+(result.kind==='backup'?'이 백업으로 전체 복원':'선수 데이터 가져오기')+'</button></div>','import');
    }catch(error){toast(error.message,true);}
    finally{$('#data-file').value='';}
  }
  function renderEditorPlayerSelect(){
    const value=ui.editorPlayer;
    $('#editor-player').innerHTML=state.players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+p.positions[0]+' · '+p.overall+'</option>').join('')||'<option value="">선수를 먼저 추가해주세요</option>';
    if(value&&player(value))$('#editor-player').value=value;
  }
  function loadEditorPlayer(id){
    const p=player(id);
    ui.plans=[];ui.planIndex=0;ui.statPreferences={archetype:"custom",constraints:[]};
    $("#editor-archetype").value="custom";renderStatConstraints();
    if(!p){ui.editorPlayer=null;ui.editorDraft=null;$('#editor-attributes').innerHTML='';$('#position-preview').innerHTML='먼저 선수 데이터를 추가해주세요.';$('#editor-output').innerHTML=editorEmpty('계산할 선수를 먼저 추가해주세요.');return;}
    ui.editorPlayer=id;ui.editorDraft=clone(p);renderAppliedStats();$('#editor-player').value=id;$('#editor-primary').innerHTML=positionOptions(p.positions[0]);$('#editor-overall').value=p.overall;
    const located=activeSlot(),target=p.statEdit?.targetPosition??(located?.playerId===id&&C.POSITIONS.includes(located.pos)?located.pos:
      p.positions.find(pos=>C.POSITIONS.includes(pos))||'CM');
    $('#editor-position').value=target;$('#editor-target').value=p.statEdit?.targetOverall??Math.min(99,Math.round((C.estimateOverall(p,target)??p.overall)+3));
    $('#editor-attributes').innerHTML=attributeInputs(p.attributes,'current_');
    $('#editor-output').innerHTML=editorEmpty();updateEditorPreview();
  }
  function editorEmpty(message='선수와 목표를 고른 뒤 계산을 눌러주세요.'){return '<div class="empty-state large"><span class="empty-icon">'+icon('sliders')+'</span><h3>성장의 방향을 찾아보세요.</h3><p>'+esc(message)+'<br>변경안은 게임에 자동 적용되지 않습니다.</p></div>';}
  function replaceEditedPlayer(next){
    state.players=state.players.map(row=>row.id===next.id?next:row);
    for(const team of state.squads)for(const target of team.career?.targets??[])if(target.player.id===next.id)target.player=clone(next);
  }
  async function applyEditorPlan(){
    const calc=ui.calculation,plan=ui.plans[ui.planIndex];if(!calc||!plan)return;
    try{
      const next=C.applyStatPlan(player(calc.player.id),{source:calc.source,draft:calc.player,position:calc.targetPosition,
        targetOverall:plan.target,style:calc.style,preferences:plan.preferences,planId:plan.id});
      if(commit(()=>replaceEditedPlayer(next),'변경안을 내 선수에 적용했어요.',{dataChanged:true}))await recalculateEditedPlayer(next.id,calc.targetPosition);
    }catch(error){toast(error.message,true);}
  }
  function renderAppliedStats(){
    const panel=$('#editor-applied');if(!panel)return;
    const p=player(ui.editorPlayer),entry=ui.statImpact?.id===p?.id?ui.statImpact:null,edit=p?.statEdit;
    panel.classList.toggle('hidden',!edit&&!entry);if(!edit&&!entry){panel.innerHTML='';return;}
    const position=entry?.position??edit.targetPosition,plan=entry?.support?.find(row=>row.position===position),support=plan?.support;
    const rows=support?[...support.current.map(row=>({name:row.player.name,detail:row.position+' · '+row.role.name+' · '+(row.sufficient?'커버 가능':'보강 필요')+' · '+row.placement})),
      ...support.recruits.map(row=>({name:row.player.name,detail:'영입 후보 · '+row.position+' · '+row.report.role.name}))]:[];
    panel.innerHTML='<h3>'+esc(p.name)+' · '+(edit?'스탯 적용됨':'원래 스탯으로 복원됨')+'</h3><p>분석 포지션 '+position+' · 현재 추정 OVR <b>'+C.estimateOverall(p,position)+'</b>'+(edit?' · 적용 전 '+C.estimateOverall({...p,...edit.original,statEdit:undefined},position):'')+'</p>'+
      '<p class="muted">내 선수에 자동 저장했어요. 원래 선호 포지션 '+esc(p.positions.join(' / '))+' · POT '+(p.potential??'미확인')+' · 현재 예산·매각 설정으로 다시 비교합니다.</p>'+
      (entry?.loading?'<p role="status">바뀐 스탯으로 사파 적합도, 커버 선수와 매각·영입 조합을 다시 계산하고 있어요…</p>':'')+
      (plan?'<p><b>사파 적합도 '+C.round(plan.score)+'</b> · '+esc(window.CareerRanking.CONVERSION_LEVELS[plan.level])+' · '+esc(plan.role.name)+'</p>':'')+
      (rows.length?'<h4>커버 선수 비교</h4><ul class="squad-package-list">'+rows.map(row=>'<li><b>'+esc(row.name)+'</b><span>'+esc(row.detail)+'</span></li>').join('')+'</ul>':'')+
      (support?.message?'<p class="muted">'+esc(support.message)+'</p>':'')+
      (entry?.proposal?'<h4>변경된 스탯으로 계산한 영입 조합</h4>'+budgetMarkup(entry.proposal.plan.budget)+'<p>선발 '+entry.proposal.plan.filled+'/11 · '+position+'에 '+esc(p.name)+' 배치</p><button class="btn primary wide" data-action="view-stat-recommendation">전체 조합과 배치 보기</button>':'')+
      (entry?.errors??[]).map(message=>'<p class="recommend-warning">'+esc(message)+'</p>').join('')+
      '<button class="btn secondary wide" data-action="recalculate-stat-plan"'+(entry?.loading?' disabled':'')+'>현재 조건으로 다시 계산</button>'+
      (edit?'<button class="btn ghost wide" data-action="restore-stat-plan">적용 전 스탯으로 복원</button>':'');
  }
  async function requestEditedSupport(id,position,context,targets){
    const settings={...context.recommendation.settings,position,scope:'squad',role:'',roleFocus:''};
    const status=await fetch('/api/status',{signal:AbortSignal.timeout(5000)}).then(response=>response.json());
    const response=await fetch('/api/career/support',{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':status.token},
      body:JSON.stringify({playerId:id,settings,context,targets}),signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'커버 선수 계산을 완료하지 못했어요.');return data.plans;
  }
  async function recalculateEditedPlayer(id,position){
    const context=aiContext(),fingerprint=JSON.stringify(context);
    const controls=()=>JSON.stringify([ui.style,ui.focus,ui.recommendFormation,ui.recommendGender]);
    const originalControls=controls();
    const entry={id,position,loading:true,errors:[]};ui.statImpact=entry;renderAppliedStats();$('#editor-applied').scrollIntoView({block:'start',behavior:'smooth'});
    const options={style:squad().style,focus:squad().focus,formation:'current',gender:ui.recommendGender,maxAge:null,minOverall:null,minPotential:null,
      excludedPlayerIds:[],fixedPlayerIds:[],anchorPlayerId:id,anchorPosition:position};
    const results=await Promise.allSettled([requestEditedSupport(id,position,context,clone(squad().career?.targets??[])),requestCatalogRecommendation(options,context)]);
    if(ui.statImpact!==entry)return;
    entry.loading=false;
    if(fingerprint!==JSON.stringify(aiContext())||originalControls!==controls()){entry.errors.push('선수나 예산 조건이 바뀌었어요. 현재 조건으로 다시 계산해주세요.');renderAppliedStats();return;}
    if(results[0].status==='fulfilled')entry.support=results[0].value;else entry.errors.push('커버 비교: '+results[0].reason.message);
    if(results[1].status==='fulfilled'&&results[1].value){entry.proposal=results[1].value;ui.recommendation={...entry.proposal.plan,proposal:entry.proposal,gender:options.gender};}
    else entry.errors.push('영입 조합: '+(results[1].reason?.message||'로컬 선수 DB 연결을 확인하고 다시 계산해주세요.'));
    renderAppliedStats();renderRecommendation();
  }
  function readEditorDraft(){
    const p=player(ui.editorPlayer);if(!p)throw new Error('먼저 계산할 선수를 골라주세요.');
    const attributes={};
    for(const input of $$('#editor-attributes input[data-attribute]')){if(!input.validity.valid)throw new Error(C.ATTRIBUTE_NAMES[input.dataset.attribute]+'은 1~99의 정수로 입력해주세요.');if(input.value!=='')attributes[input.dataset.attribute]=Number(input.value);}
    const primary=$('#editor-primary').value;
    return C.normalizePlayer({...p,statEdit:primary===p.positions[0]&&Number($('#editor-overall').value)===p.overall?p.statEdit:undefined,overall:$('#editor-overall').value,positions:[primary,...p.positions.filter(pos=>pos!==primary)],attributes});
  }
  function renderStatConstraints(){
    const {preferences,bounds}=C.statBounds(ui.statPreferences);
    const rows=Object.entries(bounds);
    $('#editor-stat-constraints').innerHTML=rows.length?'<div><b>'+esc(C.STAT_PRESETS[preferences.archetype].name)+'</b><p>'+rows.map(([key,rule])=>esc(C.ATTRIBUTE_NAMES[key])+' '+rule.min+'–'+rule.max).join(' · ')+'</p><small>유형의 기본 기준과 AI가 전달한 구체적 조건입니다. 이 범위를 유지하며 계산해요.</small><button class="text-button" data-action="clear-stat-constraints">변경 조건 지우기</button></div>':'<p>AI 상담에서 원하는 장단점과 세부 스탯 범위를 말하면 조건을 함께 가져올 수 있어요.</p>';
  }
  function updateEditorPreview(){
    try{
      const draft=readEditorDraft(),target=$('#editor-position').value,estimate=C.estimateOverall(draft,target),missing=estimate===null;
      $('#position-preview').innerHTML='<div><span>'+draft.positions[0]+' → '+target+'</span><p class="muted">'+(missing?(!C.WEIGHTS[draft.positions[0]]?'원본 포지션의 가중치가 없어요.':'계산에 필요한 세부 스탯이 부족해요.'):'현재 입력 스탯으로 본 포지션 전환 OVR 추정')+'</p></div><b>'+(estimate??'—')+'</b>';
      renderPositionAnalysis(draft);
    }catch(error){$('#position-preview').innerHTML='<span>'+esc(error.message)+'</span>';$('#position-comparison').innerHTML='';$('#position-impact').innerHTML='';}
    const weights=C.WEIGHTS[$('#editor-position').value];
    $('#formula-weights').innerHTML='<div class="weight-list">'+Object.entries(weights||{}).map(([key,value])=>'<span>'+C.ATTRIBUTE_NAMES[key]+' '+value+'%</span>').join('')+'</div>';
  }
  function invalidateEditor(){ui.plans=[];$('#editor-output').innerHTML=editorEmpty('입력이 바뀌었어요. 변경안을 다시 계산해주세요.');updateEditorPreview();}
  function calculate(){
    try{
      const draft=readEditorDraft(),target=Number($('#editor-target').value);
      if(!$('#editor-target').value||!Number.isInteger(target))throw new Error('목표 OVR는 1~99의 정수로 입력해주세요.');
      ui.plans=C.editorPlans(draft,$('#editor-position').value,target,$('#editor-style').value,ui.statPreferences);ui.planIndex=0;ui.calculation={source:clone(player(draft.id)),player:draft,targetPosition:$('#editor-position').value,style:$('#editor-style').value};renderEditorOutput();
    }catch(error){ui.plans=[];$('#editor-output').innerHTML='<div class="calculation-error" role="alert">'+esc(error.message)+'</div>';}
  }
  function renderEditorOutput(){
    const plan=ui.plans[ui.planIndex];if(!plan)return;
    const calc=ui.calculation;
    $('#editor-output').innerHTML='<div class="editor-result-title"><h3>'+esc(calc.player.name)+' · '+calc.targetPosition+'</h3><span>DB 학습 모델 추정</span></div><div class="editor-result-summary"><div><span>변경 전 '+calc.targetPosition+' 추정</span><b>'+plan.before+'</b></div>'+icon('arrow')+'<div><span>변경 후 '+calc.targetPosition+' 추정</span><b class="after">'+plan.after+'</b></div></div><div class="plan-options">'+ui.plans.map((p,i)=>'<button class="plan-option'+(i===ui.planIndex?' active':'')+'" data-action="select-plan" data-index="'+i+'" aria-pressed="'+(i===ui.planIndex)+'"><b>'+p.name+'</b><span>'+p.changes.length+'개 스탯 · 총 '+p.totalChange+' 조정</span></button>').join('')+'</div><p class="plan-description">'+esc(plan.description)+' · 목표 OVR '+plan.target+'</p>'+'<p class="notice">현재 조건의 도달 가능 OVR 범위 · '+plan.reachableRange.join('–')+'</p>'+(!plan.reached?'<p class="recommend-warning">원하는 장단점과 스탯 범위를 지키면 목표에 도달할 수 없어요. 조건을 유지한 변경안을 표시합니다.</p>':'')+(plan.blockers?.length&&!plan.reached?'<p class="muted fine-print">상한의 영향: '+plan.blockers.slice(0,4).map(row=>esc(row.name)+' '+row.max+' 이하'+(row.requiredCap!=null?' · 이 상한만 '+row.requiredCap+'까지 완화하면 목표 가능':'')).join(' / ')+'</p>':'')+(plan.relaxation&&!plan.reached?'<p class="notice">별도 완화 예시: '+plan.relaxation.constraints.map(row=>esc(row.name)+' 상한 '+row.max).join(' · ')+'이면 목표 OVR에 도달 가능한 범위가 됩니다. 아래 표는 원래 조건을 유지해요.</p>':'')+(plan.changes.length?'<table class="changes-table"><thead><tr><th>변경할 스탯</th><th>현재</th><th>변경 후</th><th>조정</th></tr></thead><tbody>'+plan.changes.map(c=>'<tr><td>'+c.name+'</td><td>'+c.before+'</td><td>'+c.after+'</td><td class="'+(c.delta>0?'delta-up':'delta-down')+'">'+(c.delta>0?'+':'')+c.delta+'</td></tr>').join('')+'</tbody></table>':'<div class="notice">입력한 목표에 이미 도달해 있어요. 조정할 스탯이 없습니다.</div>')+'<p class="muted fine-print">표에 없는 스탯은 현재 입력값을 유지합니다. 높은 목표에는 큰 변경이 필요할 수 있어요. ‘총 조정’은 변경한 각 스탯의 절댓값 합계이며, 게임 내 성장 비용이 아닙니다.</p><button class="btn primary wide" data-action="apply-stat-plan">내 선수에 적용하고 추천 다시 계산</button><p class="muted fine-print">원래 선호 포지션은 유지하고 스탯과 주 포지션의 추정 OVR를 저장해요. 목표 미달이면 실제 계산된 수치를 적용합니다. 기존 POT·가격·주급은 유지해요.</p><button class="btn secondary wide" data-action="download-plan">'+icon('download')+'이 변경안 JSON 저장</button><p class="muted fine-print">적용 버튼은 앱의 내 선수에 반영합니다. 실제 게임 세이브와 연동되지 않으며, 언제든 적용 전 스탯으로 복원할 수 있어요.</p>';
  }
  async function uploadPhoto(file){
    if(!file)return;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG, JPG, WebP 사진을 선택해주세요.');
      if(file.size>10*1024*1024)throw new Error('사진은 10MB 이하로 올려주세요.');
      const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,256/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      ui.photoData=canvas.toDataURL('image/webp',.86);$('#photo-url').value='';$('#photo-preview').innerHTML=avatar({name:'선수 사진',imageUrl:ui.photoData});$('#player-form-error').textContent='';
    }catch(error){$('#player-form-error').textContent=error.message;}
  }
  function savePlayerForm(form){
    try{
      if(!form.reportValidity())return;
      const data=new FormData(form),attributes={};for(const [key] of C.ATTRIBUTES){const value=data.get('edit_'+key);if(value!==null&&value!=='')attributes[key]=Number(value);}
      const url=String(data.get('imageUrl')||'').trim();if(url&&!C.safeImageUrl(url))throw new Error('사진 주소는 HTTPS 이미지 주소를 사용해주세요.');
      const primary=String(data.get('primary')),positions=[primary,...data.getAll('secondary').filter(pos=>pos!==primary)];
      const p=C.normalizePlayer({...player(form.dataset.id),id:form.dataset.id||C.uid('custom'),name:data.get('name'),englishName:data.get('englishName'),overall:data.get('overall'),potential:data.get('potential'),age:data.get('age'),positions,club:data.get('club'),nationality:data.get('nationality'),notes:data.get('notes'),attributes,imageUrl:url||ui.photoData||'',source:data.has('demo')?'demo':'custom'});
      const success=commit(()=>{const index=state.players.findIndex(item=>item.id===p.id);if(index>=0)state.players[index]=p;else{if(state.players.length>=20000)throw new Error('선수는 최대 20,000명까지 저장할 수 있어요.');state.players.push(p);}ui.selectedPlayer=p.id;ui.library='detail';},p.name+' 선수 정보를 저장했어요.',{dataChanged:true});
      if(success)closeDialog();
    }catch(error){$('#player-form-error').textContent=error.message;}
  }
  function chooseImport(){$('#data-file').click();}
  function resetFilters(){ui.query='';ui.position='';ui.sort='overall';ui.maxAge='';ui.minOvr='';ui.minPot='';ui.limit=100;$('#player-search').value='';$('#position-filter').value='';$('#sort-filter').value='overall';$('#age-filter').value='';$('#ovr-filter').value='';$('#pot-filter').value='';renderPlayerList();}
  async function act(action,element){
    const id=element.dataset.player||element.dataset.id,slotId=element.dataset.slot;
    switch(action){
      case 'help':openHelp();break;
      case 'data':openData();break;
      case 'backup':backup();break;
      case 'recovery':if(recoveryRaw)download('터치라인-이전저장원본.txt',recoveryRaw,'text/plain');break;
      case 'squads':openSquads();break;
      case 'player-roles':openRoleEditor(slotId);break;
      case 'close-dialog':closeDialog();break;
      case 'undo':travelHistory();break;
      case 'redo':travelHistory(true);break;
      case 'reset-positions':commit(()=>C.changeFormation(squad(),squad().formation,state.players),'기본 포메이션 배치로 돌아왔어요.');break;
      case 'clear-squad':confirmAction('스쿼드를 비울까요?','현재 스쿼드의 선발·후보·예비 배치와 고정을 해제합니다. 선수 목록은 유지합니다.','confirm-clear');break;
      case 'confirm-clear':commit(()=>{C.allSlots(squad()).forEach(s=>{s.playerId=null;s.locked=false;});},'스쿼드를 비웠어요.');closeDialog();break;
      case 'lock':{const slot=C.findSlot(squad(),slotId);if(slot?.playerId)commit(()=>{slot.locked=!slot.locked;},slot.locked?'추천 시 고정을 해제했어요.':'추천 시 이 선수와 위치를 유지해요.');break;}
      case 'add-player':openPlayerForm();break;
      case 'edit-player':openPlayerForm(id);break;
      case 'player-detail':ui.selectedPlayer=id;ui.library='detail';renderLibrary();break;
      case 'open-player-profile':if(player(id))showCatalogPlayer(player(id));break;
      case 'leave-player-profile':leavePlayerProfile();break;
      case 'assign':assignPlayer(id);break;
      case 'more-players':ui.limit+=100;renderPlayerList();break;
      case 'reset-filters':resetFilters();break;
      case 'open-editor-player':ui.editorPlayer=id;setView('editor');loadEditorPlayer(id);window.scrollTo({top:0,behavior:'auto'});break;
      case 'position-editor':ui.editorPlayer=id;setView('editor');loadEditorPlayer(id);$('#editor-position').value=element.dataset.position;invalidateEditor();window.scrollTo({top:0,behavior:'auto'});break;
      case 'editor-target-position':$('#editor-position').value=element.dataset.position;invalidateEditor();break;
      case 'weights':{const pos=ui.view==='editor'?$('#editor-position').value:activeSlot()?.pos||player(ui.selectedPlayer)?.positions[0]||'ST';openWeights(C.WEIGHTS[pos]?pos:'ST');break;}
      case 'weights-json':download('FC27-포지션가중치.json',JSON.stringify(C.RATING_MODEL,null,2));break;
      case 'weights-csv':{
        const model=C.RATING_MODEL,positions=Object.keys(model.profiles),lf=model.profiles.LF;
        const header=['attribute','label',...positions,'source','dataDate','officialFormula','LF_source','LF_dataDate','LF_validationMAE'];
        const rows=C.ATTRIBUTES.map(([key,name])=>[key,name,...positions.map(pos=>model.profiles[pos].weights[key]??0),model.sourceUrl,model.dataDate,'false',lf.source,lf.dataDate,lf.validationMAE].join(','));
        download('FC27-포지션가중치.csv','\uFEFF'+[header.join(','),...rows].join('\r\n'),'text/csv');break;
      }
      case 'start-move':ui.moveSource=slotId;ui.library='list';renderLibrary();toast('이동할 자리를 클릭해주세요.');break;
      case 'remove-slot':commit(()=>{const slot=C.findSlot(squad(),slotId);if(slot){slot.playerId=null;slot.locked=false;}},'선수 배치를 해제했어요.');break;
      case 'delete-player':{const p=player(id);if(p)confirmAction('선수를 목록에서 삭제할까요?',p.name+' 선수를 선수 목록과 모든 스쿼드의 배치에서 제거합니다.','confirm-delete-player',id);break;}
      case 'confirm-delete-player':commit(()=>{state.players=state.players.filter(p=>p.id!==id);state.squads.forEach(s=>C.allSlots(s).forEach(slot=>{if(slot.playerId===id){slot.playerId=null;slot.locked=false;}}));},'선수를 목록에서 삭제했어요.',{dataChanged:true});closeDialog();break;
      case 'load-squad':if(state.squads.some(s=>s.id===id)){state.activeSquadId=id;ui.selectedSlot=null;ui.selectedPlayer=null;ui.recommendation=null;persist();renderAll();closeDialog();toast('스쿼드를 불러왔어요.');}break;
      case 'duplicate-squad':if(commit(()=>{if(state.squads.length>=100)throw new Error('스쿼드는 최대 100개까지 저장할 수 있어요.');const original=state.squads.find(s=>s.id===id);if(!original)throw new Error('복제할 스쿼드가 없어요.');const copy=clone(original);copy.id=C.uid('squad');copy.name=(copy.name+' 복사').slice(0,50);state.squads.push(copy);state.activeSquadId=copy.id;},'스쿼드를 복제했어요.'))openSquads();break;
      case 'delete-squad':if(state.squads.length===1){toast('스쿼드는 최소 한 개가 필요해요.',true);break;}confirmAction('스쿼드를 삭제할까요?',(state.squads.find(s=>s.id===id)?.name||'선택한 스쿼드')+'의 배치와 노트를 삭제합니다. 선수 목록은 유지됩니다.','confirm-delete-squad',id);break;
      case 'confirm-delete-squad':commit(()=>{state.squads=state.squads.filter(s=>s.id!==id);if(state.activeSquadId===id)state.activeSquadId=state.squads[0].id;},'스쿼드를 삭제했어요.');openSquads();break;
      case 'choose-import':chooseImport();break;
      case 'confirm-import':{const data=ui.pendingImport;if(!data)break;const success=commit(()=>{if(data.kind==='backup')state=C.withoutSeedPlayers(clone(data.state));else{const map=new Map(state.players.map(p=>[p.id,p]));data.players.forEach(p=>map.set(p.id,p));if(map.size>20000)throw new Error('선수는 최대 20,000명까지 저장할 수 있어요.');state.players=[...map.values()];}ui.selectedSlot=null;ui.selectedPlayer=null;},data.kind==='backup'?'전체 백업을 복원했어요.':'선수 데이터를 가져왔어요.',{dataChanged:true});if(success){recoveryRaw='';persist();closeDialog();}break;}
      case 'template':download('터치라인-가상선수-JSON-예제.json',JSON.stringify({game:'FC27',description:'모든 내용이 가상인 입력 양식입니다. 실제 선수 데이터로 바꿔 사용하세요.',players:C.demoPlayers().slice(0,2).map((p,i)=>({...p,id:'sample-'+(i+1)}))},null,2));break;
      case 'csv-template':download('터치라인-가상선수-CSV-양식.csv','\uFEFFid,name,englishName,positions,overall,potential,age,club,nationality,imageUrl,source\r\nsample-csv-1,가상 예시 선수,Demo Player,CM/CAM,80,90,21,예시 구단,대한민국,,demo\r\n','text/csv');break;
      case 'clear-photo':ui.photoData='';$('#photo-url').value='';$('#photo-file').value='';$('#photo-preview').innerHTML=avatar(null);break;
      case 'recommend':{
        if(!['squad-fee-budget','squad-wage-budget','squad-max-sales','squad-sale-value','squad-reinvestment'].every(id=>$('#'+id).reportValidity()))break;
        const button=$('#recommend-button');button.disabled=true;button.innerHTML=icon('spark')+'조합을 비교하고 있어요…';
        try{
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const options={style:ui.style,focus:ui.focus,formation:ui.recommendFormation,gender:ui.recommendGender,maxAge:null,minOverall:null,minPotential:null,excludedPlayerIds:[],fixedPlayerIds:[]};
          const context=aiContext();
          const proposal=await requestCatalogRecommendation(options,context);
          if(options.style!==ui.style||options.focus!==ui.focus||options.formation!==ui.recommendFormation||options.gender!==ui.recommendGender||
             JSON.stringify(context)!==JSON.stringify(aiContext()))throw new Error('스쿼드나 추천 조건이 바뀌었어요. 다시 추천해주세요.');
          if(proposal)ui.recommendation={...proposal.plan,proposal,gender:options.gender};
          else {
            if(context.recommendation?.settings.squadFeeLimit!=null||context.recommendation?.settings.squadWageLimit!=null||context.recommendation?.settings.allowSales)throw new Error('전체 예산 조합 추천은 시작.cmd로 연 로컬 서버에서 사용할 수 있어요.');
            if(options.gender)throw new Error('남자·여자 조건은 시작.cmd로 연 선수 DB에서 사용할 수 있어요.');
            if(!state.players.length)throw new Error('선수 검색에서 DB를 적재하거나 내 선수를 추가해주세요.');
            ui.recommendation=C.recommend(state.players,squad(),ui.style,ui.focus,ui.recommendFormation);
          }
          renderRecommendation();
        }
        catch(error){toast(error.message,true);}finally{button.disabled=false;button.innerHTML=icon('spark')+'나에게 맞는 스쿼드 추천';}break;
      }
      case 'apply-recommendation':{
        const plan=ui.recommendation;if(!plan)break;
        const raw=plan.proposal?.squad??{...squad(),...plan};
        try{applySquadProposal(raw,plan.proposal?.players,'추천 구성을 스쿼드에 적용했어요.');}
        catch(error){toast(error.message,true);}break;
      }
      case 'apply-stat-plan':await applyEditorPlan();break;
      case 'restore-stat-plan':{const p=player(ui.editorPlayer);if(!p?.statEdit)break;const position=p.statEdit.targetPosition;if(commit(()=>replaceEditedPlayer(C.restoreStatPlan(p)),'적용 전 스탯을 복원했어요.',{dataChanged:true}))await recalculateEditedPlayer(p.id,position);break;}
      case 'recalculate-stat-plan':{const p=player(ui.editorPlayer);if(p)await recalculateEditedPlayer(p.id,p.statEdit?.targetPosition??ui.statImpact?.position??$('#editor-position').value);break;}
      case 'view-stat-recommendation':setView('recommend');$('#recommend-output').scrollIntoView({block:'start'});break;
      case 'reset-editor':loadEditorPlayer(ui.editorPlayer);break;
      case 'clear-stat-constraints':ui.statPreferences={archetype:'custom',constraints:[]};$('#editor-archetype').value='custom';renderStatConstraints();invalidateEditor();break;
      case 'calculate':calculate();break;
      case 'select-plan':ui.planIndex=Number(element.dataset.index);renderEditorOutput();break;
      case 'download-plan':{const plan=ui.plans[ui.planIndex],calc=ui.calculation;if(plan&&calc)download('터치라인-'+calc.player.name+'-스탯변경안.json',JSON.stringify({app:'touchline-fc27-editor-plan',version:1,ratingModel:{id:C.RATING_MODEL.id,dataDate:C.RATING_MODEL.dataDate,sourceUrl:C.RATING_MODEL.sourceUrl,baselineWeights:C.WEIGHTS[calc.player.positions[0]],targetWeights:C.WEIGHTS[calc.targetPosition]},warning:'EA 공식 계산식이 아닌 FC27 DB 학습 가중치 모델의 계획용 추정치입니다. 실제 게임 수치와 다를 수 있습니다.',player:{id:calc.player.id,name:calc.player.name,primaryPosition:calc.player.positions[0],inputOverall:calc.player.overall},targetPosition:calc.targetPosition,targetOverall:plan.target,plan:plan.name,estimatedBefore:plan.before,estimatedAfter:plan.after,reached:plan.reached,preferences:plan.preferences,constraints:plan.constraints,reachableRange:plan.reachableRange,changes:plan.changes,beforeAttributes:calc.player.attributes,afterAttributes:plan.attributes},null,2));break;}
    }
  }
  document.addEventListener('click',event=>{
    if(Date.now()<suppressClickUntil){event.preventDefault();return;}
    const target=event.target.closest('[data-action],[data-view],[data-library],[data-style],[data-focus],[data-slot-id],[data-pitch-view]');if(!target)return;
    if(target.dataset.action){event.preventDefault();act(target.dataset.action,target);}
    else if(target.dataset.view)setView(target.dataset.view);
    else if(target.dataset.pitchView){ui.pitchView=target.dataset.pitchView;renderBoard();}
    else if(target.dataset.library){ui.library=target.dataset.library;renderLibrary();}
    else if(target.dataset.style){ui.style=target.dataset.style;ui.recommendation=null;renderAll();}
    else if(target.dataset.focus){ui.focus=target.dataset.focus;ui.recommendation=null;renderAll();}
    else if(target.dataset.slotId)selectSlot(target.dataset.slotId);
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='player-form'){event.preventDefault();savePlayerForm(event.target);}
    if(event.target.id==='catalog-placement'){event.preventDefault();placeCatalogPlayer(event.target);}
    if(event.target.id==='roles-form'){event.preventDefault();saveRole();}
    if(event.target.id==='new-squad-form'){
      event.preventDefault();const name=String(new FormData(event.target).get('name')||'').trim();if(!name)return;
      if(commit(()=>{if(state.squads.length>=100)throw new Error('스쿼드는 최대 100개까지 저장할 수 있어요.');const next=C.newSquad(name);state.squads.push(next);state.activeSquadId=next.id;ui.selectedSlot=null;},'새 스쿼드를 만들었어요.'))closeDialog();
    }
  });
  $('#squad-name').addEventListener('input',event=>{squad().name=event.target.value.trim().slice(0,50)||'이름 없는 스쿼드';queueSave();});
  $('#squad-notes').addEventListener('input',event=>{squad().notes=event.target.value.slice(0,5000);queueSave();});
  $('#formation-select').addEventListener('change',event=>{const id=event.target.value;ui.selectedSlot=null;commit(()=>C.changeFormation(squad(),id,state.players),'포메이션을 바꾸고 선수들을 배치했어요.');});
  const filters={'player-search':'query','position-filter':'position','sort-filter':'sort','age-filter':'maxAge','ovr-filter':'minOvr','pot-filter':'minPot'};
  for(const [id,key] of Object.entries(filters))$('#'+id).addEventListener(['position-filter','sort-filter'].includes(id)?'change':'input',event=>{ui[key]=event.target.value.trim();ui.limit=100;renderPlayerList();});
  $('#recommend-formation').innerHTML+='<optgroup label="직접 포메이션 지정">'+formationOptions()+'</optgroup>';
  $('#recommend-formation').addEventListener('change',event=>{ui.recommendFormation=event.target.value;ui.recommendation=null;renderAll();});
  $('#recommend-gender').addEventListener('change',event=>{ui.recommendGender=event.target.value||null;ui.recommendation=null;renderAll();});
  for(const id of ['squad-fee-budget','squad-wage-budget','squad-budget-currency','squad-allow-sales','squad-max-sales','squad-sale-value','squad-reinvestment'])$('#'+id).addEventListener('change',()=>{
    const fee=$('#squad-fee-budget'),wage=$('#squad-wage-budget');
    if(!fee.reportValidity()||!wage.reportValidity()||!['squad-max-sales','squad-sale-value','squad-reinvestment'].every(id=>$('#'+id).reportValidity()))return;
    const settings={...squad().career?.settings,currency:$('#squad-budget-currency').value,
      allowSales:$('#squad-allow-sales').checked,maxSales:Number($('#squad-max-sales').value),
      saleValuePercent:Number($('#squad-sale-value').value),saleReinvestmentPercent:Number($('#squad-reinvestment').value),
      squadFeeLimit:fee.value===''?null:Math.round(Number(fee.value)*1e6),
      squadWageLimit:wage.value===''?null:Math.round(Number(wage.value)*1e3)};
    commit(()=>{squad().career=window.CareerMarket.workspace({...squad().career,settings},C.normalizePlayer);},'전체 스쿼드 예산을 저장했어요.');
  });
  $('#data-file').addEventListener('change',event=>readImport(event.target.files[0]));
  $('#editor-player').addEventListener('change',event=>loadEditorPlayer(event.target.value));
  $('#editor-archetype').addEventListener('change',event=>{ui.statPreferences={archetype:event.target.value,constraints:[]};renderStatConstraints();invalidateEditor();});
  document.addEventListener('input',event=>{
    if(event.target.closest('#editor-attributes')||['editor-overall','editor-target'].includes(event.target.id))invalidateEditor();
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('#catalog-placement select'))syncPlacementTrial(event.target.form);
    if(['editor-primary','editor-position','editor-style'].includes(event.target.id))invalidateEditor();
    if(event.target.id==='role-slot')renderRoleEditor();
    if(event.target.id==='role-select')renderRoleFocus();
    if(event.target.id==='role-focus')renderRoleFocus(event.target.value);
    if(event.target.id==='slot-position'){
      const located=C.allSlots(squad()).find(s=>s.playerId===ui.selectedPlayer),pos=event.target.value;
      if(located&&C.POSITIONS.includes(pos))commit(()=>{C.setSlotPosition(located,pos);squad().custom=true;},'자리의 포지션을 '+pos+'로 지정했어요.');
    }
    if(event.target.id==='photo-file')uploadPhoto(event.target.files[0]);
    if(event.target.id==='weight-position')openWeights(event.target.value);
    if(event.target.id==='photo-url'){const value=C.safeImageUrl(event.target.value.trim());if(event.target.value.trim()&&!value){$('#player-form-error').textContent='사진 주소는 HTTPS 이미지 주소를 사용해주세요.';return;}ui.photoData=value;$('#photo-preview').innerHTML=avatar({name:'선수 사진',imageUrl:value});$('#player-form-error').textContent='';}
  });
  document.addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.hidden=true;},true);
  $('#app-dialog').addEventListener('close',()=>{ui.pendingImport=null;ui.photoData=null;});
  document.addEventListener('keydown',event=>{
    const editable=event.target.matches('input,textarea,select,[contenteditable="true"]');
    const menu=views[Number(event.key)-1];
    if(menu&&/^[1-5]$/.test(event.key)&&!editable&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.isComposing&&!$('#app-dialog').open&&!drag){
      const button=$('.view-tab[data-view="'+menu+'"]');
      if(button){event.preventDefault();setView(menu);button.focus({preventScroll:true});}
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!editable&&!$('#app-dialog').open){event.preventDefault();travelHistory(event.shiftKey);}
    if(event.key==='Escape'){
      if(drag)cancelDrag();
      if(ui.moveSource){ui.moveSource=null;renderPlayerList();toast('자리 이동을 취소했어요.');}
    }
    if((event.key==='Enter'||event.key===' ')&&!editable){const target=event.target;if(target.matches('.pitch-slot,.bench-slot')){event.preventDefault();selectSlot(target.dataset.slotId);}else if(target.matches('.player-row')){event.preventDefault();ui.selectedPlayer=target.dataset.player;ui.library='detail';renderLibrary();}}
  });
  function cancelDrag(){
    if(!drag)return;
    try{if(drag.element.hasPointerCapture(drag.pointerId))drag.element.releasePointerCapture(drag.pointerId);}catch{}
    $$('.dragging,.drop-target').forEach(el=>el.classList.remove('dragging','drop-target'));$('#drag-ghost').classList.add('hidden');document.body.classList.remove('dragging-active');drag=null;
  }
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button,input,select,textarea,a,summary')||$('#app-dialog').open)return;
    if(ui.view==='board'&&ui.pitchView==='roles')return;
    const element=event.target.closest('[data-slot-id],[data-drag-player]');if(!element)return;
    const sourceSlot=element.dataset.slotId?C.findSlot(squad(),element.dataset.slotId):null;
    const playerId=sourceSlot?.playerId||element.dataset.dragPlayer;
    if(!playerId)return;
    drag={element,playerId,slotId:sourceSlot?.id||null,fromPitch:!!element.closest('#pitch'),startX:event.clientX,startY:event.clientY,pointerId:event.pointerId,active:false};
    try{element.setPointerCapture(event.pointerId);}catch{}
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6)return;
    if(!drag.active){drag.active=true;drag.element.classList.add('dragging');document.body.classList.add('dragging-active');$('#drag-ghost').innerHTML=cardHtml({id:'drag',pos:player(drag.playerId).positions[0],playerId:drag.playerId,locked:false});$('#drag-ghost').classList.remove('hidden');}
    event.preventDefault();$('#drag-ghost').style.left=event.clientX+'px';$('#drag-ghost').style.top=event.clientY+'px';
    $$('.drop-target').forEach(el=>el.classList.remove('drop-target'));
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot-id]');if(target&&target!==drag.element)target.classList.add('drop-target');
    if(event.clientY>window.innerHeight-45)window.scrollBy(0,12);else if(event.clientY<65)window.scrollBy(0,-12);
  },{passive:false});
  document.addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    const moving={...drag},target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot-id]');
    if(!moving.active){cancelDrag();return;}
    suppressClickUntil=Date.now()+250;cancelDrag();
    if(target&&target.dataset.slotId!==moving.slotId){ui.selectedSlot=target.dataset.slotId;ui.selectedPlayer=moving.playerId;commit(()=>C.movePlayer(squad(),moving.playerId,target.dataset.slotId),'선수 자리를 옮겼어요.');return;}
    const rect=$('#pitch').getBoundingClientRect();
    if(event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom){
      const x=(event.clientX-rect.left)/rect.width*100,y=(event.clientY-rect.top)/rect.height*100;
      if(moving.fromPitch&&moving.slotId){ui.selectedSlot=moving.slotId;commit(()=>C.moveToPoint(squad(),moving.slotId,x,y),'자유 배치를 조정했어요.');}
      else{
        const empty=squad().slots.filter(s=>!s.playerId).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
        if(empty){ui.selectedSlot=empty.id;commit(()=>{C.movePlayer(squad(),moving.playerId,empty.id);C.moveToPoint(squad(),empty.id,x,y);},'경기장에 선수를 배치했어요.');}
        else toast('경기장 위 선수에게 놓으면 서로 교체할 수 있어요.',true);
      }
    }
  });
  document.addEventListener('pointercancel',cancelDrag);
  window.addEventListener('popstate',()=>{
    const id=profileId();
    if(id)openPlayerProfile(id,playerProfile?.id===id?playerProfile.row:profilePlayer(id));
    else leavePlayerProfile(true);
  });
  window.addEventListener('beforeunload',()=>{clearTimeout(saveTimer);try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
  $('#formation-select').innerHTML=formationOptions();
  $('#position-filter').innerHTML+='<optgroup label="포지션">'+C.POSITIONS.map(pos=>'<option value="'+pos+'">'+pos+' · '+C.POSITION_NAMES[pos]+'</option>').join('')+'</optgroup>';
  $('#editor-output').insertAdjacentHTML('afterend','<section id="editor-applied" class="panel stat-applied hidden" aria-label="적용된 스탯과 재계산 결과" aria-live="polite"></section>');
  $('#editor-archetype').innerHTML=Object.entries(C.STAT_PRESETS).map(([value,preset])=>'<option value="'+value+'">'+esc(preset.name)+'</option>').join('');
  $('#editor-primary').innerHTML=positionOptions('CM');$('#editor-position').innerHTML=positionOptions('CM');
  $('#position-preview').insertAdjacentHTML('afterend','<section class="position-analysis"><div class="section-heading compact"><h3>12포지션 OVR 비교</h3><span class="model-chip">DB 학습 추정</span></div><p class="muted fine-print">입력 OVR를 기준으로 세부 스탯을 고정해 비교합니다. 포지션을 누르면 목표 포지션으로 선택돼요.</p><div id="position-comparison"></div><details class="position-analysis-details" open><summary>왜 OVR가 달라질까?</summary><div id="position-impact"></div></details><div id="rating-model-info"></div></section>');
  $('.feature-tag.amber').textContent=C.RATING_MODEL.name;
  $('.estimate-disclaimer p').innerHTML='<b>포지션별 기준 OVR를 비교하는 추정치입니다.</b> FCCareer의 FC27 DB 학습 계수를 적용했습니다. 세부 스탯은 포지션 변경만으로 수정하지 않습니다. 실제 비선호 포지션 페널티와 Dynamic OVR(폼·사기·경기 체력), PS5 세이브는 계산에 포함하지 않습니다. <a href="'+C.RATING_MODEL.officialSourceUrl+'" target="_blank" rel="noopener noreferrer">EA FC27 공식 설명</a>';
  P.mountTooltips(document);
  renderAll();
  if(window.AIChat)aiController=window.AIChat.mount({
    getContext:aiContext,
    notify:toast,
    applySquad:(raw,rows)=>applySquadProposal(raw,rows,'AI 대화에서 계산한 변경안을 적용했어요.'),
    openEditor:payload=>{
      if(!C.POSITIONS.includes(payload.position))throw new Error('포지션 정보를 확인해주세요.');
      if(!player(payload.playerId)){
        const rows=payload.players?.filter(row=>row.id===payload.playerId);
        if(!rows?.length)throw new Error('선수 정보를 확인해주세요.');
        const merged=mergeCatalogPlayers(rows);
        if(!commit(()=>{state.players=merged;},'DB 선수의 계산기를 열었어요.',{dataChanged:true}))return;
      }
      ui.editorPlayer=payload.playerId;setView('editor');loadEditorPlayer(payload.playerId);$('#editor-position').value=payload.position;$('#editor-target').value=payload.targetOverall;$('#editor-style').value=payload.style;ui.statPreferences=C.statPreferences(payload.statPreferences);$('#editor-archetype').value=ui.statPreferences.archetype;renderStatConstraints();invalidateEditor();if(payload.calculate)calculate();window.scrollTo({top:0,behavior:'auto'});
    }
  });
  if(window.PlayerSearch)playerSearchController=window.PlayerSearch.mount({notify:toast,avatar,showCatalogPlayer,importPlayers:rows=>{
    const merged = A.mergeApiPlayers(state.players, rows);
    if (!merged.added && !merged.photos && !merged.names && !merged.traits && !merged.growthProfiles) {
      toast('선택한 선수는 이미 선수 목록에 있어요.');
      return true;
    }
    const message = [
      merged.added ? merged.added + '명 추가' : '',
      merged.photos ? merged.photos + '명 사진 채움' : '',
      merged.names ? merged.names + '명 한글명 반영' : '',
      merged.traits ? merged.traits + '명 플레이스타일 반영' : '',
      merged.growthProfiles ? merged.growthProfiles + '명 성장 유형 반영' : '',
      merged.skipped ? '기존 ' + merged.skipped + '명 유지' : '',
    ].filter(Boolean).join(' · ');
    return commit(() => { state.players = merged.players; }, message, { dataChanged: true });
  }});
  if(window.CareerUI)careerController=window.CareerUI.mount({
    getSquad:squad,getPlayers:()=>state.players,notify:toast,avatar,openDialog,closeDialog,openProfile:showCatalogPlayer,
    save:(career,message)=>commit(()=>{squad().career=career;},message),
  });
  views.forEach((view,index)=>{
    const button=$('.view-tab[data-view="'+view+'"]');
    if(!button)return;
    const key=String(index+1);
    button.setAttribute('aria-keyshortcuts',key);
    button.insertAdjacentHTML('beforeend','<span class="nav-key" aria-hidden="true">'+key+'</span>');
    $('.view-nav').append(button);
  });
  $('.offline-indicator').textContent='내 PC에 저장';
  renderPlayerSources();
  if (removedExamples) persist();
  if(!storageIssue){$('#save-status').textContent='브라우저 자동 저장 · JSON 백업 권장';}
  const linkedPlayer=profileId();
  if(linkedPlayer)openPlayerProfile(linkedPlayer,profilePlayer(linkedPlayer));
})();
