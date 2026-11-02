#!/usr/bin/env python3
"""Preview with browser caching for generated, content-addressed assets."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parent.parent)
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if self.path.startswith('/site-assets/') and not self.path.endswith('manifest.json') else 'no-cache')
        super().end_headers()
ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', '8877'))), Handler).serve_forever()
