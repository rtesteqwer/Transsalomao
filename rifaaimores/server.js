const http = require('http');
const fs = require('fs');
const path = require('path');

const login = require('./api/login');
const session = require('./api/session');
const logout = require('./api/logout');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function enhanceResponse(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = value => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
  };
  return res;
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

async function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return {};
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function serveFile(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  rel = decodeURIComponent(rel);
  const filePath = path.resolve(ROOT, rel);
  if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) {
    return res.status(403).end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).end('Not found');
    const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, rawRes) => {
  const res = enhanceResponse(rawRes);
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    if (pathname === '/api/login') {
      req.body = await readBody(req);
      return login(req, res);
    }
    if (pathname === '/api/session') return session(req, res);
    if (pathname === '/api/logout') return logout(req, res);
    return serveFile(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ ok: false });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Rifa Aimorés running on port ${PORT}`);
});
