import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { useEffect, useRef } from 'react';
import { getSuggestions } from '../editor/suggestions.ts';
import { completedSentence } from '../editor/target.ts';
import { locale, type Ai } from './useAi.ts';

export const IDLE_MS = 3000;

/**
 * FR-010: after an edit and IDLE_MS without activity, proofread the sentence just finished.
 * Each sentence text is checked at most once per editor session. Never moves focus or the caret.
 */
export function useBackgroundProofreading(editor: Editor, ai: Ai, enabled: boolean) {
	const aiRef = useRef(ai);
	useEffect(() => {
		aiRef.current = ai;
	});
	const checked = useRef(new Set<string>());

	useEffect(() => {
		if (!enabled) {
			aiRef.current.clearAuto();
			return;
		}
		let timer: ReturnType<typeof setTimeout> | undefined;

		function fire() {
			timer = undefined;
			if (!editor.isEditable || editor.view.composing) return; // IME: wait for the commit
			const target = completedSentence(editor.state, locale());
			if (!target || checked.current.has(target.text)) return;
			const busy = getSuggestions(editor).some(
				(s) => s.status !== 'stale' && s.from < target.to && target.from < s.to,
			);
			if (!busy && aiRef.current.check(target)) checked.current.add(target.text);
		}

		// Edits arm the timer; any activity (edit or caret move) while armed restarts it.
		function onTransaction({ transaction }: { transaction: Transaction }) {
			if (!transaction.docChanged && (!timer || !transaction.selectionSet)) return;
			clearTimeout(timer);
			timer = setTimeout(fire, IDLE_MS);
		}

		editor.on('transaction', onTransaction);
		return () => {
			clearTimeout(timer);
			editor.off('transaction', onTransaction);
		};
	}, [editor, enabled]);
}
