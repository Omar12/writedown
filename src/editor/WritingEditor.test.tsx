// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterEach, expect, test } from 'vitest';
import { normalizeUrl } from './LinkBox.tsx';
import { serializeMarkdown } from './markdown.ts';
import { WritingEditor } from './WritingEditor.tsx';

afterEach(cleanup);

function setup(initialMarkdown = 'Hello world.') {
	render(<WritingEditor initialMarkdown={initialMarkdown} />);
	const textbox = screen.getByRole('textbox', { name: 'Document' });
	const editor = (textbox as HTMLElement & { editor: Editor }).editor;
	const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
	const button = (name: string) =>
		toolbar.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
	const md = () => serializeMarkdown(editor.getJSON());
	/** Select `text` in the first paragraph. */
	const select = (text: string) =>
		act(() => {
			const from = 1 + editor.state.doc.textContent.indexOf(text);
			editor.commands.setTextSelection({ from, to: from + text.length });
		});
	return { user: userEvent.setup(), textbox, editor, toolbar, button, md, select };
}

test('empty document has a labelled textbox and placeholder', () => {
	const { textbox } = setup('');
	expect(textbox.getAttribute('aria-multiline')).toBe('true');
	expect(textbox.querySelector('[data-placeholder="Start writing…"]')).not.toBeNull();
});

test('toolbar buttons format the selection and the Markdown reflects it', async () => {
	const { user, button, md, select } = setup('Hello world.');
	select('world');
	await user.click(button('Bold'));
	expect(md()).toBe('Hello **world**.');
	expect(button('Bold').getAttribute('aria-pressed')).toBe('true');

	await user.click(button('Italic'));
	await user.click(button('Inline code'));
	expect(md()).toBe('Hello ***`world`***.');

	await user.click(button('Heading 2'));
	expect(md()).toMatch(/^## /);
	await user.click(button('Quote'));
	expect(md()).toMatch(/^> ## /);
});

test.each([
	['Bulleted list', '- Hello world.'],
	['Numbered list', '1. Hello world.'],
	['Code block', '```\nHello world.\n```'],
	['Heading 1', '# Hello world.'],
	['Heading 3', '### Hello world.'],
])('%s block command', async (name, expected) => {
	const { user, button, md } = setup('Hello world.');
	await user.click(button(name));
	expect(md()).toBe(expected);
	expect(button(name).getAttribute('aria-pressed')).toBe('true');
});

test('disabled undo is still focusable and does nothing', async () => {
	const { user, button, md } = setup('Hello world.');
	act(() => button('Undo').focus());
	expect(document.activeElement).toBe(button('Undo'));
	await user.click(button('Undo'));
	expect(md()).toBe('Hello world.');
});

test('undo/redo buttons are disabled until available and restore content', async () => {
	const { user, button, md, select } = setup('Hello world.');
	expect(button('Undo').getAttribute('aria-disabled')).toBe('true');
	select('Hello');
	await user.click(button('Bold'));
	expect(button('Undo').hasAttribute('aria-disabled')).toBe(false);
	await user.click(button('Undo'));
	expect(md()).toBe('Hello world.');
	await user.click(button('Redo'));
	expect(md()).toBe('**Hello** world.');
});

test('clicking a toolbar button keeps focus in the text', async () => {
	const { user, textbox, button, select } = setup();
	act(() => textbox.focus());
	select('world');
	await user.click(button('Bold'));
	expect(textbox.contains(document.activeElement)).toBe(true);
});

test('toolbar is one tab stop with arrow-key navigation; Escape returns to text', async () => {
	const { user, toolbar, textbox } = setup();
	const tabbable = toolbar.querySelectorAll('[tabindex="0"]');
	expect(tabbable).toHaveLength(1);
	act(() => (tabbable[0] as HTMLElement).focus());
	await user.keyboard('{ArrowRight}');
	expect(document.activeElement?.getAttribute('aria-label')).toBe('Italic');
	await user.keyboard('{End}');
	expect(document.activeElement?.getAttribute('aria-label')).toBe('Redo');
	await user.keyboard('{ArrowRight}');
	expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold');
	await user.keyboard('{Escape}');
	expect(textbox.contains(document.activeElement)).toBe(true);
});

test('link box: apply to selection, edit, remove; focus returns to text', async () => {
	const { user, button, md, select, textbox } = setup('Read the docs now.');
	select('the docs');
	await user.click(button('Link'));
	const input = screen.getByLabelText('Link URL');
	expect(document.activeElement).toBe(input);
	await user.type(input, 'example.com/guide{Enter}');
	expect(md()).toBe('Read [the docs](https://example.com/guide) now.');
	expect(textbox.contains(document.activeElement)).toBe(true);

	select('docs');
	await user.click(button('Link'));
	expect((screen.getByLabelText('Link URL') as HTMLInputElement).value).toBe(
		'https://example.com/guide',
	);
	await user.click(screen.getByRole('button', { name: 'Remove' }));
	expect(md()).toBe('Read the docs now.');
});

test('link box rejects unsafe URLs and Escape cancels without change', async () => {
	const { user, button, md, select, textbox } = setup('Click here.');
	select('here');
	await user.click(button('Link'));
	await user.type(screen.getByLabelText('Link URL'), 'javascript:alert(1){Enter}');
	expect(screen.getByRole('alert').textContent).toMatch(/valid web address/);
	expect(md()).toBe('Click here.');
	await user.keyboard('{Escape}');
	expect(screen.queryByLabelText('Link URL')).toBeNull();
	expect(textbox.contains(document.activeElement)).toBe(true);
	expect(md()).toBe('Click here.');
});

test('link box with no selection inserts the URL as linked text', async () => {
	const { user, button, md, editor } = setup('See ');
	act(() => editor.commands.setTextSelection(5));
	await user.click(button('Link'));
	await user.type(screen.getByLabelText('Link URL'), 'https://e.com{Enter}');
	expect(md()).toBe('See [https://e.com](https://e.com)');
});

test('Mod-K opens the link box from the text', async () => {
	const { textbox, user } = setup();
	await user.click(textbox);
	// happy-dom reports a non-Mac platform, so Mod is Control here.
	await user.keyboard('{Control>}k{/Control}');
	expect(screen.getByLabelText('Link URL')).toBeTruthy();
});

test.each([
	['example.com', 'https://example.com'],
	['https://e.com/a?b=1', 'https://e.com/a?b=1'],
	['mailto:a@b.co', 'mailto:a@b.co'],
	['#section', '#section'],
	['javascript:alert(1)', null],
	['data:text/html,<script>', null],
	['vbscript:x', null],
])('normalizeUrl(%j)', (input, expected) => {
	expect(normalizeUrl(input)).toBe(expected);
});
