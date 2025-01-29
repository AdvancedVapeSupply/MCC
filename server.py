from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import urllib.request
import re

class ProxyRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/proxy/'):
            # Extract the GitHub URL from the path
            github_url = self.path.replace('/proxy/', '')
            github_url = urllib.parse.unquote(github_url)
            
            try:
                # Forward the request to GitHub
                req = urllib.request.Request(github_url)
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Content-type', response.headers.get('Content-type', 'application/octet-stream'))
                    self.send_header('Content-Length', response.headers.get('Content-Length', ''))
                    self.end_headers()
                    self.wfile.write(response.read())
            except Exception as e:
                self.send_error(500, str(e))
        else:
            return SimpleHTTPRequestHandler.do_GET(self)

if __name__ == '__main__':
    port = 5050
    print(f"Starting proxy server on port {port}")
    httpd = HTTPServer(('localhost', port), ProxyRequestHandler)
    httpd.serve_forever() 