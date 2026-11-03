"""Transport/integrity tests only; real Lean/model execution is a browser gate."""
import hashlib,http.client,importlib.util,json,sys,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import serve_connected_site as runtime

class RuntimeBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'public').mkdir()
        self.file=self.root/'public/page.html';self.file.write_bytes(b'<!doctype html><h1>Reviewed fixture</h1>')
        self.override=patch.object(runtime,'ROOT',self.root);self.override.start()
        self.server=runtime.ConnectedServer(0,1,{'page.html':hashlib.sha256(self.file.read_bytes()).hexdigest()})
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.override.stop();self.temp.cleanup()
    def request(self,method,path,body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:c.request(method,path,body=body,headers=headers or {});r=c.getresponse();return r.status,dict(r.headers),r.read()
        finally:c.close()
    def test_only_unchanged_reviewed_static_bytes_are_served(self):
        status,headers,raw=self.request('GET','/page.html?local=1');self.assertEqual(status,200);self.assertEqual(raw,self.file.read_bytes());self.assertIn("default-src 'self'",headers['Content-Security-Policy'])
        self.file.write_bytes(b'changed');self.assertEqual(self.request('GET','/page.html')[0],503)
    def test_unknown_paths_encoded_traversal_and_symlinks_fail_closed(self):
        for path in ['/not-listed','/../page.html','/%2e%2e/page.html','/api/session?other=1']:
            with self.subTest(path=path):self.assertIn(self.request('GET',path)[0],{400,404})
        target=self.root/'outside';target.write_bytes(b'outside');self.file.unlink();self.file.symlink_to(target)
        self.assertEqual(self.request('GET','/page.html')[0],503)
    def test_foreign_or_duplicate_origin_and_host_are_rejected(self):
        for headers in [{'Host':'attacker.example'},{'Origin':'https://attacker.example'},{'Origin':'null'}]:
            with self.subTest(headers=headers):self.assertEqual(self.request('GET','/page.html',headers=headers)[0],403)
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            c.putrequest('GET','/page.html',skip_host=True);c.putheader('Host','127.0.0.1:'+str(self.server.server_port));c.putheader('Host','other');c.endheaders();self.assertEqual(c.getresponse().status,403)
        finally:c.close()
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            c.putrequest('GET','/page.html');c.putheader('Origin',self.server.origin);c.putheader('Origin',self.server.origin);c.endheaders();self.assertEqual(c.getresponse().status,403)
        finally:c.close()
    def test_private_runtime_does_not_silently_enable_publication(self):
        self.assertEqual(self.request('GET','/api/lean-research/status')[0],503)
        self.assertEqual(self.request('POST','/api/lean-research/submit',b'{}',{'Content-Type':'application/json'})[0],503)
        self.assertEqual(self.request('OPTIONS','/api/session')[0],403)
    def test_bounded_json_and_closed_routes_precede_backend_access(self):
        for path,headers in [('/api/session',{'Content-Type':'text/plain'}),('/api/session',{'Content-Type':'application/json','Content-Length':'99999'}),('/api/session',{'Content-Type':'application/json','Transfer-Encoding':'chunked'}),('/api/arbitrary',{'Content-Type':'application/json'})]:
            with self.subTest(path=path,headers=headers):self.assertIn(self.request('POST',path,b'{}',headers)[0],{400,404,415})
        self.assertEqual(self.request('GET','/api/health')[0],503)
    def test_head_checks_identity_without_sending_a_body(self):
        status,headers,raw=self.request('HEAD','/page.html');self.assertEqual(status,200);self.assertEqual(raw,b'');self.assertEqual(int(headers['Content-Length']),len(self.file.read_bytes()))

if __name__=='__main__':unittest.main()
