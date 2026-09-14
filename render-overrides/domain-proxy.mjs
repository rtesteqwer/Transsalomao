import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { URL } from 'node:url';

// Keep the Render address stable while serving the current production build.
// Vercel is used as the upstream so the Render proxy no longer depends on a
// second free Render service waking up first.
const upstreamOrigin = (process.env.PROXY_UPSTREAM || 'https://transsalomao.vercel.app').replace(/\/$/, '');
const publicOrigin = 'https://transsalomao.onrender.com';
const port = Number(process.env.PORT || 10000);

function isTextual(contentType) {
  return /text\/(html|css|plain|javascript)|application\/(json|javascript|xml)/i.test(contentType || '');
}

function decompress(buffer, encoding) {
  const value = String(encoding || '').toLowerCase().trim();
  if (!value || value === 'identity') return buffer;
  if (value.includes('br')) return zlib.brotliDecompressSync(buffer);
  if (value.includes('gzip')) return zlib.gunzipSync(buffer);
  if (value.includes('deflate')) return zlib.inflateSync(buffer);
  return buffer;
}

function rewriteBody(buffer, contentType) {
  if (!isTextual(contentType)) return buffer;
  return Buffer.from(buffer.toString('utf8').replaceAll(upstreamOrigin, publicOrigin), 'utf8');
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url || '/', upstreamOrigin);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstreamOrigin);

  const headers = { ...req.headers };
  headers.host = upstreamUrl.host;
  headers['x-forwarded-host'] = 'transsalomao.onrender.com';
  headers['x-forwarded-proto'] = 'https';
  headers['accept-encoding'] = 'identity';

  const proxyReq = https.request({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: 443,
    method: req.method,
    path: upstreamUrl.pathname + upstreamUrl.search,
    headers,
  }, (proxyRes) => {
    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      try {
        const responseHeaders = { ...proxyRes.headers };

        if (responseHeaders.location) {
          responseHeaders.location = String(responseHeaders.location).replaceAll(upstreamOrigin, publicOrigin);
        }
        if (Array.isArray(responseHeaders['set-cookie'])) {
          responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) =>
            cookie.replace(/Domain=transsalomao\.vercel\.app/ig, 'Domain=transsalomao.onrender.com')
          );
        }

        const compressed = Buffer.concat(chunks);
        const decoded = decompress(compressed, responseHeaders['content-encoding']);
        const body = rewriteBody(decoded, String(responseHeaders['content-type'] || ''));

        delete responseHeaders['content-length'];
        delete responseHeaders['content-encoding'];
        delete responseHeaders['transfer-encoding'];
        responseHeaders['content-length'] = String(body.length);

        res.writeHead(proxyRes.statusCode || 502, responseHeaders);
        res.end(body);
      } catch (error) {
        console.error('[domain-proxy] response decode error', error instanceof Error ? error.message : String(error));
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Trans Salomão temporariamente indisponível.');
      }
    });
  });

  proxyReq.setTimeout(30000, () => {
    proxyReq.destroy(new Error('upstream timeout'));
  });

  proxyReq.on('error', (error) => {
    console.error('[domain-proxy] upstream error', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Trans Salomão temporariamente indisponível.');
  });

  req.pipe(proxyReq);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[domain-proxy] ${publicOrigin} -> ${upstreamOrigin} on port ${port}`);
});
