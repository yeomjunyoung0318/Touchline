'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {readConfig}=require('../server/config.cjs');
const {rootId}=require('../server.cjs');
const root=path.resolve(__dirname,'..');
async function statusAt(url){try{const response=await fetch(url+'/api/status',{signal:AbortSignal.timeout(700)});if(!response.ok)return null;return await response.json();}catch{return null;}}
function openBrowser(url){
  const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
  child.on('error',()=>console.log('브라우저에서 이 주소를 열어주세요: '+url));child.unref();
}
async function main(){
  if(!fs.existsSync(path.join(root,'.env'))&&fs.existsSync(path.join(root,'.env.example')))fs.copyFileSync(path.join(root,'.env.example'),path.join(root,'.env'),fs.constants.COPYFILE_EXCL);
  const config=readConfig(root),url='http://127.0.0.1:'+config.port,expected=rootId(root);let status=await statusAt(url);
  if(status&&(status.app!=='touchline-fc27'||status.rootId!==expected))throw new Error('이 포트를 다른 앱이나 다른 폴더가 사용 중이에요. .env의 PORT를 바꿔주세요.');
  if(process.argv.includes('--stop')){
    if(!status){console.log('실행 중인 터치라인 서버가 없어요.');return;}
    const response=await fetch(url+'/api/shutdown',{method:'POST',headers:{'X-Touchline-Token':status.token},signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error('서버를 종료하지 못했어요.');console.log('터치라인 로컬 서버를 종료했어요.');return;
  }
  if(status?.mode==='mock')throw new Error('연결 시험용 서버가 실행 중이에요. 종료.cmd로 종료한 뒤 다시 시작해주세요.');
  if(!fs.existsSync(path.join(root,'index.html')))require('./build.cjs');
  if(!status){
    const dir=path.join(root,'.runtime');fs.mkdirSync(dir,{recursive:true});const log=fs.openSync(path.join(dir,'server.log'),'a');
    const serverEnvironment = { ...process.env };
    if (process.platform === 'win32' && serverEnvironment.NODE_USE_SYSTEM_CA === undefined) {
      serverEnvironment.NODE_USE_SYSTEM_CA = '1';
    }
    const child = spawn(process.execPath, [path.join(root, 'server.cjs')], {
      cwd: root,
      env: serverEnvironment,
      windowsHide: true,
      detached: true,
      stdio: ['ignore', log, log],
    });
    child.unref();
    fs.closeSync(log);
    for(let i=0;i<50;i++){await new Promise(resolve=>setTimeout(resolve,200));status=await statusAt(url);if(status)break;}
    if(!status||status.app!=='touchline-fc27'||status.rootId!==expected)throw new Error('로컬 서버를 시작하지 못했어요. .env의 PORT와 설정을 확인해주세요.');
  }
  if(!process.argv.includes('--no-browser'))openBrowser(url);
  console.log('터치라인: '+url);console.log(status.keyConfigured?'OpenAI 키 설정을 확인했어요. AI 축구 상담에서 대화를 시작하세요.':'.env의 OPENAI_API_KEY에 키를 저장한 뒤 AI 축구 상담의 연결 확인을 눌러주세요.');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main,statusAt};
