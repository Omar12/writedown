import { Extension, type Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Unaccepted AI suggestions live only in this plugin's state, never in the document.
// A target is registered when the request starts and its range is remapped through
// every transaction, so a late response is checked against the live text, not stale offsets.

export type Suggestion = {
	id: string;
	documentId: string;
	from: number;
	to: number;
	original: string;
	proposed?: string;
	status: 'pending' | 'ready' | 'stale';
};

type State = { documentId: string; items: Suggestion[] };

type Action =
	| { type: 'setDocument'; documentId: string }
	| { type: 'request'; item: Suggestion }
	| { type: 'resolve'; id: string; proposed: string }
	| { type: 'remove'; id: string };

export const suggestionKey = new PluginKey<State>('suggestions');

const live = (s: Suggestion) => s.status !== 'stale';
const overlaps = (a: Suggestion, b: Suggestion) => a.from < b.to && b.from < a.to;

function apply(tr: Transaction, prev: State): State {
	let items = prev.items;
	if (tr.docChanged) {
		items = items.map((s) => {
			if (!live(s)) return s;
			// Edges stay outside the range, so typing next to a target doesn't absorb into it.
			const from = tr.mapping.map(s.from, 1);
			const to = Math.max(from, tr.mapping.map(s.to, -1));
			const unchanged = tr.doc.textBetween(from, to, '\n') === s.original;
			return { ...s, from, to, status: unchanged ? s.status : 'stale' };
		});
	}

	const action = tr.getMeta(suggestionKey) as Action | undefined;
	switch (action?.type) {
		case 'setDocument':
			// Positions refer to the old document; nothing from it may survive.
			return { documentId: action.documentId, items: [] };
		case 'request': {
			const item = action.item;
			const marked = items.map((s) =>
				live(s) && overlaps(s, item) ? { ...s, status: 'stale' as const } : s,
			);
			return { ...prev, items: [...marked, item] };
		}
		case 'resolve':
			return {
				...prev,
				items: items.flatMap((s) => {
					if (s.id !== action.id || s.status !== 'pending') return [s];
					if (action.proposed === s.original) return []; // no_change
					return [{ ...s, proposed: action.proposed, status: 'ready' as const }];
				}),
			};
		case 'remove':
			return { ...prev, items: items.filter((s) => s.id !== action.id) };
	}
	return items === prev.items ? prev : { ...prev, items };
}

function decorations(state: EditorState) {
	const decos = suggestionKey.getState(state)!.items.flatMap((s) => {
		if (s.status === 'pending')
			return [Decoration.inline(s.from, s.to, { class: 'wd-suggestion-pending' })];
		if (s.status !== 'ready') return [];
		// <del>/<ins> give non-color cues (strikethrough/underline) and semantics for assistive tech.
		return [
			Decoration.inline(s.from, s.to, { nodeName: 'del', class: 'wd-suggestion-removed' }),
			Decoration.widget(
				s.to,
				() => {
					const ins = document.createElement('ins');
					ins.className = 'wd-suggestion-added';
					ins.textContent = s.proposed!;
					return ins;
				},
				{ side: 1, key: `${s.id}:${s.proposed}` },
			),
		];
	});
	return DecorationSet.create(state.doc, decos);
}

export const Suggestions = Extension.create({
	name: 'suggestions',
	addProseMirrorPlugins() {
		return [
			new Plugin<State>({
				key: suggestionKey,
				state: { init: () => ({ documentId: '', items: [] }), apply },
				props: { decorations },
			}),
		];
	},
});

const dispatch = (editor: Editor, action: Action) =>
	editor.view.dispatch(editor.state.tr.setMeta(suggestionKey, action));

export const getSuggestions = (editor: Editor) => suggestionKey.getState(editor.state)!.items;

/** Call on every document switch. Drops all suggestions, so late responses for the old document are ignored. */
export function setSuggestionDocument(editor: Editor, documentId: string) {
	dispatch(editor, { type: 'setDocument', documentId });
}

/**
 * Freeze the current selection as a suggestion target before sending the AI request.
 * Returns null for empty or cross-block selections (plain-text replacement can't represent those).
 */
export function startSuggestion(editor: Editor, id: string): Suggestion | null {
	const { selection, doc } = editor.state;
	if (selection.empty || !selection.$from.sameParent(selection.$to)) return null;
	const { from, to } = selection;
	const item: Suggestion = {
		id,
		documentId: suggestionKey.getState(editor.state)!.documentId,
		from,
		to,
		original: doc.textBetween(from, to, '\n'),
		status: 'pending',
	};
	dispatch(editor, { type: 'request', item });
	return item;
}

/** Attach an AI response. Ignored unless the target is still pending and its source text is unchanged. */
export function resolveSuggestion(editor: Editor, id: string, proposed: string) {
	dispatch(editor, { type: 'resolve', id, proposed });
}

/** Apply a ready suggestion as one undoable transaction. Returns false (no mutation) if it can't be verified. */
export function acceptSuggestion(editor: Editor, id: string): boolean {
	const state = editor.state;
	const { documentId, items } = suggestionKey.getState(state)!;
	const s = items.find((x) => x.id === id);
	if (!s || s.status !== 'ready' || s.documentId !== documentId) return false;
	const $from = state.doc.resolve(s.from);
	if (!$from.sameParent(state.doc.resolve(s.to))) return false;
	if (state.doc.textBetween(s.from, s.to, '\n') !== s.original) return false;
	editor.view.dispatch(
		state.tr.insertText(s.proposed!, s.from, s.to).setMeta(suggestionKey, { type: 'remove', id }),
	);
	return true;
}

/** Discard a suggestion without touching the document. */
export function rejectSuggestion(editor: Editor, id: string) {
	dispatch(editor, { type: 'remove', id });
}
