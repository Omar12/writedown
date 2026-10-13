// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, expect, test } from 'vitest';
import { extensions, parseMarkdown } from './markdown.ts';
import { completedSentence, resolveTarget, sentences } from './target.ts';

let editor: Editor;
afterEach(() => editor?.destroy());

function setup(md: string) {
	editor = new Editor({
		element: document.createElement('div'),
		extensions,
		content: parseMarkdown(md).doc,
	});
}

/** Puts the caret (or selection) at the first occurrence of `needle` in the document text. */
function select(needle: string, length = 0) {
	let at = -1;
	editor.state.doc.descendants((n, p) => {
		if (at === -1 && n.isText && n.text!.includes(needle)) at = p + n.text!.indexOf(needle);
	});
	expect(at).toBeGreaterThan(-1);
	editor.view.dispatch(
		editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at, at + length)),
	);
}

const target = () => resolveTarget(editor.state);
const text = () => {
	const t = target();
	return 'error' in t ? t.error : t.text;
};

test('sentences: abbreviations, Unicode punctuation, CJK', () => {
	const split = (t: string) => sentences(t).map(([s, e]) => t.slice(s, e));
	expect(split('Dr. Smith arrived. He sat.')).toEqual(['Dr. Smith arrived.', 'He sat.']);
	expect(split('Version 3.5 is out! Great?')).toEqual(['Version 3.5 is out!', 'Great?']);
	expect(split('Él dijo «hola». ¿Qué tal?')).toEqual(['Él dijo «hola».', '¿Qué tal?']);
	expect(split('日本語です。次の文。')).toEqual(['日本語です。', '次の文。']);
	expect(split('No end punctuation')).toEqual(['No end punctuation']);
});

test('selection wins over the caret sentence', () => {
	setup('The ideas is good. Second one.');
	select('ideas is', 8);
	expect(text()).toBe('ideas is');
});

test('caret picks its sentence, including at its end and inside formatting', () => {
	setup('First one. The **ideas** is good. Last.');
	select('dea');
	expect(text()).toBe('The ideas is good.');
	select(' Last'); // just after "good."
	expect(text()).toBe('The ideas is good.');
	select('Last');
	expect(text()).toBe('Last.');
});

test('select-all on a one-paragraph document targets that paragraph', () => {
	setup('Only paragraph here.');
	editor.commands.selectAll();
	expect(text()).toBe('Only paragraph here.');
});

test('context is the surrounding text, bounded', () => {
	setup('# Title\n\nBefore. Target here. After.\n\nNext paragraph.');
	select('Target');
	const t = target();
	if ('error' in t) throw new Error(t.error);
	expect(t.contextBefore).toBe('Title\n\nBefore. ');
	expect(t.contextAfter).toBe(' After.\n\nNext paragraph.');
});

test('rejects empty, cross-block, code block and inline-code-only targets', () => {
	setup('One.\n\nTwo.\n\n```\ncode here\n```\n\nRun `npm test` now.\n\n');
	select('One');
	editor.view.dispatch(
		editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 8)), // into "Two."
	);
	expect(text()).toMatch(/single paragraph/);
	select('code here');
	expect(text()).toMatch(/code blocks/);
	select('npm test', 8);
	expect(text()).toMatch(/inline code/);
	select('npm test'); // caret inside code, sentence has prose: allowed
	expect(text()).toBe('Run npm test now.');
	editor.commands.setContent(parseMarkdown('').doc);
	expect(text()).toMatch(/cursor in a sentence/);
});

test('completedSentence: last finished sentence before the caret, never an unfinished one', () => {
	const done = () => completedSentence(editor.state)?.text ?? null;
	setup('First one. Second one is done. And a third');
	select('third');
	expect(done()).toBe('Second one is done.');
	select(' And'); // caret right after "done."
	expect(done()).toBe('Second one is done.');
	select('First');
	expect(done()).toBeNull(); // nothing finished before the caret

	setup('Done here. And'); // caret at the end of the sentence being typed
	select('And', 3);
	editor.commands.setTextSelection(editor.state.selection.to);
	expect(done()).toBe('Done here.');

	setup('Unfinished thought');
	select('thought');
	expect(done()).toBeNull();
	setup('She said “stop.” Then left');
	select('Then');
	expect(done()).toBe('She said “stop.”');
	setup('```\ncode. more.\n```');
	select('more');
	expect(done()).toBeNull();
});
