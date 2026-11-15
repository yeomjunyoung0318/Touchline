'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'src','template.html'),'utf8');
html=html.replace('/* TOUCHLINE_APP */',()=>fs.readFileSync(path.join(root,'src','player-search.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'\n/* TOUCHLINE_APP */');
for(const [token,file] of [['/* TOUCHLINE_STYLE */','style.css'],['/* TOUCHLINE_FC_THEME */','fc27-theme.css'],
  ['/* TOUCHLINE_CAREER_STYLE */','career-ui.css'],['/* TOUCHLINE_MODEL */','rating-model.js'],['/* TOUCHLINE_FC_IQ */','fc-iq.js'],
  ['/* TOUCHLINE_PLAYSTYLES */','playstyles.js'],['/* TOUCHLINE_CAREER_DEVELOPMENT */','career-development.js'],
  ['/* TOUCHLINE_CAREER_MARKET */','career-market.js'],['/* TOUCHLINE_CORE */','core.js'],
  ['/* TOUCHLINE_CAREER_RANKING */','career-ranking.js'],['/* TOUCHLINE_PLAYER_PROFILE */','player-profile.js'],
  ['/* TOUCHLINE_ADAPTER */','data-adapter.js'],['/* TOUCHLINE_AI_CONTEXT */','ai-context.js'],['/* TOUCHLINE_AI_CHAT */','ai-chat.js'],
  ['/* TOUCHLINE_CAREER_UI */','career-ui.js'],['/* TOUCHLINE_APP */','app.js']]) {
  if(html.split(token).length!==2) throw new Error('Expected one template marker: '+token);
  const value=fs.readFileSync(path.join(root,'src',file),'utf8');
  html=html.replace(token,()=>file.endsWith('.js')?value.replace(/<\/script/gi,'<\\/script'):value);
}
fs.writeFileSync(path.join(root,'index.html'),html,'utf8');
console.log('Built self-contained index.html ('+Math.round(Buffer.byteLength(html)/1024)+' KB)');
