import type { JSONContent } from '@tiptap/core';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

// Upstream code mark excludes all other marks, which makes [`x`](url) an invalid document.
const InlineCode = Code.extend({ excludes: '' });

// Upstream always fences with ```, which corrupts code that itself contains ```.
const FencedCodeBlock = CodeBlock.extend({
	renderMarkdown: (node: JSONContent) => {
		const code = (node.content ?? []).map((c) => c.text ?? '').join('');
		const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
		const fence = '`'.repeat(Math.max(3, longestRun + 1));
		return `${fence}${node.attrs?.language ?? ''}\n${code}\n${fence}`;
	},
});

// Underline has no Markdown syntax. Strike and horizontal rule are outside the
// TECH_SPEC list but round-trip losslessly, so they stay enabled.
export const extensions = [
	StarterKit.configure({ underline: false, code: false, codeBlock: false }),
	InlineCode,
	FencedCodeBlock,
];

const markdown = new MarkdownManager({ extensions });

export type UnsupportedSyntax = 'table' | 'html' | 'image' | 'footnote' | 'taskList';

type Token = { type: string; task?: boolean; [key: string]: unknown };

function findUnsupported(tokens: Token[], found: Set<UnsupportedSyntax>) {
	for (const token of tokens) {
		if (token.type === 'table') found.add('table');
		else if (token.type === 'html') found.add('html');
		else if (token.type === 'image') found.add('image');
		// The lexer leaves footnote definitions as plain paragraphs.
		else if (token.type === 'paragraph' && /^\[\^[^\]\s]+\]:/m.test(String(token.raw)))
			found.add('footnote');
		else if (token.type === 'list_item' && token.task) found.add('taskList');
		for (const child of [token.tokens, token.items]) {
			if (Array.isArray(child)) findUnsupported(child, found);
		}
	}
}

/** Parse Markdown into editor JSON. `warnings` lists syntax the editor cannot represent faithfully. */
export function parseMarkdown(source: string): { doc: JSONContent; warnings: UnsupportedSyntax[] } {
	const found = new Set<UnsupportedSyntax>();
	findUnsupported(markdown.instance.lexer(source) as Token[], found);
	const doc = markdown.parse(source);
	// The schema needs at least one block; an empty doc would leave nothing to type into.
	if (!doc.content?.length) doc.content = [{ type: 'paragraph' }];
	return { doc, warnings: [...found] };
}

export function serializeMarkdown(doc: JSONContent): string {
	// Drops the empty trailing paragraph the editor keeps after a final heading, list or code block.
	return markdown.serialize(doc).trimEnd();
}
