import http from 'node:http';
import { URL } from 'node:url';

import convertHandler from './api/blackbox/convert.js';
import detectFlightsHandler from './api/blackbox/detect-flights.js';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const routes = new Map([
  ['POST /api/blackbox/convert', convertHandler],
  ['OPTIONS /api/blackbox/convert', convertHandler],
  ['POST /api/blackbox/detect-flights', detectFlightsHandler],
  ['OPTIONS /api/blackbox/detect-flights', detectFlightsHandler],
]);

function attachResponseHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = (payload) => {
    if (Buffer.isBuffer(payload) || typeof payload === 'string') {
      res.end(payload);
      return res;
    }

    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
}

function normalizeQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const existing = query[key];
      query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

const server = http.createServer(async (req, res) => {
  try {
    attachResponseHelpers(res);

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    req.query = normalizeQuery(parsedUrl.searchParams);

    const routeKey = `${req.method} ${parsedUrl.pathname}`;
    const handler = routes.get(routeKey);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    await handler(req, res);
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: error?.message || 'Internal server error' }));
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT}`);
});
