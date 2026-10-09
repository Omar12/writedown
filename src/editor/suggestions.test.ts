// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensions, parseMarkdown, serializeMarkdown } from './markdown.ts';
import {
	Suggestions,
	acceptSuggestion,
	getSuggestions,
	rejectSuggestion,
	resolveSuggestion,
	setSuggestionDocument,
	startSuggestion,
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

/** Document position where `text` starts (searches text nodes). */
function pos(text: string): number {
	let found = -1;
	editor.state.doc.descendants((node, p) => {
		if (found < 0 && node.isText && node.text!.includes(text)) found = p + node.text!.indexOf(text);
	});
	if (found < 0) throw new Error(`text not found: ${text}`);
	return found;
}

function select(text: string) {
	const from = pos(text);
	editor.commands.setTextSelection({ from, to: from + text.length });
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
		expect(dom.querySelector('del.wd-suggestion-removed')?.textContent).toBe('ideas is');
		expect(dom.querySelector('ins.wd-suggestion-added')?.textContent).toBe('idea is');
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

	test('edit inside target after ready: becomes stale, accept refused', () => {
		setup('The ideas is good.');
		request('ideas is', 's1');
		resolveSuggestion(editor, 's1', 'idea is');
		editor.commands.insertContentAt(pos('ideas') + 1, 'X');
		expect(status('s1')).toBe('stale');
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
