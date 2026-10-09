import { describe, expect, test } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import { extensions, parseMarkdown, serializeMarkdown } from './markdown.ts';

const schema = getSchema(extensions);

function types(node: JSONContent, out = new Set<string>()): Set<string> {
	out.add(node.type!);
	node.marks?.forEach((m) => out.add(m.type));
	node.content?.forEach((c) => types(c, out));
	return out;
}

function text(node: JSONContent): string {
	return (node.text ?? '') + (node.content ?? []).map(text).join('');
}

// Each fixture must survive parse -> serialize -> parse with an identical document,
// contain the listed node/mark types, and produce no unsupported-syntax warnings.
const fixtures: { name: string; md: string; has: string[] }[] = [
	{ name: 'headings', md: '# One\n\n## Two\n\n###### Six', has: ['heading'] },
	{
		name: 'emphasis and nesting',
		md: '**bold** *italic* ***both*** **bold *nested* bold** ~~strike~~',
		has: ['bold', 'italic', 'strike'],
	},
	{
		name: 'links with punctuation',
		md: 'See [docs](https://example.com/a_(b)?q=1&r=2#frag). Also [**bold link**](https://x.io "Title"), then [code `x`](https://y.io)!',
		has: ['link', 'bold', 'code'],
	},
	{
		name: 'bullet list nested 3 deep',
		md: '- a\n  - b\n    - c\n- d',
		has: ['bulletList', 'listItem'],
	},
	{ name: 'ordered list with start', md: '3. three\n4. four\n   1. sub', has: ['orderedList'] },
	{ name: 'mixed list', md: '1. one\n   - inner\n2. two', has: ['orderedList', 'bulletList'] },
	{
		name: 'blockquote',
		md: '> quoted **text**\n>\n> second paragraph',
		has: ['blockquote', 'bold'],
	},
	{
		name: 'nested blockquote with list',
		md: '> - item\n>   > deeper',
		has: ['blockquote', 'bulletList'],
	},
	{ name: 'inline code with backtick', md: 'Use `` a`b `` and `<tag>`', has: ['code'] },
	{
		name: 'fenced code',
		md: '```ts\nconst a = 1 < 2 && "x";\n\n// *not emphasis*\n```\n\n```\nplain\n```',
		has: ['codeBlock'],
	},
	{ name: 'fence containing backticks', md: '````md\n```js\nx\n```\n````', has: ['codeBlock'] },
	{ name: 'hard break', md: 'line one  \nline two\\\nline three', has: ['hardBreak'] },
	{
		name: 'escaping',
		md: '\\*not em\\* \\_not em\\_ \\# not heading \\[not link\\] back\\\\slash 1\\. not list',
		has: ['paragraph'],
	},
	{
		name: 'unicode',
		md: '# Café ☕\n\n日本語のテキスト。 **עברית** 👩‍👩‍👧 é “curly” — dash',
		has: ['heading', 'bold'],
	},
	{
		name: 'multi paragraph',
		md: 'First paragraph.\n\nSecond, with *style*.\n\nThird.',
		has: ['paragraph', 'italic'],
	},
	{ name: 'horizontal rule', md: 'above\n\n---\n\nbelow', has: ['horizontalRule'] },
];

describe('supported syntax round-trips semantically', () => {
	test.each(fixtures)('$name', ({ md, has }) => {
		const first = parseMarkdown(md);
		expect(first.warnings).toEqual([]);
		schema.nodeFromJSON(first.doc).check();
		for (const t of has) expect(types(first.doc)).toContain(t);

		const second = parseMarkdown(serializeMarkdown(first.doc));
		expect(second.doc).toEqual(first.doc);
	});

	test('literal code and link destinations survive exactly', () => {
		const { doc } = parseMarkdown('```\n<b>&amp; **x**\n```\n\n[l](https://e.com/a_b*c)');
		const out = parseMarkdown(serializeMarkdown(doc)).doc;
		expect(text(out.content![0])).toBe('<b>&amp; **x**');
		expect(out.content![1].content![0].marks![0].attrs!.href).toBe('https://e.com/a_b*c');
	});

	test('empty document', () => {
		const { doc, warnings } = parseMarkdown('');
		expect(warnings).toEqual([]);
		expect(serializeMarkdown(doc)).toBe('');
	});
});

describe('unsupported syntax is reported', () => {
	test.each([
		['table', '| a | b |\n|---|---|\n| 1 | 2 |'],
		['html', '<div>block</div>'],
		['html', 'inline <span>html</span> here'],
		['image', 'look ![alt](a.png)'],
		['footnote', 'Text[^1]\n\n[^1]: the note'],
		['taskList', '- [ ] todo\n- [x] done'],
	])('%s', (kind, md) => {
		expect(parseMarkdown(md).warnings).toContain(kind);
	});

	test('nested unsupported syntax is found', () => {
		expect(parseMarkdown('> - item with ![img](a.png)').warnings).toEqual(['image']);
	});
});

describe('unsafe HTML', () => {
	test('script is kept as inert literal text, never markup', () => {
		const { doc, warnings } = parseMarkdown(
			'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>',
		);
		expect(warnings).toEqual(['html']);
		expect(types(doc).has('image')).toBe(false);
		expect(text(doc)).toContain('<script>alert(1)</script>');
		// Serialized output escapes it, so re-import still yields text, not HTML.
		const out = serializeMarkdown(doc);
		expect(out).not.toContain('<script>');
		expect(text(parseMarkdown(out).doc)).toContain('<script>alert(1)</script>');
	});
});
