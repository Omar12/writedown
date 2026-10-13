import { Extension, type Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
	blockCommands,
	bold,
	code,
	historyCommands,
	italic,
	type FormatCommand,
} from './commands.ts';
import { AiMenu } from '../ai/AiMenu.tsx';
import { SuggestionReview } from '../ai/SuggestionReview.tsx';
import { useAccount, useAutoProofread } from '../ai/api.ts';
import { useBackgroundProofreading } from '../ai/autoProofread.ts';
import { useAi } from '../ai/useAi.ts';
import { LinkBox } from './LinkBox.tsx';
import { extensions, parseMarkdown } from './markdown.ts';
import {
	autoSuggestionAt,
	revealSuggestion,
	setSuggestionDocument,
	Suggestions,
	type HistoryEntry,
} from './suggestions.ts';
import { Toolbar } from './Toolbar.tsx';

type Props = {
	documentId?: string;
	initialMarkdown?: string;
	initialHistory?: HistoryEntry[];
	editable?: boolean;
	/** Fires on every edit. Serialize lazily (e.g. debounced save), not on every keystroke. */
	onUpdate?: (editor: Editor) => void;
	/** Fires once the editor exists, before any edit. */
	onReady?: (editor: Editor) => void;
	/** Rendered in the toolbar row before and after the formatting toolbar. */
	leading?: ReactNode;
	trailing?: ReactNode;
};

/** Mount one instance per document (key it by document) so undo history and suggestions never cross documents. */
export function WritingEditor({
	documentId = '',
	initialMarkdown = '',
	initialHistory = [],
	editable = true,
	onUpdate,
	onReady,
	leading,
	trailing,
}: Props) {
	const [linkOpen, setLinkOpen] = useState(false);
	const [aiOpen, setAiOpen] = useState(false);
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
		openAi: (): void => setAiOpen(true),
		// Replaced below once the AI controller exists; returning false lets the key through.
		dismissAi: (): boolean => false,
		acceptAi: (): boolean => false,
		focusToolbar: () => toolbarRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(),
	});

	const editor = useEditor({
		extensions: [
			...extensions,
			Suggestions,
			Placeholder.configure({ placeholder: 'Start writing…' }),
			Extension.create({
				name: 'writedownShortcuts',
				addKeyboardShortcuts: () => ({
					'Mod-k': () => (shortcuts.current.openLink(), true),
					// UX-001: Mod-j is preferred; Mod-/ always works where the browser keeps Mod-j.
					'Mod-j': () => (shortcuts.current.openAi(), true),
					'Mod-/': () => (shortcuts.current.openAi(), true),
					'Mod-Enter': () => shortcuts.current.acceptAi(),
					Escape: () => shortcuts.current.dismissAi(),
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
		onCreate: ({ editor }) => {
			setSuggestionDocument(editor, documentId, initialHistory);
			onReady?.(editor);
		},
		onUpdate: ({ editor }) => onUpdateRef.current?.(editor),
	});

	const ai = useAi(editor);
	const account = useAccount();
	useBackgroundProofreading(editor, ai, useAutoProofread() && !!account && editable);
	// ⌘J on a quiet background annotation opens it instead of the menu.
	useEffect(() => {
		shortcuts.current.openAi = () => {
			const s = autoSuggestionAt(editor, editor.state.selection.from);
			if (s) revealSuggestion(editor, s.id);
			else setAiOpen(true);
		};
	}, [editor]);
	useEffect(() => {
		shortcuts.current.dismissAi = ai.dismiss;
		shortcuts.current.acceptAi = ai.acceptReady;
	});

	const onUpdateRef = useRef(onUpdate);
	useEffect(() => {
		onUpdateRef.current = onUpdate;
	}, [onUpdate]);

	useEffect(() => {
		// No update event: toggling editability is not an edit and must not trigger a save.
		editor.setEditable(editable, false);
	}, [editor, editable]);

	const inline = [bold, italic, code, link];

	return (
		<div className="writing-editor">
			<div className="toolbar-row">
				{leading}
				<Toolbar
					editor={editor}
					label="Formatting"
					ref={toolbarRef}
					commands={[...inline, ...blockCommands, ...historyCommands]}
				/>
				<button
					type="button"
					className="ai-trigger"
					aria-haspopup="dialog"
					aria-expanded={aiOpen}
					aria-keyshortcuts="Meta+J Control+J Meta+/ Control+/"
					disabled={!editable}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => setAiOpen(true)}
				>
					✦ AI
				</button>
				{trailing}
				{linkOpen && <LinkBox editor={editor} onClose={() => setLinkOpen(false)} />}
			</div>
			<BubbleMenu editor={editor} className="bubble-menu">
				<Toolbar editor={editor} label="Selection formatting" commands={inline} />
			</BubbleMenu>
			<EditorContent editor={editor} />
			{aiOpen && editable && <AiMenu editor={editor} ai={ai} onClose={() => setAiOpen(false)} />}
			<SuggestionReview editor={editor} ai={ai} />
			<p role="status" aria-label="AI status" className="ai-status">
				{ai.status}
			</p>
		</div>
	);
}
