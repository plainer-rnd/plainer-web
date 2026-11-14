// Minimal static server for the E2E tests (folder-per-page URLs, correct module MIME types).
// Not used in production: the site is served by Netlify.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  let file = path.join(root, pathname);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  // Like Netlify's rewrite for /join-shared-trip: a folder with an index page is served without a trailing slash (query kept).
  if (pathname.endsWith('/') || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}).listen(port, () => console.log('listening on ' + port));
