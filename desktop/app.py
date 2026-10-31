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
MAX_REQUEST = 5_700_000
PUBLIC_FILES = {'check-my-files.html', 'file-check.css', 'file-check.mjs', 'file-check-core.mjs', 'file-check-local.mjs', 'logo-mark.svg'}


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

    def __init__(self, assets, *, port=0):
        self.assets = Path(assets).resolve()
        self.checker = LocalChecker(self.assets)
        self.token = secrets.token_hex(32)
        self.check_slot = threading.BoundedSemaphore(1)
        super().__init__(('127.0.0.1', port), Handler)
        self.origin = f'http://127.0.0.1:{self.server_port}'
        # A new document URL also refreshes a browser that reuses an old tab.
        # This public navigation nonce is separate from the secret capability.
        self.launch_url = f'{self.origin}/check-my-files.html?launch={secrets.token_hex(16)}#session={self.token}'


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
        return self.headers.get('Host') == self.server.origin.removeprefix('http://')

    def authorized(self):
        token = self.headers.get('X-PCS-Session', '')
        return self.valid_host() and len(token)==64 and all(c in '0123456789abcdef' for c in token) and hmac.compare_digest(token, self.server.token) and self.headers.get('Origin', self.server.origin) == self.server.origin

    def do_GET(self):
        if not self.valid_host():
            return self.error(403, 'Unsupported host.')
        if self.path == '/api/session':
            if not self.authorized():
                return self.error(403, 'Open the app using its local session link.')
            return self.send(200, canonical({'format': 'pcs-file-check-session-v1', 'scope': SCOPE,
                                            'checker_sha256': self.server.checker.manifest['binary_sha256']}))
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
        content_type = {'.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml'}[Path(name).suffix]
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
                result = self.server.checker.verify(strict_json(raw))
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
    args = parser.parse_args()
    with application_assets() as assets:
        run_app(assets, args.self_test)


def run_app(assets, self_test):
    if self_test:
        import base64, hashlib
        raw = [b'id\n001\n002\n', b'id\n003\n']
        request = {'columns': [0, 0], 'files': [{'name': f'{i}.csv', 'data_base64': base64.b64encode(x).decode(), 'sha256': hashlib.sha256(x).hexdigest()} for i, x in enumerate(raw)]}
        assert LocalChecker(assets).verify(request)['lean_verdict'] == 'DISJOINT'
        print('PASS: packaged app executed the real bundled Lean CSV checker')
        return
    try:
        server = AppServer(assets, port=DEFAULT_PORT)
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
