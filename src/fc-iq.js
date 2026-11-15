(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FC27Roles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // FC IQ role catalog from EA's role table and subsequent focus updates.
  const focuses = {
    defend: { name: '수비', english: 'Defend', description: '후방 균형과 공간 보호를 우선해요.' },
    balanced: { name: '균형', english: 'Balanced', description: '공격과 수비에 고르게 관여해요.' },
    'build-up': { name: '빌드업', english: 'Build-Up', description: '패스 각도를 만들고 공을 전진시키는 데 힘을 실어요.' },
    support: { name: '지원', english: 'Support', description: '주변 선수에게 패스 선택지와 커버를 제공해요.' },
    attack: { name: '공격', english: 'Attack', description: '전진과 침투로 득점 기회에 더 자주 관여해요.' },
    aggressive: { name: '공격적', english: 'Aggressive', description: '라인에서 먼저 나와 압박과 차단을 시도해요.' },
    roaming: { name: '자유 이동', english: 'Roaming', description: '기준 위치에서 벗어나 공간과 패스 길을 찾아요.' },
    'ball-winning': { name: '볼 위닝', english: 'Ball-Winning', description: '상대를 압박하고 공을 되찾는 데 집중해요.' },
    wide: { name: '측면', english: 'Wide', description: '측면으로 움직여 폭과 패스 선택지를 만들어요.' },
    versatile: { name: '다재다능', english: 'Versatile', description: '경기 상황에 맞춰 역할 안에서 움직임을 바꿔요.' },
  };
  const names = {
    goalkeeper: ['골키퍼', 'Goalkeeper', '골문 근처에서 슈팅을 막고 수비의 마지막을 책임져요.'],
    'sweeper-keeper': ['스위퍼 키퍼', 'Sweeper Keeper', '수비 라인 뒤로 들어오는 공에 빠르게 나와 대응해요.'],
    'ball-playing-keeper': ['볼 플레이 골키퍼', 'Ball-Playing Keeper', '공을 가진 때 후방 패스 길을 만들고 수비 때 골문을 지켜요.'],
    fullback: ['풀백', 'Fullback', '수비 라인과 측면을 지키면서 가까운 패스를 지원해요.'],
    wingback: ['윙백', 'Wingback', '측면을 따라 오르내리며 공수에 폭을 제공해요.'],
    falseback: ['폴스백', 'Falseback', '공을 가진 때 중앙으로 들어와 후방과 중원을 연결해요.'],
    'attacking-wingback': ['공격형 윙백', 'Attacking Wingback', '높은 위치에서 폭을 넓히고 오버래핑으로 공격에 합류해요.'],
    'inverted-wingback': ['인버티드 윙백', 'Inverted Wingback', '공을 가진 때 전진해 안쪽에서 전개하거나 박스로 침투해요.'],
    defender: ['수비수', 'Defender', '중앙 수비 라인을 지키며 대인 수비와 차단을 맡아요.'],
    stopper: ['스토퍼', 'Stopper', '라인을 벗어나 상대가 공을 받는 순간 압박하고 끊어내요.'],
    'ball-playing-defender': ['볼 플레이 수비수', 'Ball-Playing Defender', '센터백 자리에서 전진 패스와 운반으로 후방 빌드업을 열어요.'],
    'wide-back': ['와이드 백', 'Wide Back', '중앙 수비에서 측면으로 벌어져 풀백 뒤 공간을 커버해요.'],
    holding: ['홀딩', 'Holding', '수비진 앞의 패스 길을 막고 역습에 대비해요.'],
    'centre-half': ['센터 하프', 'Centre-Half', '공을 가진 때 센터백 사이로 내려가 후방 숫자를 늘려요.'],
    'deep-lying-playmaker': ['딥라잉 플레이메이커', 'Deep-Lying Playmaker', '낮은 중원에서 공을 받아 패스로 템포와 전개 방향을 조절해요.'],
    'wide-half': ['와이드 하프', 'Wide Half', '수비형 미드필더 자리에서 측면을 커버하고 전개를 지원해요.'],
    'box-crasher': ['박스 크래셔', 'Box Crasher', '수비형 미드필더 위치에서 타이밍을 잡아 뒤늦게 박스에 들어가요.'],
    'box-to-box': ['박스 투 박스', 'Box-to-Box', '두 페널티 박스 사이를 오가며 공수 전환에 관여해요.'],
    playmaker: ['플레이메이커', 'Playmaker', '패스 선택지를 찾고 공격의 연결과 기회 창출을 맡아요.'],
    'half-winger': ['하프 윙어', 'Half-Winger', '중앙에서 측면 쪽으로 이동해 전개의 폭을 넓혀요.'],
    winger: ['윙어', 'Winger', '터치라인 쪽에서 폭을 잡고 드리블과 크로스로 공격해요.'],
    'wide-midfielder': ['와이드 미드필더', 'Wide Midfielder', '측면 중원과 수비 라인을 연결하며 공수 지원을 맡아요.'],
    'wide-playmaker': ['와이드 플레이메이커', 'Wide Playmaker', '측면에서 안으로 들어와 창의적인 패스로 기회를 만들어요.'],
    'inside-forward': ['인사이드 포워드', 'Inside Forward', '측면에서 중앙과 박스 쪽으로 파고들어 득점을 노려요.'],
    'shadow-striker': ['섀도 스트라이커', 'Shadow Striker', '공격형 미드필더 위치에서 스트라이커 뒤를 따라 박스로 들어가요.'],
    'classic-10': ['클래식 10', 'Classic 10', '공격수 뒤에서 공을 받고 마지막 패스와 슈팅을 맡아요.'],
    'advanced-forward': ['어드밴스 포워드', 'Advanced Forward', '수비 라인 가까이서 공을 받거나 뒷공간을 파고들어요.'],
    poacher: ['포처', 'Poacher', '높은 위치를 유지하며 침투와 문전 마무리를 노려요.'],
    'false-9': ['폴스 나인', 'False 9', '최전방에서 내려와 중원과 연결하고 다른 선수의 침투 공간을 열어요.'],
    'target-forward': ['타깃 포워드', 'Target Forward', '몸싸움으로 공을 지키고 주변 선수에게 연결해요.'],
  };
  function roles(entries) {
    return Object.freeze(Object.entries(entries).map(([id, options]) => {
      const [name, english, description] = names[id];
      return Object.freeze({ id, name, english, description, focuses: Object.freeze(options.split(' ')) });
    }));
  }
  const fullbacks = roles({
    fullback: 'defend balanced versatile', wingback: 'balanced support', falseback: 'defend balanced',
    'attacking-wingback': 'support attack', 'inverted-wingback': 'build-up attack',
  });
  const wideMids = roles({
    winger: 'balanced attack', 'wide-midfielder': 'defend support build-up',
    'wide-playmaker': 'attack build-up', 'inside-forward': 'balanced attack',
  });
  const wingers = roles({
    winger: 'balanced attack versatile', 'inside-forward': 'balanced attack roaming', 'wide-playmaker': 'attack build-up',
  });
  const byPosition = Object.freeze({
    GK: roles({ goalkeeper: 'defend balanced', 'sweeper-keeper': 'balanced build-up', 'ball-playing-keeper': 'build-up' }),
    LB: fullbacks,
    CB: roles({
      defender: 'defend balanced', stopper: 'balanced aggressive',
      'ball-playing-defender': 'defend build-up aggressive', 'wide-back': 'defend aggressive support',
    }),
    RB: fullbacks,
    CDM: roles({
      holding: 'defend roaming ball-winning', 'centre-half': 'defend', 'deep-lying-playmaker': 'defend roaming build-up',
      'wide-half': 'defend build-up', 'box-crasher': 'balanced',
    }),
    LM: wideMids,
    CM: roles({
      'box-to-box': 'balanced ball-winning', holding: 'defend ball-winning', 'deep-lying-playmaker': 'defend build-up',
      playmaker: 'attack roaming', 'half-winger': 'balanced attack support',
    }),
    RM: wideMids,
    CAM: roles({
      playmaker: 'balanced roaming build-up', 'shadow-striker': 'attack',
      'half-winger': 'balanced attack roaming', 'classic-10': 'attack wide versatile',
    }),
    LW: wingers,
    RW: wingers,
    ST: roles({
      'advanced-forward': 'attack versatile support', poacher: 'attack support versatile',
      'false-9': 'build-up attack', 'target-forward': 'balanced attack wide',
    }),
  });
  function getRole(position, id) {
    return Object.hasOwn(byPosition, position) ? byPosition[position].find(role => role.id === id) : undefined;
  }

  // FCRadar FC27 role codes. The provider uses code + 100 for Role++.
  const roleCodes = {
    GK: { goalkeeper: 1, 'sweeper-keeper': 2, 'ball-playing-keeper': 45 },
    RB: { fullback: 3, falseback: 4, wingback: 5, 'attacking-wingback': 6, 'inverted-wingback': 46 },
    LB: { fullback: 7, falseback: 8, wingback: 9, 'attacking-wingback': 10, 'inverted-wingback': 47 },
    CB: { defender: 11, stopper: 12, 'ball-playing-defender': 13, 'wide-back': 48 },
    CDM: { holding: 14, 'centre-half': 15, 'deep-lying-playmaker': 16, 'wide-half': 17, 'box-crasher': 49 },
    CM: { 'box-to-box': 18, holding: 19, 'deep-lying-playmaker': 20, playmaker: 21, 'half-winger': 22 },
    RM: { winger: 23, 'wide-midfielder': 24, 'wide-playmaker': 25, 'inside-forward': 26 },
    LM: { winger: 27, 'wide-midfielder': 28, 'wide-playmaker': 29, 'inside-forward': 30 },
    CAM: { playmaker: 31, 'shadow-striker': 32, 'half-winger': 33, 'classic-10': 34 },
    RW: { winger: 35, 'inside-forward': 36, 'wide-playmaker': 37 },
    LW: { winger: 38, 'inside-forward': 39, 'wide-playmaker': 40 },
    ST: { 'advanced-forward': 41, poacher: 42, 'false-9': 43, 'target-forward': 44 },
  };
  function roleLevel(roleIds, position, id) {
    const code = roleCodes[position]?.[id];
    if (!code || !Array.isArray(roleIds)) return null;
    return roleIds.includes(code + 100) ? 2 : roleIds.includes(code) ? 1 : 0;
  }
  function masteredRoles(roleIds) {
    return Object.entries(byPosition).flatMap(([position, roles]) => roles.flatMap(role => {
      const level = roleLevel(roleIds, position, role.id);
      return level ? [{ position, id: role.id, name: role.name, level }] : [];
    }));
  }
  return Object.freeze({ byPosition, focuses: Object.freeze(focuses), getRole, roleLevel, masteredRoles });
});
