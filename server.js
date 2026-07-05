import http from 'node:http';
import { URL } from 'node:url';

import convertHandler from './api/blackbox/convert.js';
import convertSmartHandler from './api/blackbox/convert-smart.js';
import detectFlightsHandler from './api/blackbox/detect-flights.js';
import createJobHandler from './api/blackbox/jobs/create.js';
import processJobHandler from './api/blackbox/jobs/process.js';
import resultJobHandler from './api/blackbox/jobs/result.js';
import statusJobHandler from './api/blackbox/jobs/status.js';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const routes = new Map([
  ['POST /api/blackbox/convert', convertHandler],
  ['OPTIONS /api/blackbox/convert', convertHandler],
  ['POST /api/blackbox/convert-smart', convertSmartHandler],
  ['OPTIONS /api/blackbox/convert-smart', convertSmartHandler],
  ['POST /api/blackbox/detect-flights', detectFlightsHandler],
  ['OPTIONS /api/blackbox/detect-flights', detectFlightsHandler],
  ['POST /api/blackbox/jobs/create', createJobHandler],
  ['OPTIONS /api/blackbox/jobs/create', createJobHandler],
  ['POST /api/blackbox/jobs/process', processJobHandler],
  ['OPTIONS /api/blackbox/jobs/process', processJobHandler],
  ['GET /api/blackbox/jobs/result', resultJobHandler],
  ['OPTIONS /api/blackbox/jobs/result', resultJobHandler],
  ['GET /api/blackbox/jobs/status', statusJobHandler],
  ['OPTIONS /api/blackbox/jobs/status', statusJobHandler],
  ['GET /healthz', async (_req, res) => res.status(200).json({ ok: true })],
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
