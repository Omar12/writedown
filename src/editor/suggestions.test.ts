// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensions, parseMarkdown, serializeMarkdown } from './markdown.ts';
import {
	Suggestions,
	acceptSuggestion,
	getSuggestionHistory,
	getSuggestions,
	rejectSuggestion,
	resolveSuggestion,
	setSuggestionDocument,
	startSuggestion,
	autoSuggestionAt,
	revealSuggestion,
} from './suggestions.ts';

let editor: Editor;
afterEach(() => editor?.destroy());

function setup(md: string, documentId = 'doc-a') {
	editor = new Editor({
		element: document.createElement('div'),
		extensions: [...extensions, Suggestions],
		content: parseMarkdown(md).doc,
	});
	setSuggestionDocument(editor, documentId);
	return editor;
}

const md = () => serializeMarkdown(editor.getJSON());

/** Document range of `text`, which may span marks and hard breaks ("\n") within one block. */
function range(text: string): { from: number; to: number } {
	let found: { from: number; to: number } | null = null;
	editor.state.doc.descendants((block, blockPos) => {
		if (found || !block.isTextblock) return !found;
		let chars = '';
		const pos: number[] = [];
		block.forEach((child, offset) => {
			const p = blockPos + 1 + offset;
			const text = child.isText ? child.text! : '\n';
			chars += text;
			for (let k = 0; k < text.length; k++) pos.push(p + k);
		});
		pos.push(blockPos + block.nodeSize - 1);
		const i = chars.indexOf(text);
		if (i >= 0) found = { from: pos[i], to: pos[i + text.length - 1] + 1 };
		return false;
	});
	if (!found) throw new Error(`text not found: ${text}`);
	return found;
}

const pos = (text: string) => range(text).from;

function select(text: string) {
	editor.commands.setTextSelection(range(text));
}

function request(text: string, id: string) {
	select(text);
	const target = startSuggestion(editor, id);
	expect(target?.original).toBe(text);
	return target!;
}

const status = (id: string) => getSuggestions(editor).find((s) => s.id === id)?.status;

describe('display without mutation', () => {
	test('ready suggestion renders del/ins but document and Markdown are unchanged', () => {
		setup('The ideas is good. Next sentence.');
		const before = md();
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');

		expect(status('s1')).toBe('ready');
		expect(md()).toBe(before);
		expect(editor.getText()).toBe('The ideas is good. Next sentence.');
		const dom = editor.view.dom;
		// Word-level: only the changed word is marked.
		expect(dom.querySelector('del.wd-suggestion-removed')?.textContent).toBe('ideas');
		expect(dom.querySelector('ins.wd-suggestion-added')?.textContent).toBe('idea');
		expect(dom.querySelectorAll('del, ins')).toHaveLength(2);
	});

	test('response does not move caret or selection', () => {
		setup('The ideas is good. Next sentence.');
		request('ideas is', 's1');
		const caret = pos('Next');
		editor.commands.setTextSelection(caret);
		resolveSuggestion(editor, 's1', 'idea is');
		expect(editor.state.selection.from).toBe(caret);
		expect(editor.state.selection.to).toBe(caret);
	});

	test('no_change response leaves nothing behind', () => {
		setup('Fine text.');
		request('Fine text.', 's1');
		resolveSuggestion(editor, 's1', 'Fine text.');
		expect(getSuggestions(editor)).toEqual([]);
	});
});

describe('accept and reject', () => {
	test('accept applies once; a single undo restores original exactly', () => {
		setup('The **ideas is** good.');
		const before = md();
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');

		expect(acceptSuggestion(editor, 's1')).toBe(true);
		expect(md()).toBe('The **idea is** good.'); // keeps surrounding marks
		expect(getSuggestions(editor)).toEqual([]);
		expect(editor.view.dom.querySelector('ins, del')).toBeNull();

		editor.commands.undo();
		expect(md()).toBe(before);
		editor.commands.redo();
		expect(md()).toBe('The **idea is** good.');
	});

	test('accept keeps caret after the target in place relative to text', () => {
		setup('The ideas is good. Next sentence.');
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');
		editor.commands.setTextSelection(pos('Next'));
		acceptSuggestion(editor, 's1');
		expect(editor.state.selection.from).toBe(pos('Next'));
	});

	test('reject removes annotation without mutation', () => {
		setup('The ideas is good.');
		const before = md();
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');
		rejectSuggestion(editor, 's1');
		expect(md()).toBe(before);
		expect(getSuggestions(editor)).toEqual([]);
		expect(acceptSuggestion(editor, 's1')).toBe(false);
	});

	test('pending suggestion cannot be accepted', () => {
		setup('The ideas is good.');
		request('ideas is', 's1');
		expect(acceptSuggestion(editor, 's1')).toBe(false);
		expect(editor.getText()).toBe('The ideas is good.');
	});
});

describe('stale responses cannot apply', () => {
	test('edit inside target while pending: response dropped, marked stale', () => {
		setup('The ideas is good.');
		request('ideas is', 's1');
		editor.commands.insertContentAt(pos('ideas') + 5, ' really');
		resolveSuggestion(editor, 's1', 'idea is');
		expect(status('s1')).toBe('stale');
		expect(acceptSuggestion(editor, 's1')).toBe(false);
		expect(editor.getText()).toBe('The ideas really is good.');
	});

	test('edit inside target after ready: suggestion is dropped, accept refused', () => {
		setup('The ideas is good.');
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');
		editor.commands.insertContentAt(pos('ideas') + 1, 'X');
		expect(getSuggestions(editor)).toEqual([]);
		expect(acceptSuggestion(editor, 's1')).toBe(false);
		expect(editor.getText()).toBe('The iXdeas is good.');
		expect(editor.view.dom.querySelector('ins, del')).toBeNull();
	});

	test('deleting the target makes it stale', () => {
		setup('Keep. The ideas is good.');
		request('ideas is', 's1');
		const from = pos('The ideas');
		editor.commands.deleteRange({ from, to: from + 'The ideas is good.'.length });
		resolveSuggestion(editor, 's1', 'idea is');
		expect(status('s1')).toBe('stale');
		expect(acceptSuggestion(editor, 's1')).toBe(false);
	});

	test('edit before target remaps; accept hits the right text', () => {
		setup('Intro.\n\nThe ideas is good.');
		request('ideas is', 's1');
		editor.commands.insertContentAt(pos('Intro'), 'New first paragraph words. ');
		editor.commands.insertContentAt(pos('ideas'), ' '); // typing at the edge stays outside the range
		resolveSuggestion(editor, 's1', 'idea is');
		expect(status('s1')).toBe('ready');
		expect(acceptSuggestion(editor, 's1')).toBe(true);
		expect(md()).toBe('New first paragraph words. Intro.\n\nThe  idea is good.');
	});

	test('document switch while pending: late response ignored', () => {
		setup('The ideas is good.');
		request('ideas is', 's1');
		setSuggestionDocument(editor, 'doc-b');
		editor.commands.setContent(parseMarkdown('The ideas is good in doc B too.').doc);
		resolveSuggestion(editor, 's1', 'idea is');
		expect(getSuggestions(editor)).toEqual([]);
		expect(acceptSuggestion(editor, 's1')).toBe(false);
		expect(editor.getText()).toBe('The ideas is good in doc B too.');
	});

	test('overlapping newer request makes older stale; older late response cannot apply', () => {
		setup('The ideas is good.');
		request('ideas is', 'old');
		request('The ideas is good.', 'new');
		resolveSuggestion(editor, 'old', 'idea is');
		expect(status('old')).toBe('stale');
		resolveSuggestion(editor, 'new', 'The idea is good.');
		expect(acceptSuggestion(editor, 'old')).toBe(false);
		expect(acceptSuggestion(editor, 'new')).toBe(true);
		expect(editor.getText()).toBe('The idea is good.');
	});

	test('accepting one suggestion remaps a later one in the same paragraph', () => {
		setup('The ideas is good and she go home.');
		request('ideas is', 'a');
		request('she go', 'b');
		resolveSuggestion(editor, 'a', 'idea is');
		resolveSuggestion(editor, 'b', 'she goes');
		expect(acceptSuggestion(editor, 'a')).toBe(true); // shortens text before b
		expect(status('b')).toBe('ready');
		expect(acceptSuggestion(editor, 'b')).toBe(true);
		expect(editor.getText()).toBe('The idea is good and she goes home.');
	});

	test('reordered responses for independent targets both apply correctly', () => {
		setup('The ideas is good.\n\nShe go home.');
		request('ideas is', 'a');
		request('She go', 'b');
		resolveSuggestion(editor, 'b', 'She goes');
		resolveSuggestion(editor, 'a', 'idea is');
		expect(acceptSuggestion(editor, 'b')).toBe(true);
		expect(acceptSuggestion(editor, 'a')).toBe(true);
		expect(md()).toBe('The idea is good.\n\nShe goes home.');
	});
});

describe('formatting is preserved on accept', () => {
	function acceptRewrite(source: string, target: string, proposed: string) {
		setup(source);
		request(target, 's1');
		resolveSuggestion(editor, 's1', proposed);
		expect(acceptSuggestion(editor, 's1')).toBe(true);
		return md();
	}

	test('link and bold in the middle of a rewritten sentence survive', () => {
		expect(
			acceptRewrite(
				'Their is a [great guide](https://e.com) that **really** help.',
				'Their is a great guide that really help.',
				'There is a great guide that really helps.',
			),
		).toBe('There is a [great guide](https://e.com) that **really** helps.');
	});

	test('replacing a word inside a link keeps the link', () => {
		expect(
			acceptRewrite('Read [the docs](https://e.com) now.', 'the docs', 'the documentation'),
		).toBe('Read [the documentation](https://e.com) now.');
	});

	test('text inserted right after a link or bold does not extend it', () => {
		expect(
			acceptRewrite('See [docs](https://e.com) now.', 'See docs now.', 'See docs right now.'),
		).toBe('See [docs](https://e.com) right now.');
		expect(acceptRewrite('A **bold** end', 'A bold end', 'A bold new end')).toBe(
			'A **bold** new end',
		);
	});

	test('inline code and hard breaks survive', () => {
		expect(
			acceptRewrite(
				'Run `pnpm test` befor  \npushing.',
				'Run pnpm test befor\npushing.',
				'Run pnpm test before\npushing.',
			),
		).toBe('Run `pnpm test` before  \npushing.');
	});

	test('formatting-preserving accept is still one undo step', () => {
		const before = 'Their is a [great guide](https://e.com) that **really** help.';
		acceptRewrite(
			before,
			'Their is a great guide that really help.',
			'There is a great guide that really helps.',
		);
		editor.commands.undo();
		expect(md()).toBe(before);
	});
});

describe('history of original state', () => {
	test('accept records original content with formatting', () => {
		setup('Their is a [guide](https://e.com) that **really** help.');
		request('Their is a guide that really help.', 's1');
		resolveSuggestion(editor, 's1', 'There is a guide that really helps.');
		acceptSuggestion(editor, 's1');

		const [entry] = getSuggestionHistory(editor);
		expect(entry).toMatchObject({
			id: 's1',
			documentId: 'doc-a',
			originalText: 'Their is a guide that really help.',
			proposed: 'There is a guide that really helps.',
		});
		expect(Date.parse(entry.acceptedAt)).not.toBeNaN();
		// Original inline nodes can rebuild the exact pre-AI Markdown.
		const restored = serializeMarkdown({
			type: 'doc',
			content: [{ type: 'paragraph', content: entry.original }],
		});
		expect(restored).toBe('Their is a [guide](https://e.com) that **really** help.');
	});

	test('reject, stale and refused accepts record nothing', () => {
		setup('The ideas is good. She go home.');
		request('ideas is', 'r');
		resolveSuggestion(editor, 'r', 'idea is');
		rejectSuggestion(editor, 'r');
		request('She go', 'a');
		resolveSuggestion(editor, 'a', 'She goes');
		acceptSuggestion(editor, 'a');
		expect(acceptSuggestion(editor, 'a')).toBe(false);
		expect(getSuggestionHistory(editor).map((e) => e.id)).toEqual(['a']);
	});

	test("history is per document: a switch loads that document's stored history", () => {
		setup('She go home.');
		request('She go', 'a');
		resolveSuggestion(editor, 'a', 'She goes');
		acceptSuggestion(editor, 'a');
		const stored = getSuggestionHistory(editor);
		setSuggestionDocument(editor, 'doc-b');
		expect(getSuggestionHistory(editor)).toEqual([]);
		setSuggestionDocument(editor, 'doc-a', stored);
		expect(getSuggestionHistory(editor)).toEqual(stored);
	});
});

describe('target freezing', () => {
	test('empty and cross-block selections are refused', () => {
		setup('First.\n\nSecond.');
		editor.commands.setTextSelection(pos('First'));
		expect(startSuggestion(editor, 'x')).toBeNull();
		editor.commands.setTextSelection({ from: pos('First'), to: pos('Second') + 3 });
		expect(startSuggestion(editor, 'y')).toBeNull();
		expect(getSuggestions(editor)).toEqual([]);
	});
});

describe('background annotations', () => {
	test('auto suggestion: no pending mark, dotted underline when ready, reveal shows del/ins', () => {
		setup('The ideas is good.');
		const before = md();
		startSuggestion(editor, 'a1', range('The ideas is good.'), true);
		expect(editor.view.dom.querySelector('.wd-suggestion-pending')).toBeNull();
		resolveSuggestion(editor, 'a1', 'The idea is good.');
		const dom = editor.view.dom;
		expect(dom.querySelector('.wd-auto-issue')?.textContent).toBe('The ideas is good.');
		expect(dom.querySelector('del, ins')).toBeNull();
		expect(autoSuggestionAt(editor, range('ideas').from)?.id).toBe('a1');

		revealSuggestion(editor, 'a1');
		expect(dom.querySelector('.wd-auto-issue')).toBeNull();
		expect(dom.querySelector('del')?.textContent).toBe('ideas');
		expect(autoSuggestionAt(editor, range('ideas').from)).toBeUndefined();
		expect(md()).toBe(before);
		expect(acceptSuggestion(editor, 'a1')).toBe(true);
		expect(editor.getText()).toBe('The idea is good.');
	});
});
