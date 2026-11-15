(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./core.js'));
  else root.PlayerDataAdapter=factory(root.SquadCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  // Data boundary only. This adapter makes no network requests and accepts no API keys.
  // After access is approved, map an authorized response into this schema here.
  const MAX_PLAYERS=20000;
  const HEADERS={이름:'name',선수명:'name',영문이름:'englishName',포지션:'positions',나이:'age',오버롤:'overall',능력치:'overall',ovr:'overall',잠재력:'potential',pot:'potential',소속팀:'club',클럽:'club',국적:'nationality',사진:'imageUrl',사진주소:'imageUrl',imageurl:'imageUrl',photourl:'imageUrl',portraiturl:'imageUrl',englishname:'englishName'};
  function validatePlayers(rows) {
    if(!Array.isArray(rows)||!rows.length) throw new Error('선수 목록이 비어 있어요.');
    if(rows.length>MAX_PLAYERS) throw new Error('한 번에 최대 20,000명까지 불러올 수 있어요.');
    const players=rows.map(C.normalizePlayer);
    if(new Set(players.map(p=>p.id)).size!==players.length) throw new Error('파일 안에 중복된 선수 ID가 있어요.');
    return players;
  }
  function fromJSON(text) {
    let data;
    try {data=JSON.parse(text.replace(/^\uFEFF/,''));} catch {throw new Error('JSON 파일 문법을 확인해주세요.');}
    if(data?.app==='touchline-fc27') return {kind:'backup',state:C.validateBackup(data)};
    return {kind:'players',players:validatePlayers(Array.isArray(data)?data:data?.players)};
  }
  function parseCSV(text) {
    text=String(text).replace(/^\uFEFF/,'');
    const rows=[];let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++) {
      const ch=text[i];
      if(quoted) {if(ch==='"'&&text[i+1]==='"'){value+='"';i++;}else if(ch==='"'){quoted=false;closed=true;}else value+=ch;continue;}
      if(ch==='"'){if(value.trim()||closed)throw new Error('CSV 따옴표 위치를 확인해주세요.');quoted=true;continue;}
      if(closed&&ch!==','&&ch!=='\n'&&ch!=='\r'&&ch!==' '&&ch!=='\t')throw new Error('CSV 따옴표 뒤의 구분자를 확인해주세요.');
      if(ch===','){row.push(value);value='';closed=false;}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';closed=false;}
      else if(!closed)value+=ch;
    }
    if(quoted)throw new Error('CSV에 닫히지 않은 따옴표가 있어요.');
    row.push(value);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length<2)throw new Error('CSV에는 제목 행과 최소 한 명의 선수가 필요해요.');
    const headers=rows.shift().map(h=>HEADERS[h.trim().toLowerCase()]??h.trim());
    if(new Set(headers).size!==headers.length)throw new Error('CSV에 중복된 열 이름이 있어요.');
    return rows.map((cells,index)=>{
      if(cells.length!==headers.length)throw new Error('CSV '+(index+2)+'행의 열 수를 확인해주세요.');
      const raw=Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]));
      raw.source=raw.source==='demo'?'demo':'import';return raw;
    });
  }
  const fromCSV=text=>({kind:'players',players:validatePlayers(parseCSV(text))});
  const fromPermittedApiResponse=(response,mapRecord)=>validatePlayers(response.map(record=>({...mapRecord(record),source:'import'})));
  function mergeApiPlayers(current, rows) {
    const incoming = validatePlayers(rows);
    const existing = new Map(current.map(player => [player.id, player]));
    const added = [];
    const updates = new Map();
    let photos = 0;
    let names = 0;
    let traits = 0;
    let growthProfiles = 0;
    for (const player of incoming) {
      const saved = existing.get(player.id);
      if (!saved) {
        added.push(player);
        continue;
      }
      const update = {};
      if (!saved.imageUrl && player.imageUrl) {
        update.imageUrl = player.imageUrl;
        photos++;
      }
      if (C.isApiPlayer(saved) && saved.source === 'import' &&
          saved.englishName === player.englishName &&
          player.name !== saved.name && /[가-힣]/.test(player.name)) {
        update.name = player.name;
        names++;
      }
      if (C.isApiPlayer(saved)) {
        for (const field of ['playstyles', 'playstyle_plus']) {
          if (player[field] && JSON.stringify(player[field]) !== JSON.stringify(saved[field])) update[field] = player[field];
        }
        if (update.playstyles || update.playstyle_plus) traits++;
        const growth = player.profile?.growth;
        if (growth && JSON.stringify(growth) !== JSON.stringify(saved.profile?.growth)) {
          update.profile = { ...saved.profile, growth };
          growthProfiles++;
        }
      }
      if (Object.keys(update).length) updates.set(player.id, update);
    }
    if (current.length + added.length > MAX_PLAYERS) throw new Error('선수는 최대 20,000명까지 저장할 수 있어요.');
    return {
      players: current.map(player => updates.has(player.id) ? { ...player, ...updates.get(player.id) } : player).concat(added),
      added: added.length,
      photos,
      names,
      traits,
      growthProfiles,
      skipped: incoming.length - added.length - updates.size,
    };
  }
  return Object.freeze({fromJSON,fromCSV,parseCSV,validatePlayers,fromPermittedApiResponse,mergeApiPlayers});
});
