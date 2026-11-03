#!/usr/bin/env python3
"""Serve the real website with a receiver-owned local Lean/model backend.

This is a local research runtime, not a sandbox or immutable trusted root.
Public proof jobs remain separately consented and use the existing public service.
"""
import argparse,hashlib,json,mimetypes,os,signal,socket,subprocess,sys,threading,time,urllib.request,urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote
from replay_proof_workbench import trusted_source
from check_model_capabilities import inventory

ROOT=Path(__file__).resolve().parents[1]
PUBLIC_ORIGIN='https://proof-carrying-science-site.marenatommaso.workers.dev'
LOCAL_GET={'/api/health','/api/models'}
LOCAL_POST={'/api/formalize','/api/explain','/api/solve','/api/session','/api/step'}
PUBLIC_GET={'/api/lean-research/status'}
PUBLIC_POST={'/api/lean-research/submit','/api/lean-research/result','/api/lean-research/cancel'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def frontend_snapshot(development=False):
    names=subprocess.check_output(['git','ls-files','public'],cwd=ROOT,text=True).splitlines()
    extra=subprocess.check_output(['git','ls-files','--others','--exclude-standard','public'],cwd=ROOT,text=True).splitlines()
    changed=subprocess.check_output(['git','diff','--name-only','HEAD','--','public'],cwd=ROOT,text=True)
    if not development and (extra or changed):raise ValueError('Commit the reviewed frontend or explicitly use --development')
    result={}
    for name in names+(extra if development else []):
        p=ROOT/name
        if p.is_symlink() or not p.is_file():raise ValueError('Only reviewed regular public assets are served')
        result[name.removeprefix('public/')]=hashlib.sha256(p.read_bytes()).hexdigest()
    return result

class ConnectedServer(ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=False
    def __init__(self,port,backend_port,assets,allow_public=False,development=False):
        self.backend='http://127.0.0.1:'+str(backend_port);self.assets=assets
        self.allow_public=allow_public;self.development=development
        super().__init__(('127.0.0.1',port),Handler)
        self.origin='http://127.0.0.1:'+str(self.server_port)

class Handler(BaseHTTPRequestHandler):
    def valid(self):
        hosts=self.headers.get_all('Host',[])
        if len(hosts)!=1 or hosts[0]!=self.server.origin.removeprefix('http://'):return False
        origins=self.headers.get_all('Origin',[])
        return len(origins)<=1 and (not origins or origins[0]==self.server.origin)
    def send(self,status,raw,kind='application/json; charset=utf-8'):
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'")
        self.send_header('Referrer-Policy','no-referrer');self.end_headers()
        if self.command!='HEAD':self.wfile.write(raw)
    def error(self,status,message):self.send(status,json.dumps({'message':message,'pcs_authority':False}).encode())
    def proxy(self,path,body=None,public=False):
        origin=PUBLIC_ORIGIN if public else self.server.backend
        headers={'Origin':origin,'Accept':'application/json'}
        if body is not None:headers['Content-Type']='application/json'
        # Never forward local cookies, credentials or arbitrary caller headers.
        key=self.headers.get('Idempotency-Key')
        if public and path.endswith('/submit') and key:headers['Idempotency-Key']=key
        req=urllib.request.Request(origin+path,data=body,headers=headers,method='POST' if body is not None else 'GET')
        try:
            with urllib.request.build_opener(NoRedirect()).open(req,timeout=180 if path=='/api/solve' else 40) as r:
                raw=r.read(4_000_001)
                if len(raw)>4_000_000:return self.error(502,'Backend result exceeds the transport bound')
                self.send(r.status,raw)
        except urllib.error.HTTPError as e:
            raw=e.read(16385)
            self.send(e.code,raw) if len(raw)<=16384 and e.headers.get_content_type()=='application/json' else self.error(502,'Backend request was not completed')
        except (OSError,TimeoutError):self.error(503,'Backend unavailable. No result has been established')
    def do_GET(self):
        if not self.valid():return self.error(403,'Origin or host rejected')
        p=urlsplit(self.path)
        if p.path.startswith('/api/') and p.query:return self.error(400,'API query parameters are not accepted')
        if p.path=='/api/runtime/status':
            try:
                with urllib.request.urlopen(self.server.backend+'/api/health',timeout=5) as r:health=json.load(r)
                ready=health.get('status')=='ready' and 'version 4.28.0,' in health.get('lean','') and health.get('memory_configured') is True
                return self.send(200,json.dumps({'format':'pcs-connected-runtime-v1','ready':ready,'core_revision':self.server.core_revision,'verified_memory_checkpoint':self.server.memory_checkpoint,'public_jobs_enabled':self.server.allow_public,'physical_neural_execution_independently_attested':False,'pcs_authority':False}).encode())
            except (OSError,ValueError):return self.error(503,'The actual local Lean server is not ready')
        if p.path in LOCAL_GET:return self.proxy(p.path)
        if p.path in PUBLIC_GET:
            return self.proxy(p.path,public=True) if self.server.allow_public else self.error(503,'Public jobs are disabled locally. Use the local Lean lab or open the public PCS website')
        name=unquote(p.path).removeprefix('/') or 'lean-learning-lab.html'
        if not Path(name).suffix:name+='.html'
        if name not in self.server.assets or '..' in Path(name).parts:return self.error(404,'No reviewed asset at this path')
        file=ROOT/'public'/name
        try:
            if file.is_symlink():return self.error(503,'Frontend source changed')
            raw=file.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=self.server.assets[name]:return self.error(503,'Frontend source changed; restart from the reviewed snapshot')
            kind={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8'}.get(file.suffix,mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            self.send(200,raw,kind)
        except OSError:self.error(503,'Frontend source unavailable')
    do_HEAD=do_GET
    def do_POST(self):
        if not self.valid():return self.error(403,'Origin or host rejected')
        path=self.path
        if path not in LOCAL_POST|PUBLIC_POST:return self.error(404,'Unreviewed runtime route')
        if path in PUBLIC_POST and not self.server.allow_public:return self.error(503,'Public jobs are disabled by local configuration')
        values=self.headers.get_all('Content-Length',[])
        if self.headers.get('Transfer-Encoding') or len(values)!=1 or not values[0].isdigit() or not 0<int(values[0])<=16384:return self.error(400,'A single bounded JSON request is required')
        if self.headers.get_content_type()!='application/json':return self.error(415,'JSON required')
        self.connection.settimeout(15)
        try:
            raw=self.rfile.read(int(values[0]))
            if len(raw)!=int(values[0]):return self.error(400,'Incomplete request')
            # Each receiving backend independently validates its closed schema.
            self.proxy(path,raw,public=path in PUBLIC_POST)
        except (OSError,TimeoutError):self.error(400,'Request could not be read')
    def do_OPTIONS(self):self.error(403,'Cross-origin requests are not supported')
    def log_message(self,*args):pass

def main():
    p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);p.add_argument('--port',type=int,default=8769)
    p.add_argument('--development',action='store_true');p.add_argument('--allow-public-jobs',action='store_true',help='Allow the fixed public proof service; each submission still needs publication consent')
    a=p.parse_args();core=a.core.resolve()
    if a.port not in {8766,8769}:raise ValueError('The reviewed local interfaces use port 8766 or 8769')
    expected=json.loads((ROOT/'public/model-capabilities.json').read_text());actual=inventory(core)
    if actual!=expected:raise ValueError('Core models or source do not match the approved website inventory')
    trusted_source(core);assets=frontend_snapshot(a.development)
    with socket.socket() as s:s.bind(('127.0.0.1',0));backend_port=s.getsockname()[1]
    command=[sys.executable,'-m','pcs.experimental.prover.server','--models',str(core/'research/lean-learning-v2'),'--reuse-models',str(core/'research/checked-reuse-v2'),'--abstraction-models',str(core/'research/induction-abstraction-v2'),'--memory-models',str(core/'research/verified-memory-v1'),'--public',str(ROOT/'public'),'--port',str(backend_port)]
    env={**os.environ,'PYTHONPATH':str(core),'PYTHONDONTWRITEBYTECODE':'1'}
    child=subprocess.Popen(command,cwd=core,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,
                           start_new_session=os.name!='nt')
    def stop(signum,frame):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    ready=threading.Event()
    def logs():
        for line in child.stdout:
            if line.startswith('PCS local Lean backend ready on port '):ready.set()
    threading.Thread(target=logs,daemon=True).start()
    server=None
    try:
        deadline=time.monotonic()+180
        while not ready.wait(.2):
            if child.poll() is not None:raise RuntimeError('The real Lean/model backend failed to start')
            if time.monotonic()>deadline:raise RuntimeError('The real Lean/model backend did not become ready')
        server=ConnectedServer(a.port,backend_port,assets,a.allow_public_jobs,a.development)
        server.core_revision=actual['core_revision']
        server.memory_checkpoint=next(m['sha256'] for m in actual['models'] if m['family']=='verified-memory-v1' and m['selected'])
        print(json.dumps({'url':server.origin+'/lean-learning-lab.html','core_revision':actual['core_revision'],'model_checkpoints_verified':len(actual['models']),'public_jobs_enabled':a.allow_public_jobs,'development_frontend':a.development,'immutable_host_root_established':False,'pcs_authority':False}),flush=True)
        server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        if server:server.server_close()
        if os.name=='nt':
            subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        else:
            try:os.killpg(child.pid,signal.SIGTERM)
            except ProcessLookupError:pass
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            if os.name=='nt':child.kill()
            else:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
            child.wait()

if __name__=='__main__':main()
