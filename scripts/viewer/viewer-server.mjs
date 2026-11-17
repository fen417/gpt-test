import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const site = fileURLToPath(new URL('./site/', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
};

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://' + host).pathname;
    const file = path === '/' ? 'soldier-review.html' : path.slice(1);
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const type = contentTypes[extname(file)];
    if (!type || !file.split('/').every(segment => /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(segment))) {
      response.writeHead(404).end();
      return;
    }
    const bytes = await readFile(join(site, file));
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500).end();
  }
});

server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(0, host, () => {
  const url = 'http://' + host + ':' + server.address().port + '/';
  console.log('SECTOR 09 — ' + url);
  console.log('Keep this window open while using the viewer. Ctrl+C stops it.');
  if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log('Open the URL above in your browser.'));
    browser.unref();
  }
});
