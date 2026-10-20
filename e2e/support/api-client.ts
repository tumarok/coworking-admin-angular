import type { APIRequestContext } from '@playwright/test';

type Query = Record<string, string | number | boolean>;

/**
 * Talks to the mock API the way the app does, to prepare and read test data without clicking
 * through the screens. It goes through the same address as the browser (the static server, which
 * forwards `/api`), so the proxy is exercised too. A refusal throws with the request and the
 * answer in the message, so a failed set-up reads as one.
 */
export class ApiClient {
  /** The bearer token of the signed-in user, once `signIn` has run. */
  token = '';

  constructor(private readonly request: APIRequestContext) {}

  /** Puts the mock back to its seeded data. */
  async reset(): Promise<void> {
    await this.send('POST', '/__reset', { auth: false });
  }

  async signIn(email: string, password: string): Promise<void> {
    const answer = await this.send('POST', '/auth/login', {
      data: { email, password },
      auth: false,
    });
    this.token = (answer as { token: string }).token;
  }

  async get<T>(path: string, params?: Query): Promise<T> {
    return (await this.send('GET', path, { params })) as T;
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return (await this.send('POST', path, { data })) as T;
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    return (await this.send('PATCH', path, { data })) as T;
  }

  private async send(
    method: string,
    path: string,
    { data, params, auth = true }: { data?: unknown; params?: Query; auth?: boolean },
  ): Promise<unknown> {
    const answer = await this.request.fetch(`/api/v1${path}`, {
      method,
      data,
      params,
      headers: auth && this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
    });
    const text = await answer.text();
    if (!answer.ok()) {
      throw new Error(`${method} /api/v1${path} answered ${answer.status()}: ${text}`);
    }
    return text ? (JSON.parse(text) as unknown) : undefined;
  }
}
