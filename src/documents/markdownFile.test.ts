import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../editor/markdown.ts';
import {
	exportFilename,
	ImportError,
	MAX_IMPORT_BYTES,
	parseImport,
	readMarkdownFile,
} from './markdownFile.ts';

const file = (content: BlobPart, name = 'notes.md') => new File([content], name);

describe('readMarkdownFile', () => {
	test('reads a clean file with title from content', async () => {
		const parsed = await readMarkdownFile(
			file('# Trip plan\n\nPack **light**. See [map](https://e.com/a_(b)).\n'),
		);
		expect(parsed).toEqual({
			title: 'Trip plan',
			markdown: '# Trip plan\n\nPack **light**. See [map](https://e.com/a_(b)).',
			warnings: [],
		});
	});

	test('falls back to the file name for the title', async () => {
		expect((await readMarkdownFile(file('', 'Empty draft.md'))).title).toBe('Empty draft');
	});

	test('strips a UTF-8 BOM', async () => {
		expect((await readMarkdownFile(file('﻿# Title'))).markdown).toBe('# Title');
	});

	test('reports unsupported syntax', async () => {
		const parsed = await readMarkdownFile(file('| a |\n|---|\n| 1 |\n\n![x](y.png)\n\n- [ ] task'));
		expect(parsed.warnings.sort()).toEqual(['image', 'table', 'taskList']);
	});

	test.each([
		['wrong extension', file('# x', 'photo.png'), /isn’t a Markdown file/],
		['too large', file(new Uint8Array(MAX_IMPORT_BYTES + 1)), /larger than 5 MB/],
		['invalid UTF-8', file(new Uint8Array([0x23, 0x20, 0xff, 0xfe])), /isn’t UTF-8/],
		['binary', file('# a\0b'), /binary/],
	])('rejects %s', async (_, f, message) => {
		const result = readMarkdownFile(f);
		await expect(result).rejects.toBeInstanceOf(ImportError);
		await expect(result).rejects.toThrow(message);
	});
});

describe('malicious HTML', () => {
	test('script and event handlers never become markup', () => {
		const parsed = parseImport(
			'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))',
			'x.md',
		);
		expect(parsed.warnings).toContain('html');
		expect(parsed.markdown).not.toMatch(/<script|<img/);
		const json = JSON.stringify(parseMarkdown(parsed.markdown).doc);
		expect(json).not.toMatch(/"image"|"script"|javascript:/);
	});
});

describe('round trip through import', () => {
	test('importing exported Markdown yields the same document', () => {
		const source =
			'# T\n\n1. one\n   - nested `code`\n\n> quote [l](https://e.com/x_y)\n\n````md\n```js\nx\n```\n````';
		const once = parseImport(source, 'a.md');
		const twice = parseImport(once.markdown, 'a.md');
		expect(parseMarkdown(twice.markdown).doc).toEqual(parseMarkdown(once.markdown).doc);
	});
});

describe('exportFilename', () => {
	test.each([
		['Trip plan', 'Trip plan.md'],
		['a/b\\c:d*e?f"g<h>i|j', 'abcdefghij.md'],
		['  ..hidden. ', 'hidden.md'],
		['line\u0000break‎here', 'linebreakhere.md'],
		['', 'Untitled.md'],
		['???', 'Untitled.md'],
		['CON', '_CON.md'],
		['Café ☕ 日本', 'Café ☕ 日本.md'],
		['x'.repeat(300), `${'x'.repeat(100)}.md`],
	])('%j -> %j', (title, expected) => {
		expect(exportFilename(title)).toBe(expected);
	});
});
