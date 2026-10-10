import type { JSONContent } from '@tiptap/core';
import { parseMarkdown, serializeMarkdown, type UnsupportedSyntax } from '../editor/markdown.ts';
import { deriveTitle } from './db.ts';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // ~800k words; far above any real document

/** What happens to each unsupported construct on import (see TECH_SPEC §4, WD-002). */
export const unsupportedEffects: Record<UnsupportedSyntax, string> = {
	table: 'Tables will be removed.',
	image: 'Images will be replaced by their alt text.',
	footnote: 'Footnotes will become plain links.',
	taskList: 'Task list checkboxes will be removed (items stay).',
	html: 'HTML will be converted to plain text or removed. It is never run.',
	unsafeLink: 'Unsafe links (such as javascript:) will be removed; their text stays.',
};

export type ParsedImport = { title: string; markdown: string; warnings: UnsupportedSyntax[] };

export class ImportError extends Error {}

/** Read and validate a user-chosen file. Throws ImportError with a user-facing message. */
export async function readMarkdownFile(file: File): Promise<ParsedImport> {
	if (!/\.(md|markdown|mdown|txt)$/i.test(file.name)) {
		throw new ImportError(`“${file.name}” isn’t a Markdown file. Choose a .md file.`);
	}
	if (file.size > MAX_IMPORT_BYTES) throw new ImportError(`“${file.name}” is larger than 5 MB.`);
	const bytes = new Uint8Array(await file.arrayBuffer());
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new ImportError(`“${file.name}” isn’t UTF-8 text.`);
	}
	if (text.includes('\0'))
		throw new ImportError(`“${file.name}” looks like a binary file, not text.`);
	return parseImport(text, file.name);
}

export function parseImport(text: string, fileName: string): ParsedImport {
	const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const { doc, warnings } = parseMarkdown(withoutBom);
	const fromContent = deriveTitle(doc);
	const fromName = fileName.replace(/\.[^.]+$/, '').trim();
	return {
		title: fromContent !== 'Untitled' ? fromContent : fromName || 'Untitled',
		// Store what the editor will actually show, so the first save doesn't look like an edit.
		markdown: serializeMarkdown(doc),
		warnings,
	};
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Safe cross-platform file name from a document title. */
export function exportFilename(title: string): string {
	let name = title
		.normalize('NFC')
		.replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]/gu, '') // control/format chars and reserved punctuation
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '') // no leading dots (hidden files) or trailing dots/spaces
		.slice(0, 100)
		.trim();
	if (!name) name = 'Untitled';
	if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
	return `${name}.md`;
}

/** Download the given editor content as a .md file named after its title. */
export function downloadMarkdown(doc: JSONContent) {
	const blob = new Blob([`${serializeMarkdown(doc)}\n`], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = Object.assign(document.createElement('a'), {
		href: url,
		download: exportFilename(deriveTitle(doc)),
	});
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
