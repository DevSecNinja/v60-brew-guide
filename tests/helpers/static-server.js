const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

async function startStaticServer() {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(REPO_ROOT, relativePath);
    const isInsideRepo = filePath === REPO_ROOT || filePath.startsWith(REPO_ROOT + path.sep);

    if (!isInsideRepo) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    });
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let closed = false;
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.close(resolve);
      for (const socket of sockets) socket.destroy();
    }),
  };
}

module.exports = { startStaticServer };
