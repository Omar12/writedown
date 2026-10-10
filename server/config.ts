// All server configuration comes from the environment (.env locally, the host's secret store in deployment).

export type Config = {
	production: boolean;
	appOrigin: string; // exact origin the browser app is served from; used for CSRF checks and links
	allowlist: Set<string>; // lower-cased emails allowed into the private beta
	databasePath: string;
	aiProvider: 'anthropic' | 'openrouter' | 'fake';
	anthropicApiKey: string | undefined;
	openrouterApiKey: string | undefined;
	modelProofread: string;
	modelCompose: string;
	resendApiKey: string | undefined;
	mailFrom: string;
	dailyRequestsPerUser: number;
	monthlyBudgetUsd: number;
};

const number = (value: string | undefined, fallback: number) => {
	const n = Number(value);
	return value && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const production = env.NODE_ENV === 'production';
	const aiProvider =
		env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'openrouter' ? env.AI_PROVIDER : 'fake';
	if (aiProvider === 'anthropic' && !env.ANTHROPIC_API_KEY) {
		throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
	}
	if (aiProvider === 'openrouter') {
		if (!env.OPENROUTER_API_KEY)
			throw new Error('AI_PROVIDER=openrouter requires OPENROUTER_API_KEY');
		// OpenRouter ids look like "vendor/model"; the Claude defaults below don't apply, so don't guess.
		if (!env.MODEL_PROOFREAD || !env.MODEL_COMPOSE)
			throw new Error('AI_PROVIDER=openrouter requires MODEL_PROOFREAD and MODEL_COMPOSE');
	}
	if (env.RESEND_API_KEY && !env.MAIL_FROM) throw new Error('RESEND_API_KEY requires MAIL_FROM');
	if (production && !env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production');
	return {
		production,
		appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
		allowlist: new Set(
			(env.ALLOWLIST ?? '')
				.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter(Boolean),
		),
		databasePath: env.DATABASE_PATH ?? 'writedown-server.db',
		aiProvider,
		anthropicApiKey: env.ANTHROPIC_API_KEY,
		openrouterApiKey: env.OPENROUTER_API_KEY,
		modelProofread: env.MODEL_PROOFREAD ?? 'claude-haiku-5-5',
		modelCompose: env.MODEL_COMPOSE ?? 'claude-sonnet-5-5',
		resendApiKey: env.RESEND_API_KEY,
		mailFrom: env.MAIL_FROM ?? '',
		dailyRequestsPerUser: number(env.DAILY_REQUESTS_PER_USER, 100),
		monthlyBudgetUsd: number(env.MONTHLY_BUDGET_USD, 10),
	};
}
