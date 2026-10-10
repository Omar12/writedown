import { createApp } from './app.ts';
import type { Provider } from './ai/types.ts';
import { fakeProvider } from './ai/types.ts';
import type { Mailer } from './auth.ts';
import { loadConfig, type Config } from './config.ts';
import { openStore } from './store.ts';

export const ORIGIN = 'http://localhost:5173';

/** In-memory app with fakes; returns helpers for signing in and calling the API like a browser. */
export function testApp(
	overrides: { config?: Partial<Config>; provider?: Provider; mailer?: Mailer | null } = {},
) {
	const config = { ...loadConfig({ ALLOWLIST: 'alice@example.com' }), ...overrides.config };
	const store = openStore(':memory:');
	const links: string[] = [];
	const mailer: Mailer | null =
		overrides.mailer === undefined
			? { sendSignInLink: async (_e, link) => void links.push(link) }
			: overrides.mailer;
	const app = createApp({ config, store, provider: overrides.provider ?? fakeProvider, mailer });

	const request = (path: string, init: RequestInit & { cookie?: string } = {}) =>
		app.request(`/api${path}`, {
			...init,
			headers: { origin: ORIGIN, ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
		});

	const postJson = (path: string, body: unknown, cookie?: string) =>
		request(path, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
			cookie,
		});

	async function signIn(email = 'alice@example.com') {
		await postJson('/auth/request', { email });
		const token = new URL(links.at(-1)!).searchParams.get('token')!;
		const res = await request('/auth/verify', {
			method: 'POST',
			body: new URLSearchParams({ token }),
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		});
		return res.headers.get('set-cookie')!.split(';')[0];
	}

	return { app, config, store, links, request, postJson, signIn };
}
