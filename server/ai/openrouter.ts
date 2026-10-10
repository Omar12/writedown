import {
	BASE,
	MAX_TOKENS,
	OUTPUT_SCHEMA,
	TASK,
	WORST_PRICE,
	parseOutput,
	userContent,
} from './anthropic.ts';
import type { Action, Provider, ProviderResult } from './types.ts';
import { ProviderError } from './types.ts';

// OpenRouter's OpenAI-compatible chat API (https://openrouter.ai/docs/api-reference/chat-completion).
// Same prompt and output contract as the Claude adapter; any OpenRouter model id works.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Model prices vary, so the budget reserves at WORST_PRICE and OpenRouter is told never to route
// to a provider charging more (provider.max_price, $ per million tokens).
const [MAX_IN, MAX_OUT] = WORST_PRICE;

type Completion = {
	model?: string;
	choices?: {
		finish_reason?: string;
		message?: { content?: string | null; refusal?: string | null };
	}[];
	usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
	error?: unknown;
};

export function createOpenRouterProvider(
	{
		apiKey,
		modelProofread,
		modelCompose,
	}: { apiKey: string; modelProofread: string; modelCompose: string },
	fetchImpl: typeof fetch = fetch,
): Provider {
	const modelFor = (action: Action) => (action === 'proofread' ? modelProofread : modelCompose);

	return {
		maxCostUsd(input) {
			const inputTokens =
				1000 +
				(input.targetText.length + input.contextBefore.length + input.contextAfter.length) / 2;
			return (inputTokens * MAX_IN + MAX_TOKENS[input.action] * MAX_OUT) / 1e6;
		},

		async suggest(input, signal): Promise<ProviderResult> {
			const model = modelFor(input.action);
			let res: Response;
			let body: Completion;
			try {
				res = await fetchImpl(ENDPOINT, {
					method: 'POST',
					headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model,
						max_tokens: MAX_TOKENS[input.action],
						messages: [
							{ role: 'system', content: `${BASE}\n\n${TASK[input.action]}` },
							{ role: 'user', content: userContent(input) },
						],
						response_format: {
							type: 'json_schema',
							json_schema: { name: 'suggestion', strict: true, schema: OUTPUT_SCHEMA },
						},
						// Only route to providers that honor the schema, and never above the reserved price.
						provider: {
							require_parameters: true,
							max_price: { prompt: MAX_IN, completion: MAX_OUT },
						},
					}),
					signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
				});
				body = (await res.json().catch(() => ({}))) as Completion;
			} catch (error) {
				throw new ProviderError(
					(error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError'
						? 'upstream_timeout'
						: 'upstream_unavailable',
				);
			}

			// 403 is OpenRouter's moderation rejection; everything else non-2xx is "unavailable".
			if (res.status === 403) throw new ProviderError('ai_declined');
			if (!res.ok || body.error) throw new ProviderError('upstream_unavailable');

			const costUsd = costOf(body);
			const choice = body.choices?.[0];
			if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal)
				throw new ProviderError('ai_declined', costUsd);
			if (choice?.finish_reason !== 'stop') throw new ProviderError('upstream_invalid', costUsd);
			const parsed = parseOutput(choice.message?.content ?? undefined);
			if (!parsed) throw new ProviderError('upstream_invalid', costUsd);
			return { ...parsed, model: body.model ?? model, costUsd };
		},
	};
}

/** OpenRouter reports the charged cost in usage.cost; without it, assume the worst allowed price. */
function costOf(body: Completion) {
	const u = body.usage ?? {};
	if (typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0) return u.cost;
	return ((u.prompt_tokens ?? 0) * MAX_IN + (u.completion_tokens ?? 0) * MAX_OUT) / 1e6;
}
