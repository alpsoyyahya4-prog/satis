// Tiny static server for previewing build/web in a browser during development.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'build', 'web');
const types = { '.html': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5178, () => console.log('http://localhost:5178'));
