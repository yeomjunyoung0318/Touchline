(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./playstyles.js'),require('./career-development.js'));
  else root.PlayerProfile=factory(root.SquadCore,root.PlayerPlaystyles,root.CareerDevelopment);
})(typeof globalThis!=='undefined'?globalThis:this,function(C,P,D){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const nations={
    'Korea Republic':'대한민국', England:'잉글랜드', France:'프랑스', Brazil:'브라질', Argentina:'아르헨티나',
    Spain:'스페인', Germany:'독일', Italy:'이탈리아', Portugal:'포르투갈', Netherlands:'네덜란드',
    Japan:'일본', 'China PR':'중국', Norway:'노르웨이', Belgium:'벨기에', 'United States':'미국',
    Wales:'웨일스', Scotland:'스코틀랜드', Australia:'호주', Canada:'캐나다', Mexico:'멕시코',
  };
  const nationLabel=name=>Object.hasOwn(nations,name)?nations[name]:name;
  const bands=[
    [90,'elite','90–99'], [80,'high','80–89'], [70,'mid','70–79'], [60,'low','60–69'], [1,'base','1–59'],
  ];
  const band=value=>Number.isInteger(value)?(bands.find(([min])=>value>=min)?.[1]??'unknown'):'unknown';
  const scoreClass=value=>'stat-tone stat-'+band(value);
  const date=value=>String(value).replaceAll('-','.');
  const snapshotDate=value=>value?.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1.$2.$3');
  const genderLabel=value=>({male:'남자',female:'여자'}[value]??'—');

  function facts(player, meta){
    const profile=player.profile??{};
    const birthDates=meta.career?.birthDates??[];
    const birth=birthDates.length?birthDates.map(date).join(' / '):meta.loading?'확인 중…':'미확인';
    const growth=D.outlook(player,meta.growthObservation);
    const origin=growth.origin;
    const values=[
      ['국적',nationLabel(player.nationality)||'—'], ['분류',genderLabel(meta.gender)], ['DB 나이',player.age==null?'—':player.age+'세'],
      ['생년월일',birth], ['키',profile.heightCm?profile.heightCm+' cm':'—'], ['몸무게',profile.weightKg?profile.weightKg+' kg':'—'],
      ['리그',profile.league||'—'], ['계약 만료 연도',profile.contractYear??'—'],
      ['주발',({Left:'왼발',Right:'오른발',Both:'양발'}[profile.preferredFoot]??'—')],
      ['개인기',profile.skillMoves?profile.skillMoves+' / 5':'—'], ['약발',profile.weakFoot?profile.weakFoot+' / 5':'—'],
      ['성장 유형',origin?.label??'미확인'], ['전성기 나이',growth.peak?growth.peak.join('–')+'세':'미확인'],
      ['POT 여지',growth.gap==null?'미확인':(growth.gap>0?'+':'')+growth.gap],
    ];
    const growthSource=D.PROFILE_SOURCES[origin?.source];
    const attribution=origin?.url?'<a href="'+escape(origin.url)+'" target="_blank" rel="noopener noreferrer">'+escape(growthSource)+'</a>':escape(growthSource);
    return '<dl class="profile-facts-grid">'+values.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl>'+
      (growthSource?'<p class="muted fine-print">성장 유형 출처 · '+attribution+'</p>':'')+
      (birthDates.length>1?'<p class="muted fine-print">공개 기록에 생년월일 표기가 여러 개 있어 함께 보여줘요.</p>':'');
  }

  function career(player,meta){
    const sourceId=meta.career?.sourceId;
    const rows=meta.career?.memberships??[];
    let history='<p class="muted">동일 선수로 확인된 공개 소속 이력 자료가 없어요.</p>';
    if(meta.loading)history='<p class="muted" role="status">생년월일과 공개 소속 이력을 확인하고 있어요…</p>';
    if(meta.career?.unavailable)history='<p class="muted">공개 기록을 불러오지 못했어요. 나중에 상세 페이지를 다시 열어주세요.</p>';
    if(rows.length)history='<ol class="profile-timeline">'+rows.map(entry=>{
      const period=entry.from?(entry.to?date(entry.from)+' – '+date(entry.to):date(entry.from)+'부터'):
        entry.to?date(entry.to)+'까지':'기간 미확인';
      return '<li><span>'+escape(period)+'</span><b>'+escape(entry.name)+'</b></li>';
    }).join('')+'</ol>';
    return '<div class="profile-current-team"><span>FC27 스냅샷 소속</span><b>'+escape(player.club||'소속 정보 없음')+'</b></div>'+history+
      (/^Q[1-9]\d*$/.test(sourceId??'')?'<p class="muted fine-print">실제 소속 이력과 생년월일 제공 <a href="https://www.wikidata.org/wiki/'+sourceId+'" target="_blank" rel="noopener noreferrer">Wikidata</a> · 기록 범위는 선수마다 달라요.</p>':'');
  }

  function stats(player){
    const groups=C.ATTRIBUTE_GROUPS.map(([, label, attributes])=>({label,rows:attributes.filter(([key])=>Number.isInteger(player.attributes[key]))})).filter(group=>group.rows.length);
    const count=groups.reduce((sum,group)=>sum+group.rows.length,0);
    if(!count)return '<p class="muted">세부 스탯 정보가 없어요.</p>';
    const legend='<div class="profile-stat-legend" aria-label="능력치 구간">'+bands.map(([,key,label])=>
      '<span class="stat-tone stat-'+key+'"><i aria-hidden="true"></i>'+label+'</span>').join('')+'</div>';
    return '<div class="profile-stat-heading"><span class="muted">세부 스탯 '+count+'개</span>'+legend+'</div><div class="profile-stat-grid">'+groups.map(group=>
      '<section class="profile-stat-group"><h4>'+group.label+'</h4><dl>'+group.rows.map(([key,label])=>{
        const value=player.attributes[key];
        return '<div class="profile-stat '+scoreClass(value)+'"><dt>'+label+'</dt><dd>'+value+'</dd><span class="profile-stat-track" aria-hidden="true"><span style="width:'+value+'%"></span></span></div>';
      }).join('')+'</dl></section>').join('')+'</div>';
  }

  function render(player,meta,avatar,placement){
    const name=escape(player.name),positions=player.positions.map(pos=>'<span>'+escape(pos)+'</span>').join('');
    const rating=(label,value)=>'<div class="profile-score '+scoreClass(value)+'"><span>'+label+'</span><b>'+(value??'—')+'</b></div>';
    return '<header class="panel profile-hero">'+avatar(player)+'<div class="profile-identity"><p class="eyebrow">FC27 · PLAYER PROFILE</p><h2 id="profile-heading" tabindex="-1">'+name+'</h2>'+
      (player.englishName&&player.englishName!==player.name?'<p class="profile-english">'+escape(player.englishName)+'</p>':'')+
      '<div class="profile-positions">'+positions+'</div><p class="profile-club">'+escape(player.club||'소속 정보 없음')+
      (meta.snapshot?' · '+escape(snapshotDate(meta.snapshot))+' 스냅샷':'')+'</p></div><div class="profile-scores">'+rating('현재 OVR',player.overall)+rating('잠재력 POT',player.potential)+'</div></header>'+
      '<div class="profile-overview"><section class="panel profile-panel"><h3>기본 정보</h3><div id="profile-facts">'+facts(player,meta)+'</div></section>'+
      '<section class="panel profile-panel profile-placement"><h3>스쿼드 배치</h3>'+placement+'</section></div>'+
      '<section class="panel profile-panel"><h3>플레이스타일</h3>'+P.badges(player,true)+'<p class="muted fine-print">배지에 마우스를 올리거나 키보드 포커스를 옮기면 경기 중 효과가 표시돼요. <a href="https://www.ea.com/games/ea-sports-fc/fc-27/news/what-are-playstyles" target="_blank" rel="noopener noreferrer">EA 플레이스타일 안내</a></p></section>'+
      '<section class="panel profile-panel"><h3>세부 능력치</h3>'+stats(player)+'</section>'+
      '<section class="panel profile-panel"><h3>선수 경력</h3><div id="profile-career">'+career(player,meta)+'</div></section>'+
      (C.isApiPlayer(player)?'<p class="muted fine-print">게임 스냅샷 제공 <a href="https://fcradar.gg/" target="_blank" rel="noopener noreferrer">FCRadar</a></p>':'');
  }
  return Object.freeze({nationLabel,band,facts,career,render});
});
