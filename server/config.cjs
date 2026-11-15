'use strict';
const fs=require('node:fs');
const path=require('node:path');
function parseEnv(text){
  const values={};
  for(const line of String(text).replace(/^\uFEFF/,'').split(/\r?\n/)){
    const match=line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);if(!match)continue;
    let value=match[2];
    if(value.startsWith('"')){if(!value.endsWith('"'))throw new Error('.env의 큰따옴표를 확인해주세요.');value=value.slice(1,-1).replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\"/g,'"').replace(/\\\\/g,'\\');}
    else if(value.startsWith("'")){if(!value.endsWith("'"))throw new Error('.env의 작은따옴표를 확인해주세요.');value=value.slice(1,-1);}
    else value=value.replace(/\s+#.*$/,'').trim();
    values[match[1]]=value;
  }
  return values;
}
function readConfig(root,environment=process.env){
  const file=path.join(root,'.env');let values={};
  if(fs.existsSync(file))values=parseEnv(fs.readFileSync(file,'utf8'));
  const get=(name,fallback='')=>values[name]||environment[name]||fallback;
  const apiKey=get('OPENAI_API_KEY').trim();
  const model=get('OPENAI_MODEL','gpt-6-luna').trim();
  const effort=get('OPENAI_REASONING_EFFORT','medium').trim();
  const port=Number(get('PORT','4267'));
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,100}$/.test(model))throw new Error('OPENAI_MODEL 값을 확인해주세요.');
  if(!['low','medium','high','xhigh','max'].includes(effort))throw new Error('OPENAI_REASONING_EFFORT는 low, medium, high, xhigh, max 중 하나로 설정해주세요.');
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT는 1~65535의 정수여야 해요.');
  const keyConfigured=!!apiKey&&/^[A-Za-z0-9._-]{16,512}$/.test(apiKey)&&!/^your[_-]|placeholder|example|sample|여기에/i.test(apiKey);
  const fcradarApiKey=get('FCRADAR_API_KEY').trim();
  const fcradarKeyConfigured=!!fcradarApiKey&&/^[A-Za-z0-9._-]{16,512}$/.test(fcradarApiKey)&&!/^your[_-]|placeholder|example|sample|여기에/i.test(fcradarApiKey);
  const fcradarImageCdnBaseUrl = get('FCRADAR_IMAGE_CDN_BASE_URL').trim();
  return {apiKey,model,effort,port,keyConfigured,fcradarApiKey,fcradarKeyConfigured,fcradarImageCdnBaseUrl};
}
module.exports={parseEnv,readConfig};
