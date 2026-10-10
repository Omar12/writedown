import { useSyncExternalStore } from 'react';

// Browser side of the WD-007 API. Only the AI target and bounded context ever leave the device.

export type Action = 'proofread' | 'expand' | 'rewrite' | 'custom';

export type SuggestRequest = {
	requestId: string;
	action: Action;
	targetText: string;
	contextBefore: string;
	contextAfter: string;
	instruction: string | null;
	locale: string;
};

export type SuggestResult =
	| { ok: true; status: 'suggestion' | 'no_change'; replacementText: string; reason?: string }
	| { ok: false; error: string };

/** undefined: not checked yet; null: signed out (or the server is unreachable). */
type Account = { email: string } | null | undefined;

let account: Account;
const listeners = new Set<() => void>();
function setAccount(next: Account) {
	account = next;
	listeners.forEach((l) => l());
}

export const useAccount = () =>
	useSyncExternalStore(
		(l) => (listeners.add(l), () => listeners.delete(l)),
		() => account,
	);

/** 'signed-in' | 'signed-out' | 'not-allowed' (signed in, but no longer on the beta list) | 'offline'. */
export async function checkAccount() {
	try {
		const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
		if (res.ok) {
			setAccount((await res.json()) as { email: string });
			return 'signed-in' as const;
		}
		setAccount(null);
		if (res.status === 401) return 'signed-out' as const;
		if (res.status === 403) return 'not-allowed' as const;
		return 'offline' as const;
	} catch {
		setAccount(null);
		return 'offline' as const;
	}
}

const post = (path: string, body?: unknown, signal?: AbortSignal) =>
	fetch(path, {
		method: 'POST',
		credentials: 'same-origin',
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal,
	});

/** Null when the request was accepted (the server never says whether the address is allowed); otherwise an error message. */
export async function requestSignInLink(email: string): Promise<string | null> {
	try {
		const res = await post('/api/auth/request', { email });
		if (res.ok) return null;
		const { error } = (await res.json().catch(() => ({}))) as { error?: string };
		return errorMessage(error ?? 'upstream_unavailable');
	} catch {
		return errorMessage('offline');
	}
}

export async function signOut() {
	await post('/api/auth/logout').catch(() => undefined);
	setAccount(null);
}

export async function suggest(req: SuggestRequest, signal: AbortSignal): Promise<SuggestResult> {
	try {
		const res = await post('/api/ai/suggest', req, signal);
		const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
		if (res.status === 401) setAccount(null);
		if (!res.ok)
			return { ok: false, error: typeof body.error === 'string' ? body.error : 'offline' };
		if (
			body.requestId !== req.requestId ||
			(body.status !== 'suggestion' && body.status !== 'no_change') ||
			typeof body.replacementText !== 'string'
		)
			return { ok: false, error: 'upstream_invalid' };
		return {
			ok: true,
			status: body.status,
			replacementText: body.replacementText,
			reason: typeof body.reason === 'string' ? body.reason : undefined,
		};
	} catch (e) {
		return { ok: false, error: (e as Error).name === 'AbortError' ? 'canceled' : 'offline' };
	}
}

const MESSAGES: Record<string, string> = {
	unauthenticated: 'You’re signed out. Press ⌘J to sign in again.',
	not_allowlisted: 'This account isn’t on the beta list.',
	daily_limit: 'You’ve used today’s 100 AI requests. They reset at midnight UTC.',
	budget_exhausted: 'AI is paused for the rest of the month (beta budget reached).',
	too_many_concurrent: 'Wait for the current AI request to finish.',
	payload_too_large: 'That’s too much text for one request. Select less.',
	ai_declined: 'Claude declined this request.',
	upstream_timeout: 'Claude took too long. Try again.',
	upstream_invalid: 'Claude’s reply couldn’t be used. Try again.',
	invalid_email: 'Enter a valid email address.',
	rate_limited: 'Too many sign-in requests. Try again in an hour.',
	mail_unavailable: 'Sign-in email isn’t set up on this server.',
	offline: 'Can’t reach the AI service. Your writing is still saved.',
};

export const errorMessage = (code: string) =>
	MESSAGES[code] ?? 'AI is unavailable right now. Your writing is still saved.';
