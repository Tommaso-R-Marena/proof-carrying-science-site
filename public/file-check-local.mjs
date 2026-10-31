// The only network path used by the portable file checker. Production website
// origins fail before any request; data can go only to this app's own loopback.
import {canonical,SCOPE} from './file-check-core.mjs';
function requireLocal(session) {
  if(location.protocol!=='http:'||location.hostname!=='127.0.0.1'||session.origin!==location.origin||!/^[a-f0-9]{64}$/.test(session.token))throw Error('Open the portable app to use the local checker.');
}
async function readBounded(response) {
  if(Number(response.headers.get('content-length'))>16384)throw Error('The local checker response is too large.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw Error('The local checker response is too large.');}parts.push(value);}}
  finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let pos=0;for(const p of parts){raw.set(p,pos);pos+=p.length;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!response.ok)throw Error(value.error||'The local checker could not complete this check.');return value;
}
export async function connectLocal() {
  const token=new URLSearchParams(location.hash.slice(1)).get('session');if(!token)return null;
  const session={origin:location.origin,token};requireLocal(session);
  history.replaceState(null,'',location.pathname);
  const response=await fetch('/api/session',{headers:{'X-PCS-Session':session.token},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  const value=await readBounded(response);
  if(value.format!=='pcs-file-check-session-v1'||value.scope!==SCOPE||!/^[a-f0-9]{64}$/.test(value.checker_sha256))throw Error('Local session unavailable.');
  return Object.freeze({...session,checkerHash:value.checker_sha256});
}
export async function checkLocally(session,request,signal) {
  requireLocal(session);
  const response=await fetch('/api/check-files',{method:'POST',headers:{'Content-Type':'application/json','X-PCS-Session':session.token},body:canonical(request),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(35000)])});
  return readBounded(response);
}
