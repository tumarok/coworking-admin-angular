import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';

import type { MockApi } from './core/api';

export const API_PREFIX = '/api/v1';

export interface NodeServerOptions {
  /** Artificial delay per request, so loading states are visible during development. */
  latencyMs?: number;
  log?: boolean;
}

const readJson = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
};

/** Serves the mock API over plain node:http. Any frontend can use it, not only this one. */
export const createNodeServer = (
  api: MockApi,
  { latencyMs = 0, log = false }: NodeServerOptions = {},
): Server => {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(API_PREFIX)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not found' }));
      return;
    }

    const body = await readJson(req);
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    const result = api.handle({
      method: req.method ?? 'GET',
      path: url.pathname.slice(API_PREFIX.length) || '/',
      query: Object.fromEntries(url.searchParams),
      body,
      authorization: req.headers.authorization,
    });
    if (log) console.warn(`${req.method} ${url.pathname}${url.search} -> ${result.status}`);

    if (result.status === 204 || result.body === undefined) {
      res.writeHead(result.status).end();
      return;
    }
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  };

  return createServer((req, res) => {
    void handle(req, res);
  });
};
