import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const upstreamOrigin = 'https://transteste.onrender.com';
const publicOrigin = 'https://transsalomao.onrender.com';
const port = Number(process.env.PORT || 10000);

function rewriteText(buffer, contentType) {
  const textual = /text\/(html|css|plain|javascript)|application\/(json|javascript|xml)/i.test(contentType || '');
  if (!textual) return buffer;
  return Buffer.from(buffer.toString('utf8').replaceAll(upstreamOrigin, publicOrigin));
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url || '/', upstreamOrigin);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstreamOrigin);

  const headers = { ...req.headers };
  headers.host = upstreamUrl.host;
  headers['x-forwarded-host'] = 'transsalomao.onrender.com';
  headers['x-forwarded-proto'] = 'https';

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
      const responseHeaders = { ...proxyRes.headers };

      if (responseHeaders.location) {
        responseHeaders.location = String(responseHeaders.location).replaceAll(upstreamOrigin, publicOrigin);
      }
      if (Array.isArray(responseHeaders['set-cookie'])) {
        responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) =>
          cookie.replace(/Domain=transteste\.onrender\.com/ig, 'Domain=transsalomao.onrender.com')
        );
      }

      delete responseHeaders['content-length'];
      delete responseHeaders['content-encoding'];
      delete responseHeaders['transfer-encoding'];

      const body = rewriteText(Buffer.concat(chunks), String(responseHeaders['content-type'] || ''));
      responseHeaders['content-length'] = String(body.length);
      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      res.end(body);
    });
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
