import os, sys
os.chdir("/Users/phillipstolz/Desktop/Claude")
import http.server, socketserver
PORT = 7788
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
