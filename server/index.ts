import { serve } from '@hono/node-server';
import { createAnthropicProvider } from './ai/anthropic.ts';
import { fakeProvider } from './ai/types.ts';
import { createApp } from './app.ts';
import { consoleMailer } from './auth.ts';
import { loadConfig } from './config.ts';
import { openStore } from './store.ts';

const config = loadConfig();
const provider =
	config.aiProvider === 'anthropic'
		? createAnthropicProvider({
				apiKey: config.anthropicApiKey!,
				modelProofread: config.modelProofread,
				modelCompose: config.modelCompose,
			})
		: fakeProvider;
// No real email provider yet: development prints links; production refuses sign-in requests (503).
const mailer = config.production ? null : consoleMailer;

const app = createApp({ config, store: openStore(config.databasePath), provider, mailer });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
	console.log(`API listening on http://localhost:${port} (AI provider: ${config.aiProvider})`),
);
