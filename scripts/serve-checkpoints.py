from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re, sys
root=Path(sys.argv[1]).resolve()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name=self.path.split('?',1)[0].lstrip('/')
        if not re.fullmatch(r'StickLaugh_Dynamic_[A-Za-z0-9_]+\.zip',name):
            self.send_error(404);return
        p=root/name
        if not p.is_file():self.send_error(404);return
        self.send_response(200)
        self.send_header('Content-Type','application/zip')
        self.send_header('Content-Disposition','attachment; filename="'+name+'"')
        self.send_header('Content-Length',str(p.stat().st_size))
        self.send_header('Cache-Control','no-store');self.end_headers()
        with p.open('rb') as f:
            while chunk:=f.read(1024*1024):self.wfile.write(chunk)
print('Checkpoint downloads: http://127.0.0.1:3002/',flush=True)
ThreadingHTTPServer(('127.0.0.1',3002),Handler).serve_forever()
