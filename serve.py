#!/usr/bin/env python3
"""Serve docs/ for development, with caching turned off.

`python3 -m http.server` sends no Cache-Control, so browsers fall back to
heuristic caching and will happily keep serving a stale style.css or
app.js after an edit -- including ES modules, which survive a plain
reload. That looks exactly like a change that did not work. no-store
makes every reload fetch the real file.

    python3 serve.py [port]        # default 8731
"""

import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):        # one line per request, quietly
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    print(f'serving {ROOT} at http://127.0.0.1:{port}/  (no-store)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
