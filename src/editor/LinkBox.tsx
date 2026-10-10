import type { Editor } from '@tiptap/core';
import { isAllowedUri } from '@tiptap/extension-link';
import { useId, useState, type FormEvent } from 'react';

/** Adds https:// to bare domains ("example.com"); null if the scheme is unsafe (javascript:, data:, ...). */
export function normalizeUrl(input: string): string | null {
	const url = input.trim();
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) || /^[/#]/.test(url) ? url : `https://${url}`;
	return isAllowedUri(withScheme) ? withScheme : null;
}

/** Small inline form for adding, editing or removing a link. Focus returns to the text when it closes. */
export function LinkBox({ editor, onClose }: { editor: Editor; onClose: () => void }) {
	const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
	const [href, setHref] = useState(existing);
	const [error, setError] = useState('');
	const inputId = useId();
	const errorId = useId();

	function close() {
		onClose();
		editor.commands.focus();
	}

	function remove() {
		editor.chain().focus().extendMarkRange('link').unsetLink().run();
		onClose();
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!href.trim()) return remove();
		const url = normalizeUrl(href);
		if (!url) {
			setError('Enter a valid web address, such as https://example.com');
			return;
		}
		const chain = editor.chain().focus();
		if (editor.state.selection.empty && !existing) {
			chain
				.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
				.run();
		} else {
			chain.extendMarkRange('link').setLink({ href: url }).run();
		}
		onClose();
	}

	return (
		<form
			className="link-box"
			onSubmit={submit}
			onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), close())}
		>
			<label htmlFor={inputId}>Link URL</label>
			<input
				id={inputId}
				type="text"
				inputMode="url"
				autoFocus
				value={href}
				onChange={(e) => (setHref(e.target.value), setError(''))}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				placeholder="https://"
			/>
			<button type="submit">Apply</button>
			{existing && (
				<button type="button" onClick={remove}>
					Remove
				</button>
			)}
			<button type="button" onClick={close}>
				Cancel
			</button>
			{error && (
				<p id={errorId} role="alert" className="link-error">
					{error}
				</p>
			)}
		</form>
	);
}
