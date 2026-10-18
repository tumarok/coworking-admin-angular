import { createApi } from './core/api';
import { DEMO_PASSWORD } from './core/db';
import { API_PREFIX, createNodeServer } from './node';

const port = Number(process.env['PORT'] ?? 4010);
const latencyMs = Number(process.env['MOCK_LATENCY_MS'] ?? 250);

const api = createApi({ seed: Number(process.env['MOCK_SEED'] ?? 42) });

createNodeServer(api, { latencyMs, log: process.env['MOCK_LOG'] === '1' }).listen(port, () => {
  console.warn(`Mock API on http://localhost:${port}${API_PREFIX} (latency ${latencyMs} ms)`);
  console.warn(`Sign in with admin@coworking.test / ${DEMO_PASSWORD}`);
});
