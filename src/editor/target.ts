import type { EditorState } from '@tiptap/pm/state';
import { readRange } from './suggestions.ts';

export const CONTEXT_CHARS = 2000;
export const TARGET_CHARS = 4000;

export type Target = {
	from: number;
	to: number;
	text: string;
	contextBefore: string;
	contextAfter: string;
};

// Intl.Segmenter splits after these; a sentence never ends on them.
// ponytail: English titles only; extend per locale if users write in others.
const ABBREVIATION = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|No)\.\s*$/;

/** Sentence spans [start, end) in plain text, with trailing whitespace trimmed off. */
export function sentences(text: string, locale = 'en'): [number, number][] {
	const spans: [number, number][] = [];
	let start = 0;
	for (const { segment, index } of new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(
		text,
	)) {
		const end = index + segment.length;
		if (ABBREVIATION.test(text.slice(start, end)) && end < text.length) continue;
		const trimmed = text.slice(start, end).trimEnd().length;
		if (trimmed) spans.push([start, start + trimmed]);
		start = end;
	}
	return spans;
}

/**
 * What an AI action works on: the selection if there is one, otherwise the sentence around the caret.
 * Returns an error message instead when the target can't be represented as one plain-text replacement.
 */
export function resolveTarget(state: EditorState, locale = 'en'): Target | { error: string } {
	const { selection, doc } = state;
	let from = selection.from;
	let to = selection.to;
	// A selection reaching past one block's edges (e.g. ⌘A on a one-paragraph document) counts as
	// that block's text when it is the only block with selected text.
	if (!selection.$from.sameParent(selection.$to) || !selection.$from.parent.isTextblock) {
		const blocks: [number, number][] = [];
		doc.nodesBetween(from, to, (n, p) => {
			if (!n.isTextblock) return true;
			const s = Math.max(from, p + 1);
			const e = Math.min(to, p + n.nodeSize - 1);
			if (doc.textBetween(s, e).trim()) blocks.push([s, e]);
			return false;
		});
		if (blocks.length !== 1) return { error: 'Select text within a single paragraph.' };
		[from, to] = blocks[0];
	}
	const $from = doc.resolve(from);
	if (!$from.parent.isTextblock) return { error: 'Select text within a single paragraph.' };
	if ($from.parent.type.name === 'codeBlock') return { error: 'AI doesn’t edit code blocks.' };

	if (from === to) {
		const start = $from.start();
		const { text, pos } = readRange(doc, start, $from.end());
		const caret = pos.findIndex((p) => p >= from);
		const offset = caret === -1 ? text.length : caret;
		// The sentence containing the caret; at a sentence end, the one just finished.
		const span =
			sentences(text, locale).find(([s, e]) => s <= offset && offset <= e) ??
			sentences(text, locale).findLast(([, e]) => e <= offset);
		if (!span) return { error: 'Put the cursor in a sentence or select some text.' };
		from = pos[span[0]];
		to = pos[span[1]];
	}

	const text = readRange(doc, from, to).text;
	if (!text.trim()) return { error: 'Put the cursor in a sentence or select some text.' };
	if (text.length > TARGET_CHARS)
		return { error: `Select less text (at most ${TARGET_CHARS.toLocaleString()} characters).` };
	let codeOnly = true;
	doc.nodesBetween(from, to, (n) => {
		if (n.isText && n.text!.trim() && !n.marks.some((m) => m.type.name === 'code'))
			codeOnly = false;
	});
	if (codeOnly) return { error: 'AI doesn’t edit inline code.' };

	return {
		from,
		to,
		text,
		contextBefore: doc.textBetween(0, from, '\n\n', '\n').slice(-CONTEXT_CHARS),
		contextAfter: doc.textBetween(to, doc.content.size, '\n\n', '\n').slice(0, CONTEXT_CHARS),
	};
}
