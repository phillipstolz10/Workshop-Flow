import os
os.chdir("/tmp")
import http.server, socketserver

PORT = 7788

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "/WorkshopFlow.html")
            self.end_headers()
        else:
            super().do_GET()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
