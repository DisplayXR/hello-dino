// Local dev server for panel testing: serves the static page AND runs the real api/session.js on
// http://127.0.0.1:8137 (localhost is a secure context, so the microphone works).
//   OPENAI_API_KEY=... node tools/dev_server.mjs
// Never deployed; Vercel serves api/ itself.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/session.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/plain' };
const PORT = Number(process.env.PORT || 8137);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/session') {
    // Minimal Vercel-style res shim.
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    return handler(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); });
  }
  const p = normalize(join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(p);
    res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404; res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`hello-dino dev: http://127.0.0.1:${PORT}/`));
