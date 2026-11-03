"""Portable loopback UI. No caller-selected programs, paths, origins or verdicts."""
from __future__ import annotations
import argparse
import errno
from contextlib import contextmanager
import shutil
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import mimetypes
from pathlib import Path
import secrets
import socket
import sys
import threading
import webbrowser

from file_check import LocalChecker, SCOPE, canonical, strict_json

DEFAULT_PORT = 49381  # Stable loopback origin keeps explicitly saved browser recipes reachable.
MAX_REQUEST = 9_000_000
PUBLIC_FILES = {'model-evaluation-core.mjs','model-evaluation.mjs','evaluation-reference.csv','evaluation-baseline.csv','evaluation-candidate.csv','evaluation-example.json', 'file-check.mjs', 'science-workflow-core.mjs', 'page-help.mjs', 'page-help-core.mjs', 'page-help.css', 'file-check-local.mjs', 'review-changes.mjs', 'review-changes.html', 'usability-study.html', 'example-iris-previous.csv', 'example-iris-new.csv', 'logo-mark.svg', 'file-check.css', 'check-my-files.html', 'file-check-core.mjs', 'usability-core.mjs', 'change-review-core.mjs', 'usability-study.mjs'}


@contextmanager
def application_assets():
    base = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent/'bundle'))
    payload = base/'native-payload.zip'
    if not payload.is_file():
        yield base
        return
    # Keep original native bytes inside an opaque archive: packagers may rewrite
    # and ad-hoc-sign Mach-O DATA entries. Never accept a changed checker pin.
    manifest = json.loads((base/'checker-manifest.json').read_bytes())
    names = {manifest['binary'], *manifest.get('dependent_files_sha256', {})}
    if any(Path(n).name != n or n in {'.', '..'} for n in names):
        raise ValueError('Invalid packaged native paths.')
    with tempfile.TemporaryDirectory(prefix='pcs-file-checker-runtime-') as tmp:
        assets = Path(tmp)
        shutil.copy2(base/'checker-manifest.json', assets/'checker-manifest.json')
        shutil.copytree(base/'public', assets/'public')
        with zipfile.ZipFile(payload) as z:
            entries = z.infolist()
            if len(entries) != len(names) or {x.filename for x in entries} != names or sum(x.file_size for x in entries) > 1_000_000_000:
                raise ValueError('Invalid packaged native payload.')
            for entry in entries:
                path = assets/entry.filename
                path.write_bytes(z.read(entry))
                path.chmod(0o700 if entry.filename == manifest['binary'] else 0o600)
        LocalChecker(assets)  # Verify original binary/dependency pins before use.
        yield assets


class AppServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = sys.platform != 'win32'
    allow_reuse_port = False

    def server_bind(self):
        # Windows SO_REUSEADDR can let a second listener take the same address.
        # Use the OS exclusive-bind mode; this is not an immutable host root.
        if sys.platform == 'win32':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def __init__(self, assets, *, port=0, handoff=None):
        self.assets = Path(assets).resolve()
        self.checker = LocalChecker(self.assets)
        self.token = secrets.token_hex(32)
        self.check_slot = threading.BoundedSemaphore(1)
        self.handoff = handoff
        self.handoff_lock = threading.Lock()
        super().__init__(('127.0.0.1', port), Handler)
        self.origin = f'http://127.0.0.1:{self.server_port}'
        # A new document URL also refreshes a browser that reuses an old tab.
        # This public navigation nonce is separate from the secret capability.
        self.launch_url = f'{self.origin}/review-changes.html?launch={secrets.token_hex(16)}#session={self.token}'


class Handler(BaseHTTPRequestHandler):
    server_version = 'PCS-File-Checker'
    sys_version = ''

    def log_message(self, *_):
        pass  # Do not log user paths, requests, file contents or session tokens.

    def send(self, code, body, content_type='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def error(self, code, message):
        self.send(code, canonical({'error': message}))

    def valid_host(self):
        return self.headers.get_all('Host',[]) == [self.server.origin.removeprefix('http://')]

    def authorized(self):
        tokens = self.headers.get_all('X-PCS-Session', [])
        origins = self.headers.get_all('Origin', [])
        token = tokens[0] if len(tokens)==1 else ''
        return self.valid_host() and len(token)==64 and all(c in '0123456789abcdef' for c in token) and hmac.compare_digest(token, self.server.token) and (not origins or origins==[self.server.origin])

    def do_GET(self):
        if not self.valid_host():
            return self.error(403, 'Unsupported host.')
        if self.path == '/api/session':
            if not self.authorized():
                return self.error(403, 'Open the app using its local session link.')
            return self.send(200, canonical({'format': 'pcs-file-check-session-v1', 'scope': SCOPE,
                                            'checker_sha256': self.server.checker.manifest['binary_sha256'],
                                            'capabilities':self.server.checker.manifest.get('capabilities',[]),
                                            'has_handoff':self.server.handoff is not None,'version':self.server.checker.manifest.get('version')}))
        if self.path == '/api/handoff':
            if not self.authorized():return self.error(403,'Open the app using its local session link.')
            with self.server.handoff_lock:
                raw=self.server.handoff
                self.server.handoff=None
            if raw is None:return self.error(404,'No pending private replay. Choose your saved replay in the app.')
            return self.send(200,raw)
        path = self.path.partition('?')[0]
        name = 'check-my-files.html' if path == '/' else path.removeprefix('/')
        if name not in PUBLIC_FILES:
            return self.error(404, 'Not found.')
        try:
            raw = (self.server.assets/'public'/name).read_bytes()
            import hashlib
            expected = self.server.checker.manifest.get('source_sha256', {}).get('public/'+name)
            if hashlib.sha256(raw).hexdigest() != expected:
                return self.error(503, 'Bundled page changed. Download a fresh app.')
        except OSError:
            return self.error(503, 'Bundled page unavailable. Download a fresh app.')
        content_type = {'.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.json':'application/json; charset=utf-8'}[Path(name).suffix]
        self.send(200, raw, content_type)

    do_HEAD = do_GET

    def do_OPTIONS(self):
        self.error(403, 'Cross-origin requests are not supported.')

    def do_POST(self):
        self.connection.settimeout(15)
        if self.path != '/api/check-files' or not self.authorized():
            return self.error(403, 'Unsupported request or local session.')
        if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
            return self.error(400, 'Use a bounded JSON request.')
        try:
            values = self.headers.get_all('Content-Length', [])
            if len(values) != 1 or not values[0].isdigit():
                raise ValueError('A single content length is required.')
            size = int(values[0])
            if not 0 < size <= MAX_REQUEST:
                return self.error(413, 'Choose files smaller than 2 MB each.')
            if not self.server.check_slot.acquire(blocking=False):
                return self.error(429, 'A local check is already running. Try again shortly.')
            try:
                raw = self.rfile.read(size)
                if len(raw) != size:
                    raise ValueError('The request was incomplete.')
                payload = strict_json(raw)
                mode=payload.get('mode') if type(payload) is dict else None
                if mode=='evaluation':
                    from model_evaluation import evaluate
                    result=evaluate(self.server.checker,payload)
                else:result = self.server.checker.review(payload) if mode=='changes' else self.server.checker.verify(payload)
                self.send(200, canonical(result))
            finally:
                self.server.check_slot.release()
        except ValueError as exc:
            self.error(400, str(exc)[:240])
        except (OSError, UnicodeError, RecursionError, OverflowError):
            self.error(400, 'The file check could not complete. Check the CSV format, file identities and ID columns, then try again.')


def main():
    parser = argparse.ArgumentParser(description='PCS File Checker: choose CSV files in your browser; all checks stay local.')
    parser.add_argument('--self-test', action='store_true', help='Run a real bundled-checker smoke test without opening a browser.')
    parser.add_argument('handoff',nargs='?',type=Path,help='Optional private replay; files and rules load together, then need a fresh check.')
    args = parser.parse_args()
    with application_assets() as assets:
        from handoff import capture_handoff
        try: captured=capture_handoff(args.handoff)
        except (ValueError,OSError,RecursionError):
            print('Could not open that private replay. Choose a canonical PCS replay up to 9 MB. No check ran.')
            raise SystemExit(2) from None
        run_app(assets, args.self_test, captured)


def run_app(assets, self_test, handoff=None):
    if self_test:
        import base64, hashlib
        raw = [b'id\n001\n002\n', b'id\n003\n']
        request = {'columns': [0, 0], 'files': [{'name': f'{i}.csv', 'data_base64': base64.b64encode(x).decode(), 'sha256': hashlib.sha256(x).hexdigest()} for i, x in enumerate(raw)]}
        checker = LocalChecker(assets)
        if checker.verify(request)['lean_verdict'] != 'DISJOINT':
            raise ValueError('Packaged overlap self-test failed.')
        request.update(mode='changes', compare_headers=[], rules={'allow_added': True, 'allow_removed': True, 'allow_changed': False})
        if checker.review(request)['accepted'] is not True:
            raise ValueError('Packaged change-review self-test failed.')
        from model_evaluation import evaluate
        files=[b'id,label\na,yes\nb,yes\nc,yes\n',b'id,label\na,yes\nb,no\nc,no\n',b'id,label\na,no\nb,yes\nc,yes\n']
        req={'mode':'evaluation','files':[{'name':str(i)+'.csv','data_base64':base64.b64encode(x).decode(),'sha256':hashlib.sha256(x).hexdigest()} for i,x in enumerate(files)],'columns':[[0,1]]*3,
             'provenance':{'baseline_name':'Old','candidate_name':'New','baseline_weights_sha256':None,'candidate_weights_sha256':None,'reference_note':'Authored control','source_note':''}}
        er=evaluate(checker,req)
        if er['summary']!={'total':3,'before_matches':1,'after_matches':2,'improvements':2,'regressions':1} or er['preserved'] is not False:raise ValueError('Packaged evaluation regression control failed.')
        print('PASS: packaged app executed the real bundled Lean CSV checker')
        return
    try:
        server = AppServer(assets, port=DEFAULT_PORT, handoff=handoff)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        print('PCS File Checker could not open its local address. Another copy may already be running. Return to its browser tab, or close the other copy and open this app again.')
        if sys.stdin.isatty():
            input('Press Enter to close this window. ')
        raise SystemExit(1) from None
    with server:
        url = server.launch_url
        opened = webbrowser.open(url, new=1)
        print('PCS File Checker is open in your browser. Files stay on this computer. Close this window to stop the local checker.')
        if not opened:
            print('The default browser did not open. Open this private local session link in your browser:')
            print(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
