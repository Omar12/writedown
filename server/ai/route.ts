import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireUser, sameOrigin, type AuthEnv } from '../auth.ts';
import type { Config } from '../config.ts';
import type { Store } from '../store.ts';
import { ACTIONS, ProviderError, type Action, type Provider, type SuggestInput } from './types.ts';

export const LIMITS = { target: 4000, context: 2000, instruction: 500, body: 64 * 1024 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;
const TIMEOUT_MS = 25_000;
const MAX_CONCURRENT_PER_USER = 2;

const STATUS = {
	upstream_invalid: 502,
	upstream_unavailable: 503,
	upstream_timeout: 504,
	ai_declined: 422,
} as const;

type Parsed =
	| { ok: true; requestId: string; input: SuggestInput }
	| { ok: false; status: 400 | 413; error: string };

function parse(body: unknown): Parsed {
	if (typeof body !== 'object' || body === null)
		return { ok: false, status: 400, error: 'invalid_input' };
	const b = body as Record<string, unknown>;
	const str = (v: unknown, fallback = '') => (v === undefined || v === null ? fallback : v);
	const requestId = b.requestId;
	const action = b.action;
	const targetText = b.targetText;
	const contextBefore = str(b.contextBefore);
	const contextAfter = str(b.contextAfter);
	const instruction = str(b.instruction, null as unknown as string);
	const locale = str(b.locale, 'en');
	if (
		typeof requestId !== 'string' ||
		!UUID.test(requestId) ||
		!ACTIONS.includes(action as Action) ||
		typeof targetText !== 'string' ||
		typeof contextBefore !== 'string' ||
		typeof contextAfter !== 'string' ||
		(instruction !== null && typeof instruction !== 'string') ||
		typeof locale !== 'string' ||
		!LOCALE.test(locale)
	) {
		return { ok: false, status: 400, error: 'invalid_input' };
	}
	if (!targetText.trim()) return { ok: false, status: 400, error: 'empty_target' };
	if (action === 'custom' && !instruction?.trim())
		return { ok: false, status: 400, error: 'missing_instruction' };
	if (
		targetText.length > LIMITS.target ||
		contextBefore.length > LIMITS.context ||
		contextAfter.length > LIMITS.context ||
		(instruction?.length ?? 0) > LIMITS.instruction
	) {
		return { ok: false, status: 413, error: 'payload_too_large' };
	}
	return {
		ok: true,
		requestId,
		input: {
			action: action as Action,
			targetText,
			contextBefore,
			contextAfter,
			instruction: action === 'custom' ? instruction : null,
			locale,
		},
	};
}

export function aiRoutes(config: Config, store: Store, provider: Provider) {
	const app = new Hono<AuthEnv>();
	const inFlight = new Map<string, number>(); // ponytail: per-process; fine for one server instance

	app.post(
		'/suggest',
		sameOrigin(config),
		bodyLimit({
			maxSize: LIMITS.body,
			onError: (c) => c.json({ error: 'payload_too_large' }, 413),
		}),
		requireUser(config, store),
		async (c) => {
			if (!c.req.header('content-type')?.startsWith('application/json')) {
				return c.json({ error: 'invalid_input' }, 400);
			}
			const parsed = parse(await c.req.json().catch(() => null));
			if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status);
			const { requestId, input } = parsed;
			c.header('X-Request-Id', requestId);
			const email = c.get('email');
			const fail = (status: 422 | 429 | 502 | 503 | 504, error: string) =>
				c.json({ error, requestId }, status);

			if ((inFlight.get(email) ?? 0) >= MAX_CONCURRENT_PER_USER)
				return fail(429, 'too_many_concurrent');
			if (!store.takeDailyRequest(email, config.dailyRequestsPerUser))
				return fail(429, 'daily_limit');
			const reserved = provider.maxCostUsd(input);
			if (!store.reserveSpend(reserved, config.monthlyBudgetUsd))
				return fail(429, 'budget_exhausted');

			inFlight.set(email, (inFlight.get(email) ?? 0) + 1);
			const started = Date.now();
			let costUsd = 0;
			let outcome = 'ok';
			try {
				const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(TIMEOUT_MS)]);
				const result = await provider.suggest(input, signal);
				costUsd = result.costUsd;
				const unchanged =
					result.status === 'no_change' || result.replacementText === input.targetText;
				return c.json({
					requestId,
					status: unchanged ? 'no_change' : 'suggestion',
					replacementText: unchanged ? input.targetText : result.replacementText,
					...(result.reason && !unchanged ? { reason: result.reason } : {}),
				});
			} catch (error) {
				const code = error instanceof ProviderError ? error.code : 'upstream_unavailable';
				costUsd = error instanceof ProviderError ? error.costUsd : 0;
				outcome = code;
				return fail(STATUS[code], code);
			} finally {
				store.settleSpend(reserved, costUsd);
				inFlight.set(email, (inFlight.get(email) ?? 1) - 1);
				// Metadata only: never document text, prompts, model output or the user's email.
				console.log(
					JSON.stringify({
						event: 'ai_suggest',
						requestId,
						action: input.action,
						outcome,
						ms: Date.now() - started,
						costUsd: Number(costUsd.toFixed(6)),
					}),
				);
			}
		},
	);

	return app;
}
