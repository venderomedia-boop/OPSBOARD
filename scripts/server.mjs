import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 3000);
const root = path.resolve('ops-hub-mvp');
const entryPoint = path.join(root, 'standalone-demo.html');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (!fs.existsSync(entryPoint)) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('OPSBOARD build is missing.');
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  fs.createReadStream(entryPoint).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`OPSBOARD listening on port ${port}`);
});
