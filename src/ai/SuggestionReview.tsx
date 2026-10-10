import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { getSuggestions } from '../editor/suggestions.ts';
import { MOD } from './AiMenu.tsx';
import type { Ai } from './useAi.ts';

/**
 * Nonmodal Accept/Reject bar for the ready suggestion, under its text. It never takes focus:
 * writing continues, and the keyboard path is ⌘Enter / Escape from the text.
 */
export function SuggestionReview({ editor, ai }: { editor: Editor; ai: Ai }) {
	const ready = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			const s = getSuggestions(e).find((x) => x.status === 'ready' && !x.auto);
			if (!s) return null;
			const { bottom, left } = e.view.coordsAtPos(s.to);
			return {
				id: s.id,
				original: s.original,
				proposed: s.proposed!,
				top: bottom + window.scrollY + 6,
				left,
			};
		},
		equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
	});
	if (!ready) return null;
	const reason = ai.reasons[ready.id];

	return (
		<div
			className="ai-review"
			role="group"
			aria-label="AI suggestion"
			style={{
				top: ready.top,
				left: Math.max(8, Math.min(ready.left - 160, window.innerWidth - 336)),
			}}
		>
			{reason && <p className="ai-reason">{reason}</p>}
			<p className="visually-hidden">
				{`Original: “${ready.original}” Suggested: “${ready.proposed}”`}
			</p>
			<div className="ai-actions">
				<button
					type="button"
					aria-keyshortcuts="Meta+Enter Control+Enter"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ai.accept(ready.id)}
				>
					Accept <kbd aria-hidden="true">{MOD}↵</kbd>
				</button>
				<button
					type="button"
					aria-keyshortcuts="Escape"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ai.reject(ready.id)}
				>
					Reject <kbd aria-hidden="true">Esc</kbd>
				</button>
			</div>
		</div>
	);
}
