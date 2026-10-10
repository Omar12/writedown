import type { Editor } from '@tiptap/core';

export type FormatCommand = {
	id: string;
	label: string; // accessible name
	glyph: string; // visible text
	keys: string; // aria-keyshortcuts
	run: (editor: Editor) => void;
	isActive?: (editor: Editor) => boolean;
	isDisabled?: (editor: Editor) => boolean;
};

// Keyboard shortcuts are StarterKit's defaults; `keys` only documents them for assistive tech.
const mark = (
	id: string,
	label: string,
	glyph: string,
	keys: string,
	toggle: (e: Editor) => void,
): FormatCommand => ({
	id,
	label,
	glyph,
	keys,
	run: toggle,
	isActive: (e) => e.isActive(id),
});

export const bold = mark('bold', 'Bold', 'B', 'Meta+B Control+B', (e) =>
	e.chain().focus().toggleBold().run(),
);
export const italic = mark('italic', 'Italic', 'I', 'Meta+I Control+I', (e) =>
	e.chain().focus().toggleItalic().run(),
);
export const code = mark('code', 'Inline code', '</>', 'Meta+E Control+E', (e) =>
	e.chain().focus().toggleCode().run(),
);

const heading = (level: 1 | 2 | 3): FormatCommand => ({
	id: `heading${level}`,
	label: `Heading ${level}`,
	glyph: `H${level}`,
	keys: `Meta+Alt+${level} Control+Alt+${level}`,
	run: (e) => e.chain().focus().toggleHeading({ level }).run(),
	isActive: (e) => e.isActive('heading', { level }),
});

export const blockCommands: FormatCommand[] = [
	heading(1),
	heading(2),
	heading(3),
	{
		id: 'bulletList',
		label: 'Bulleted list',
		glyph: '•',
		keys: 'Meta+Shift+8 Control+Shift+8',
		run: (e) => e.chain().focus().toggleBulletList().run(),
		isActive: (e) => e.isActive('bulletList'),
	},
	{
		id: 'orderedList',
		label: 'Numbered list',
		glyph: '1.',
		keys: 'Meta+Shift+7 Control+Shift+7',
		run: (e) => e.chain().focus().toggleOrderedList().run(),
		isActive: (e) => e.isActive('orderedList'),
	},
	{
		id: 'blockquote',
		label: 'Quote',
		glyph: '❝',
		keys: 'Meta+Shift+B Control+Shift+B',
		run: (e) => e.chain().focus().toggleBlockquote().run(),
		isActive: (e) => e.isActive('blockquote'),
	},
	{
		id: 'codeBlock',
		label: 'Code block',
		glyph: '{ }',
		keys: 'Meta+Alt+C Control+Alt+C',
		run: (e) => e.chain().focus().toggleCodeBlock().run(),
		isActive: (e) => e.isActive('codeBlock'),
	},
];

export const historyCommands: FormatCommand[] = [
	{
		id: 'undo',
		label: 'Undo',
		glyph: '↶',
		keys: 'Meta+Z Control+Z',
		run: (e) => e.chain().focus().undo().run(),
		isDisabled: (e) => !e.can().undo(),
	},
	{
		id: 'redo',
		label: 'Redo',
		glyph: '↷',
		keys: 'Meta+Shift+Z Control+Shift+Z',
		run: (e) => e.chain().focus().redo().run(),
		isDisabled: (e) => !e.can().redo(),
	},
];
