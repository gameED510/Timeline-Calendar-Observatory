import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { proxyRequest } from '../shared/proxy.mjs';

const root=resolve(import.meta.dirname,'..');
const files=new Set(['index.html','styles.css','theme.js','app.js','calendar-motion.js','performance.js','actual-performance.js','performance-charts.js','favicon.svg','site.webmanifest']);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.gif':'image/gif'};
const config={supabaseUrl:process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.SUPABASE_ANON_KEY||'',supabaseProxyUrl:'/api/supabase-proxy'};
if(!config.supabaseUrl||!config.supabaseAnonKey) {
  try {
    const response=await fetch('https://xxltl.xyz/api/config',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Config unavailable');
    const publicConfig=await response.json();
    config.supabaseUrl=publicConfig.supabaseUrl;config.supabaseAnonKey=publicConfig.supabaseAnonKey;
  }catch {console.warn('Cloud configuration unavailable; set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in.');}
}
const server=createServer(async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/api/config') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(config));return;}
    if(url.pathname==='/api/supabase-proxy') {
      const upstream=await proxyRequest(new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})}),{supabaseUrl:config.supabaseUrl,anonKey:config.supabaseAnonKey,ip:req.socket.remoteAddress});
      res.writeHead(upstream.status,Object.fromEntries(upstream.headers));
      if(upstream.body)await pipeline(Readable.fromWeb(upstream.body),res);else res.end();
      return;
    }
    if(url.pathname==='/sw.js') {res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));");return;}
    const name=decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1));
    const path=resolve(root,name);
    if(!path.startsWith(root+sep)||(!files.has(name)&&!path.startsWith(resolve(root,'vendor')+sep))) {res.writeHead(404);res.end('Not found');return;}
    const content=await readFile(path);res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(content);
  }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:502);res.end('Preview request failed');}
});
let port=Number(process.env.PORT)||8768;
server.on('error',error=>{if(error.code==='EADDRINUSE'&&port<8800)server.listen(++port,'127.0.0.1');else throw error;});
server.on('listening',()=>console.log(`TL preview: http://127.0.0.1:${port}`));
server.listen(port,'127.0.0.1');
