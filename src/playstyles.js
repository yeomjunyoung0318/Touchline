(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PlayerPlaystyles=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const names={
    'finesse-shot':['감아차기','감차'], 'chip-shot':['칩 슛'], 'power-shot':['파워 슛'],
    'dead-ball':['데드볼','세트피스'], 'precision-header':['정밀 헤더'],
    acrobatic:['아크로바틱'], 'low-driven-shot':['낮은 드리븐 슛','로우 드리븐 슛'], gamechanger:['게임 체인저'],
    'incisive-pass':['예리한 패스','침투 패스'], 'pinged-pass':['강한 땅볼 패스','핑드 패스'],
    'long-ball-pass':['긴 패스','롱 볼 패스'], 'tiki-taka':['티키타카'], 'whipped-pass':['휘어지는 크로스','휩드 패스'],
    inventive:['창의적 패스','인벤티브'], 'first-touch':['퍼스트 터치'], 'press-proven':['압박 저항','프레스 프루븐'],
    rapid:['래피드','질주'], technical:['기술 드리블','테크니컬'], trickster:['트릭스터'],
    'aerial-fortress':['공중전 요새','에어리얼 포트리스'], anticipate:['예측 수비','앤티시페이트'],
    block:['블로킹','블록'], intercept:['가로채기','인터셉트'], jockey:['견제 수비','자키'], 'slide-tackle':['슬라이딩 태클'],
    bruiser:['몸싸움','브루저'], enforcer:['인포서'], 'long-throw':['긴 스로인'],
    'quick-step':['퀵 스텝','빠른 발','빠른 스텝'], relentless:['지칠 줄 모름','릴렌트리스'],
    'gk-first-touch':['1대1 좁히기','1v1 Close Down','GK 퍼스트 터치'], 'gk-cross-claimer':['크로스 처리','Cross Claimer'],
    'gk-deflector':['디플렉터','쳐내기','Deflector'], 'gk-far-reach':['긴 리치','Far Reach'],
    'gk-far-throw':['멀리 던지기','Far Throw'], 'gk-footwork':['발 선방','풋워크','Footwork'],
  };
  const effects={
    'finesse-shot':'감아차기가 빨라지고 커브와 정확도가 올라가요.',
    'chip-shot':'칩 슛을 더 빠르고 정확하게 차요.',
    'power-shot':'파워 슛의 볼 이동 속도가 올라가요.',
    'dead-ball':'세트피스의 속도·커브·정확도와 궤적 미리보기가 좋아져요.',
    'precision-header':'헤딩 슛의 정확도와 위력이 올라가요.',
    acrobatic:'발리 정확도가 올라가고 아크로바틱 동작을 써요.',
    'low-driven-shot':'낮은 드리븐 슛의 발동·공 속도·정확도가 좋아져요.',
    gamechanger:'트리벨라와 화려한 슛의 정확도가 올라가요.',
    'incisive-pass':'스루패스 정확도, 휘는 패스의 커브, 정밀 패스 속도가 올라가요.',
    'pinged-pass':'받는 선수의 트래핑 난도 증가 없이 땅볼 패스가 빨라져요.',
    'long-ball-pass':'로빙 패스가 더 빠르고 정확해져 가로채기 어려워져요.',
    'tiki-taka':'원터치 땅볼 패스와 짧은 패스가 더 정확해져요.',
    'whipped-pass':'크로스의 정확도·속도·커브가 좋아져요.',
    inventive:'트리벨라와 화려한 패스의 정확도가 올라가요.',
    'first-touch':'트래핑 실수가 줄고 드리블로 빠르게 이어져요.',
    'press-proven':'조깅 속도 드리블과 압박 속 공 지키기가 좋아져요.',
    rapid:'질주 드리블 속도가 올라가고 공을 길게 칠 때 실수가 줄어요.',
    technical:'컨트롤드 스프린트 속도와 드리블 방향 전환이 좋아져요.',
    trickster:'전용 플릭 개인기를 사용할 수 있어요.',
    'aerial-fortress':'수비 공중볼 경합에서 점프와 몸싸움이 강해져요.',
    anticipate:'스탠딩 태클 성공률이 오르고 공을 발밑에 멈출 수 있어요.',
    block:'블록이 닿는 범위와 성공 가능성이 높아져요.',
    intercept:'가로채기 범위가 넓어지고 공을 지키기 쉬워져요.',
    jockey:'스프린트 견제 속도와 질주 전환이 빨라져요.',
    'slide-tackle':'슬라이딩 태클 뒤 공을 발밑에 멈출 수 있어요.',
    bruiser:'몸싸움을 동반한 태클이 강해져요.',
    enforcer:'드리블 중 어깨 경합과 공 지키기가 좋아져요.',
    'long-throw':'스로인을 더 힘차게 멀리 던져요.',
    'quick-step':'폭발적인 질주를 시작할 때 더 빨리 가속해요.',
    relentless:'경기 중 체력 소모가 줄고 하프타임 회복이 늘어요.',
    'gk-first-touch':'골키퍼가 빠르게 나와 근거리 슛에 반응해요.',
    'gk-cross-claimer':'크로스에 빠르게 나가 더 강하게 펀칭해요.',
    'gk-deflector':'슈팅을 더 힘 있게 안전한 방향으로 쳐내요.',
    'gk-far-reach':'멀리 다이빙해 중거리·장거리 슛을 막기 쉬워져요.',
    'gk-far-throw':'골키퍼가 전용 동작으로 공을 더 멀리 던져요.',
    'gk-footwork':'전용 발 선방 동작으로 낮은 슛에 더 잘 대응해요.',
  };
  const plusEffects={
    acrobatic:'발리가 훨씬 정확해지고 전용 아크로바틱 발리 동작을 쓸 수 있어요.',
    'whipped-pass':'정확하고 빠른 크로스에 더해 강한 드리븐 크로스를 보낼 수 있어요.',
    trickster:'더 많은 전용 개인기를 쓸 수 있고 측면 드리블이 민첩해져요.',
    'slide-tackle':'공을 발밑에 멈추는 효과와 함께 태클 범위가 크게 넓어져요.',
    relentless:'체력 소모와 하프타임 회복이 개선되고 장기 피로로 인한 스탯 저하도 줄어요.',
  };
  const key=text=>text.toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
  const slugs=new Map(Object.entries(names).flatMap(([slug,labels])=>[slug,...labels].map(label=>[key(label),slug])));
  const english=slug=>slug==='gk-first-touch'?'1v1 Close Down':slug.replace(/^gk-/,'').split('-').map(word=>word[0]?.toUpperCase()+word.slice(1)).join(' ');
  const label=slug=>Object.hasOwn(names,slug)?names[slug][0]:english(slug);
  const escape=value=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function description(slug,plus){
    if(!Object.hasOwn(effects,slug))return '이 특성의 효과 설명이 아직 없어요.';
    if(!plus)return effects[slug];
    return Object.hasOwn(plusEffects,slug)?plusEffects[slug]:effects[slug]+' + 등급은 이 효과가 더 강해요.';
  }

  function filter(value){
    const text=value.normalize('NFKC').trim().toLowerCase();
    const level=text.startsWith('base:')?'base':/(?:\+|플러스)$/.test(text)?'plus':'either';
    const name=text.replace(/^base:\s*/,'').replace(/(?:\+|플러스)$/,'').trim();
    const slug=slugs.get(key(name))??name.replace(/\s+/g,'-');
    if((slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))||(!slug&&level==='either')){
      throw new Error('플레이스타일 이름을 확인해주세요. “감아차기+”나 “quick-step”처럼 지정할 수 있어요.');
    }
    return {slug,level};
  }

  function matches(player,{slug,level}){
    const has=entries=>entries?.some(style=>!slug||style.slug===slug)??false;
    return (level!=='base'&&has(player.playstyle_plus))||(level!=='plus'&&has(player.playstyles));
  }

  function describe(player){
    const list=entries=>entries?.map(({slug})=>({slug,name:label(slug)}))??null;
    return {playstyles:list(player.playstyles),playstyle_plus:list(player.playstyle_plus)};
  }

  function hasNamedPlus(text){
    if(!/\+|플러스/.test(text))return false;
    const compact=key(text.replaceAll('플러스',''));
    return [...slugs.keys()].some(alias=>alias.length>1&&compact.includes(alias));
  }

  // FC27 player pages use separate image files for standard and upgraded badges.
  const iconBase='https://img.fcradar.gg/insecure/rs:fit:80:0/q:80/f:webp/plain/s3://il-fcr-hel/FC27/playerTraitsSmall/';
  function badge(style,plus,detail){
    const name=label(style.slug)+(plus?'+':'');
    const title=name+' · '+english(style.slug)+(plus?'+':'');
    const effect=description(style.slug,plus);
    const image=Number.isInteger(style.id)&&style.id>=0&&style.id<=999
      ?'<img class="playstyle-icon" alt="" src="'+iconBase+(plus?'traits_icon_colored_sm':'traits_colored_sm')+style.id+'.png" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="26" height="26">':'';
    return '<span class="playstyle-badge'+(plus?' is-plus':'')+'" role="img" aria-label="'+escape(name+' · '+effect)+'" data-playstyle-title="'+escape(title)+'" data-playstyle-effect="'+escape(effect)+'"'+(detail?' tabindex="0"':'')+'><span class="playstyle-art"><span aria-hidden="true">'+escape(name.slice(0,2))+'</span>'+image+'</span>'+(detail?'<span>'+escape(name)+'</span>':'')+(plus&&!detail?'<span class="playstyle-plus-mark" aria-hidden="true">+</span>':'')+'</span>';
  }

  function badges(player,detail=false){
    const plus=player.playstyle_plus,regular=player.playstyles;
    if(!detail){
      const icons=(plus??[]).map(style=>badge(style,true,false)).concat((regular??[]).map(style=>badge(style,false,false)));
      return icons.length?'<span class="playstyle-icons">'+icons.join('')+'</span>':'';
    }
    const group=(items,upgraded)=>'<div class="playstyle-group"><h4'+(upgraded?' class="playstyle-plus-heading"':'')+'>플레이스타일'+(upgraded?'+':'')+' '+(items?'· '+items.length:'')+'</h4>'+
      (items?.length?'<div class="playstyle-icons">'+items.map(style=>badge(style,upgraded,true)).join('')+'</div>':'<p class="muted fine-print">'+(items?'보유 특성 없음':'DB 정보 없음')+'</p>')+'</div>';
    return '<section class="player-playstyles" aria-label="선수 플레이스타일">'+group(plus,true)+group(regular,false)+'</section>';
  }

  function mountTooltips(doc){
    const tip=doc.createElement('div');
    tip.className='playstyle-tooltip';tip.hidden=true;tip.setAttribute('aria-hidden','true');
    const heading=doc.createElement('strong'),copy=doc.createElement('span');
    tip.append(heading,copy);doc.body.append(tip);
    let owner=null;
    function hide(){owner=null;tip.hidden=true;}
    function show(event){
      const badge=event.target.closest?.('[data-playstyle-effect]');
      if(!badge||badge===owner)return;
      owner=badge;heading.textContent=badge.dataset.playstyleTitle;copy.textContent=badge.dataset.playstyleEffect;
      tip.classList.toggle('is-plus',badge.classList.contains('is-plus'));
      tip.hidden=false;
      const rect=badge.getBoundingClientRect(),width=tip.offsetWidth,height=tip.offsetHeight;
      const viewport=doc.documentElement;
      tip.style.left=Math.max(8,Math.min(rect.left,viewport.clientWidth-width-8))+'px';
      tip.style.top=Math.max(8,rect.bottom+8+height<=viewport.clientHeight?rect.bottom+8:rect.top-height-8)+'px';
    }
    function leave(event){if(owner?.contains(event.target)&&!owner.contains(event.relatedTarget))hide();}
    doc.addEventListener('mouseover',show);doc.addEventListener('focusin',show);
    doc.addEventListener('mouseout',leave);doc.addEventListener('focusout',leave);
    doc.addEventListener('scroll',hide,true);
    doc.addEventListener('pointerdown',hide,true);
    doc.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  }

  return Object.freeze({filter,matches,describe,label,hasNamedPlus,badges,mountTooltips});
});
