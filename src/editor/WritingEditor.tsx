import { Extension, type Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useRef, useState } from 'react';
import {
	blockCommands,
	bold,
	code,
	historyCommands,
	italic,
	type FormatCommand,
} from './commands.ts';
import { LinkBox } from './LinkBox.tsx';
import { extensions, parseMarkdown } from './markdown.ts';
import { Toolbar } from './Toolbar.tsx';

type Props = {
	initialMarkdown?: string;
	/** Fires on every edit. Serialize lazily (e.g. debounced save), not on every keystroke. */
	onUpdate?: (editor: Editor) => void;
};

export function WritingEditor({ initialMarkdown = '', onUpdate }: Props) {
	const [linkOpen, setLinkOpen] = useState(false);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const link: FormatCommand = {
		id: 'link',
		label: 'Link',
		glyph: '🔗',
		keys: 'Meta+K Control+K',
		run: () => setLinkOpen(true),
		isActive: (e) => e.isActive('link'),
	};

	// Shortcuts are registered once at editor creation; both targets are stable.
	const shortcuts = useRef({
		openLink: () => setLinkOpen(true),
		focusToolbar: () => toolbarRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(),
	});

	const editor = useEditor({
		extensions: [
			...extensions,
			Placeholder.configure({ placeholder: 'Start writing…' }),
			Extension.create({
				name: 'writedownShortcuts',
				addKeyboardShortcuts: () => ({
					'Mod-k': () => (shortcuts.current.openLink(), true),
					// Conventional rich-text shortcut to reach the toolbar from the text.
					'Alt-F10': () => (shortcuts.current.focusToolbar(), true),
				}),
			}),
		],
		content: parseMarkdown(initialMarkdown).doc,
		editorProps: {
			attributes: {
				'aria-label': 'Document',
				'aria-multiline': 'true',
				role: 'textbox',
				class: 'prose',
			},
		},
		onUpdate: ({ editor }) => onUpdate?.(editor),
	});

	const inline = [bold, italic, code, link];

	return (
		<div className="writing-editor">
			<div className="toolbar-row">
				<Toolbar
					editor={editor}
					label="Formatting"
					ref={toolbarRef}
					commands={[...inline, ...blockCommands, ...historyCommands]}
				/>
				{linkOpen && <LinkBox editor={editor} onClose={() => setLinkOpen(false)} />}
			</div>
			<BubbleMenu editor={editor} className="bubble-menu">
				<Toolbar editor={editor} label="Selection formatting" commands={inline} />
			</BubbleMenu>
			<EditorContent editor={editor} />
		</div>
	);
}
