import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import {
	acceptSuggestion,
	getSuggestions,
	rejectSuggestion,
	resolveSuggestion,
	startSuggestion,
} from '../editor/suggestions.ts';
import { resolveTarget } from '../editor/target.ts';
import { errorMessage, suggest, type Action } from './api.ts';

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

	/** Returns an error message instead of sending when there is no usable target. */
	function run(action: Action, instruction: string | null = null): string | null {
		const target = resolveTarget(editor.state, locale());
		if ('error' in target) return target.error;
		const id = crypto.randomUUID();
		if (!startSuggestion(editor, id, target)) return 'Select text within a single paragraph.';
		const controller = new AbortController();
		inFlight.current.set(id, controller);
		setStatus(PENDING[action]);

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
			if (editor.isDestroyed) return;
			if (result.ok === false && result.error === 'canceled') return;
			if (item(id)?.status !== 'pending') {
				rejectSuggestion(editor, id);
				setStatus('Suggestion discarded because the text changed.');
				return;
			}
			if (result.ok === false) {
				rejectSuggestion(editor, id);
				setStatus(errorMessage(result.error));
				return;
			}
			resolveSuggestion(editor, id, result.replacementText);
			if (!item(id)) {
				setStatus('No changes suggested.');
				return;
			}
			if (result.reason) setReasons((r) => ({ ...r, [id]: result.reason! }));
			setStatus('Suggestion ready. Press ⌘Enter to accept or Escape to reject.');
		});
		return null;
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

	/** Escape: cancel pending requests, else reject the ready suggestion. False if there was nothing to do. */
	function dismiss(): boolean {
		const items = getSuggestions(editor);
		const pending = items.filter((s) => s.status === 'pending');
		if (pending.length) {
			for (const s of pending) {
				inFlight.current.get(s.id)?.abort();
				rejectSuggestion(editor, s.id);
			}
			setStatus('Canceled.');
			return true;
		}
		const ready = items.find((s) => s.status === 'ready');
		if (!ready) return false;
		reject(ready.id);
		return true;
	}

	function acceptReady(): boolean {
		const ready = getSuggestions(editor).find((s) => s.status === 'ready');
		if (!ready) return false;
		accept(ready.id);
		return true;
	}

	return { status, setStatus, reasons, run, accept, reject, dismiss, acceptReady };
}

export type Ai = ReturnType<typeof useAi>;
