(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AIChat=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const labels={get_current_squad:'현재 스쿼드 확인',list_formations:'포메이션 확인',search_players:'선수 검색',scout_players:'성장·역할 기준 추천',get_player_details:'선수 정보 확인',recommend_squad:'스쿼드 추천',analyze_position:'포지션 분석',calculate_stat_plan:'스탯 변경안 계산',propose_player_move:'선수 이동안 준비',list_player_roles:'FC IQ 역할 확인',propose_player_roles:'선수 역할 변경안 준비'};
  function renderMessageText(content,citations=[]){
    const formatted=escape(content).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    if(!citations.length)return formatted;
    const links=citations.map((source,index)=>{
      let url;
      try{url=new URL(source.url);}catch{return '';}
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
      const title=escape(source.title||url.hostname);
      return '<a href="'+escape(url.href)+'" target="_blank" rel="noopener noreferrer" title="'+title+
        '" aria-label="출처 '+(index+1)+' · '+title+'">['+(index+1)+']</a>';
    });
    const used=new Set();
    const text=formatted.replace(/\[(\d{1,2})\]/g,(marker,number)=>{
      const index=Number(number)-1;
      if(!links[index])return marker;
      used.add(index);
      return links[index];
    });
    const remaining=links.filter((link,index)=>link&&!used.has(index));
    return remaining.length?text+'\n\n출처 '+remaining.join(' '):text;
  }
  async function digest(context){const bytes=new TextEncoder().encode(JSON.stringify(context));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function readEvents(body,onEvent){
    const reader=body.getReader(),decoder=new TextDecoder();let pending='';
    try{while(true){const {value,done}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i).trim();pending=pending.slice(i+1);if(line)onEvent(JSON.parse(line));}if(done){if(pending.trim())onEvent(JSON.parse(pending));break;}}}finally{reader.releaseLock();}
  }
  function mount(bridge){
    const $=selector=>document.querySelector(selector);
    let status=null,busy=false,controller=null,sessionId=null,messages=[],refreshing=null,requestSequence=0;
    $('.view-nav').insertAdjacentHTML('beforeend','<button class="view-tab" data-view="ai"><svg><use href="#i-spark"/></svg>AI 축구 상담</button>');
    $('.site-footer').insertAdjacentHTML('beforebegin','<section id="view-ai" class="view-panel hidden" aria-label="AI 축구 상담"><div class="feature-title"><div><p class="eyebrow">COACH / FOOTBALL ADVICE</p><h2>AI 축구 상담</h2><p>전 세계 실축부터 EA FC, 풋볼 매니저, eFootball까지 물어보세요.</p></div><span id="ai-connection" class="feature-tag">연결 확인 중</span></div><div class="ai-layout"><section class="panel ai-conversation"><div class="ai-chat-toolbar"><div><span class="ai-status-dot"></span><b>터치라인 코치</b><span id="ai-model-label">로컬 서버 확인</span></div><button class="btn ghost small" id="ai-new-chat" type="button">새 대화</button></div><div id="ai-setup" class="ai-setup hidden"></div><div id="ai-messages" class="ai-messages" role="log" aria-label="AI 대화 내용" aria-live="polite"></div><div id="ai-progress" class="ai-progress hidden" role="status"></div><form id="ai-form" class="ai-compose"><label for="ai-message" class="field-eyebrow">나의 축구 질문</label><textarea id="ai-message" rows="3" maxlength="3000" placeholder="예: 이강인을 CM에 고정하고, 4-2-3-1로 점유율 팀을 짜줘." aria-label="AI에게 보낼 메시지"></textarea><div class="ai-compose-footer"><span>Enter 전송 · Shift+Enter 줄바꿈</span><div><button id="ai-cancel" type="button" class="btn ghost small hidden">취소</button><button id="ai-send" type="submit" class="btn primary small">보내기 <svg><use href="#i-arrow"/></svg></button></div></div></form><p class="ai-data-note">질문과 최근 대화를 OpenAI로 보내 맥락을 확인해요. 최신 정보는 공개 웹 자료를 찾아 출처와 함께 표시해요.</p></section><aside class="ai-side"><section class="panel"><p class="eyebrow">CURRENT CONTEXT</p><h3>지금 함께 보는 스쿼드</h3><div id="ai-context-summary"></div><button class="btn secondary small wide" id="ai-refresh" type="button">연결 확인</button></section><section class="panel ai-capabilities"><p class="eyebrow">WHAT WE CAN DO</p><h3>대화로 할 수 있는 일</h3><div><b>스쿼드와 선수 역할</b><p>선발 추천과 FC IQ 역할·포커스 변경안</p></div><div><b>실축 경기·전술·규칙</b><p>국내외 리그와 대회, 경기 결과와 일정, 전술과 축구 역사</p></div><div><b>선수 검색과 스탯 계획</b><p>플레이스타일·나이·포지션으로 선수 검색, 추정 OVR와 변경안 확인</p></div><div><b>축구 게임 상담</b><p>커리어, 영입과 육성, 게임별 전술·패치·조작</p></div><p class="muted fine-print">실제 계산은 스쿼드 빌더의 기능으로 수행합니다. 변경안의 적용 버튼을 눌러 스쿼드에 반영하세요.</p></section></aside></div></section>');
    function refreshContext(){
      try{const c=bridge.getContext(),s=c.squad,locked=[...s.slots,...s.bench,...s.reserves].filter(slot=>slot.locked&&slot.playerId).length;$('#ai-context-summary').innerHTML='<strong class="ai-context-name">'+escape(s.name)+'</strong><div class="ai-context-row"><span>포메이션</span><b>'+escape(s.formation)+(s.custom?' · 자유 배치':'')+'</b></div><div class="ai-context-row"><span>선수 목록</span><b>'+c.players.length+'명</b></div><div class="ai-context-row"><span>전체 선수 DB</span><b>'+(status?.catalogCount??0).toLocaleString('ko-KR')+'명</b></div><div class="ai-context-row"><span>추천 고정</span><b>'+locked+'명</b></div><div class="ai-context-row"><span>API 선수</span><b>'+c.players.filter(window.SquadCore.isApiPlayer).length+'명</b></div>';}
      catch{$('#ai-context-summary').textContent='스쿼드 데이터를 확인해주세요.';}
    }
    function welcome(){const c=bridge.getContext(),first=c.players.find(p=>p.positions.includes('ST'))||c.players[0],examples=['스토크로 시작해. 첫 시즌 선발과 현실적인 영입 후보를 추천해줘.','왼쪽 센터백에 볼플레잉 수비수, 포커스는 빌드업으로 잡아줘.','오늘 K리그1 경기 일정이랑 중계 알려줘.','FM에서 볼 위닝 미드필더와 앵커는 어떻게 달라?','이강인을 LF에서 중미로 쓰면 오버롤이 얼마야?',first?'현재 포메이션에서 '+first.name+'을 CM에 배치하면 어때?':'4-2-3-1과 4-3-3의 장단점을 비교해줘'];return '<div class="ai-welcome"><span class="empty-icon"><svg><use href="#i-spark"/></svg></span><h3>당신의 축구에, 한 명의 코치.</h3><p>실제 경기, 전술과 규칙, 축구 게임 전반을 물어보세요.<br>FC27 선수와 스쿼드 계산에는 앱의 선수 DB를 사용해요.</p><div class="ai-examples">'+examples.map(text=>'<button type="button" data-ai-example="'+escape(text)+'">'+escape(text)+' <svg><use href="#i-arrow"/></svg></button>').join('')+'</div></div>';}
    function render({ toLatest = false } = {}){
      const log=$('#ai-messages');
      const scrollTop=log.scrollTop;
      const followLatest=toLatest||log.scrollHeight-log.clientHeight-scrollTop<=24;
      if(!messages.length)log.innerHTML=welcome();
      else log.innerHTML=messages.map((m,index)=>'<article class="ai-message '+m.role+(m.error?' ai-error':'')+'"><div class="ai-message-author">'+(m.role==='user'?'나':m.mode==='local'?'앱 안내':'터치라인 코치')+(m.mode==='mock'?'<span class="ai-test-label">연결 테스트 · 실제 AI 아님</span>':'')+'</div><div class="ai-message-text">'+(m.role==='user'?escape(m.content||''):renderMessageText(m.content||'',m.citations))+'</div>'+(m.trace?.length?'<details class="ai-trace"><summary>실행한 기능 '+m.trace.length+'개</summary>'+m.trace.map(t=>'<div class="'+(t.ok?'':'muted')+'">'+(t.ok?'✓ ':'· ')+escape(t.label)+'</div>').join('')+'</details>':'')+(m.artifacts?.length?'<div class="ai-artifacts">'+m.artifacts.map((a,i)=>'<div class="ai-artifact"><div><b>'+escape(a.title)+'</b><span>'+(a.type==='squad'?'스쿼드 변경안':'포지션·스탯 계산 결과')+'</span></div><button type="button" class="btn '+(a.applied?'secondary':'primary')+' small" data-ai-artifact="'+index+':'+i+'"'+(a.applied?' disabled':'')+'>'+(a.applied?'적용됨':a.type==='squad'?'스쿼드에 적용':'계산기에서 보기')+'</button></div>').join('')+'</div>':'')+(m.usage&&m.mode!=='mock'?'<p class="ai-usage">'+escape(m.modelUsed)+' · 이번 요청 '+m.usage.totalTokens.toLocaleString('ko-KR')+' 토큰</p>':'')+'</article>').join('');
      log.scrollTop=followLatest?log.scrollHeight:scrollTop;
      $('#ai-send').disabled=busy||!status?.keyConfigured;$('#ai-new-chat').disabled=busy;$('#ai-refresh').disabled=busy;$('#ai-cancel').classList.toggle('hidden',!busy);$('#ai-progress').classList.toggle('hidden',!busy);
    }
    function setProgress(text){$('#ai-progress').textContent=text;}
    async function refresh(){
      refreshContext();if(refreshing)return refreshing;
      refreshing=Promise.resolve().then(async()=>{
        try{
          if(!['http:','https:'].includes(location.protocol)||!['127.0.0.1','localhost'].includes(location.hostname))throw new Error('OFFLINE');
          const response=await fetch('/api/status',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('NO_SERVER');
          const data=await response.json();if(data.app!=='touchline-fc27')throw new Error('WRONG_SERVER');if(data.chatScope!=='football')throw new Error('RESTART_SERVER');
          const changed=status?.token&&status.token!==data.token;if(changed)sessionId=null;status=data;refreshContext();
          $('#ai-model-label').textContent=data.mode==='mock'?'연결 흐름 테스트':data.model+' / '+data.effort;
          $('#ai-connection').textContent=data.mode==='mock'?'테스트 모드 · LLM 미사용':data.keyConfigured?'OpenAI 연결 준비':'API 키 설정 필요';
          $('#ai-setup').classList.toggle('hidden',data.keyConfigured&&data.mode!=='mock');
          $('#ai-setup').textContent=data.mode==='mock'?'현재는 연결 흐름을 확인하는 테스트 모드입니다. 실제 LLM·API 호출은 하지 않습니다.':data.configurationError||'.env 파일의 OPENAI_API_KEY= 뒤에 키를 직접 저장한 다음 ‘연결 확인’을 눌러주세요. 서버를 다시 켤 필요는 없어요.';
        }catch(error){
          status=null;$('#ai-connection').textContent='시작 파일로 열어주세요';$('#ai-model-label').textContent='AI 연결 대기';$('#ai-setup').classList.remove('hidden');$('#ai-setup').textContent=error.message==='RESTART_SERVER'?'종료.cmd를 실행한 뒤 시작.cmd로 다시 열어주세요.':'AI 대화는 프로젝트 폴더의 시작.cmd를 더블클릭해서 사용해주세요. HTML을 직접 연 경우에도 기존 스쿼드 기능은 사용할 수 있어요. 기존 데이터는 백업 후 시작 화면에서 복원할 수 있어요.';
        }finally{render();}
      }).finally(()=>{refreshing=null;});return refreshing;
    }
    async function send(){
      const input=$('#ai-message'),text=input.value.trim();if(!text||busy)return;
      if(/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b/.test(text)){bridge.notify('API 키는 .env 파일에만 저장해주세요.',true);return;}
      if(!status?.keyConfigured){await refresh();if(!status?.keyConfigured)return;}
      if(busy)return;
      busy=true;controller=new AbortController();const requestId=++requestSequence,requestStatus=status;let completed=false,assistant=null;
      render();setProgress('질문과 앞 대화의 맥락을 확인하고 있어요…');
      try{
        const context=bridge.getContext(),snapshotHash=await digest(context);controller.signal.throwIfAborted();
        messages.push({role:'user',content:text});assistant={role:'assistant',content:'',trace:[],artifacts:[],mode:requestStatus.mode,snapshotHash};messages.push(assistant);input.value='';render({toLatest:true});
        const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Touchline-Token':requestStatus.token},credentials:'same-origin',body:JSON.stringify({message:text,context,snapshotHash,sessionId}),signal:controller.signal});
        if(!response.ok){let data;try{data=await response.json();}catch{}const error=new Error(data?.error?.message||'서버에 연결하지 못했어요. 다시 시도해주세요.');error.code=data?.error?.code;throw error;}
        await readEvents(response.body,event=>{
          if(requestId!==requestSequence)return;
          if(event.type==='meta'){sessionId=event.sessionId;assistant.mode=event.mode;assistant.modelUsed=event.model;}
          if(event.type==='progress')setProgress(event.message);
          if(event.type==='tool_start')setProgress((labels[event.name]||'자료 확인')+' 중…');
          if(event.type==='tool_result'){assistant.trace.push({name:event.name,label:event.label,ok:event.ok});render();}
          if(event.type==='error'){const error=new Error(event.error.message);error.code=event.error.code;throw error;}
          if(event.type==='done'){completed=true;sessionId=event.sessionId;Object.assign(assistant,{content:event.reply,citations:event.citations,artifacts:event.artifacts,trace:event.trace,usage:event.usage,modelUsed:event.modelUsed,mode:event.mode,snapshotHash:event.snapshotHash});$('#ai-connection').textContent=event.mode==='mock'?'테스트 모드 · LLM 미사용':'OpenAI 대화 연결됨';render();}
        });
        if(!completed)throw new Error('응답 연결이 중단되었어요. 다시 보내주세요.');
      }catch(error){const message=error.name==='AbortError'?'요청을 취소했어요.':error.message;if(assistant){assistant.error=!['FOOTBALL_ONLY','NEEDS_TOPIC'].includes(error.code);if(!assistant.error)assistant.mode='local';assistant.content=message;}else bridge.notify(message,true);input.value=text;if(error.code==='SESSION_EXPIRED')sessionId=null;}
      finally{busy=false;controller=null;render();input.focus({preventScroll:true});}
    }
    async function applyArtifact(index,id,button){
      const m=messages[index],artifact=m?.artifacts[id];if(!artifact||artifact.applied||busy)return;
      button.disabled=true;
      try{
        if(await digest(bridge.getContext())!==m.snapshotHash)throw new Error('추천 후 선수 정보나 스쿼드가 바뀌었어요. 현재 구성으로 다시 요청해주세요.');
        if(artifact.type==='squad'){const applied=bridge.applySquad(artifact.payload.squad,artifact.payload.players);if(applied!==false)artifact.applied=true;}
        else if(artifact.type==='editor')bridge.openEditor(artifact.payload);
        else throw new Error('지원하지 않는 결과예요.');
        render();
      }catch(error){bridge.notify(error.message,true);button.disabled=false;}
    }
    $('#ai-form').addEventListener('submit',event=>{event.preventDefault();send();});
    $('#ai-message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}});
    $('#ai-cancel').addEventListener('click',()=>controller?.abort());
    $('#ai-new-chat').addEventListener('click',()=>{if(busy)return;sessionId=null;messages=[];render();});
    $('#ai-refresh').addEventListener('click',refresh);
    $('#view-ai').addEventListener('click',event=>{const example=event.target.closest('[data-ai-example]');if(example){$('#ai-message').value=example.dataset.aiExample;$('#ai-message').focus();}const action=event.target.closest('[data-ai-artifact]');if(action){const [index,id]=action.dataset.aiArtifact.split(':').map(Number);applyArtifact(index,id,action);}});
    refreshContext();render();
    return {refresh,refreshContext};
  }
  return Object.freeze({mount,digest,readEvents,renderMessageText});
});
