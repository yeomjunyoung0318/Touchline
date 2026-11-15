'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'..','index.html');
const server=http.createServer((req,res)=>{
  if(!['/','/index.html'].includes(req.url.split('?')[0])) {res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
});
server.listen(0,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
