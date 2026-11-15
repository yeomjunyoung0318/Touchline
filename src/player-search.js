(function(root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const rangeFields = [
    ['나이', 'age', 'Age', '세'], ['잠재력 POT', 'potential', 'Potential', ''],
    ['키', 'height', 'Height', ' cm'], ['몸무게', 'weight', 'Weight', ' kg'],
  ];

  root.PlayerSearch = { mount(bridge) {
    const $ = selector => document.querySelector(selector);
    const localPage = ['http:', 'https:'].includes(location.protocol) &&
      ['127.0.0.1', 'localhost'].includes(location.hostname);
    let busy = false;
    let players = [];
    let page = 1;
    let lastQuery = null;
    let fromDatabase = false;
    let databaseTimer;
    let facets = null;
    let facetStamp = null;

    $('.view-nav').insertAdjacentHTML('beforeend', '<button class="view-tab" data-view="search"><svg aria-hidden="true"><use href="#i-search"/></svg>선수 검색</button>');
    $('.site-footer').insertAdjacentHTML('beforebegin', `
      <section id="view-search" class="view-panel hidden" aria-label="선수 검색">
        <div class="feature-title"><div><p class="eyebrow">SCOUTING / PLAYER SEARCH</p>
          <h2>선수 검색</h2>
          <p>이름, 포지션, 나이, 잠재력으로 팀에 맞는 선수를 찾고 원하는 자리에 배치하세요.</p>
        </div></div>
        <section class="panel player-api-panel">
          <div id="player-database" class="player-search-status hidden">
            <p id="player-database-status" role="status">선수 DB 확인 중…</p>
            <button id="player-database-sync" class="btn secondary small" type="button">선수 DB 적재</button>
          </div>
          <div class="player-search-status">
            <p id="player-api-status" role="status">설정 확인 중…</p>
            <p id="player-api-saved" class="muted">내 목록에 저장한 API 선수 0명</p>
          </div>
          <form id="player-search-form" class="player-search-form">
            <div class="player-search-row">
              <label>선수 이름<input name="search" maxlength="100" placeholder="예: 쿠르투아, 손흥민, 홀란"></label>
              <label>포지션<select name="position"><option value="">전체</option>${root.SquadCore.POSITIONS.map(pos => '<option>' + pos + '</option>').join('')}</select></label>
              <label>최소 OVR<input name="minRating" type="number" min="1" max="99"></label>
              <button class="btn primary" type="submit">검색</button>
            </div>
            <details class="player-search-details">
              <summary>상세 검색</summary>
              <div class="player-search-row">
                <label>남자·여자<select name="gender" disabled><option value="">전체</option><option value="male">남자</option><option value="female">여자</option></select></label>
                <label>리그<select name="league" disabled><option value="">전체 리그</option></select></label>
                <label>소속팀<select name="team" disabled><option value="">전체 팀</option></select></label>
                <label>국적<select name="nationality" disabled><option value="">전체 국적</option></select></label>
              </div>
              <div class="player-search-row search-ranges">
                ${rangeFields.map(([label, , key]) => `<fieldset><legend>${label}</legend><div>
                  <select name="min${key}" aria-label="최소 ${label}" disabled><option value="">최소 제한 없음</option></select>
                  <select name="max${key}" aria-label="최대 ${label}" disabled><option value="">최대 제한 없음</option></select>
                </div></fieldset>`).join('')}
              </div>
              <div class="player-search-row search-order-row">
                <label>최대 OVR<input name="maxRating" type="number" min="1" max="99"></label>
                <label>정렬<select name="dir"><option value="desc">OVR 높은 순</option><option value="asc">OVR 낮은 순</option></select></label>
                <button class="btn secondary" type="button" id="player-search-reset">검색 조건 초기화</button>
              </div>
              <p class="muted fine-print" id="search-facet-note">리그·팀·국적·신체 조건은 선수 DB 적재 후 선택할 수 있어요.</p>
            </details>
          </form>
          <p class="muted fine-print">한글 이름과 원래 이름으로 검색할 수 있어요. FC 온라인에서 일치하는 이름이 없으면 원래 이름을 표시해요.</p>
          <p class="muted fine-print">선수 데이터 제공 <a href="https://fcradar.gg/" target="_blank" rel="noopener noreferrer">FCRadar</a> · 한글 이름 <a href="https://openapi.nexon.com/ko/game/fconline/?id=5" target="_blank" rel="noopener noreferrer">Data based on NEXON Open API</a></p>
          <p class="muted fine-print">은색은 플레이스타일, 금색 +는 플레이스타일+예요. 배지에 마우스를 올리면 경기 중 효과를 볼 수 있어요.</p>
          <p id="player-api-photo" class="muted fine-print"></p>
          <div id="player-search-results" aria-live="polite"></div>
          <div class="dialog-actions player-search-actions">
            <button id="player-search-prev" class="btn secondary" type="button" disabled>이전 페이지</button>
            <span id="player-search-page"></span>
            <button id="player-search-next" class="btn secondary" type="button" disabled>다음 페이지</button>
            <button id="player-search-import" class="btn primary" type="button" disabled>선택한 선수 추가</button>
          </div>
          <p id="player-search-save-hint" class="muted fine-print">같은 선수를 다시 추가하면 빈 사진과 API 한글 이름, 플레이스타일을 보완해요.</p>
        </section>
      </section>`);

    const status = $('#player-api-status');
    const form = $('#player-search-form');
    const submit = form.querySelector('button[type="submit"]');
    const results = $('#player-search-results');
    const previous = $('#player-search-prev');
    const next = $('#player-search-next');
    const pageLabel = $('#player-search-page');
    const add = $('#player-search-import');
    const sync = $('#player-database-sync');
    const localGuide = '시작.cmd로 로컬 웹을 열면 선수 검색을 사용할 수 있어요.';
    const control = name => form.elements.namedItem(name);
    const collator = new Intl.Collator('ko', { numeric: true });

    function options(name, values, empty, label = value => value) {
      const select = control(name), selected = select.value;
      select.replaceChildren(new Option(empty, ''), ...values.map(value => new Option(label(value), value)));
      if (values.map(String).includes(selected)) select.value = selected;
      select.disabled = !values.length;
    }

    function updateLeagueTeams() {
      const category = control('gender').value;
      const leagues = (facets?.leagues ?? []).filter(league => !category || league.gender === category);
      options('league', leagues.map(league => league.name).sort(collator.compare), '전체 리그');
      const selected = leagues.find(league => league.name === control('league').value);
      const teams = selected?.teams ?? (category ? [...new Set(leagues.flatMap(league => league.teams))] : facets?.teams ?? []);
      options('team', [...teams].sort(collator.compare), '전체 팀');
    }

    function showFacets(value) {
      facets = value;
      control('gender').disabled = !facets?.genderKnown;
      if (control('gender').disabled) control('gender').value = '';
      updateLeagueTeams();
      const nation = value => root.PlayerProfile.nationLabel(value);
      options('nationality', [...(facets?.nationalities ?? [])].sort((a,b) => collator.compare(nation(a), nation(b))), '전체 국적', nation);
      for (const [, field, key, unit] of rangeFields) {
        const range = facets?.ranges[field] ?? { age: [14, 65], potential: [1, 99] }[field];
        const values = range ? Array.from({ length: range[1] - range[0] + 1 }, (_, index) => range[0] + index) : [];
        options('min' + key, values, '최소 제한 없음', value => value + unit);
        options('max' + key, values, '최대 제한 없음', value => value + unit);
      }
      $('#search-facet-note').textContent = facets
        ? '리그를 고르면 해당 리그의 팀만 보여요. 선택한 조건은 전체 선수 DB에 적용돼요.'
        : '리그·팀·국적·신체 조건은 선수 DB 적재 후 선택할 수 있어요. 실시간 검색에서 나이와 POT는 받은 페이지에 적용돼요.';
    }

    async function refreshFacets(stamp) {
      if (stamp === facetStamp) return;
      facetStamp = stamp;
      try {
        const response = await fetch('/api/players/database/filters', { cache: 'no-store' });
        if (!response.ok) throw new Error('선수 조건을 불러오지 못했어요.');
        const data = await response.json();
        if (facetStamp === stamp) showFacets(data.facets);
      } catch {
        if (facetStamp === stamp) facetStamp = null;
      }
    }

    function showPhotoStatus(data) {
      const hint = $('#player-api-photo');
      if (data.mode === 'mock') hint.textContent = '';
      else if (data.imageCdnConfigured) hint.textContent = '사진 제공 선수는 검색 결과와 스쿼드 카드에 사진이 표시돼요.';
      else hint.innerHTML = '사진을 보려면 계정의 이미지 주소를 설정하세요. <a href="https://fcradar.gg/my-account/api-access" target="_blank" rel="noopener noreferrer">사진 주소 확인</a>';
    }

    async function localStatus() {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(localGuide);
      const data = await response.json();
      if (data.app !== 'touchline-fc27') throw new Error(localGuide);
      return data;
    }

    function showDatabase(data) {
      clearTimeout(databaseTimer);
      $('#player-database').classList.toggle('hidden', !data.enabled);
      if (!data.enabled) return;
      const count = data.count ? 'FC27 선수 DB · ' + data.count.toLocaleString('ko-KR') + '명 · ' +
        data.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3') + ' 스냅샷' : 'FC27 선수 DB · 적재 대기';
      const progress = data.progress ? ' · ' + data.progress.processed.toLocaleString('ko-KR') + ' / ' +
        data.progress.total.toLocaleString('ko-KR') + '건 수신' : '';
      $('#player-database-status').textContent = count + (data.syncing ? ' · 적재 중' + progress : '') +
        (data.bodyKnown ? ' · 신체 정보 ' + data.bodyKnown.toLocaleString('ko-KR') + '명' : '') +
        (data.playstyleKnown ? ' · 플레이스타일 확인 ' + data.playstyleKnown.toLocaleString('ko-KR') + '명' : '') +
        (data.unmodeled ? ' · 원본 포지션 추정 미지원 ' + data.unmodeled.toLocaleString('ko-KR') + '명' : '') +
        (data.skipped ? ' · 제외 ' + data.skipped.toLocaleString('ko-KR') + '건' : '') +
        (data.error ? ' · ' + data.error : '');
      sync.disabled = data.syncing;
      sync.textContent = data.count ? '스냅샷 갱신' : '선수 DB 적재';
      if (data.count) refreshFacets(data.updatedAt);
      if (data.syncing) databaseTimer = setTimeout(refreshDatabase, 2500);
      if (data.count && !data.syncing && !lastQuery && !busy && !$('#view-search').classList.contains('hidden')) {
        search(Object.fromEntries(new FormData(form)), 1);
      }
    }

    async function refreshDatabase() {
      if (!localPage) return;
      try {
        const response = await fetch('/api/players/database', { cache: 'no-store' });
        if (response.ok) showDatabase(await response.json());
      } catch {
        clearTimeout(databaseTimer);
      }
    }

    async function setup() {
      if (!localPage) {
        status.textContent = localGuide;
        submit.disabled = true;
        return;
      }
      try {
        const response = await fetch('/api/players/status', { cache: 'no-store' });
        if (!response.ok) throw new Error(localGuide);
        const data = await response.json();
        if (data.mode === 'mock') status.textContent = '모의 데이터로 연결 시험 중 · 외부 API 미사용';
        else if (data.configured) status.textContent = '선수 검색 준비 · 검색한 뒤 원하는 선수를 추가하세요.';
        else status.textContent = '승인된 선수 데이터 API 키를 설정하면 검색할 수 있어요.';
        showPhotoStatus(data);
        refreshDatabase();
      } catch {
        status.textContent = localGuide;
      }
    }

    function renderResults(skipped) {
      results.innerHTML = players.length ? players.map((player, index) => {
        const originalName = player.englishName && player.englishName !== player.name
          ? '<small>' + escape(player.englishName) + '</small><br>' : '';
        const growth = root.CareerDevelopment.outlook(player);
        const content = `${bridge.avatar(player)}
          <span class="player-api-info"><b>${escape(player.name)}</b>${root.SquadCore.isApiPlayer(player) ? ' <span class="api-source">API</span>' : ''}<br>
            ${originalName}
            ${escape(player.club || '소속 정보 없음')} · ${escape(player.positions.join('/'))} · OVR ${player.overall} · POT ${player.potential ?? '미입력'} · 나이 ${player.age ?? '미입력'}<br>
            ${growth.peak ? `<small class="player-growth-summary">${escape(growth.origin.label)} · 전성기 ${growth.peak.join('–')}세</small><br>` : ''}
            <small>상세 스탯 ${Object.keys(player.attributes).length}/${root.SquadCore.ATTRIBUTES.length}</small>
            ${root.PlayerPlaystyles.badges(player)}
          </span>`;
        const detail = `<button class="btn secondary small" type="button" data-catalog-player="${index}" data-profile-return="${escape(player.id)}" aria-label="${escape(player.name)} 선수 상세">선수 상세</button>`;
        return fromDatabase
          ? `<div class="player-api-row catalog-player-row">${content}${detail}</div>`
          : `<div class="player-api-row"><label class="live-player-select"><input type="checkbox" value="${index}" checked>${content}</label>${detail}</div>`;
      }).join('') : '이 페이지에 조건에 맞는 선수가 없어요.';
      if (skipped) {
        const notice = document.createElement('p');
        notice.className = 'muted fine-print';
        notice.textContent = '필수 정보 누락·지원 범위·중복 때문에 ' + skipped + '명을 이 페이지에서 제외했어요.';
        results.append(notice);
      }
    }

    async function search(query, nextPage) {
      if (busy || !localPage) return;
      busy = true;
      players = [];
      results.textContent = '검색 중…';
      add.disabled = submit.disabled = previous.disabled = next.disabled = true;
      pageLabel.textContent = '';
      try {
        const session = await localStatus();
        const response = await fetch('/api/players/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Touchline-Token': session.token },
          body: JSON.stringify({ ...query, page: nextPage }),
          signal: AbortSignal.timeout(25000),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '검색하지 못했어요.');
        fromDatabase = data.mode === 'catalog';
        const inRange = (value, min, max) => (!min || (value !== null && value >= Number(min))) &&
          (!max || (value !== null && value <= Number(max)));
        players = fromDatabase ? data.players : data.players.filter(player =>
          inRange(player.age, query.minAge, query.maxAge) &&
          inRange(player.potential, query.minPotential, query.maxPotential));
        page = data.page;
        lastQuery = query;
        const skipped = Number.isInteger(data.skipped) && data.skipped > 0 ? data.skipped : 0;
        const received = data.received ?? data.players.length;
        const source = fromDatabase ? '선수 DB 검색 결과' : data.mode === 'mock' ? '모의 검색 결과' : 'API 검색 결과';
        status.textContent = source + ' · ' + players.length.toLocaleString('ko-KR') + '명' +
          (fromDatabase && players.length !== data.total ? ' / 전체 ' + data.total.toLocaleString('ko-KR') + '명' :
            players.length === received ? '' : ' / 이 페이지 ' + received + '명');
        showPhotoStatus(data);
        renderResults(skipped);
        pageLabel.textContent = page + '페이지';
        previous.disabled = page <= 1;
        next.disabled = !data.mayHaveMore;
        add.disabled = !players.length;
        add.classList.toggle('hidden', fromDatabase);
        $('#player-search-save-hint').textContent = fromDatabase
          ? '선수 상세에서 자리를 고르면 해당 선수만 내 스쿼드에 저장돼요.'
          : '같은 선수를 다시 추가하면 빈 사진과 API 한글 이름, 플레이스타일을 보완해요.';
      } catch (error) {
        status.textContent = '검색을 완료하지 못했어요.';
        results.textContent = error.name === 'TimeoutError' ? '검색 시간이 초과되었어요. 다시 시도해주세요.' : error.message;
      } finally {
        busy = false;
        submit.disabled = false;
      }
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      search(Object.fromEntries(new FormData(form)), 1);
    });
    form.addEventListener('change', event => {
      if (['gender', 'league'].includes(event.target.name)) updateLeagueTeams();
    });
    $('#player-search-reset').addEventListener('click', () => {
      if (busy) return;
      form.reset();
      updateLeagueTeams();
      search(Object.fromEntries(new FormData(form)), 1);
    });
    previous.addEventListener('click', () => search(lastQuery, page - 1));
    next.addEventListener('click', () => search(lastQuery, page + 1));
    sync.addEventListener('click', async () => {
      sync.disabled = true;
      try {
        const status = await localStatus();
        const response = await fetch('/api/players/database/sync', {
          method: 'POST', headers: { 'X-Touchline-Token': status.token },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '선수 DB 적재를 시작하지 못했어요.');
        lastQuery = null;
        showDatabase(data);
      } catch (error) {
        sync.disabled = false;
        bridge.notify(error.message, true);
      }
    });
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-catalog-player]');
      if (!button) return;
      try { bridge.showCatalogPlayer(players[Number(button.dataset.catalogPlayer)]); }
      catch (error) { bridge.notify(error.message, true); }
    });
    add.addEventListener('click', () => {
      const selected = [...results.querySelectorAll('input:checked')].map(input => players[Number(input.value)]);
      if (!selected.length) {
        bridge.notify('가져올 선수를 선택해주세요.', true);
        return;
      }
      try {
        if (bridge.importPlayers(selected) !== false) add.disabled = true;
      } catch (error) {
        bridge.notify(error.message, true);
      }
    });
    showFacets(null);
    setup();
    return { refreshDatabase };
  } };
})(window);
