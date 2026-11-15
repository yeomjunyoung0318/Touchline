'use strict';
// Explicit development fixture. Every UI response is labelled as a test, never as live AI.
const C=require('../src/core.js');
const { queryParams } = require('./fcradar.cjs');
const response=(output)=>({model:'local-test-no-llm',status:'completed',output,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
const call=(name,args)=>response([{type:'function_call',id:'test-'+name,call_id:'call-'+name,name,arguments:JSON.stringify(args)}]);
const message=text=>response([{type:'message',role:'assistant',content:[{type:'output_text',text}]}]);
function createMockProvider(){return {mode:'mock',async request(body,{context}){
  const prompt=body.input.filter(i=>i.role==='user').at(-1)?.content||'';
  const results=body.input.filter(i=>i.type==='function_call_output');
  if(!results.length)return call('get_current_squad',{});
  if(results.length===1){
    const player=context.players.find(p=>prompt.includes(p.name))||context.players[0];
    const matches=[...prompt.matchAll(/\b(GK|LB|CB|RB|CDM|LM|CM|RM|CAM|LW|RW|ST)\b/gi)],position=matches.at(-1)?.[1].toUpperCase()||'CM';
    const goal=prompt.match(/(?:OVR\s*|오버롤\s*|목표\s*)(\d{1,2})/i);
    if(goal&&player)return call('calculate_stat_plan',{playerId:player.id,position,targetOverall:Number(goal[1]),style:'possession'});
    if(/포지션|바꾸|전환|옮기|CM|CAM|ST/.test(prompt)&&!/스쿼드|팀|짜줘/.test(prompt)&&player)return call('analyze_position',{playerId:player.id,position});
    if(/찾|검색/.test(prompt))return call('search_players',{query:context.players.find(p=>prompt.includes(p.name))?.name||'',position:null,maxAge:null,minOverall:null,minPotential:null,sort:'overall',playstyles:[]});
    const style=/압박|프레스/.test(prompt)?'press':/역습/.test(prompt)?'counter':'possession';
    const focus=/유망|젊|어린/.test(prompt)?'youth':/즉시|현재 전력/.test(prompt)?'ready':'balanced';
    const formation=[...C.FORMATIONS].sort((a,b)=>b.id.length-a.id.length).find(f=>prompt.includes(f.id))?.id||'auto';
    return call('recommend_squad',{style,focus,formation,maxAge:null,minOverall:null,minPotential:null,excludedPlayerIds:[],fixedPlayerIds:context.squad.slots.filter(s=>{const p=context.players.find(p=>p.id===s.playerId);return p&&prompt.includes(p.name)&&/고정/.test(prompt);}).map(s=>s.playerId)});
  }
  const last=JSON.parse(results.at(-1).output);
  if(!last.ok)return message('연결 흐름 테스트 응답입니다. 계산 입력을 확인해주세요: '+last.error);
  const data=last.data;
  if(data.starters)return message('연결 흐름 테스트 응답입니다. 실제 LLM은 사용하지 않았습니다.\n\n등록된 선수로 '+data.formation+' 구성을 실제 추천 엔진에서 계산했어요. 선발 '+data.filled+'명을 구성했고, 고정 선수는 유지했어요. 아래 변경안을 적용하면 스쿼드 보드에 반영됩니다. 예시 선수는 모두 가상입니다.');
  if(data.plans)return message('연결 흐름 테스트 응답입니다. 실제 LLM은 사용하지 않았습니다.\n\n'+data.player.name+'의 '+data.position+' 목표 OVR '+data.targetOverall+' 변경안 세 가지를 실제 계산했어요. 계산기에서 변경 전후를 확인할 수 있어요. 게임의 확정 수치가 아닌 추정입니다.');
  if(Object.hasOwn(data,'estimate'))return message('연결 흐름 테스트 응답입니다. 실제 LLM은 사용하지 않았습니다.\n\n'+data.player.name+'의 '+data.position+' 전환 추정 OVR는 '+(data.estimate??'계산 불가')+'입니다. '+data.limitations+' 계산기에서 근거를 볼 수 있어요.');
  const names = data.players?.map(player => player.name).join(', ');
  return message('연결 흐름 테스트 응답입니다. 실제 LLM은 사용하지 않았습니다.\n\n등록된 선수 '+data.total+'명을 검색했어요.'+(names?'\n'+names:'')+'\n실제 연결은 .env에 키를 넣고 일반 시작 파일로 실행하세요.');
}};}

function createMockFCRadarProvider() {
  const fixtures = C.demoPlayers().map(player => ({
    ...player,
    id: 'mock-fcradar-' + player.id,
    name: player.name + ' (모의)',
    notes: 'FCRadar 연결을 확인하는 가상 선수입니다.',
  }));
  return {
    mode: 'mock',
    async search(input) {
      const params = queryParams(input);
      const name = params.get('search') || '';
      const position = params.get('position');
      const minimum = Number(params.get('minRating'));
      const maximum = Number(params.get('maxRating') || 99);
      const clubs = (params.get('club') || '').toLowerCase().split(',').filter(Boolean);
      const nations = (params.get('nationality') || '').toLowerCase().split(',').filter(Boolean);
      const page = Number(params.get('page'));
      const pageSize = Number(params.get('per_page'));
      const start = (page - 1) * pageSize;
      const matches = fixtures.filter(player => C.matchesSearch(player, name) &&
        (!position || player.positions.includes(position)) && player.overall >= minimum && player.overall <= maximum &&
        (!clubs.length || clubs.some(club => player.club.toLowerCase().includes(club))) &&
        (!nations.length || nations.includes(player.nationality.toLowerCase())));
      const ascending = params.get('dir') === 'asc';
      matches.sort((a, b) => ascending ? a.overall - b.overall : b.overall - a.overall);
      return {
        players: matches.slice(start, start + pageSize),
        page,
        mayHaveMore: matches.length > start + pageSize,
        source: '모의 선수 데이터',
        fetchedAt: new Date().toISOString(),
      };
    },
  };
}

module.exports={createMockProvider,createMockFCRadarProvider};
