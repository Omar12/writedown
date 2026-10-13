import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import {
	acceptSuggestion,
	getSuggestions,
	rejectSuggestion,
	resolveSuggestion,
	startSuggestion,
} from '../editor/suggestions.ts';
import { resolveTarget, type Target } from '../editor/target.ts';
import { errorMessage, suggest, type Action } from './api.ts';

const QUOTA_ERRORS = new Set([
	'daily_limit',
	'budget_exhausted',
	'unauthenticated',
	'not_allowlisted',
]);

export const ACTION_LABELS: Record<Action, string> = {
	proofread: 'Proofread',
	expand: 'Expand',
	rewrite: 'Rewrite',
	custom: 'Custom instruction…',
};

const PENDING: Record<Action, string> = {
	proofread: 'Proofreading…',
	expand: 'Expanding…',
	rewrite: 'Rewriting…',
	custom: 'Working on it…',
};

export const locale = () => {
	const lang = document.documentElement.lang || navigator.language || 'en';
	return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(lang) ? lang : 'en';
};

/**
 * Explicit AI requests for one editor (one document). Responses land as suggestions in the
 * suggestions plugin, which discards them if the target text changed meanwhile.
 */
export function useAi(editor: Editor) {
	const [status, setStatus] = useState('');
	const [reasons, setReasons] = useState<Record<string, string>>({});
	const inFlight = useRef(new Map<string, AbortController>());

	// The editor is per document; leaving it cancels everything so nothing lands elsewhere.
	useEffect(() => {
		const requests = inFlight.current;
		return () => requests.forEach((c) => c.abort());
	}, []);

	const item = (id: string) => getSuggestions(editor).find((s) => s.id === id);
	// Background checks stop for this editor after a quota error; explicit requests still try.
	const autoPaused = useRef(false);
	const autoInFlight = useRef(0);

	function send(action: Action, target: Target, instruction: string | null, auto: boolean) {
		const id = crypto.randomUUID();
		if (!startSuggestion(editor, id, target, auto)) return false;
		const controller = new AbortController();
		inFlight.current.set(id, controller);
		if (auto) autoInFlight.current++;
		else setStatus(PENDING[action]);
		// Background results are silent; only explicit requests report progress and errors.
		const say = (message: string) => !auto && setStatus(message);

		void suggest(
			{
				requestId: id,
				action,
				targetText: target.text,
				contextBefore: target.contextBefore,
				contextAfter: target.contextAfter,
				instruction,
				locale: locale(),
			},
			controller.signal,
		).then((result) => {
			inFlight.current.delete(id);
			if (auto) autoInFlight.current--;
			if (editor.isDestroyed) return;
			if (result.ok === false && result.error === 'canceled') return;
			if (item(id)?.status !== 'pending') {
				rejectSuggestion(editor, id);
				say('Suggestion discarded because the text changed.');
				return;
			}
			if (result.ok === false) {
				rejectSuggestion(editor, id);
				if (auto && QUOTA_ERRORS.has(result.error)) {
					autoPaused.current = true;
					setStatus(`Automatic checks paused. ${errorMessage(result.error)}`);
				}
				say(errorMessage(result.error));
				return;
			}
			resolveSuggestion(editor, id, result.replacementText);
			if (!item(id)) {
				say('No changes suggested.');
				return;
			}
			if (result.reason) setReasons((r) => ({ ...r, [id]: result.reason! }));
			say('Suggestion ready. Press ⌘Enter to accept or Escape to reject.');
		});
		return true;
	}

	/** Returns an error message instead of sending when there is no usable target. */
	function run(action: Action, instruction: string | null = null): string | null {
		const target = resolveTarget(editor.state, locale());
		if ('error' in target) return target.error;
		return send(action, target, instruction, false)
			? null
			: 'Select text within a single paragraph.';
	}

	/** Background proofread of one finished sentence. False if not sent (paused or busy). */
	function check(target: Target): boolean {
		// ponytail: one background request at a time; queue if checks lag behind fast writers.
		if (autoPaused.current || autoInFlight.current >= 1) return false;
		return send('proofread', target, null, true);
	}

	/** Turning background checks off: cancel them and clear their unopened annotations. */
	function clearAuto() {
		for (const s of getSuggestions(editor)) {
			if (!s.auto) continue;
			inFlight.current.get(s.id)?.abort();
			rejectSuggestion(editor, s.id);
		}
	}

	function accept(id: string) {
		setStatus(
			acceptSuggestion(editor, id)
				? 'Change applied.'
				: 'The text changed, so the suggestion was discarded.',
		);
		rejectSuggestion(editor, id); // no-op after a successful accept; clears a stale one
	}

	function reject(id: string) {
		rejectSuggestion(editor, id);
		setStatus('Suggestion rejected.');
	}

	// Keyboard Accept/Escape act on explicit (or opened) suggestions only, never quiet annotations.
	const explicit = () => getSuggestions(editor).filter((s) => !s.auto);

	/** Escape: cancel pending requests, else reject the ready suggestion. False if there was nothing to do. */
	function dismiss(): boolean {
		const pending = explicit().filter((s) => s.status === 'pending');
		if (pending.length) {
			for (const s of pending) {
				inFlight.current.get(s.id)?.abort();
				rejectSuggestion(editor, s.id);
			}
			setStatus('Canceled.');
			return true;
		}
		const ready = explicit().find((s) => s.status === 'ready');
		if (!ready) return false;
		reject(ready.id);
		return true;
	}

	function acceptReady(): boolean {
		const ready = explicit().find((s) => s.status === 'ready');
		if (!ready) return false;
		accept(ready.id);
		return true;
	}

	return {
		status,
		setStatus,
		reasons,
		run,
		check,
		clearAuto,
		accept,
		reject,
		dismiss,
		acceptReady,
	};
}

export type Ai = ReturnType<typeof useAi>;
