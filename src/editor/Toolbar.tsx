import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useState, type KeyboardEvent, type Ref } from 'react';
import type { FormatCommand } from './commands.ts';

type Props = {
	editor: Editor;
	label: string;
	commands: FormatCommand[];
	ref?: Ref<HTMLDivElement>;
};

/** WAI-ARIA toolbar: one tab stop, arrow keys move between buttons, Escape returns to the text. */
export function Toolbar({ editor, label, commands, ref }: Props) {
	const [current, setCurrent] = useState(0);
	const states = useEditorState({
		editor,
		selector: ({ editor: e }) =>
			commands.map((c) => ({
				active: c.isActive?.(e) ?? false,
				disabled: c.isDisabled?.(e) ?? false,
			})),
		equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
	});

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const buttons = [...event.currentTarget.querySelectorAll('button')];
		const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: buttons.length - 1 }[
			event.key
		];
		if (next !== undefined) {
			event.preventDefault();
			const target = (next + buttons.length) % buttons.length;
			setCurrent(target);
			buttons[target].focus();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editor.commands.focus();
		}
	}

	return (
		<div role="toolbar" aria-label={label} className="toolbar" ref={ref} onKeyDown={onKeyDown}>
			{commands.map((c, i) => (
				<button
					key={c.id}
					type="button"
					tabIndex={i === current ? 0 : -1}
					aria-label={c.label}
					aria-keyshortcuts={c.keys}
					aria-pressed={c.isActive ? states[i].active : undefined}
					// aria-disabled, not disabled: toolbar items stay focusable so arrow keys can reach them.
					aria-disabled={states[i].disabled || undefined}
					title={c.label}
					// Keep the editor's selection when clicking.
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => {
						setCurrent(i);
						if (!states[i].disabled) c.run(editor);
					}}
				>
					{c.glyph}
				</button>
			))}
		</div>
	);
}
