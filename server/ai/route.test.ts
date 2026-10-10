import { afterEach, expect, test, vi } from 'vitest';
import { testApp } from '../testing.ts';
import { LIMITS } from './route.ts';
import { ProviderError, type Provider } from './types.ts';

afterEach(() => vi.restoreAllMocks());

const body = (over: Record<string, unknown> = {}) => ({
	requestId: crypto.randomUUID(),
	action: 'proofread',
	targetText: 'Teh ideas is good.',
	contextBefore: '',
	contextAfter: '',
	instruction: null,
	locale: 'en',
	...over,
});

async function signedIn(over: Parameters<typeof testApp>[0] = {}) {
	const t = testApp(over);
	const cookie = await t.signIn();
	return { ...t, suggest: (b: unknown) => t.postJson('/ai/suggest', b, cookie) };
}

test('anonymous 401; signed-in but removed from allowlist 403', async () => {
	const t = testApp();
	expect((await t.postJson('/ai/suggest', body())).status).toBe(401);
	const s = await signedIn();
	s.config.allowlist.clear();
	expect((await s.suggest(body())).status).toBe(403);
});

test('valid request returns a suggestion with the request id', async () => {
	const s = await signedIn();
	const b = body({ targetText: 'i think teh plan works.' });
	const res = await s.suggest(b);
	expect(res.status).toBe(200);
	expect(res.headers.get('x-request-id')).toBe(b.requestId);
	expect(await res.json()).toEqual({
		requestId: b.requestId,
		status: 'suggestion',
		replacementText: 'I think the plan works.',
	});
});

test('unchanged text is reported as no_change', async () => {
	const s = await signedIn();
	expect(await (await s.suggest(body({ targetText: 'All good here.' }))).json()).toMatchObject({
		status: 'no_change',
		replacementText: 'All good here.',
	});
});

test.each([
	['bad request id', { requestId: 'x' }, 'invalid_input'],
	['unknown action', { action: 'translate' }, 'invalid_input'],
	['bad locale', { locale: 'en_US<script>' }, 'invalid_input'],
	['whitespace target', { targetText: '   ' }, 'empty_target'],
	['custom without instruction', { action: 'custom' }, 'missing_instruction'],
])('400 for %s', async (_, over, error) => {
	const s = await signedIn();
	const res = await s.suggest(body(over));
	expect(res.status).toBe(400);
	expect((await res.json()).error).toBe(error);
});

test('non-JSON content type is rejected', async () => {
	const t = testApp();
	const cookie = await t.signIn();
	const res = await t.request('/ai/suggest', {
		method: 'POST',
		body: 'x',
		cookie,
		headers: { 'content-type': 'text/plain' },
	});
	expect(res.status).toBe(400);
});

test.each([
	['target', { targetText: 'x'.repeat(LIMITS.target + 1) }],
	['context', { contextBefore: 'x'.repeat(LIMITS.context + 1) }],
	['instruction', { action: 'custom', instruction: 'x'.repeat(LIMITS.instruction + 1) }],
	['whole body', { contextAfter: 'x'.repeat(LIMITS.body) }],
])('413 for oversized %s', async (_, over) => {
	const s = await signedIn();
	expect((await s.suggest(body(over))).status).toBe(413);
});

test('daily per-user limit returns 429', async () => {
	const s = await signedIn({ config: { dailyRequestsPerUser: 2 } });
	expect((await s.suggest(body())).status).toBe(200);
	expect((await s.suggest(body())).status).toBe(200);
	const res = await s.suggest(body());
	expect(res.status).toBe(429);
	expect((await res.json()).error).toBe('daily_limit');
});

test('monthly budget: worst case is reserved first, actual cost is recorded', async () => {
	const provider: Provider = {
		maxCostUsd: () => 6,
		suggest: async (input) => ({
			status: 'suggestion',
			replacementText: `${input.targetText}!`,
			model: 'm',
			costUsd: 0.01,
		}),
	};
	const s = await signedIn({ provider, config: { monthlyBudgetUsd: 10 } });
	expect((await s.suggest(body())).status).toBe(200);
	expect(s.store.monthlySpendUsd()).toBeCloseTo(0.01);
	expect((await s.suggest(body())).status).toBe(200); // reservation released after the first settled
	const blocked = await s.store.reserveSpend(6, 10); // a concurrent in-flight reservation...
	expect(blocked).toBe(true);
	const res = await s.suggest(body()); // ...leaves no room for another worst case
	expect(res.status).toBe(429);
	expect((await res.json()).error).toBe('budget_exhausted');
});

test('more than two concurrent requests per user returns 429', async () => {
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	const provider: Provider = {
		maxCostUsd: () => 0,
		suggest: async (input) => (
			await gate,
			{ status: 'no_change', replacementText: input.targetText, model: 'm', costUsd: 0 }
		),
	};
	const s = await signedIn({ provider });
	const first = s.suggest(body());
	const second = s.suggest(body());
	await new Promise((r) => setTimeout(r, 10));
	const third = await s.suggest(body());
	expect(third.status).toBe(429);
	expect((await third.json()).error).toBe('too_many_concurrent');
	release();
	expect((await first).status).toBe(200);
	expect((await second).status).toBe(200);
});

test.each([
	['upstream_invalid', 502],
	['upstream_unavailable', 503],
	['upstream_timeout', 504],
	['ai_declined', 422],
] as const)(
	'provider %s maps to %i with a stable code and records billed cost',
	async (code, status) => {
		const provider: Provider = {
			maxCostUsd: () => 0.1,
			suggest: async () => {
				throw new ProviderError(code, 0.002);
			},
		};
		const s = await signedIn({ provider });
		const b = body();
		const res = await s.suggest(b);
		expect(res.status).toBe(status);
		expect(await res.json()).toEqual({ error: code, requestId: b.requestId });
		expect(s.store.monthlySpendUsd()).toBeCloseTo(0.002);
	},
);

test('logs carry metadata only: no document text or email', async () => {
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	const s = await signedIn();
	await s.suggest(body({ targetText: 'SECRET draft sentence.', contextBefore: 'PRIVATE context' }));
	const lines = log.mock.calls.map((c) => c.join(' ')).join('\n');
	expect(lines).toContain('ai_suggest');
	expect(lines).not.toMatch(/SECRET|PRIVATE|alice@example\.com/);
});
