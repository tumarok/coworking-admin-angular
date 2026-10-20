import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from 'node:http';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

/**
 * Serves the production build the way a real host would, for the end-to-end suite: files from the
 * build output, `index.html` for any other path (the app routes in the browser), and `/api`
 * forwarded to the mock API. Plain `node:http`, no dependency.
 *
 * Settings come from the environment: `PORT` (4173), `API_PORT` (4010), `ROOT` (the build output).
 */
const port = Number(process.env['PORT'] ?? 4173);
const apiPort = Number(process.env['API_PORT'] ?? 4010);
const root = resolve(process.env['ROOT'] ?? 'dist/coworking-admin-angular/browser');

try {
  statSync(join(root, 'index.html'));
} catch {
  console.error(`No index.html in ${root}: run "npm run build" first.`);
  process.exit(1);
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const fileAt = async (path: string): Promise<string | undefined> => {
  const file = normalize(join(root, path));
  // A path that climbs out of the build output is not a file of it.
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  try {
    return (await stat(file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
};

/** Headers that describe one connection, not the message: a proxy must not pass them on. */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const withoutHopByHop = <T extends IncomingHttpHeaders | OutgoingHttpHeaders>(headers: T): T =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.includes(name))) as T;

const send = async (res: ServerResponse, file: string): Promise<void> => {
  const { size } = await stat(file);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': size,
    // The entry point names the hashed files of the build it belongs to: never serve a stale one.
    ...(basename(file) === 'index.html' ? { 'Cache-Control': 'no-cache' } : {}),
  });
  await pipeline(createReadStream(file), res);
};

/** Passes the request to the mock and streams its answer back; resolves once both are done. */
const forward = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const upstream = request({
    host: '127.0.0.1',
    port: apiPort,
    method: req.method,
    path: req.url,
    headers: { ...withoutHopByHop(req.headers), host: `127.0.0.1:${apiPort}` },
  });
  const answered = new Promise<IncomingMessage>((resolveAnswer, reject) => {
    upstream.once('response', resolveAnswer);
    upstream.once('error', reject);
  });
  // A client that goes away takes the upstream request with it.
  res.once('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });

  try {
    const [answer] = await Promise.all([answered, pipeline(req, upstream)]);
    res.writeHead(answer.statusCode ?? 502, withoutHopByHop(answer.headers));
    await pipeline(answer, res);
  } catch (error) {
    if (res.headersSent || res.destroyed) {
      // Part of the answer is out, or the client is gone: all that is left is to cut the line.
      res.destroy();
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'The mock API is not reachable' }));
    }
    if ((error as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE')
      console.error(error);
  }
};

const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    await forward(req, res);
    return;
  }
  const requested = decodeURIComponent(pathname);
  const file = await fileAt(requested);
  if (file) {
    await send(res, file);
    return;
  }
  // A missing file with an extension is a missing file; any other path is a route of the app.
  const index = extname(requested) === '' ? await fileAt('index.html') : undefined;
  if (index) {
    await send(res, index);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
};

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    // A client that left in the middle of an answer is not worth a line.
    if ((error as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE')
      console.error(error);
    if (res.headersSent) res.destroy();
    else res.writeHead(500).end();
  });
}).listen(port, () => {
  console.warn(`Serving ${root} on http://localhost:${port} (API on :${apiPort})`);
});
