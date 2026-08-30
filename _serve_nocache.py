# -*- coding: utf-8 -*-
"""
serve_nocache.py —— 简易静态服务器，响应头强制加 Cache-Control: no-store, no-cache, must-revalidate
让浏览器每次都请求最新文件，避免磁盘 304。
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9255
CWD  = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
os.chdir(CWD)

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), NoCache)
    print(f"Serving {CWD}  ->  http://127.0.0.1:{PORT}/index.html  (no-cache)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.server_close()
