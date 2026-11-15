(function () {
  'use strict';
  const C = window.SquadCore;
  const M = window.CareerMarket;
  const R = window.CareerRanking;
  const D = window.CareerDevelopment;
  const P = window.PlayerPlaystyles;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const number = value => value == null ? '미확인' : String(value);
  const signed = value => value == null ? '미확인' : (value > 0 ? '+' : '') + value;
  const currency = (value, code) => M.money(value, code);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const styleOptions = Object.fromEntries(Object.entries(C.STYLES).map(([key, style]) => [key, style.name]));
  const scopeOptions = { market: '이적시장', academy: '내 유스 아카데미', squad: '현재 선수단' };
  const deploymentOptions = { any: '전체 포지션 적합도', natural: '선호 포지션만', conversion: '사파 전환만' };
  const seasonOptions = { 2: '2시즌', 4: '4시즌', 6: '6시즌' };
  const reportTabs = { ...M.REPORTS, conversion: '사파 전환' };
  const sorts = { fit: '추천 순', ovr: '포지션 OVR', potential: '잠재력', growth: '성장 여지', age: '어린 순', value: '이적 비용 낮은 순', wage: '주급 낮은 순' };
  const profileChoices = Object.fromEntries(Object.entries(D.PROFILES).map(([key, value]) => [key, value.name + ' · ' + value.english]));
  const source = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  const labels = { '': '미입력', ...M.LEVELS };
  const stageLabel = (row, report) => row.observation?.reports?.includes(report) ? '확인함' : '확인 전';

  function options(values, selected) {
    return Object.entries(values).map(([value, label]) =>
      `<option value="${esc(value)}"${String(selected ?? '') === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }
  const field = (label, html) => `<label><span>${label}</span>${html}</label>`;
  const select = (name, values, selected) => `<select name="${name}">${options(values, selected)}</select>`;
  const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
  const num = (name, min, max, value = '', step = 1) => input(name, value, `type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal" placeholder="—"`);
  const check = (name, title, value = false) =>
    `<label class="career-check"><input type="checkbox" name="${name}"${value ? ' checked' : ''}><span>${title}</span></label>`;
  const action = (name, label, modifier = '', disabled = false) =>
    `<button type="button" class="btn small ${modifier || 'secondary'}" data-career-action="${name}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const metric = (label, value, source = '') => `<div class="career-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${source ? `<small>${esc(source)}</small>` : ''}</div>`;
  const positionLabel = position => `${position} · ${C.POSITION_NAMES[position]}`;
  const positionOptions = Object.fromEntries(C.POSITIONS.map(pos => [pos, positionLabel(pos)]));
  const roles = position => ({ '': '전술에 맞게 추천', ...Object.fromEntries(
    (C.FC_IQ.byPosition[position] ?? []).map(role => [role.id, role.name])) });
  const dateLabel = snapshot => snapshot?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') ?? '';
  const peakLabel = peak => peak ? peak.join('–') + '세' : '미확인';
  const peakTiming = data => data.yearsToPeak > 0 ? '전성기까지 ' + data.yearsToPeak + '년' : data.phase;
  const empty = (title, body) => `<div class="career-empty"><span class="empty-icon">${icon('spark')}</span><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;

  function scoutForm() {
    return `<form id="career-scout-form" class="career-scout-form">
      <details class="panel career-settings" id="career-setup">
        <summary><span>커리어 설정</span><small id="career-setup-summary">전체 선수 DB</small></summary>
        <div class="career-fields">
          ${field('감독 구단', select('careerClubKey', { '': '구단 제한 없음' }))}
          ${field('커리어 단계', select('careerStage', M.STAGES))}
          ${field('세이브 기준일', input('gameDate', '', 'type="date"'))}
          ${field('이적시장', select('window', M.WINDOWS))}
          ${field('통화', select('currency', M.CURRENCIES))}
          ${field('영입 예산 (백만)', num('feeMillions', 0, 10000, '', 0.000001))}
          ${field('주급 여력 (천)', num('wageThousands', 0, 100000, '', 0.001))}
          ${check('allowUnknown', '금액 미확인 후보도 보기')}
        </div>
        <p class="career-hint">예산은 후보 한 명씩 비교해요. 저장한 협상안의 선지급액과 주급 합계는 이적 협상에서 확인할 수 있어요.</p>
      </details>
      <div class="panel career-search-panel">
        <div class="career-fields career-primary-fields">
          ${field('선수 범위', select('scope', scopeOptions))}
          ${field('보강할 자리', select('slotId', { '': '포지션 직접 지정' }))}
          ${field('포지션', select('position', positionOptions, 'CM'))}
          ${field('FC IQ 역할', select('role', roles('CM')))}
          ${field('포커스', select('roleFocus', { '': '역할 기본 포커스' }))}
          ${field('추천 방향', select('focus', R.GOALS))}
          ${field('기용 방식', select('deployment', deploymentOptions))}
          ${field('영입 방식', select('route', M.ROUTES))}
        </div>
        <div class="career-fields career-quick-fields">
          ${field('이름 검색', input('query', '', 'maxlength="120" placeholder="이강인, Lee Kang In"'))}
          ${field('팀 스타일', select('style', styleOptions))}
          ${field('육성 기간', select('growthSeasons', seasonOptions, 4))}
        </div>
        <details id="career-filters" class="career-more">
          <summary>상세 조건</summary>
          <div class="career-fields">
            ${field('남자·여자', select('gender', { '': '전체', male: '남자', female: '여자' }))}
            ${field('리그', select('league', { '': '전체 리그' }))}
            ${field('소속팀', select('club', { '': '전체 소속팀' }))}
            ${field('국적', select('nation', { '': '전체 국적' }))}
            ${field('주발', select('foot', { '': '상관없음', Right: '오른발', Left: '왼발', Both: '양발' }))}
            ${field('최소 나이', num('minAge', 14, 65))}${field('최대 나이', num('maxAge', 14, 65))}
            ${field('최소 OVR', num('minOvr', 1, 99))}${field('최대 OVR', num('maxOvr', 1, 99))}
            ${field('최소 POT', num('minPot', 1, 99))}${field('최대 POT', num('maxPot', 1, 99))}
            ${field('최소 성장 여지', num('minGrowth', 0, 98))}
            ${field('성장 유형', select('growthProfile', { '': '전체 유형', ...profileChoices }))}
            ${field('최소 키 (cm)', num('minHeight', 100, 250))}
            ${field('최소 약발', num('minWeakFoot', 1, 5))}
            ${field('최소 개인기', num('minSkill', 1, 5))}
            ${field('역할 숙련도', select('roleLevel', { '': '상관없음', 1: 'Role+ 이상', 2: 'Role++' }))}
            ${field('플레이스타일', select('trait', { '': '전체 플레이스타일' }))}
            ${check('traitPlus', '플레이스타일+ 필수')}
            ${check('excludeSquad', '내 스쿼드에 배치된 선수 제외', true)}
            ${check('includeHistoric', '클래식·커스텀·미분류 포함')}
          </div>
        </details>
        <div class="career-search-actions">
          <span class="career-hint" id="career-data-source"></span>
          ${action('clear', '조건 초기화')}
          <button type="submit" class="btn primary" id="career-search-button">${icon('search')}후보 찾기</button>
        </div>
      </div>
    </form>
    <div id="career-scout-message" class="career-message" role="status" hidden></div>
    <div id="career-scout-results" class="career-layout"></div>`;
  }

  function mount({ getSquad, getPlayers, save, notify, avatar, openDialog, closeDialog, openProfile }) {
    const view = $('#view-recommend');
    const scoutPanel = $('#career-scout', view);
    const listsPanel = $('#career-lists', view);
    const transfersPanel = $('#career-transfers', view);
    const staffPanel = $('#career-staff', view);
    scoutPanel.innerHTML = scoutForm();
    const form = $('#career-scout-form', scoutPanel);
    const results = $('#career-scout-results', scoutPanel);
    const message = $('#career-scout-message', scoutPanel);
    const setupSummary = $('#career-setup-summary', scoutPanel);
    const dialog = $('#app-dialog');
    const canFetch = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.protocol === 'http:';
    const state = {
      tab: 'scout', reportTab: 'tactics', list: 'all', transferTab: 'negotiations', squadId: '', loadedSettings: '',
      request: null, meta: null, metaTime: 0, metaPending: null, result: null, selected: null,
      support: null, compare: new Map(), editing: null, growthScenario: '', staffFilter: 'all',
    };
    const workspace = () => getSquad().career ?? {
      settings: M.options({ style: getSquad().style, focus: getSquad().focus }), targets: [], staff: [],
    };
    const targetFor = id => workspace().targets.find(record => record.player.id === id);
    const findPlayer = id => getPlayers().find(player => player.id === id);
    const getControl = name => form.elements.namedItem(name);
    const addWarning = text => { message.hidden = !text; message.textContent = text; };
    const menu = (type, values, selected) => `<div class="segmented career-filter-bar" role="group" aria-label="${type === 'report' ? '스카우트 보고서' : '보기 선택'}">
      ${Object.entries(values).map(([key, label]) => `<button type="button" data-career-${type}="${key}" class="${selected === key ? 'active' : ''}" aria-pressed="${selected === key}">${esc(label)}</button>`).join('')}
    </div>`;
    const rankMarkup = player => player.source === 'demo' ? '가상 선수' : player.club || '소속 미입력';

    function slotLabel(slot) {
      const count = getSquad().slots.filter(other => other.pos === slot.pos).length;
      const lane = count > 1 && slot.x !== 50 ? (slot.x < 50 ? '왼쪽 ' : '오른쪽 ') : '';
      const player = findPlayer(slot.playerId);
      return lane + slot.pos + ' · ' + (player?.name ?? '빈 자리') + (slot.role ? ' · ' + C.FC_IQ.getRole(slot.pos, slot.role.id)?.name : '');
    }
    function refreshClubPicker(current = getControl('careerClubKey').value) {
      const leagues = new Map();
      for (const club of state.meta?.clubs ?? []) {
        if (!leagues.has(club.league)) leagues.set(club.league, []);
        leagues.get(club.league).push(club);
      }
      const picker = getControl('careerClubKey');
      picker.innerHTML = '<option value="">구단 제한 없음</option>' + [...leagues].sort(([a], [b]) => a.localeCompare(b)).map(([league, clubs]) =>
        `<optgroup label="${esc(league)}">${clubs.sort((a, b) => a.name.localeCompare(b.name)).map(club =>
          `<option value="${esc(JSON.stringify([club.name, club.league]))}">${esc(club.name)} · ${club.gender === 'female' ? '여자' : '남자'}</option>`).join('')}</optgroup>`).join('');
      if (current && ![...picker.options].some(option => option.value === current)) {
        const [club, league] = JSON.parse(current);
        picker.add(new Option(club + ' · ' + league, current));
      }
      picker.value = current;
    }
    function setPicker(name, values, emptyLabel, value = getControl(name).value) {
      getControl(name).innerHTML = options({ '': emptyLabel, ...Object.fromEntries(values) }, value);
    }
    function updateClubs(selected = getControl('club').value) {
      const league = getControl('league').value;
      const facets = state.meta?.facets;
      const clubs = league ? facets?.leagues.find(row => row.name === league)?.teams ?? [] : facets?.teams ?? [];
      setPicker('club', [...clubs].sort().map(value => [value, value]), '전체 소속팀', selected);
    }
    function updateRoleControls(position, role = getControl('role').value, focus = getControl('roleFocus').value) {
      const roleOptions = roles(position);
      getControl('role').innerHTML = options(roleOptions, role);
      const chosen = C.FC_IQ.getRole(position, getControl('role').value);
      getControl('roleFocus').innerHTML = options({ '': '역할 기본 포커스', ...Object.fromEntries(
        (chosen?.focuses ?? []).map(key => [key, C.FC_IQ.focuses[key].name])) }, focus);
      getControl('roleFocus').disabled = !chosen;
      getControl('roleLevel').disabled = !chosen;
      if (!chosen) getControl('roleLevel').value = '';
    }
    function restore(settings) {
      const formationSlots = Object.fromEntries(getSquad().slots.map(slot => [slot.id, slotLabel(slot)]));
      getControl('slotId').innerHTML = options({ '': '포지션 직접 지정', ...formationSlots }, settings.slotId);
      const slot = getSquad().slots.find(row => row.id === getControl('slotId').value);
      const position = slot?.pos ?? settings.position;
      const style = settings.style;
      for (const control of form.elements) {
        if (!control.name || !Object.hasOwn(settings, control.name)) continue;
        if (control.type === 'checkbox') control.checked = settings[control.name];
        else control.value = settings[control.name] ?? '';
      }
      getControl('position').value = C.POSITIONS.includes(position) ? position : 'CM';
      getControl('position').disabled = !!slot;
      getControl('style').value = C.STYLES[style] ? style : 'possession';
      getControl('focus').value = R.GOALS[settings.focus] ? settings.focus : 'balanced';
      getControl('feeMillions').value = settings.feeLimit == null ? '' : settings.feeLimit / 1e6;
      getControl('wageThousands').value = settings.wageLimit == null ? '' : settings.wageLimit / 1e3;
      refreshClubPicker(settings.careerClub ? JSON.stringify([settings.careerClub, settings.careerLeague]) : '');
      const facets = state.meta?.facets;
      setPicker('league', (facets?.leagues ?? []).map(row => row.name).sort().map(value => [value, value]), '전체 리그', settings.league);
      setPicker('nation', [...(facets?.nationalities ?? [])].sort().map(value => [value, value]), '전체 국적', settings.nation);
      setPicker('trait', (state.meta?.traits ?? []).map(trait => [trait.slug, P.label(trait.slug)]), '전체 플레이스타일', settings.trait);
      updateClubs(settings.club);
      updateRoleControls(getControl('position').value, settings.role, settings.roleFocus);
      updateSetup(settings);
    }
    function readForm(validate = true) {
      const data = Object.fromEntries(new FormData(form));
      const [careerClub, careerLeague] = data.careerClubKey ? JSON.parse(data.careerClubKey) : ['', ''];
      const stage = data.scope === 'market';
      const { gender } = state.meta?.clubs.find(row => row.name === careerClub && row.league === careerLeague) ?? {};
      const input = {
        ...workspace().settings, ...data, position: getControl('position').value, careerClub, careerLeague,
        gender: stage && gender ? gender : data.gender,
        feeLimit: data.feeMillions === '' ? null : Math.round(Number(data.feeMillions) * 1e6),
        wageLimit: data.wageThousands === '' ? null : Math.round(Number(data.wageThousands) * 1e3),
        ...Object.fromEntries(['allowUnknown', 'excludeSquad', 'includeHistoric', 'traitPlus']
          .map(name => [name, getControl(name).checked])),
      };
      return validate ? R.validOptions(input, getSquad()) : M.options(input);
    }
    function updateSetup(settings) {
      const parts = [settings.careerClub || '전체 선수 DB'];
      if (settings.gameDate) parts.push(settings.gameDate);
      if (settings.feeLimit != null) parts.push('예산 ' + currency(settings.feeLimit, settings.currency));
      if (settings.wageLimit != null) parts.push('주급 ' + currency(settings.wageLimit, settings.currency));
      setupSummary.textContent = parts.join(' · ');
    }
    async function loadMeta() {
      if (!canFetch || state.metaPending || Date.now() - state.metaTime < 60000) return state.metaPending;
      state.metaPending = (async () => {
        try {
          const response = await fetch('/api/career/options', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
          if (!response.ok) return;
          const data = await response.json();
          state.meta = data;
          state.metaTime = Date.now();
          const settings = workspace().settings;
          refreshClubPicker();
          setPicker('league', (data.facets?.leagues ?? []).map(row => row.name).sort().map(value => [value, value]), '전체 리그', getControl('league').value || settings.league);
          setPicker('nation', [...(data.facets?.nationalities ?? [])].sort().map(value => [value, value]), '전체 국적', getControl('nation').value || settings.nation);
          setPicker('trait', data.traits.map(trait => [trait.slug, P.label(trait.slug)]).sort((a, b) => a[1].localeCompare(b[1], 'ko')), '전체 플레이스타일', getControl('trait').value || settings.trait);
          updateClubs(getControl('club').value || settings.club);
          const growth = data.growthKnown ? ' · 성장 유형 ' + data.growthKnown.toLocaleString('ko-KR') + '명' : '';
          $('#career-data-source', scoutPanel).textContent = data.count
            ? `FCRadar FC27 · ${dateLabel(data.snapshot)} · ${data.count.toLocaleString('ko-KR')}명${growth}` : '내 선수 목록과 세이브 기록';
        } catch {
          $('#career-data-source', scoutPanel).textContent = '내 선수 목록과 세이브 기록';
        }
      })().finally(() => { state.metaPending = null; });
      return state.metaPending;
    }
    function saveWorkspace(settings, targets, notice) {
      return save(M.workspace({ ...workspace(), settings, targets }, C.normalizePlayer), notice);
    }
    async function fetchRows(settings, page, signal) {
      const current = getSquad();
      const players = getPlayers();
      if (canFetch) {
        const status = await fetch('/api/status', { cache: 'no-store', signal }).then(response => response.ok ? response.json() : null).catch(() => null);
        if (status?.app === 'touchline-fc27') {
          const { career, notes, ...squad } = current;
          const compact = players.map(({ notes, imageUrl, ...player }) => player);
          const response = await fetch('/api/career/scout', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Touchline-Token': status.token }, signal,
            body: JSON.stringify({ settings, page, context: { players: compact, squad }, targets: workspace().targets }),
          });
          if (response.status !== 404) {
            const body = await response.json();
            if (!response.ok) throw new Error(body.error?.message ?? '후보를 불러오지 못했어요.');
            for (const row of body.rows) if (!row.player.imageUrl) row.player.imageUrl = findPlayer(row.player.id)?.imageUrl ?? '';
            return body;
          }
          if (status.catalogCount && settings.scope === 'market') throw new Error('선수 추천에 연결하려면 터치라인을 다시 실행해주세요.');
        }
      }
      if (settings.scope === 'market' && (settings.careerClub || settings.gender)) {
        throw new Error('구단·리그 분류는 시작.cmd로 연 로컬 선수 DB에서 사용할 수 있어요.');
      }
      return R.scout({ input: settings, page, squad: current, players, saved: workspace().targets });
    }
    async function search(settings, page = 1) {
      state.request?.abort();
      const controller = new AbortController();
      state.request = controller;
      const button = $('#career-search-button', scoutPanel);
      button.disabled = true;
      button.textContent = '후보 비교 중…';
      addWarning('');
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
        const response = await fetchRows(settings, page, signal);
        if (state.request !== controller) return;
        const previous = state.selected;
        const criteria = state.result?.settings;
        state.result = response;
        state.selected = response.rows.some(row => row.player.id === state.selected) ? state.selected : response.rows[0]?.player.id ?? null;
        if (previous !== state.selected || ['position', 'deployment', 'focus', 'query'].some(key => settings[key] !== criteria?.[key])) {
          state.reportTab = defaultReport(settings);
          state.growthScenario = '';
        }
        renderScouting();
      } catch (error) {
        if (state.request !== controller) return;
        state.result = null;
        renderScouting();
        addWarning(error.message || '후보를 불러오지 못했어요.');
      } finally {
        if (state.request === controller) {
          state.request = null;
          button.disabled = false;
          button.innerHTML = icon('search') + '후보 찾기';
        }
      }
    }

    function sync() {
      const squad = getSquad();
      const current = workspace();
      const signature = JSON.stringify(current.settings);
      if (squad.id !== state.squadId) {
        state.request?.abort();
        state.request = null;
        $('#career-search-button', scoutPanel).disabled = false;
        $('#career-search-button', scoutPanel).innerHTML = icon('search') + '후보 찾기';
        state.squadId = squad.id;
        state.loadedSettings = '';
        state.result = null;
        state.selected = null;
        state.growthScenario = '';
        state.compare.clear();
        addWarning('');
      }
      if (signature !== state.loadedSettings) {
        state.loadedSettings = signature;
        restore(current.settings);
      } else {
        const selected = getControl('slotId').value;
        getControl('slotId').innerHTML = options({ '': '포지션 직접 지정', ...Object.fromEntries(
          squad.slots.map(slot => [slot.id, slotLabel(slot)])) }, selected);
      }
      renderScouting();
      renderLists();
      renderTransfers();
      renderStaff();
    }
    function enter() {
      sync();
      loadMeta();
    }
    function setTab(tab) {
      state.tab = tab;
      for (const button of view.querySelectorAll('[data-career-tab]')) {
        const active = button.dataset.careerTab === tab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      scoutPanel.hidden = tab !== 'scout';
      listsPanel.hidden = tab !== 'lists';
      transfersPanel.hidden = tab !== 'transfers';
      staffPanel.hidden = tab !== 'staff';
      $('#career-eleven', view).hidden = tab !== 'eleven';
      if (tab === 'scout') renderScouting();
      if (tab === 'lists') renderLists();
      if (tab === 'transfers') renderTransfers();
      if (tab === 'staff') renderStaff();
    }

    const foot = { Left: '왼발', Right: '오른발', Both: '양발' };
    function roleText(level) {
      return level == null ? '숙련도 미확인' : level === 0 ? '기본 역할' : 'Role' + '+'.repeat(level);
    }
    function compareButton() {
      return action('show-compare', '후보 비교 ' + state.compare.size + '/3', '', state.compare.size < 2);
    }
    function defaultReport(settings) {
      if (settings.deployment === 'conversion') return 'conversion';
      return settings.focus === 'youth' || settings.query ? 'future' : 'tactics';
    }
    function candidate(row, selected, context) {
      const { player, report } = row;
      const record = targetFor(player.id);
      const active = selected === player.id;
      const rating = report?.fit.estimate;
      const settings = context === 'scout' ? state.result.settings : row.settings;
      const growth = report?.development;
      const prospect = settings.focus === 'youth' || settings.query;
      const growthDetails = growth && prospect ? [
        growth.origin?.label,
        growth.peak ? '전성기 ' + peakLabel(growth.peak) : '',
        growth.gap == null ? '' : 'POT 여지 ' + signed(growth.gap),
      ].filter(Boolean).join(' · ') : '';
      const conversion = settings.deployment === 'conversion' && report?.fit.kind === 'other'
        ? player.positions[0] + ' → ' + settings.position + ' · ' + signed(report.delta) + ' OVR' : '';
      const age = growth?.age ?? player.age;
      return `<button type="button" class="career-candidate${active ? ' active' : ''}" data-career-select="${esc(player.id)}" aria-pressed="${active}">
        ${avatar(player)}
        <span class="career-candidate-name"><b>${esc(player.name)}</b>
          <small>${esc(rankMarkup(player))} · ${player.positions.join(' / ')}${age == null ? '' : ' · ' + age + '세'}</small>
          ${context === 'list' ? `<small>${M.LISTS[record?.list] ?? ''} · ${record?.observation?.reports?.length ?? 0}/4 확인</small>` :
            `<small>${R.ROUTE_LABELS[report?.route] ?? ''}${report?.role.level > 0 ? ' · ' + roleText(report.role.level) : ''}${report?.budget === 'unknown' ? ' · 금액 확인 필요' : ''}</small>`}
          ${growthDetails ? `<small class="career-candidate-insight">${esc(growthDetails)}</small>` : ''}
          ${conversion ? `<small class="career-candidate-insight">${esc(conversion)}</small>` : ''}
        </span>
        <span class="career-candidate-ovr"><b>${rating ?? '—'}</b><small>${context === 'list' ? 'OVR' : '포지션 OVR'}</small></span>
        <span class="career-candidate-pot"><b>${report?.potential ?? player.potential ?? '—'}</b><small>POT</small></span>
      </button>`;
    }
    function budgetText(result) {
      const parts = [];
      if (result.overBudget) parts.push('한도 초과 ' + result.overBudget.toLocaleString('ko-KR') + '명 제외');
      if (result.unknownBudget) parts.push('금액 미확인 ' + result.unknownBudget.toLocaleString('ko-KR') + '명 ' + (result.settings.allowUnknown ? '포함' : '제외'));
      return parts.join(' · ');
    }
    function renderScouting() {
      const scroll = $('.career-candidate-list', results)?.scrollTop ?? 0;
      const result = state.result;
      if (!result) {
        results.innerHTML = `<section class="panel career-span">${empty('영입할 자리를 골라보세요', '포지션과 FC IQ 역할을 고르고 후보 찾기를 누르면 스카우트 보고서를 비교할 수 있어요.')}</section>`;
        return;
      }
      const { settings } = result;
      const matched = result.rows.find(row => row.player.id === state.selected);
      const budget = budgetText(result);
      const visible = settings.scope === 'academy' ? action('add-academy', '유스 선수 기록') : '';
      const role = settings.role && C.FC_IQ.getRole(settings.position, settings.role);
      const comparison = `<div class="career-section-heading">
        <div><h3>${esc(positionLabel(settings.position))} <span>${result.total.toLocaleString('ko-KR')}명</span></h3>
        <p>${esc([result.career?.club, role?.name, R.GOALS[settings.focus], settings.focus === 'youth' && seasonOptions[settings.growthSeasons], settings.deployment === 'conversion' && '사파 전환', M.WINDOWS[settings.window]].filter(Boolean).join(' · '))}</p></div>
        <div class="career-inline">${visible}${compareButton()}</div>
      </div>`;
      const pagination = result.pages > 1 ? `<div class="career-pagination">
        ${action('prev', '이전', '', result.page <= 1)}
        <span>${result.page.toLocaleString('ko-KR')} / ${result.pages.toLocaleString('ko-KR')}</span>
        ${action('next', '다음', '', result.page >= result.pages)}
      </div>` : '';
      results.innerHTML = `<section class="panel career-results" aria-label="추천 후보">
        ${comparison}
        <div class="career-results-tools">${field('정렬', select('careerSort', sorts, settings.sort))}${budget ? `<p class="career-hint">${esc(budget)}</p>` : ''}</div>
        ${result.rows.length ? `<div class="career-candidate-list">${result.rows.map(row => candidate(row, state.selected, 'scout')).join('')}</div>` :
          empty('조건에 맞는 후보가 없어요', settings.scope === 'academy' ? '세이브의 유스 선수를 기록하거나 포지션 조건을 바꿔보세요.' : '나이, 숙련도, 예산 또는 구단 단계를 조정해보세요.')}
        ${pagination}
      </section>
      ${matched ? `<section class="panel career-inspector" aria-label="스카우트 보고서">${reportMarkup(matched, settings, result.date, 'scout')}</section>` : ''}`;
      const list = $('.career-candidate-list', results);
      if (list) list.scrollTop = scroll;
    }
    function recordEntry(record, settings = workspace().settings) {
      const local = findPlayer(record.player.id);
      const player = local ? { ...record.player, ...local, profile: { ...local.profile, ...record.player.profile } } : record.player;
      const position = C.POSITIONS.includes(record.position) ? record.position :
        C.POSITIONS.includes(player.positions[0]) ? player.positions[0] : settings.position;
      const role = C.FC_IQ.getRole(position, record.role);
      const criteria = {
        ...settings, position, role: role?.id ?? '',
        roleFocus: role?.focuses.includes(record.roleFocus) ? record.roleFocus : '',
      };
      const route = record.list === 'academy' ? 'academy' : record.route === 'any' ? 'buy' : record.route;
      return { player, settings: criteria, report: R.evaluate(player, criteria, record.observation, route, criteria.gameDate || dateLabel(state.meta?.snapshot)) };
    }
    function renderLists() {
      const scroll = $('.career-candidate-list', listsPanel)?.scrollTop ?? 0;
      const records = workspace().targets;
      const tabs = { all: '전체 ' + records.length, ...M.LISTS };
      const visible = state.list === 'all' ? records : records.filter(record => record.list === state.list);
      const chosen = visible.find(record => record.player.id === state.listSelected) ?? visible[0];
      if (state.listSelected !== chosen?.player.id) state.growthScenario = '';
      state.listSelected = chosen?.player.id;
      const selected = chosen && recordEntry(chosen);
      listsPanel.innerHTML = `<div class="career-layout">
        <section class="panel career-results" aria-label="저장한 선수">
          <div class="career-section-heading"><h3>저장한 선수</h3><div class="career-inline">${action('add-academy', '유스 선수 기록')}${compareButton()}</div>
          ${menu('list', tabs, state.list)}
          ${visible.length ? `<div class="career-candidate-list">${visible.map(record => candidate(recordEntry(record), state.listSelected, 'list')).join('')}</div>` :
            empty('저장한 선수가 없어요', '스카우트 보고서에서 선수를 관심 명단에 저장할 수 있어요.')}
        </section>
        ${selected ? `<section class="panel career-inspector" aria-label="저장한 스카우트 보고서">${reportMarkup(selected, selected.settings, selected.settings.gameDate || dateLabel(state.meta?.snapshot), 'lists')}</section>` : ''}
      </div>`;
      const list = $('.career-candidate-list', listsPanel);
      if (list) list.scrollTop = scroll;
    }
    function mastered(player) {
      const values = C.FC_IQ.masteredRoles(player.profile?.roleIds);
      if (!values.length) return `<p class="career-hint">${player.profile?.roleIds ? 'DB에 등록된 Role+ / Role++ 없음' : 'DB 역할 숙련도 미확인'}</p>`;
      return `<div class="career-chips">${values.map(role => `<span>${role.position} · ${esc(role.name)} <b>${'+'.repeat(role.level)}</b></span>`).join('')}</div>`;
    }
    function tacticalReport(player, report, settings) {
      const role = report?.role;
      const depth = report?.depth;
      const skills = role?.strengths ?? [];
      return `<div class="career-metrics">
        ${metric('기준 OVR', player.overall, 'DB / 입력')}
        ${metric(settings.position + ' OVR', number(report?.fit.estimate), report?.fit.kind === 'primary' ? '주 포지션' : '스탯 기반 추정')}
        ${metric('역할 적합도', number(role?.score), '스탯 기반 추정')}
        ${metric('팀 내 순위', depth?.rank ? depth.rank + ' / ' + depth.size : '비교 자료 없음', '같은 포지션 기준')}
      </div>
      ${role ? `<div class="career-role-card"><div><b>${esc(role.name)}</b><span>${esc(C.FC_IQ.focuses[role.focus]?.name)} · ${roleText(role.level)}</span></div>
        <div class="career-chips">${skills.map(stat => `<span>${C.ATTRIBUTE_NAMES[stat.key]} <b>${stat.value}</b></span>`).join('')}</div></div>` : ''}
      ${depth?.incumbent ? `<p class="career-hint">현재 ${esc(depth.incumbent.name)} ${depth.incumbent.value} · 후보와의 OVR 차이 ${signed(depth.delta)}</p>` : ''}
      ${report?.fit.kind === 'other' ? '<p class="career-message">선호 포지션 밖이에요. 게임에서 받는 비선호 페널티는 세이브에서 확인해주세요.</p>' : ''}
      <div class="career-data-grid">
        ${metric('선호 포지션', (player.profile?.preferredPositions ?? player.positions).join(' / '))}
        ${metric('주발 · 약발 · 개인기', [foot[player.profile?.preferredFoot], player.profile?.weakFoot && player.profile.weakFoot + '★', player.profile?.skillMoves && player.profile.skillMoves + '★'].map(value => value ?? '—').join(' · '))}
        ${metric('키 · 몸무게', [player.profile?.heightCm && player.profile.heightCm + ' cm', player.profile?.weightKg && player.profile.weightKg + ' kg'].map(value => value ?? '—').join(' · '))}
      </div>
      <div class="career-report-group"><h4>FC IQ 숙련 역할</h4>${mastered(player)}</div>
      ${P.badges(player, true)}`;
    }
    function futureReport(player, _report, notes, settings) {
      const range = notes.potLow != null || notes.potHigh != null ? [notes.potLow ?? '—', notes.potHigh ?? '—'].join('–') : '미확인';
      const assessment = D.assess(player, notes, workspace().staff, settings.position, state.growthScenario);
      const { peak, origin } = assessment;
      const outlook = D.outlook(player, notes, settings.growthSeasons);
      const coach = assessment.coach;
      const coachStars = coach?.[assessment.department];
      const profileName = [origin?.label, assessment.selected?.english].filter(Boolean).join(' · ') || '미확인';
      const sourceLabel = D.PROFILE_SOURCES[origin?.source];
      const history = assessment.history;
      const change = assessment.gain == null ? '비교 자료 없음' : signed(assessment.gain) + ' OVR · ' + assessment.days + '일';
      const academy = player.id.startsWith('academy-');
      const gap = academy && notes.dynamicPot == null && (notes.potLow != null || notes.potHigh != null)
        ? [notes.potLow, notes.potHigh].map(value => value == null ? '—' : signed(Math.max(0, value - outlook.baseline))).join(' ~ ')
        : signed(outlook.gap);
      return `<div class="career-metrics">
        ${metric(notes.saveAge != null || academy ? '세이브 나이' : 'DB 나이', assessment.age == null ? '미확인' : assessment.age + '세')}
        ${academy ? metric('잠재력 범위', range, '세이브 기록') : metric('DB 잠재력', number(player.potential), '스냅샷')}
        ${metric('POT 여지', gap, player.positions[0] + ' 기준 OVR ' + outlook.baseline + (outlook.recordedBaseline ? ' · 세이브 기록' : ''))}
        ${metric('세이브 POT', number(notes.dynamicPot), '직접 기록')}
      </div>
      <div class="career-data-grid">
        ${academy ? '' : metric('스카우트 잠재력 범위', range, '세이브 기록')}
        ${metric('성장 유형', profileName, sourceLabel)}
        ${metric('전성기 나이', peakLabel(peak), peakTiming(assessment))}
        ${metric(settings.position + ' 담당 수석 코치', coach ? coach.name : '미지정', D.DEPARTMENTS[assessment.department] + (coachStars ? ' · ' + coachStars + '★' : ''))}
        ${metric('현재 성장 단계', notes.developmentPhase || assessment.phase || '미확인')}
      </div>
      <div class="career-growth-card">
        ${field('성장 유형 비교', select('careerGrowthScenario', { '': '선수의 성장 유형', ...profileChoices }, state.growthScenario))}
        ${peak ? growthTrack(peak, assessment.age) : ''}
        ${assessment.selected ? `<p class="career-hint">${esc(assessment.selected.description)}
          ${origin.url ? source(origin.url, sourceLabel) + ' · ' : ''}${source(D.SOURCES.profiles, '전성기 자료')}</p>` :
          '<p class="career-hint">전성기를 확인할 수 있는 성장 유형이 없어요. 세이브에서 확인한 유형은 보고서에 기록할 수 있어요.</p>'}
      </div>
      ${settings.focus === 'youth' ? `<div class="career-data-grid">
        ${metric('육성 기간 내 전성기', outlook.overlap == null ? '미확인' : outlook.overlap + '년', seasonOptions[outlook.seasons] + ' 기준 · ' + (peakTiming(outlook) || '유형 미확인'))}
        ${metric('육성 추천 가점', '+' + outlook.bonus, 'POT 여지와 선수의 전성기 구간 반영')}
      </div>` : ''}
      <div class="career-data-grid">
        ${metric('기록된 기준 OVR 변화', change, settings.position + '의 최근 평가 2회')}
        ${metric('1년 뒤 기준 OVR 추정', number(assessment.projection), '기록된 변화 속도 기준')}
      </div>
      <p class="career-hint">코치의 별 등급은 잠재력 평가의 정확도에 영향을 줘요. 폼과 꾸준한 경기 성과에 따라 세이브의 잠재력이 바뀔 수 있어요. ${source(D.SOURCES.ea, 'EA 성장·코칭 안내')}</p>
      ${history.length ? `<details class="career-more"><summary>성장 평가 이력 · ${history.length}건</summary><ul class="career-history">
        ${[...history].reverse().map(point => `<li><time>${esc(point.date)}</time><span>OVR ${point.overall}${point.potentialLow != null || point.potentialHigh != null ? ' · POT ' + (point.potentialLow ?? '—') + '–' + (point.potentialHigh ?? '—') : ''}${point.assessor ? ' · ' + esc(point.assessor) + (point.stars ? ' ' + point.stars + '★' : '') : ''}</span></li>`).join('')}
      </ul></details>` : ''}`;
    }
    function supportState(player,settings) {
      const current=getSquad();
      const payload={playerId:player.id,settings,context:{players:getPlayers(),squad:current},targets:workspace().targets};
      const key=JSON.stringify(payload);
      if(state.support?.key===key)return state.support;
      const entry={key,loading:canFetch,plans:[],error:''};
      state.support=entry;
      if(!canFetch){
        entry.plans=R.conversionSupport({player,settings,squad:current,players:getPlayers(),saved:workspace().targets});
        return entry;
      }
      (async()=>{
        try{
          const status=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(response=>response.json());
          const response=await fetch('/api/career/support',{method:'POST',
            headers:{'Content-Type':'application/json','X-Touchline-Token':status.token},
            body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error?.message??'커버 후보를 불러오지 못했어요.');
          entry.plans=data.plans;
        }catch(error){entry.error=error.message;}
        entry.loading=false;
        if(state.support===entry&&state.reportTab==='conversion'){
          if(state.tab==='scout')renderScouting();
          if(state.tab==='lists')renderLists();
        }
      })();
      return entry;
    }
    function supportMarkup(plan,entry,settings) {
      if(entry.loading)return '<p class="career-hint" role="status">내 팀의 커버 선수와 영입 후보를 비교하고 있어요…</p>';
      if(entry.error)return '<p class="career-hint">'+esc(entry.error)+'</p>'+action('retry-support','커버 후보 다시 찾기');
      const support=entry.plans.find(row=>row.position===plan.position)?.support;
      if(!support)return '';
      const stats=row=>row.stats.map(stat=>C.ATTRIBUTE_NAMES[stat.key]+' '+number(stat.value)).join(' · ');
      const local=support.current.map(row=>`<li><b>${esc(row.player.name)}</b><span>${row.position} · ${esc(row.role.name)} · ${esc(row.placement)}</span>
        <small>${row.sufficient?'커버 기준 충족':row.available?'보완 필요':'출전 상태 확인 필요'} · ${esc(stats(row))}</small></li>`).join('');
      const recruits=support.recruits.map(row=>`<li><b>${esc(row.player.name)}</b><span>${row.position} · ${esc(row.report.role.name)} · 추천 ${row.report.score}</span>
        <small>${esc(stats(row))}</small><small>영입 참고액 ${currency(row.report.finance.upfront,settings.currency)} · 주급 ${currency(row.report.finance.weeklyWage,settings.currency)}</small>
        <button class="btn secondary small" type="button" data-career-support-player="${esc(row.player.id)}" data-support-position="${plan.position}">선수 상세</button></li>`).join('');
      return `<section class="career-cover"><h4>${esc(support.label)}</h4>
        <p class="career-hint">내 팀 · ${support.status==='covered'?'커버 후보 있음':support.status==='weak'?'커버 능력 보완 필요':'커버 선수 부족'}</p>
        ${local?'<ul>'+local+'</ul>':'<p class="career-hint">현재 선발·후보에서 배치 가능한 커버 선수를 찾지 못했어요.</p>'}
        ${recruits?'<h4>함께 볼 영입 후보</h4><ul>'+recruits+'</ul>':''}
        ${support.message?'<p class="career-hint">'+esc(support.message)+'</p>':''}
        <small class="career-hint">커버 평가는 핵심 능력치와 출전 상태를 기준으로 한 전술 추정이에요.</small></section>`;
    }
    function conversionReport(player, settings, notes, active) {
      const plans = R.conversionPlans(player, settings, getSquad(), findPlayer, notes);
      if (!plans.length) {
        return '<p class="career-hint">필드 선수의 주 포지션과 세부 능력치가 있어야 사파 전환안을 비교할 수 있어요.</p>';
      }
      const entry = active ? supportState(player,settings) : {loading:false,plans:[]};
      const record = targetFor(player.id);
      const chips = stats => stats.map(({ key, value }) => `<span>${C.ATTRIBUTE_NAMES[key]} <b>${value}</b></span>`).join('');
      return `<p class="career-hint">현재 DB의 선호 포지션 밖에서 비교한 결과예요. 게임의 비선호 페널티와 육성 계획의 전환 기간은 세이브에서 확인하세요.</p>
      <div class="career-conversions">${plans.map((plan, index) => {
        const assigned = record?.position === plan.position && record.role === plan.role.id && record.roleFocus === plan.role.focus;
        const head = `<span><strong>${player.positions[0]} → ${plan.position}</strong><small>${esc(plan.role.name)} · ${esc(C.FC_IQ.focuses[plan.role.focus]?.name)}</small></span>
          <span class="career-conversion-ovr"><b>${plan.ovr}</b><small>${signed(plan.delta)} OVR</small></span>`;
        const use = C.FC_IQ.getRole(plan.position, plan.role.id)?.description;
        const body = `<div class="career-conversion-body">
          <div class="career-conversion-context"><b data-level="${plan.level}">${R.CONVERSION_LEVELS[plan.level]}</b>
            <span>${plan.role.score == null ? '역할 적합도 미확인' : '역할 적합도 ' + plan.role.score}${plan.role.level > 0 ? ' · ' + roleText(plan.role.level) : ''}</span>
            ${plan.incumbent ? `<span>${esc(plan.incumbent.name)} 대비 ${signed(plan.squadDelta)}</span>` : plan.slotId ? '<span>빈 자리 시험 가능</span>' : ''}
          </div>
          <p>${esc(use)} ${esc(plan.cover)}</p>
          ${plan.role.strengths.length ? `<div class="career-chips"><strong>활용 능력</strong>${chips(plan.role.strengths.slice(0, 3))}</div>` : ''}
          ${plan.weakness.length ? `<div class="career-chips"><strong>보완할 능력</strong>${chips(plan.weakness)}</div>` : ''}
          ${!plan.slotId ? `<p class="career-hint">${esc(plan.blocked || '포메이션에 ' + plan.position + ' 자리가 필요해요.')}</p>` : ''}
          ${supportMarkup(plan,entry,settings)}
          <div class="career-inline">
            <button type="button" class="btn primary small" data-career-convert="${plan.position}" data-convert-action="try"${plan.slotId ? '' : ' disabled'}>시험 배치</button>
            <button type="button" class="btn secondary small" data-career-convert="${plan.position}" data-convert-action="save"${assigned ? ' disabled' : ''}>${assigned ? '전환안 저장됨' : '전환안 저장'}</button>
          </div>
        </div>`;
        return `<details class="career-conversion"${index === 0 ? ' open' : ''}><summary>${head}</summary>${body}</details>`;
      }).join('')}</div>`;
    }
    function growthTrack(peak, age = null) {
      const pct = years => Math.max(0, Math.min(100, (years - 15) * 100 / 23));
      return `<div class="career-growth-track" aria-label="전성기 ${peak.join('세에서 ')}세">
        <span class="career-growth-peak" style="left:${pct(peak[0])}%;width:${pct(peak[1]) - pct(peak[0])}%"></span>
        ${age == null ? '' : `<i class="career-growth-age" style="left:${pct(age)}%" title="현재 ${age}세"></i>`}
      </div><div class="career-growth-ages" aria-hidden="true"><span>15세</span><span>전성기 ${peak.join('–')}세</span><span>38세</span></div>`;
    }
    function financeReport(player, report, notes, settings, gameDate) {
      const f = report?.finance;
      const code = settings.currency;
      const expiry = f?.contract ?? R.contract(player, notes, gameDate);
      const feeLabel = { save: '세이브 기록', free: '자유계약 기준', market: 'DB 시장가 기준' };
      return `<div class="career-metrics">
        ${metric('시장가', currency(f?.marketValue, code), 'DB 기준')}
        ${metric('현재 주급', currency(f?.dbWage, code), 'DB 기준')}
        ${metric('영입비 참고액', currency(f?.upfront, code), feeLabel[f?.feeSource] ?? '협상 확인')}
        ${metric('주급 참고액', currency(f?.weeklyWage, code), f?.wageSource === 'save' ? '세이브 기록' : f?.wageSource === 'db' ? 'DB 기준' : '협상 확인')}
      </div>
      <div class="career-data-grid">
        ${metric('계약 만료', expiry.exact || expiry.year || '미확인', expiry.exact ? '세이브 기록' : 'DB 만료 연도')}
        ${metric('바이아웃', currency(f?.releaseClause, code))}
        ${metric('이적 관심도', labels[notes.interest] ?? '미확인', '세이브 기록')}
      </div>
      ${report?.path ? `<p class="career-hint">${esc(report.path)}</p>` : ''}
      ${expiry.approaching ? '<p class="career-hint">만료 접근 후보예요. 사전계약 가능 시점은 게임에서 확인하세요.</p>' : ''}
      <div class="career-data-grid">${metric('게임 xTV', currency(notes.currency === code ? notes.xTV : null, code), '세이브 기록')}</div>
      <p class="career-hint">실제 이적료, 주급과 경쟁 구단은 세이브의 협상 상황에 따라 달라져요.</p>`;
    }
    function statusReport(report, notes, settings) {
      const stats = [notes.games, notes.goals, notes.assists].map(value => value ?? '—').join(' / ');
      return `<div class="career-metrics">
        ${metric(settings.position + ' Dynamic OVR', number(report?.dynamicOvr), '세이브 기록')}
        ${metric('폼', M.FORM[notes.form] ?? '미확인')}
        ${metric('사기', M.MORALE[notes.morale] ?? '미확인')}
        ${metric('경기 체력', M.FITNESS[notes.fitness] ?? '미확인')}
      </div>
      <div class="career-data-grid">
        ${metric('부상 · 회복', [M.INJURY[notes.injury], notes.injuredWeeks != null ? notes.injuredWeeks + '주' : ''].filter(Boolean).join(' · ') || '미확인')}
        ${metric('에너지', notes.energy == null ? '미확인' : notes.energy + '%')}
        ${metric('출전 / 골 / 도움', stats)}
        ${metric('출전 시간', notes.minutes == null ? '미확인' : notes.minutes + '분')}
        ${metric('계약상 선수단 역할', M.SQUAD_ROLES[notes.squadRole] ?? '미확인')}
        ${metric('이적 관심도', M.LEVELS[notes.interest] ?? '미확인')}
      </div>
      ${notes.notes ? `<p class="career-saved-note">${esc(notes.notes)}</p>` : ''}`;
    }
    function reportMarkup(row, settings, gameDate, panel) {
      const { player, report } = row;
      const record = targetFor(player.id), notes = record?.observation ?? {};
      const tab = state.reportTab;
      const contents = {
        future: futureReport, finance: financeReport,
        status: (_player, report, notes, settings) => statusReport(report, notes, settings),
        conversion: (player, _report, notes, settings) => conversionReport(player, settings, notes, panel === state.tab),
      };
      const body = tab === 'tactics' ? tacticalReport(player, report, settings) : contents[tab](player, report, notes, settings, gameDate);
      const reviewable = Object.hasOwn(M.REPORTS, tab);
      const assigned = workspace().staff.find(row => row.id === notes.scoutId);
      const experience = notes.scoutExperience ?? assigned?.experience;
      const judgement = notes.scoutJudgement ?? assigned?.judgement;
      const staff = [assigned?.name || notes.scout, experience && '경험 ' + experience + '★', judgement && '판단력 ' + judgement + '★'].filter(Boolean).join(' · ');
      return `<div class="career-report-head">
        ${avatar(player)}
        <div><h3>${esc(player.name)}</h3><p>${esc([rankMarkup(player), player.profile?.league, player.nationality].filter(Boolean).join(' · '))}</p></div>
        ${report ? `<div class="career-fit-score"><b>${report.score}</b><small>추천 점수</small></div>` : ''}
      </div>
      ${menu('report', reportTabs, tab)}
      ${reviewable ? `<div class="career-report-status"><span>${reportTabs[tab]} · ${stageLabel(record ?? {}, tab)}</span>${staff ? `<span>${esc(staff)}</span>` : ''}</div>` : ''}
      <div class="career-report-body">${body}</div>
      <div class="career-report-actions">
        ${record ? field('저장 명단', select('careerList', M.LISTS, record.list)) : action('save-target', '관심 명단에 추가', 'primary')}
        ${action('observe', '보고서 기록')}
        ${reviewable ? action('mark-report', stageLabel(record ?? {}, tab) === '확인함' ? '확인 해제' : '보고서 확인') : ''}
        ${action('compare', state.compare.has(player.id) ? '비교에서 빼기' : '비교에 추가')}
        ${action('profile', '선수 프로필')}
        ${record?.list === 'academy' ? '' : action('offer', record?.deal ? '협상 수정' : '협상 기록')}
        ${record && !record.deal ? action('remove-target', '기록 삭제') : ''}
      </div>`;
    }
    function nextTask(deal) {
      if (deal.disposition !== 'open') return M.DISPOSITION[deal.disposition];
      if (deal.enquiry === 'declined') return '문의 결과 확인';
      if (deal.clubTalk === 'declined' || deal.playerTalk === 'declined') return '결렬 사유 확인';
      if (deal.clubTalk === 'counter' || deal.playerTalk === 'counter') return '수정 조건 검토';
      const needsClub = deal.direction !== 'renewal' && !['free', 'precontract'].includes(deal.route);
      if (deal.playerTalk === 'agreed' && (!needsClub || deal.clubTalk === 'agreed')) return '최종 합의 확인';
      if (deal.direction === 'renewal') return '재계약 조건 검토';
      if (deal.enquiry === 'planned') return '영입·이적 문의';
      if (deal.enquiry === 'sent') return '문의 응답 확인';
      return needsClub ? '구단 및 선수 조건 협상' : '선수 조건 협상';
    }
    function dealSummary(offer, settings) {
      const totals = M.amounts(offer);
      const code = offer.currency;
      const incoming = offer.direction !== 'outgoing';
      const budget = incoming && code === settings.currency && offer.timing === 'now' ? settings.feeLimit : null;
      const wageLimit = incoming && code === settings.currency ? settings.wageLimit : null;
      const balance = budget == null || !totals.cashKnown ? null : budget - totals.upfront;
      const wageBalance = wageLimit == null || totals.wage == null ? null : wageLimit - totals.wage;
      const terms = [
        totals.totalWages != null ? metric('기간 내 주급 합계', currency(totals.totalWages, code), '조건부 인상·인하 별도') : '',
        totals.deferred ? metric('분할 지급', currency(totals.deferred, code), totals.installments + '회 · 회당 ' + currency(totals.perInstallment, code) + (totals.installmentRemainder ? ' · 잔액 마지막 회차' : '')) : '',
        totals.bonuses ? metric('조건부 보너스', currency(totals.bonuses, code), '합계 상한') : '',
        totals.option ? metric('완전 영입 옵션', currency(totals.option, code), '행사 시 별도') : '',
        balance != null ? metric('선지급 후 예산', currency(balance, code), balance < 0 ? '예산 초과' : '현재 창 기준') : '',
        wageBalance != null ? metric('계약 후 주급 여력', currency(wageBalance, code), wageBalance < 0 ? '주급 한도 초과' : '개별 계약 기준') : '',
      ];
      return `<div class="career-metrics">
        ${metric(incoming ? '선지급액' : '즉시 수입', totals.cashKnown ? currency(totals.upfront, code) : '미입력')}
        ${metric(incoming ? '확정금 합계' : '확정 수입', totals.cashKnown ? currency(totals.guaranteed, code) : '미입력', '주급·조건부 금액 별도')}
        ${metric(totals.loan ? '분담 주급' : '주급', currency(totals.wage, code))}
        ${metric('합류·이동 시점', M.TIMING[offer.timing])}
      </div>${terms.some(Boolean) ? `<div class="career-data-grid">${terms.join('')}</div>` : ''}`;
    }
    function offerDetails(record, settings) {
      const offer = record.deal;
      let finances;
      try { finances = dealSummary(offer, settings); } catch (error) { finances = `<p class="career-message">${esc(error.message)}</p>`; }
      return `<section class="panel career-inspector" aria-label="협상 상세">
        <div class="career-report-head">${avatar(record.player)}<div><h3>${esc(record.player.name)}</h3>
          <p>${M.DIRECTIONS[offer.direction]} · ${offer.direction === 'renewal' ? '계약 연장' : M.ROUTES[offer.route]} · ${nextTask(offer)}</p></div></div>
        <div class="career-data-grid">
          ${metric('이적 문의', offer.direction === 'renewal' ? '재계약' : M.ENQUIRY[offer.enquiry])}
          ${metric('구단 조건', M.TALKS[offer.clubTalk])}
          ${metric('선수 조건', M.TALKS[offer.playerTalk])}
          ${metric('협상 담당', offer.delegate ? '디렉터에게 위임' : '직접 협상')}
          ${metric('협상 긴장도', offer.tension == null ? '미기록' : offer.tension + '%', '세이브 기록')}
          ${metric('경쟁 구단', offer.competingClub || '미기록')}
          ${metric('선수단 역할', M.SQUAD_ROLES[offer.squadRole] ?? '미입력')}
        </div>
        ${finances}
        ${offer.bonusTerms || offer.notes ? `<p class="career-saved-note">${esc([offer.bonusTerms, offer.notes].filter(Boolean).join('\n'))}</p>` : ''}
        ${offer.history.length ? `<details class="career-more"><summary>협상 이력 · ${offer.history.length}건</summary><ul class="career-history">
          ${[...offer.history].reverse().map(entry => `<li><time>${esc(entry.date || '날짜 미입력')}</time><span>${esc(entry.label)}</span></li>`).join('')}</ul></details>` : ''}
        <div class="career-report-actions">${action('offer', '협상 수정', 'primary')}${action('profile', '선수 프로필')}</div>
      </section>`;
    }
    function renderTransfers() {
      const { settings, targets } = workspace();
      const deals = targets.filter(record => record.deal);
      const open = deals.filter(record => record.deal.disposition === 'open');
      const completed = deals.filter(record => record.deal.disposition !== 'open');
      const active = state.transferTab === 'history' ? completed : state.transferTab === 'negotiations' ? open : [];
      const contractView = state.transferTab === 'contracts';
      const selected = active.find(record => record.player.id === state.transferSelected) ?? active[0];
      state.transferSelected = selected?.player.id;
      const currencyMatch = open.filter(record => record.deal.currency === settings.currency && record.deal.direction === 'incoming');
      let commitments = 0, weekly = 0, unknown = 0;
      for (const record of currencyMatch) {
        try {
          const totals = M.amounts(record.deal);
          if (record.deal.timing === 'now' && totals.cashKnown) commitments += totals.upfront;
          weekly += totals.wage ?? 0;
          if (!totals.cashKnown || totals.wage == null) unknown++;
        } catch { unknown++; }
      }
      const cash = settings.feeLimit == null ? '미설정' : currency(settings.feeLimit, settings.currency);
      const wage = settings.wageLimit == null ? '미설정' : currency(settings.wageLimit, settings.currency);
      const market = settings.window === 'open' ? '' : `<p class="career-message">${M.WINDOWS[settings.window]}. 협상 기록의 합류 시점과 게임 내 가능 여부를 확인하세요.</p>`;
      transfersPanel.innerHTML = `<div class="panel career-transfer-overview">
        <div class="career-section-heading"><div><h3>${esc(settings.careerClub || '현재 커리어')}의 이적시장</h3><p>${esc([settings.gameDate, M.WINDOWS[settings.window], M.CURRENCIES[settings.currency]].filter(Boolean).join(' · '))}</p></div></div>
        <div class="career-metrics">
          ${metric('이적 예산', cash)}
          ${metric('주급 여력', wage)}
          ${metric('협상 중 선지급액', currency(commitments, settings.currency), '즉시 합류·입력 금액 합계')}
          ${metric('협상 중 추가 주급', currency(weekly, settings.currency), '입력 금액 합계')}
        </div>
        ${unknown ? `<p class="career-hint">진행 중인 영입 ${unknown}건의 이적료 또는 주급이 미입력이에요.</p>` : ''}
        ${market}
      </div>
      ${menu('transfer', { negotiations: '진행 중 ' + open.length, contracts: '계약과 조항', history: '이적 이력 ' + completed.length }, state.transferTab)}
      ${contractView ? contractsMarkup(settings) : `<div class="career-layout">
        <section class="panel career-results">
          ${active.length ? `<div class="career-candidate-list">${active.map(record => `<button type="button" class="career-candidate${record === selected ? ' active' : ''}" data-career-deal="${esc(record.player.id)}" aria-pressed="${record === selected}">
            ${avatar(record.player)}<span class="career-candidate-name"><b>${esc(record.player.name)}</b><small>${M.DIRECTIONS[record.deal.direction]} · ${esc(record.deal.date || '날짜 미입력')}</small></span>
            <span class="career-transfer-task">${nextTask(record.deal)}</span></button>`).join('')}</div>` :
            empty(state.transferTab === 'history' ? '완료한 거래가 없어요' : '진행 중인 협상이 없어요', '선수 보고서에서 협상 기록을 만들 수 있어요.')}
        </section>
        ${selected ? offerDetails(selected, settings) : ''}
      </div>`}`;
    }
    function contractsMarkup(settings) {
      const roster = C.allSlots(getSquad()).map(slot => findPlayer(slot.playerId)).filter(Boolean);
      const rows = roster.map(player => {
        const notes = targetFor(player.id)?.observation ?? {};
        const expiry = R.contract(player, notes, settings.gameDate || dateLabel(state.meta?.snapshot));
        return { player, notes, expiry };
      }).sort((a, b) => (a.expiry.exact || String(a.expiry.year ?? 9999)).localeCompare(b.expiry.exact || String(b.expiry.year ?? 9999)));
      return `<section class="panel career-results">
        <div class="career-section-heading"><div><h3>현재 선수단 계약</h3><p>선수를 골라 재계약이나 방출 조건을 기록하세요.</p></div></div>
        ${rows.length ? `<div class="career-contract-list">${rows.map(({ player, notes, expiry }) => `<div class="career-contract-row">
          ${avatar(player)}<div><b>${esc(player.name)}</b><small>${player.positions.join(' / ')}${expiry.approaching ? ' · 만료 접근' : ''}</small></div>
          ${metric('계약 만료', expiry.exact || expiry.year || '미확인')}
          ${metric('바이아웃', currency((notes.currency === settings.currency ? notes.releaseClause : null) ?? player.profile?.releaseClause?.[settings.currency], settings.currency))}
          <button type="button" class="btn secondary small" data-career-renew="${esc(player.id)}">계약 관리</button>
        </div>`).join('')}</div>` : empty('배치된 선수가 없어요', '스쿼드 보드에 선수를 배치하면 여기에 계약이 표시돼요.')}
      </section>`;
    }

    function renderStaff() {
      const { staff, settings } = workspace();
      const hired = staff.filter(row => row.status === 'hired');
      const coaches = hired.filter(row => row.type === 'coach');
      const visible = staff.filter(row => state.staffFilter === 'all' || state.staffFilter === row.type)
        .sort((a, b) => Number(b.status === 'hired') - Number(a.status === 'hired') || a.name.localeCompare(b.name, 'ko'));
      const cards = Object.entries(D.DEPARTMENTS).map(([key, label]) => {
        const department = coaches.filter(row => row.department === key);
        const head = department.find(row => row.head);
        return `<article class="career-staff-department">
          <div><h4>${label} 코치</h4><span>${department.length}명</span></div>
          <b>${esc(head?.name || '수석 코치 미지정')}</b>
          <small>${head?.[key] ? '★'.repeat(head[key]) + ' · 수석 코치' : head ? '별 등급 미입력' : '담당 부서 평가'}</small>
        </article>`;
      });
      const currencies = hired.filter(row => row.currency === settings.currency);
      const wages = currencies.reduce((total, row) => total + (row.weeklyWage ?? 0), 0);
      const missing = currencies.filter(row => row.weeklyWage == null).length;
      staffPanel.innerHTML = `<section class="panel career-staff-panel" aria-label="스태프 관리">
        <div class="career-section-heading">
          <div><h3>코칭·스카우팅 스태프</h3><p>고용한 코치 ${coaches.length}/12 · 이적 스카우트 ${hired.filter(row => row.type === 'senior').length}명 · 유스 스카우트 ${hired.filter(row => row.type === 'youth').length}명</p></div>
          ${action('add-staff', '스태프 기록', 'primary')}
        </div>
        <div class="career-staff-grid">${cards.join('')}</div>
        <p class="career-hint career-staff-wages">스태프 주급 ${currency(wages, settings.currency)} · ${M.CURRENCIES[settings.currency]} 기록 합계${missing ? ' · 주급 미입력 ' + missing + '명' : ''}</p>
        ${menu('staff-filter', { all: '전체', ...D.TYPES }, state.staffFilter)}
        ${visible.length ? `<div class="career-staff-list">${visible.map(staffRow).join('')}</div>` :
          empty('기록된 스태프가 없어요', '고용한 스태프나 영입 후보를 기록하고, 각 부서의 수석 코치를 지정할 수 있어요.')}
      </section>
      <section class="panel career-staff-guide">
        <h3>별 등급이 반영되는 곳</h3>
        <div class="career-staff-grid">
          <div><h4>부서별 수석 코치</h4><p>공격·미드필더·수비·골키퍼 코치가 담당 선수의 잠재력을 평가해요. 등급이 높을수록 실제 잠재력을 더 잘 파악해요. ${source(D.SOURCES.ea, 'EA 공식 안내')}</p></div>
          <div><h4>이적시장 스카우트</h4><p>경험은 동시에 조사할 수 있는 선수 수와 시장가 평가에 영향을 줘요. 판단력과 보고서의 확인 단계도 기록할 수 있어요. ${source(D.SOURCES.scoutCapacity, 'EA v1.1 변경점')} · ${source(D.SOURCES.scoutValues, '시장가 평가 수정')}</p></div>
          <div><h4>유스 스카우트</h4><p>경험·판단력 별 등급과 파견 국가, 임무, 비용을 기록하고 발견한 선수의 POT 범위를 비교하세요.</p></div>
        </div>
      </section>
      <section class="panel career-staff-guide">
        <h3>성장 프로필 6가지</h3>
        <p class="career-hint">유형별로 성장 속도와 전성기 나이가 달라요. 아래 나이 구간은 게임 데이터 분석을 바탕으로 표시해요. ${source(D.SOURCES.profiles, 'CMTracker 분석')}</p>
        <div class="career-profile-grid">${Object.values(D.PROFILES).map(profile => `<article class="career-growth-card">
          <div class="career-profile-title"><h4>${profile.name}</h4><small>${profile.english}</small></div>
          ${growthTrack(profile.peak)}<p class="career-hint">${profile.description}</p>
        </article>`).join('')}</div>
      </section>`;
    }
    function staffRow(row) {
      const coach = row.type === 'coach';
      const group = D.DEPARTMENTS[row.department];
      const stars = (label, count) => count ? `<span>${label} <b>${'★'.repeat(count)}</b></span>` : '';
      return `<article class="career-staff-row">
        <div><b>${esc(row.name)}</b><small>${coach ? group + ' 코치' + (row.head && row.status === 'hired' ? ' · 수석' : '') : D.TYPES[row.type]} · ${D.STATUSES[row.status]}</small>
          ${row.mission || row.country ? `<small>${esc([row.country, row.mission].filter(Boolean).join(' · '))}</small>` : ''}</div>
        <div class="career-chips">${coach ? stars(group, row[row.department]) : stars('경험', row.experience) + stars('판단력', row.judgement)}
          ${row.capacity == null ? '' : `<span>동시 조사 ${row.capacity}명</span>`}</div>
        ${metric('주급', currency(row.weeklyWage, row.currency), row.fee != null ? '고용비 ' + currency(row.fee, row.currency) : '')}
        <div class="career-inline">
          ${row.status === 'candidate' ? `<button type="button" class="btn primary small" data-career-hire="${esc(row.id)}">고용 기록</button>` : ''}
          <button type="button" class="btn secondary small" data-career-staff-edit="${esc(row.id)}">계약 수정</button>
        </div>
      </article>`;
    }
    function staffEditor(id) {
      const { staff, settings } = workspace();
      const initial = staff.find(row => row.id === id) ?? {
        id: C.uid('staff'), type: 'coach', status: 'candidate', department: 'attack', currency: settings.currency, date: settings.gameDate,
      };
      const stars = { '': '미입력', 1: '1★', 2: '2★', 3: '3★', 4: '4★', 5: '5★' };
      state.editing = { kind: 'staff', staffId: initial.id, squadId: getSquad().id };
      openDialog('스태프 계약 기록', `<form id="career-staff-form" class="career-dialog-form">
        <div class="career-fields">
          ${field('이름', input('name', initial.name, 'required maxlength="80"'))}
          ${field('직무', select('type', D.TYPES, initial.type))}
          ${field('계약 상태', select('status', D.STATUSES, initial.status))}
          ${field('고용일', input('date', initial.date, 'type="date"'))}
          ${field('통화', select('currency', M.CURRENCIES, initial.currency))}
          ${field('고용 비용', num('fee', 0, 1e10, initial.fee))}
          ${field('주급', num('weeklyWage', 0, 1e10, initial.weeklyWage))}
        </div>
        <div class="career-fields" data-staff-fields="coach">
          ${field('담당 부서', select('department', D.DEPARTMENTS, initial.department))}
          ${Object.entries(D.DEPARTMENTS).map(([key, name]) => field(name + ' 별 등급', select(key, stars, initial[key]))).join('')}
          ${field('전술 지식', input('knowledge', initial.knowledge, 'maxlength="80"'))}
          ${check('head', '수석 코치로 지정', initial.head)}
        </div>
        <div class="career-fields" data-staff-fields="scout">
          ${field('경험 별 등급', select('experience', stars, initial.experience))}
          ${field('판단력 별 등급', select('judgement', stars, initial.judgement))}
          ${field('동시 조사 가능 인원 (게임 기록)', num('capacity', 0, 1000, initial.capacity))}
          ${field('파견 국가', input('country', initial.country, 'maxlength="80"'))}
          ${field('파견 임무·기간', input('mission', initial.mission, 'maxlength="240"'))}
          ${field('파견 비용', num('missionCost', 0, 1e10, initial.missionCost))}
        </div>
        ${field('메모', `<textarea name="notes" rows="2" maxlength="1000">${esc(initial.notes)}</textarea>`)}
        <p class="career-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">취소</button>
          <button type="submit" class="btn primary">스태프 저장</button></div>
      </form>`, 'career');
      updateStaffFields($('#career-staff-form', dialog));
    }
    function updateStaffFields(form) {
      const isCoach = form.elements.namedItem('type').value === 'coach';
      for (const group of form.querySelectorAll('[data-staff-fields]')) {
        group.hidden = (group.dataset.staffFields === 'coach') !== isCoach;
        for (const control of group.querySelectorAll('input,select')) control.disabled = group.hidden;
      }
    }
    function storeStaff(raw) {
      const current = workspace();
      const staff = D.saveStaff(current.staff, raw);
      return save(M.workspace({ ...current, staff }, C.normalizePlayer), '스태프 계약을 저장했어요.');
    }
    function observationEditor(row, settings) {
      const notes = targetFor(row.player.id)?.observation ?? {};
      const employed = workspace().staff.filter(staff => staff.status === 'hired');
      const scouts = employed.filter(staff => staff.type !== 'coach');
      const relevant = employed.filter(staff => staff.type !== 'coach' || staff.department === D.department(settings.position));
      const groupOptions = list => Object.fromEntries(list.map(staff => [staff.id, staff.name + ' · ' + (staff.type === 'coach' ? D.DEPARTMENTS[staff.department] + ' 코치' : D.TYPES[staff.type])]));
      const recordedProfile = D.profile(notes.growthProfile) || notes.growthProfile;
      const catalogProfile = D.playerProfile(row.player);
      const growthProfiles = { '': catalogProfile ? 'DB 유형 사용 · ' + catalogProfile.label : '미확인', ...profileChoices };
      if (recordedProfile && !Object.hasOwn(growthProfiles, recordedProfile)) growthProfiles[recordedProfile] = recordedProfile;
      const noteSelect = (name, title, choices) => field(title, select(name, { '': '미입력', ...choices }, notes[name]));
      const noteNumber = (name, title, min, max) => field(title, num(name, min, max, notes[name]));
      state.editing = { kind: 'observe', row, settings, squadId: getSquad().id };
      openDialog('스카우트 보고서 · ' + row.player.name, `<form id="career-observe-form" class="career-dialog-form">
        <details open class="career-more"><summary>선수 상태와 시즌 성적</summary><div class="career-fields">
          ${noteNumber('dynamicOvr', '세이브 Dynamic OVR', 1, 99)}
          ${field('Dynamic OVR 포지션', select('dynamicPosition', positionOptions, notes.dynamicPosition || settings.position))}
          ${noteSelect('form', '폼', M.FORM)}${noteSelect('morale', '사기', M.MORALE)}
          ${noteSelect('fitness', '경기 체력', M.FITNESS)}${noteNumber('energy', '에너지 (%)', 0, 100)}
          ${noteSelect('injury', '부상 상태', M.INJURY)}${noteNumber('injuredWeeks', '회복까지 (주)', 0, 104)}
          ${noteSelect('interest', '이적 관심도', M.LEVELS)}${noteSelect('squadRole', '계약상 선수단 역할', M.SQUAD_ROLES)}
          ${noteNumber('games', '출전 경기', 0, 500)}${noteNumber('minutes', '출전 시간 (분)', 0, 60000)}
          ${noteNumber('goals', '득점', 0, 500)}${noteNumber('assists', '도움', 0, 500)}
        </div></details>
        <details class="career-more"><summary>성장 전망</summary><div class="career-fields">
          ${noteNumber('dynamicPot', '세이브 POT', 1, 99)}
          ${noteNumber('potLow', '스카우트 POT 하한', 1, 99)}${noteNumber('potHigh', '스카우트 POT 상한', 1, 99)}
          ${field('성장 유형', select('growthProfile', growthProfiles, recordedProfile))}
          ${field('성장 단계', input('developmentPhase', notes.developmentPhase, 'maxlength="80"'))}
          ${noteNumber('saveAge', '세이브 나이', 14, 65)}
        </div></details>
        <details class="career-more"><summary>성장 이력에 평가 추가</summary><div class="career-fields">
          ${check('trackGrowth', '이번 평가를 이력에 추가')}
          ${field('평가일', input('recordDate', settings.gameDate, 'type="date"'))}
          ${field('평가 포지션', select('growthPosition', positionOptions, settings.position))}
          ${field('평가일 기준 OVR', num('baselineOvr', 1, 99))}
          ${field('평가 스태프', select('assessorId', { '': '미지정', ...groupOptions(relevant) }, D.headCoach(employed, settings.position)?.id ?? notes.scoutId))}
        </div><p class="career-hint">같은 포지션의 기준 OVR을 날짜가 다른 두 시점에 기록하면 변화량을 비교할 수 있어요.</p></details>
        <details class="career-more"><summary>재정 평가</summary><div class="career-fields">
          ${field('기록 통화', select('currency', M.CURRENCIES, notes.currency || settings.currency))}
          ${noteNumber('xTV', '게임 xTV (예상 이적 가치)', 0, 1e10)}
          ${noteNumber('expectedFee', '확인한 이적료·임대료', 0, 1e10)}
            ${noteNumber('expectedSaleFee', '예상 매각 수령액 (수수료 차감 후)', 0, 1e10)}
          ${noteNumber('expectedWage', '확인한 제안 주급', 0, 1e8)}
          ${noteNumber('releaseClause', '바이아웃', 0, 1e10)}
          ${field('정확한 계약 만료일', input('contractDate', notes.contractDate, 'type="date"'))}
        </div></details>
        <details class="career-more"><summary>스카우트와 확인 상태</summary><div class="career-fields">
          ${field('등록된 스카우트', select('scoutId', { '': '미지정', ...groupOptions(scouts) }, notes.scoutId))}
          ${field('담당 스카우트', input('scout', notes.scout, 'maxlength="60"'))}
          ${noteNumber('scoutExperience', '경험 (별)', 1, 5)}${noteNumber('scoutJudgement', '판단력 (별)', 1, 5)}
          ${Object.entries(M.REPORTS).map(([key, label]) => check('report_' + key, label + ' 확인', notes.reports?.includes(key))).join('')}
        </div></details>
        ${field('보고서 메모', `<textarea name="notes" rows="3" maxlength="1200">${esc(notes.notes)}</textarea>`)}
        <p class="career-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">취소</button>
          <button type="submit" class="btn primary">보고서 저장</button></div>
      </form>`, 'career');
    }
    function offerEditor(row, settings, direction = 'incoming') {
      const previous = targetFor(row.player.id)?.deal;
      const initial = previous ?? M.deal({
        direction, route: Object.hasOwn(M.ROUTES, row.report?.route) ? row.report.route : 'buy',
        date: settings.gameDate, currency: settings.currency, timing: settings.window === 'open' ? 'now' : 'window',
      });
      const allRoutes = Object.fromEntries(Object.entries(M.ROUTES).filter(([key]) => key !== 'any'));
      const term = key => {
        const [max, label] = M.TERM_NUMBERS[key];
        const min = ['installments', 'years', 'loanMonths'].includes(key) ? 1 : 0;
        return field(label, num(key, min, max, initial[key]));
      };
      state.editing = { kind: 'offer', row, settings, squadId: getSquad().id };
      openDialog('이적 협상 · ' + row.player.name, `<form id="career-offer-form" class="career-dialog-form">
        <div class="career-fields">
          ${field('거래 유형', select('direction', M.DIRECTIONS, initial.direction))}
          ${field('이동 방식', select('route', allRoutes, initial.route))}
          ${field('합류·이동 시점', select('timing', M.TIMING, initial.timing))}
          ${field('통화', select('currency', M.CURRENCIES, initial.currency))}
          ${field('기록 날짜', input('date', initial.date, 'type="date"'))}
          ${field('협상 상태', select('disposition', M.DISPOSITION, initial.disposition))}
        </div>
        <details class="career-more" open><summary>협상 진행</summary><div class="career-fields">
          ${field('이적 문의', select('enquiry', M.ENQUIRY, initial.enquiry))}
          ${field('구단 조건', select('clubTalk', M.TALKS, initial.clubTalk))}
          ${field('선수 조건', select('playerTalk', M.TALKS, initial.playerTalk))}
          ${field('경쟁 구단', input('competingClub', initial.competingClub, 'maxlength="120"'))}
          ${field('협상 긴장도 (%)', num('tension', 0, 100, initial.tension))}
          ${check('delegate', '디렉터에게 위임', initial.delegate)}
        </div></details>
        <details class="career-more" open><summary>이적료와 선수 계약</summary><div class="career-fields">
          ${term('fee')}${term('deferred')}${term('installments')}
          ${term('weeklyWage')}${term('years')}${field('계약상 선수단 역할', select('squadRole', { '': '미입력', ...M.SQUAD_ROLES }, initial.squadRole))}
          ${term('signingBonus')}${term('agentFee')}${term('releaseClause')}
        </div></details>
        <details class="career-more"><summary>임대·트레이드·향후 이적 조항</summary><div class="career-fields">
          ${term('loanMonths')}${term('wageShare')}${term('buyOption')}${term('loanBackMonths')}
          ${field('교환 선수', input('swapPlayer', initial.swapPlayer, 'maxlength="120"'))}
          ${term('sellOn')}${term('buyBack')}${check('firstRefusal', '우선 협상권', initial.firstRefusal)}
        </div></details>
        <details class="career-more"><summary>성과 보너스와 주급 변동</summary><div class="career-fields">
          ${term('achievementBonus')}${term('performanceBonus')}${term('promotionRaise')}${term('relegationCut')}
        </div>${field('조건 (출전·골·도움·클린시트·팀 업적 등)', input('bonusTerms', initial.bonusTerms, 'maxlength="500"'))}</details>
        ${field('협상 메모', `<textarea name="notes" maxlength="1200" rows="2">${esc(initial.notes)}</textarea>`)}
        <div id="career-offer-preview"></div>
        <p class="career-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">취소</button>
          <button type="submit" class="btn primary">협상 저장</button></div>
      </form>`, 'career');
      updateOffer($('#career-offer-form', dialog));
    }
    function readOffer(form) {
      return {
        ...Object.fromEntries(new FormData(form)),
        delegate: form.elements.namedItem('delegate').checked,
        firstRefusal: !form.elements.namedItem('firstRefusal').disabled && form.elements.namedItem('firstRefusal').checked,
      };
    }
    function updateOffer(form) {
      const direction = form.elements.namedItem('direction').value;
      const route = form.elements.namedItem('route').value;
      const renewal = direction === 'renewal', noFee = renewal || ['free', 'precontract'].includes(route);
      const loan = !renewal && ['loan', 'loan-buy'].includes(route);
      const disable = (names, off) => {
        for (const name of names) {
          const control = form.elements.namedItem(name);
          control.disabled = off;
          control.closest('label').hidden = off;
        }
      };
      disable(['route', 'enquiry', 'competingClub'], renewal);
      disable(['clubTalk', 'fee', 'deferred', 'installments', 'swapPlayer', 'sellOn', 'buyBack', 'firstRefusal'], noFee);
      disable(['loanBackMonths'], noFee || loan);
      disable(['loanMonths', 'wageShare'], !loan);
      disable(['buyOption'], !loan || route !== 'loan-buy');
      disable(['signingBonus', 'agentFee', 'squadRole', 'promotionRaise', 'relegationCut'], direction === 'outgoing');
      const preview = $('#career-offer-preview', form);
      try {
        preview.innerHTML = dealSummary(M.deal(readOffer(form)), workspace().settings);
      } catch (error) {
        preview.innerHTML = `<p class="career-message">${esc(error.message)}</p>`;
      }
    }
    function academyEditor() {
      const youthScouts = workspace().staff.filter(row => row.type === 'youth' && row.status === 'hired');
      state.editing = { kind: 'academy', squadId: getSquad().id };
      openDialog('유스 선수 기록', `<form id="career-academy-form" class="career-dialog-form">
        <p class="career-hint">세이브의 유스 선수를 저장해 현재 선수단과 비교할 수 있어요.</p>
        <div class="career-fields">
          ${field('이름', input('name', '', 'required maxlength="80"'))}
          ${field('주 포지션', select('position', positionOptions, 'CM'))}
          ${field('나이', num('age', 14, 65))}
          ${field('기준 OVR', input('overall', '', 'type="number" required min="1" max="99" inputmode="numeric"'))}
          ${field('잠재력 하한', num('potLow', 1, 99))}
          ${field('잠재력 상한', num('potHigh', 1, 99))}
          ${field('국적', input('nationality', '', 'maxlength="60"'))}
          ${field('성장 단계', input('developmentPhase', '', 'maxlength="80"'))}
          ${field('성장 프로필', select('growthProfile', { '': '미확인', ...profileChoices }))}
          ${field('담당 유스 스카우트', select('scoutId', { '': '미지정', ...Object.fromEntries(youthScouts.map(row => [row.id, row.name])) }))}
        </div>
        ${field('스카우트 메모', '<textarea name="notes" rows="2" maxlength="1200"></textarea>')}
        <p class="career-message" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="btn secondary small" data-action="close-dialog">취소</button>
          <button type="submit" class="btn primary">유스 선수 저장</button></div>
      </form>`, 'career');
    }
    function compareEditor() {
      const current = workspace().settings;
      const criteria = state.result?.settings ?? current;
      const roster = [...state.compare.values()].map(entry => {
        const notes = targetFor(entry.player.id)?.observation ?? {};
        const report = R.evaluate(entry.player, criteria, notes, entry.report?.route ?? 'buy', criteria.gameDate || dateLabel(state.meta?.snapshot));
        return { player: entry.player, report, notes };
      });
      const heading = `<thead><tr><th scope="col">${esc(positionLabel(criteria.position))}</th>${roster.map(({ player }) =>
        `<th scope="col">${avatar(player)}<b>${esc(player.name)}</b></th>`).join('')}</tr></thead>`;
      const rows = [
        ['선호 포지션', ({ player }) => (player.profile?.preferredPositions ?? player.positions).join(' / ')],
        ['기준 OVR', ({ player }) => player.overall],
        [criteria.position + ' OVR', ({ report }) => report?.fit.estimate],
        ['역할 · 숙련도', ({ report }) => report && report.role.name + ' · ' + roleText(report.role.level)],
        ['역할 적합도', ({ report }) => report?.role.score],
        ['세이브 Dynamic OVR', ({ report }) => report?.dynamicOvr],
        ['POT', ({ report }) => report?.potential], ['POT 여지', ({ report }) => report?.growth], ['나이', ({ report, player }) => report?.development.age ?? player.age],
        ['성장 유형', ({ report, player, notes }) => (report?.development.origin ?? D.playerProfile(player, notes))?.label],
        ['전성기 나이', ({ report, player, notes }) => peakLabel((report?.development ?? D.outlook(player, notes)).peak)],
        ['시장가', ({ report }) => currency(report?.finance.marketValue, criteria.currency)],
        ['현재 주급', ({ report }) => currency(report?.finance.dbWage, criteria.currency)],
        ['영입비 참고액', ({ report }) => currency(report?.finance.upfront, criteria.currency)],
        ['계약 만료', ({ report }) => report?.finance.contract.exact || report?.finance.contract.year],
        ['이적 관심도', ({ notes }) => M.LEVELS[notes.interest]], ['경기 체력', ({ notes }) => M.FITNESS[notes.fitness]],
      ];
      openDialog('후보 비교', `<div class="career-comparison"><table>${heading}<tbody>${rows.map(([label, value]) =>
        `<tr><th scope="row">${esc(label)}</th>${roster.map(row => `<td>${esc(value(row) ?? '미확인')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, 'career');
    }
    function saveRecord(row, settings, change, message) {
      const current = workspace();
      const existing = targetFor(row.player.id);
      if (!existing && current.targets.length >= M.MAX_TARGETS) {
        throw new Error('한 스쿼드에 최대 ' + M.MAX_TARGETS + '명의 후보를 저장할 수 있어요.');
      }
      const next = {
        list: 'watch', observation: {}, deal: null, ...existing, player: row.player,
        position: existing?.position ?? settings.position,
        role: existing?.role ?? row.report?.role.id ?? settings.role,
        roleFocus: existing?.roleFocus ?? row.report?.role.focus ?? settings.roleFocus,
        route: Object.hasOwn(M.ROUTES, row.report?.route) ? row.report.route : existing?.route ?? 'buy',
        ...change,
      };
      const targets = existing ? current.targets.map(record => record === existing ? next : record) : [...current.targets, next];
      return saveWorkspace(current.settings, targets, message);
    }
    function checkPot(notes) {
      if (notes.potLow != null && notes.potHigh != null && notes.potLow > notes.potHigh) {
        throw new Error('잠재력 하한은 상한 이하여야 해요.');
      }
    }
    function saveDialog(event) {
      const form = event.target;
      const edit = state.editing;
      if (!edit || form.id !== 'career-' + edit.kind + '-form') return;
      event.preventDefault();
      const errorText = $('.career-message', form);
      try {
        if (edit.squadId !== getSquad().id) throw new Error('스쿼드가 바뀌었어요. 다시 기록해주세요.');
        const values = Object.fromEntries(new FormData(form));
        let ok;
        if (edit.kind === 'observe') {
          const previous = targetFor(edit.row.player.id)?.observation;
          const checkpoints = [...(previous?.checkpoints ?? [])];
          if (values.trackGrowth) {
            if (!values.recordDate || !values.baselineOvr) throw new Error('평가일과 해당 날짜의 기준 OVR을 입력해주세요.');
            const assessor = workspace().staff.find(staff => staff.id === values.assessorId);
            if (assessor?.type === 'coach' && D.department(values.growthPosition) !== assessor.department) {
              throw new Error('평가 포지션을 담당하는 부서의 코치를 골라주세요.');
            }
            checkpoints.push({
              date: values.recordDate, overall: values.baselineOvr, position: values.growthPosition, profile: values.growthProfile,
              potentialLow: values.potLow || (values.potHigh ? '' : values.dynamicPot),
              potentialHigh: values.potHigh || (values.potLow ? '' : values.dynamicPot),
              staffId: assessor?.id, assessor: assessor?.name,
              stars: assessor?.type === 'coach' ? assessor[assessor.department] : assessor?.judgement,
            });
          }
          const notes = M.observation({ ...values, checkpoints, reports: Object.keys(M.REPORTS).filter(key => values['report_' + key]) });
          checkPot(notes);
          ok = saveRecord(edit.row, edit.settings, { observation: notes }, '스카우트 보고서를 저장했어요.');
          if (ok && state.result) search(state.result.settings, state.result.page);
        } else if (edit.kind === 'offer') {
          const record = targetFor(edit.row.player.id);
          const next = M.saveOffer(readOffer(form), record?.deal);
          ok = saveRecord(edit.row, edit.settings, { deal: next }, '협상 조건을 저장했어요.');
          if (ok) {
            state.transferTab = next.disposition === 'open' ? 'negotiations' : 'history';
            state.transferSelected = edit.row.player.id;
            setTab('transfers');
          }
        } else if (edit.kind === 'staff') {
          ok = storeStaff({ ...values, id: edit.staffId, head: values.head === 'on' });
        } else if (edit.kind === 'academy') {
          const notes = M.observation(values);
          checkPot(notes);
          const player = C.normalizePlayer({ id: C.uid('academy'), name: values.name, positions: [values.position], age: values.age,
            overall: values.overall, club: workspace().settings.careerClub, nationality: values.nationality, source: 'custom' });
          ok = saveRecord({ player }, { ...workspace().settings, position: values.position, role: '', roleFocus: '' },
            { list: 'academy', observation: notes }, '유스 선수를 저장했어요.');
          if (ok) {
            state.list = 'academy';
            state.listSelected = player.id;
            state.growthScenario = '';
            setTab('lists');
          }
        }
        if (ok) { state.editing = null; closeDialog(); }
      } catch (error) {
        errorText.textContent = error.message;
        errorText.hidden = false;
      }
    }
    function selectedEntry() {
      if (state.tab === 'scout') {
        const row = state.result?.rows.find(entry => entry.player.id === state.selected);
        return row && { ...row, settings: state.result.settings };
      }
      const id = state.tab === 'transfers' ? state.transferSelected : state.listSelected;
      const record = targetFor(id);
      return record && recordEntry(record);
    }
    function actOnConversion(position, action) {
      const entry = selectedEntry();
      if (!entry) return;
      const { player, settings } = entry;
      const notes = targetFor(player.id)?.observation;
      const plan = R.conversionPlans(player, settings, getSquad(), findPlayer, notes).find(row => row.position === position);
      if (!plan) return;
      if (action === 'try' && plan.slotId) openProfile(player, plan.slotId, { position, role: plan.role.id, focus: plan.role.focus });
      if (action === 'save') {
        saveRecord(entry, settings, { position, role: plan.role.id, roleFocus: plan.role.focus }, position + ' 사파 전환안을 관심 명단에 저장했어요.');
      }
    }
    async function act(name) {
      if (name === 'retry-support') { state.support=null; showReport(); return; }
      if (name === 'add-staff') { staffEditor(); return; }
      if (name === 'add-academy') { academyEditor(); return; }
      if (name === 'show-compare') { compareEditor(); return; }
      if (name === 'prev' || name === 'next') {
        if (state.result) await search(state.result.settings, state.result.page + (name === 'prev' ? -1 : 1));
        return;
      }
      if (name === 'clear') {
        const current = readForm(false);
        const settings = M.options({
          careerClub: current.careerClub, careerLeague: current.careerLeague, careerStage: current.careerStage,
          gameDate: current.gameDate, currency: current.currency, window: current.window, position: current.position,
          style: current.style, feeLimit: current.feeLimit, wageLimit: current.wageLimit,
        });
        restore(settings);
        return;
      }
      const entry = selectedEntry();
      if (!entry) return;
      const { player, settings } = entry;
      if (name === 'save-target') saveRecord(entry, settings, {}, '관심 명단에 추가했어요.');
      if (name === 'observe') observationEditor(entry, settings);
      if (name === 'offer') offerEditor(entry, settings);
      if (name === 'profile') openProfile(player, state.tab === 'scout' ? settings.slotId : '');
      if (name === 'mark-report' && Object.hasOwn(M.REPORTS, state.reportTab)) {
        const previous = targetFor(player.id)?.observation ?? {};
        const reports = new Set(previous.reports);
        reports.has(state.reportTab) ? reports.delete(state.reportTab) : reports.add(state.reportTab);
        saveRecord(entry, settings, { observation: { ...previous, reports: [...reports] } }, '보고서 확인 상태를 저장했어요.');
      }
      if (name === 'compare') {
        if (state.compare.has(player.id)) state.compare.delete(player.id);
        else {
          if (state.compare.size >= 3) throw new Error('한 번에 최대 3명을 비교할 수 있어요.');
          state.compare.set(player.id, entry);
        }
        renderScouting();
        renderLists();
      }
      if (name === 'remove-target') {
        const current = workspace();
        const record = targetFor(player.id);
        if (record?.deal) throw new Error('협상 기록이 있는 선수예요. 협상 상태를 먼저 확인해주세요.');
        if (saveWorkspace(current.settings, current.targets.filter(record => record.player.id !== player.id), '선수 기록을 삭제했어요. 실행 취소로 되돌릴 수 있어요.')) {
          state.compare.delete(player.id);
        }
      }
    }
    function showReport() {
      if (state.tab === 'scout') renderScouting();
      if (state.tab === 'lists') renderLists();
      if (matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(() => $('.career-inspector', state.tab === 'scout' ? scoutPanel : listsPanel)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      }
    }
    view.addEventListener('click', event => {
      const target = event.target.closest('[data-career-tab],[data-career-action],[data-career-select],[data-career-report],[data-career-list],[data-career-transfer],[data-career-deal],[data-career-renew],[data-career-staff-filter],[data-career-staff-edit],[data-career-hire],[data-career-convert],[data-career-support-player]');
      if (!target) return;
      try {
        if (target.dataset.careerTab) setTab(target.dataset.careerTab);
        if (target.dataset.careerAction) act(target.dataset.careerAction).catch(error => notify(error.message, true));
        if (target.dataset.careerSupportPlayer) {
          const plan=state.support?.plans.find(row=>row.position===target.dataset.supportPosition);
          const row=plan?.support.recruits.find(row=>row.player.id===target.dataset.careerSupportPlayer);
          if(row)openProfile(row.player,row.slotId,{position:row.position,role:row.report.role.id,focus:row.report.role.focus});
        }
        if (target.dataset.careerConvert) actOnConversion(target.dataset.careerConvert, target.dataset.convertAction);
        if (target.dataset.careerSelect) {
          if (state.tab === 'scout') state.selected = target.dataset.careerSelect;
          else state.listSelected = target.dataset.careerSelect;
          state.reportTab = state.tab === 'scout' ? defaultReport(state.result.settings) : state.reportTab;
          state.growthScenario = '';
          showReport();
        }
        if (target.dataset.careerReport) {
          state.reportTab = target.dataset.careerReport;
          showReport();
        }
        if (target.dataset.careerList) {
          state.list = target.dataset.careerList;
          renderLists();
        }
        if (target.dataset.careerTransfer) {
          state.transferTab = target.dataset.careerTransfer;
          renderTransfers();
        }
        if (target.dataset.careerDeal) {
          state.transferSelected = target.dataset.careerDeal;
          renderTransfers();
        }
        if (target.dataset.careerStaffFilter) {
          state.staffFilter = target.dataset.careerStaffFilter;
          renderStaff();
        }
        if (target.dataset.careerStaffEdit) staffEditor(target.dataset.careerStaffEdit);
        if (target.dataset.careerHire) {
          const staff = workspace().staff.find(row => row.id === target.dataset.careerHire);
          if (staff) storeStaff({ ...staff, status: 'hired', date: workspace().settings.gameDate || staff.date });
        }
        if (target.dataset.careerRenew) {
          const player = findPlayer(target.dataset.careerRenew);
          if (!player) return;
          const position = C.POSITIONS.includes(player.positions[0]) ? player.positions[0] : 'CM';
          const settings = { ...workspace().settings, position, role: '', roleFocus: '' };
          const report = R.evaluate(player, settings);
          offerEditor({ player, report }, settings, 'renewal');
        }
      } catch (error) { notify(error.message, true); }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const settings = readForm();
        if (saveWorkspace(settings, workspace().targets)) search(settings);
      } catch (error) { addWarning(error.message); }
    });
    form.addEventListener('change', event => {
      const name = event.target.name;
      if (name === 'slotId') {
        const slot = getSquad().slots.find(slot => slot.id === event.target.value);
        getControl('position').disabled = !!slot;
        if (slot) getControl('position').value = slot.pos;
        updateRoleControls(getControl('position').value, slot?.role?.id ?? '', slot?.role?.focus ?? '');
      }
      if (name === 'position') updateRoleControls(event.target.value, '', '');
      if (name === 'role') updateRoleControls(getControl('position').value, event.target.value, '');
      if (name === 'league') updateClubs('');
    });
    view.addEventListener('change', event => {
      if (event.target.name === 'careerSort' && state.result) {
        const settings = { ...state.result.settings, sort: event.target.value };
        search(settings);
      }
      if (event.target.name === 'careerList') {
        const entry = selectedEntry();
        if (entry) {
          const list = event.target.value;
          saveRecord(entry, entry.settings, { list }, '선수 명단을 변경했어요.');
        }
      }
      if (event.target.name === 'careerGrowthScenario') {
        state.growthScenario = event.target.value;
        showReport();
        const panel = state.tab === 'scout' ? scoutPanel : listsPanel;
        $('[name="careerGrowthScenario"]', panel)?.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('submit', saveDialog);
    dialog.addEventListener('input', event => {
      const form = event.target.closest('#career-offer-form');
      if (form) updateOffer(form);
    });
    dialog.addEventListener('change', event => {
      const form = event.target.closest('#career-offer-form');
      if (form) updateOffer(form);
      const staffForm = event.target.closest('#career-staff-form');
      if (staffForm && event.target.name === 'type') updateStaffFields(staffForm);
    });
    dialog.addEventListener('close', () => { state.editing = null; });
    function invalidate(){
      state.request?.abort();state.request=null;state.result=null;state.support=null;state.compare.clear();
      $('#career-search-button',scoutPanel).disabled=false;
      $('#career-search-button',scoutPanel).innerHTML=icon('search')+'후보 찾기';
    }
    return { enter, sync, invalidate };
  }
  window.CareerUI = Object.freeze({ mount });
})();
