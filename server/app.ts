import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { aiRoutes } from './ai/route.ts';
import type { Provider } from './ai/types.ts';
import { authRoutes, type Mailer } from './auth.ts';
import type { Config } from './config.ts';
import type { Store } from './store.ts';

export type Deps = { config: Config; store: Store; provider: Provider; mailer: Mailer | null };

export function createApp({ config, store, provider, mailer }: Deps) {
	const app = new Hono().basePath('/api');
	app.use(secureHeaders());
	app.get('/health', (c) => c.json({ status: 'ok' }));
	app.route('/auth', authRoutes(config, store, mailer));
	app.route('/ai', aiRoutes(config, store, provider));
	return app;
}
