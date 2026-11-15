'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const X=require('./src/ai-context.js');
const {readConfig}=require('./server/config.cjs');
const {PublicError,GAME_TOOLS,createOpenAIProvider,classifyTurn,runTurn}=require('./server/ai-engine.cjs');
const {createFCRadarProvider,imageCdnBase}=require('./server/fcradar.cjs');
const { createFCOnlineNameLoader } = require('./server/fconline-names.cjs');
const { createMockProvider, createMockFCRadarProvider } = require('./server/mock-provider.cjs');
const { createPlayerDatabase } = require('./server/player-database.cjs');
const { createCareerProvider } = require('./server/player-career.cjs');
const { recommendForContext } = require('./server/ai-tools.cjs');
const { recruitmentFor, scoutingClubs } = require('./server/career-recruitment.cjs');
const C = require('./src/core.js');
const CareerMarket = require('./src/career-market.js');
const CareerRanking = require('./src/career-ranking.js');
const ROOT=__dirname;
const APP_ID='touchline-fc27';
const rootId=root=>crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
const hashContext=context=>crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');
function publicError(error){return error?.public?{code:error.code,message:error.message,status:error.status}:{code:'SERVER_ERROR',message:'요청을 처리하지 못했어요. 입력값과 서버 실행 상태를 확인해주세요.',status:500};}
function readJson(req,maxBytes=32*1024*1024){return new Promise((resolve,reject)=>{
  const chunks=[];let size=0,settled=false;
  req.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){if(!settled){settled=true;reject(new PublicError('선수 정보가 너무 커요. 대화에 사용할 선수 목록을 줄여주세요.','BODY_TOO_LARGE',413));}return;}chunks.push(chunk);});
  req.on('end',()=>{if(settled)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new PublicError('요청 내용을 읽지 못했어요. 새로고침 후 다시 시도해주세요.','INVALID_JSON',400));}});
  req.on('error',()=>reject(new PublicError('연결이 중단되었어요.','CANCELLED',499)));
});}
function searchOptions(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PublicError('검색 조건을 확인해주세요.', 'INVALID_SEARCH', 400);
  }
  const { league, team, gender, minAge, maxAge, minPotential, maxPotential, minHeight, maxHeight, minWeight, maxWeight, ...query } = body;
  const optional = (value, min, max, label) => {
    if (value === '' || value == null) return null;
    const number = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isInteger(number) || number < min || number > max) {
      throw new PublicError(label + ' 범위를 확인해주세요.', 'INVALID_SEARCH', 400);
    }
    return number;
  };
  const ranges = [
    ['나이', minAge, maxAge, 14, 65, 'Age'], ['잠재력', minPotential, maxPotential, 1, 99, 'Potential'],
    ['키', minHeight, maxHeight, 100, 250, 'Height'], ['몸무게', minWeight, maxWeight, 25, 220, 'Weight'],
  ];
  const filters = {};
  for (const [label, lower, upper, min, max, key] of ranges) {
    const low = optional(lower, min, max, label), high = optional(upper, min, max, label);
    if (low !== null && high !== null && low > high) throw new PublicError(label + ' 최소·최대 값을 확인해주세요.', 'INVALID_SEARCH', 400);
    filters['min' + key] = low;
    filters['max' + key] = high;
  }
  for (const [key, value] of [['league', league], ['team', team]]) {
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || value.length > 100) throw new PublicError('리그와 소속팀 조건을 확인해주세요.', 'INVALID_SEARCH', 400);
    filters[key] = value.trim();
  }
  if (gender != null && gender !== '') {
    if (!['male', 'female'].includes(gender)) throw new PublicError('남자·여자 분류를 확인해주세요.', 'INVALID_SEARCH', 400);
    filters.gender = gender;
  }
  return { query, filters };
}
function createApp({
  root = ROOT,
  provider = createOpenAIProvider(),
  playerProvider = provider.mode === 'mock' ? createMockFCRadarProvider() : createFCRadarProvider(fetch, createFCOnlineNameLoader()),
  careerProvider = provider.mode === 'mock' ? null : createCareerProvider(),
  playerDatabase,
  configReader = () => readConfig(root),
  port,
} = {}) {
  const playerMode = playerProvider.mode === 'mock' ? 'mock' : 'fcradar';
  const token=crypto.randomBytes(32).toString('hex'),sessions=new Map();
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    const actualPort=server.address()?.port,expectedHosts=new Set(['127.0.0.1:'+actualPort,'localhost:'+actualPort]);
    if(!expectedHosts.has(req.headers.host)){json(res,403,{error:{message:'로컬 주소로 접속해주세요.',code:'INVALID_HOST'}});return;}
    const origin=req.headers.origin;
    if(origin&&!['http://127.0.0.1:'+actualPort,'http://localhost:'+actualPort].includes(origin)){json(res,403,{error:{message:'다른 사이트에서는 이 서버를 호출할 수 없어요.',code:'INVALID_ORIGIN'}});return;}
    let pathname;try{pathname=new URL(req.url,'http://127.0.0.1').pathname;}catch{json(res,400,{error:{message:'주소가 올바르지 않아요.',code:'INVALID_URL'}});return;}
    if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html')){
      const file=path.join(root,'index.html');if(!fs.existsSync(file)){json(res,503,{error:{message:'index.html이 없어요. 빌드 후 실행해주세요.',code:'NO_HTML'}});return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return;
    }
    if(req.method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(req.method==='GET'&&pathname==='/api/status'){
      try{const config=configReader();json(res,200,{app:APP_ID,version:2,rootId:rootId(root),mode:provider.mode,model:provider.mode==='mock'?'local-test-no-llm':config.model,effort:config.effort,keyConfigured:provider.mode==='mock'||config.keyConfigured,token,tools:GAME_TOOLS.length,chatScope:'football',catalogCount:playerDatabase?.status().count??0});}
      catch{json(res,200,{app:APP_ID,version:2,rootId:rootId(root),mode:provider.mode,keyConfigured:false,token,chatScope:'football',configurationError:'.env의 모델·추론·포트 설정을 확인해주세요.'});}return;
    }
    if(req.method==='GET'&&pathname==='/api/players/status'){
      try {
        const config = configReader();
        json(res, 200, { configured: playerMode === 'mock' || !!config.fcradarKeyConfigured || !!playerDatabase?.status().count,
          imageCdnConfigured: playerMode !== 'mock' && !!imageCdnBase(config), verified: false, mode: playerMode });
      } catch {
        json(res, 200, { configured: false, imageCdnConfigured: false, verified: false, mode: playerMode });
      }
      return;
    }
    if(req.method==='GET'&&pathname==='/api/players/database'){
      json(res,200,playerDatabase?{enabled:true,...playerDatabase.status()}:{enabled:false,count:0});return;
    }
    if(req.method==='GET'&&pathname==='/api/players/database/filters'){
      const facets=playerDatabase?.view({})?.facets;
      json(res,200,{facets:facets??null});return;
    }
    if(req.method==='GET'&&pathname==='/api/career/options'){
      const catalog=playerDatabase?.view({});
      const traits=new Map();
      for(const row of catalog?.players??[]) {
        for(const trait of [...(row.playstyles??[]),...(row.playstyle_plus??[])]) traits.set(trait.slug,trait);
      }
      const status=playerDatabase?.status();
      json(res,200,{clubs:scoutingClubs(catalog),facets:catalog?.facets??null,traits:[...traits.values()],
        snapshot:catalog?.date??null,count:status?.count??0,financeKnown:status?.financeKnown??0,rolesKnown:status?.rolesKnown??0,
        growthKnown:status?.growthKnown??0});
      return;
    }
    if(req.method==='POST'&&['/api/career/scout','/api/career/support'].includes(pathname)){
      if(req.headers['x-touchline-token']!==token){json(res,403,{error:{code:'INVALID_TOKEN',message:'페이지를 새로고침해주세요.'}});return;}
      if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:{code:'INVALID_CONTENT_TYPE',message:'JSON 요청이 필요해요.'}});return;}
      try {
        const body=await readJson(req);
        const catalog=playerDatabase?.view(configReader());
        let result;
        try {
          const context=body?.context;
          const checked=C.validateBackup({app:'touchline-fc27',version:1,players:context?.players,
            squads:[context?.squad],activeSquadId:context?.squad?.id});
          const squad=checked.squads[0];
          const input=CareerRanking.validOptions(body.settings,squad);
          const {targets:saved}=CareerMarket.workspace({targets:body.targets},C.normalizePlayer);
          if(input.gender&&input.scope==='market'&&!catalog?.facets.genderKnown) throw new Error('남자·여자 분류가 있는 로컬 선수 DB가 필요해요.');
          const recruitment=input.careerClub&&input.scope==='market'
            ? recruitmentFor(catalog,input.careerClub,input.careerStage,input.gender||null,input.careerLeague||null) : null;
          if(pathname==='/api/career/support'){
            const local=checked.players.find(row=>row.id===body.playerId)??saved.find(row=>row.player.id===body.playerId)?.player;
            const remote=catalog?.get(body.playerId);
            const player=local?{...remote,...local,profile:{...local.profile,...remote?.profile}}:remote;
            if(!player)throw new Error('커버를 비교할 선수를 다시 검색해주세요.');
            result={plans:CareerRanking.conversionSupport({player,settings:input,squad,players:checked.players,saved,catalog,recruitment})};
          }else result=CareerRanking.scout({input,squad,players:checked.players,saved,catalog,recruitment,page:body.page});
        } catch(error) {
          throw new PublicError(error.message,'INVALID_SCOUTING',400);
        }
        json(res,200,result);
      } catch(error) {
        const safe=publicError(error);
        json(res,safe.status,{error:{code:safe.code,message:safe.message}});
      }
      return;
    }
    const profileId = pathname.match(/^\/api\/players\/database\/(fcradar-fc27-[1-9]\d{0,15})\/profile$/)?.[1];
    if(req.method==='GET'&&profileId){
      try {
        const catalog=playerDatabase?.view(configReader());
        const row=catalog?.get(profileId);
        if(!row)throw new PublicError('로컬 DB에 없는 선수예요.','PLAYER_NOT_FOUND',404);
        const career=await careerProvider?.load(row,catalog.date);
        json(res,200,{player:catalog.display(row),snapshot:catalog.date,gender:catalog.gender(row),career:career??null});
      } catch(error) {
        const safe=publicError(error);json(res,safe.status,{error:{code:safe.code,message:safe.message}});
      }
      return;
    }
    const playstylePlayer = pathname.match(/^\/api\/players\/database\/(fcradar-fc27-[1-9]\d{0,15})\/playstyles$/)?.[1];
    if(req.method==='GET'&&playstylePlayer){
      const row=playerDatabase?.view({})?.get(playstylePlayer);
      if(!row){json(res,404,{error:{code:'PLAYER_NOT_FOUND',message:'로컬 DB에 없는 선수예요.'}});return;}
      json(res,200,{playstyles:row.playstyles,playstyle_plus:row.playstyle_plus});return;
    }
    if(req.method==='POST'&&pathname==='/api/players/database/sync'){
      if(req.headers['x-touchline-token']!==token){json(res,403,{error:{code:'INVALID_TOKEN',message:'페이지를 새로고침해주세요.'}});return;}
      try {
        if(!playerDatabase)throw new PublicError('로컬 DB 적재를 사용할 수 없어요.','DATABASE_DISABLED',404);
        const config=configReader();
        if(!config.fcradarKeyConfigured)throw new PublicError('FCRadar API 키를 설정해주세요.','FCRADAR_KEY_REQUIRED',400);
        playerDatabase.refresh(playerProvider,config).catch(()=>{});
        json(res,202,{enabled:true,...playerDatabase.status()});
      }catch(error){const safe=publicError(error);json(res,safe.status,{error:{code:safe.code,message:safe.message}});}
      return;
    }
    if(req.method==='POST'&&pathname==='/api/players/search'){
      if(req.headers['x-touchline-token']!==token){json(res,403,{error:{code:'INVALID_TOKEN',message:'새로고침 후 다시 검색해주세요.'}});return;}
      if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:{code:'INVALID_CONTENT_TYPE',message:'JSON 요청이 필요해요.'}});return;}
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);timeout.unref();
      res.once('close',()=>{if(!res.writableEnded)controller.abort();});
      try {
        const {query,filters} = searchOptions(await readJson(req, 4096));
        const config=configReader();
        const catalog=playerDatabase?.view(config);
        if(!catalog && (filters.league || filters.team || filters.gender || filters.minHeight !== null || filters.maxHeight !== null ||
            filters.minWeight !== null || filters.maxWeight !== null)) {
          throw new PublicError('이 검색 조건은 선수 DB 적재 후 사용할 수 있어요.', 'DATABASE_REQUIRED', 409);
        }
        const result=catalog?catalog.search(query,filters):await playerProvider.search(query,config,controller.signal);
        json(res,200,{...result,mode:catalog?'catalog':playerMode});
      }
      catch(error){const safe=publicError(error);json(res,safe.status,{error:{code:safe.code,message:safe.message}});}
      finally{clearTimeout(timeout);}return;
    }
    if(req.method==='POST'&&pathname==='/api/squads/recommend'){
      if(req.headers['x-touchline-token']!==token){json(res,403,{error:{code:'INVALID_TOKEN',message:'페이지를 새로고침해주세요.'}});return;}
      if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:{code:'INVALID_CONTENT_TYPE',message:'JSON 요청이 필요해요.'}});return;}
      try {
        const body=await readJson(req);
        const catalog=playerDatabase?.view(configReader());
        if(!catalog)throw new PublicError('선수 DB 적재 후 추천을 사용할 수 있어요.','DATABASE_REQUIRED',404);
        let proposal;
        try{proposal=recommendForContext(body?.options,X.prepare(body?.context),catalog);}
        catch(error){throw new PublicError(error.message,'INVALID_RECOMMENDATION',400);}
        json(res,200,proposal);
      }catch(error){const safe=publicError(error);json(res,safe.status,{error:{code:safe.code,message:safe.message}});}
      return;
    }
    if(req.method==='POST'&&(pathname==='/api/chat'||pathname==='/api/shutdown')){
      if(req.headers['x-touchline-token']!==token){json(res,403,{error:{message:'연결 정보가 바뀌었어요. 페이지를 새로고침해주세요.',code:'INVALID_TOKEN'}});return;}
        if(pathname==='/api/shutdown'){playerDatabase?.stop();json(res,200,{ok:true});setTimeout(()=>server.close(),50);return;}
      if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:{message:'JSON 요청이 필요해요.',code:'INVALID_CONTENT_TYPE'}});return;}
      let session,ownsSession=false;
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(new DOMException('AI response timed out','TimeoutError')),120000);timeout.unref();
      res.once('close',()=>{if(!res.writableEnded)controller.abort();});
      try{
        const body=await readJson(req);if(typeof body.message!=='string'||!body.message.trim()||body.message.length>3000)throw new PublicError('대화는 1~3,000자로 입력해주세요.','INVALID_MESSAGE',400);
        if(/\b(?:sk-(?:proj-|svcacct-)?|sk_(?:live|test)_)[A-Za-z0-9_-]{16,}\b/.test(body.message))throw new PublicError('API 키는 .env 파일에 저장해주세요.','SECRET_IN_MESSAGE',400);
        let context;try{context=X.prepare(body.context);}catch{throw new PublicError('선수 정보나 스쿼드 형식이 올바르지 않아요. 스쿼드를 확인해주세요.','INVALID_CONTEXT',400);}
        const snapshotHash=hashContext(context);
        if(body.snapshotHash!==snapshotHash)throw new PublicError('선수 정보가 갱신되었어요. 다시 보내주세요.','CONTEXT_MISMATCH',409);
        for(const [id,s] of sessions)if(Date.now()-s.updated>60*60*1000&&!s.busy)sessions.delete(id);
        if(body.sessionId){session=sessions.get(body.sessionId);if(!session)throw new PublicError('대화 연결이 만료되었어요. 새 대화를 시작해주세요.','SESSION_EXPIRED',409);}
        const config=configReader();if(provider.mode!=='mock'&&!config.keyConfigured)throw new PublicError('.env 파일의 OPENAI_API_KEY= 뒤에 키를 저장하고 연결 확인을 눌러주세요.','KEY_REQUIRED',400);
        const message=body.message.trim();
        if([config.apiKey,config.fcradarApiKey].some(key=>key?.length>=16&&message.includes(key))){
          throw new PublicError('API 키는 .env 파일에 저장해주세요.','SECRET_IN_MESSAGE',400);
        }
        if(session?.busy)throw new PublicError('이전 답변을 기다리거나 취소한 뒤 보내주세요.','SESSION_BUSY',409);
        if(session){session.busy=true;ownsSession=true;}
        const scope=await classifyTurn({message,history:session?.history,config,provider,signal:controller.signal});
        if(controller.signal.aborted)throw new PublicError('질문의 맥락을 확인하는 중 요청이 종료됐어요.','CANCELLED',504);
        if(!session){
          if(sessions.size>=30)throw new PublicError('열린 대화가 많아요. 잠시 후 다시 시작해주세요.','SESSION_LIMIT',429);
          session={id:crypto.randomUUID(),history:[],busy:true,updated:Date.now()};
          ownsSession=true;
          sessions.set(session.id,session);
        }
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
        const emit=event=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(event)+'\n');};
        emit({type:'meta',sessionId:session.id,model:provider.mode==='mock'?'local-test-no-llm':config.model,mode:provider.mode,snapshotHash});
        const catalog=scope.route==='app'?playerDatabase?.view(config):undefined;
        const {career,...result}=await runTurn({message,history:session.history,context,catalog,career:session.career,scope,config,provider,onEvent:emit,signal:controller.signal});
        session.career=career;
        session.history.push({role:'user',content:message},{role:'assistant',content:result.reply});session.history=session.history.slice(-12);session.updated=Date.now();
        emit({type:'done',...result,snapshotHash,sessionId:session.id,mode:provider.mode});res.end();
      }catch(error){const safe=publicError(error);if(!res.headersSent)json(res,safe.status,{error:{code:safe.code,message:safe.message}});else if(!res.destroyed&&!res.writableEnded)res.end(JSON.stringify({type:'error',error:{code:safe.code,message:safe.message}})+'\n');}
      finally{clearTimeout(timeout);if(session&&ownsSession)session.busy=false;}
      return;
    }
    json(res,404,{error:{message:'이 주소는 제공하지 않아요.',code:'NOT_FOUND'}});
  });
  server.requestTimeout=130000;server.headersTimeout=15000;
  return {server,sessions,token,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port??configReader().port,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port));})};
}
if(require.main===module){
  const mock = process.argv.includes('--mock');
  const provider = mock ? createMockProvider() : createOpenAIProvider();
  const configReader = mock ? () => ({ effort: 'medium', keyConfigured: false }) : () => readConfig(ROOT);
  const playerDatabase = mock ? undefined : createPlayerDatabase(path.join(ROOT,'data','fc27-players.json'));
  const app = createApp({ provider, configReader, playerDatabase, port: mock ? 0 : undefined });
  Promise.resolve().then(() => app.listen()).then(url => {
    console.log('Local: ' + url);
    if (mock) {
      console.log('LOCAL TEST: FCRadar and OpenAI fixtures');
    } else {
      const config = configReader();
      console.log('AI model: ' + config.model + ' / ' + config.effort + '; key configured: ' + config.keyConfigured);
    }
  }).catch(error => {
    console.error(error.code === 'EADDRINUSE' ? '이 포트를 사용 중이에요. 시작 파일을 이용하거나 .env의 PORT를 바꿔주세요.' : '서버를 시작하지 못했어요. .env 설정을 확인해주세요.');
    process.exitCode = 1;
  });
}
module.exports={createApp,rootId,hashContext,publicError};
