export const ACTIONS = ['proofread', 'expand', 'rewrite', 'custom'] as const;
export type Action = (typeof ACTIONS)[number];

export type SuggestInput = {
	action: Action;
	targetText: string;
	contextBefore: string;
	contextAfter: string;
	instruction: string | null;
	locale: string;
};

export type SuggestOutput = {
	status: 'suggestion' | 'no_change';
	replacementText: string;
	reason?: string;
};

export type ProviderResult = SuggestOutput & { model: string; costUsd: number };

/** Provider failures the route maps to stable HTTP errors. */
export type ProviderErrorCode =
	'upstream_invalid' | 'upstream_unavailable' | 'upstream_timeout' | 'ai_declined';

export class ProviderError extends Error {
	readonly code: ProviderErrorCode;
	readonly costUsd: number;
	constructor(code: ProviderErrorCode, costUsd = 0) {
		super(code);
		this.code = code;
		this.costUsd = costUsd;
	}
}

export type Provider = {
	/** Worst-case cost of one request, reserved against the budget before calling. */
	maxCostUsd(input: SuggestInput): number;
	suggest(input: SuggestInput, signal: AbortSignal): Promise<ProviderResult>;
};

/** Deterministic stand-in for development and tests. Never calls the network. */
export const fakeProvider: Provider = {
	maxCostUsd: () => 0,
	async suggest({ action, targetText, instruction }) {
		const replacementText =
			action === 'proofread'
				? targetText
						.replace(/\bteh\b/g, 'the')
						.replace(/ {2,}/g, ' ')
						.replace(/\bi\b/g, 'I')
				: action === 'expand'
					? `${targetText} (expanded)`
					: action === 'rewrite'
						? targetText.split(' ').reverse().join(' ')
						: `${targetText} [${instruction}]`;
		return {
			status: replacementText === targetText ? 'no_change' : 'suggestion',
			replacementText,
			model: 'fake',
			costUsd: 0,
		};
	},
};
