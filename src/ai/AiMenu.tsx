import type { Editor } from '@tiptap/core';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { resolveTarget } from '../editor/target.ts';
import { checkAccount, requestSignInLink, type Action } from './api.ts';
import { ACTION_LABELS, locale, type Ai } from './useAi.ts';

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const DISCLOSURE_KEY = 'writedown.aiDisclosureAccepted';
export const disclosureAccepted = () => {
	try {
		return localStorage.getItem(DISCLOSURE_KEY) === '1';
	} catch {
		return false;
	}
};

/** OPS-001 wording, owner-confirmed 2026-10-09. Keep in sync with TECH_SPEC §10. */
export function Disclosure() {
	return (
		<>
			<p>
				Your documents stay in this browser. When you use AI, the selected text and a little
				surrounding context are sent to Anthropic’s Claude to produce a suggestion.
			</p>
			<p>
				Anthropic keeps API data for up to 30 days and doesn’t use it to train models. It may keep
				it for up to 2 years if its safety systems flag it, or when the law requires.
			</p>
		</>
	);
}

type Step =
	| { kind: 'disclosure'; then: Step }
	| { kind: 'menu' }
	| { kind: 'custom' }
	| { kind: 'signin' }
	| { kind: 'sent' }
	| { kind: 'message'; text: string };

const ACTIONS: Action[] = ['proofread', 'rewrite', 'expand', 'custom'];

/**
 * Popup at the caret: four actions, keyboard first. Opening it sends nothing; only choosing an
 * action does. Focus returns to the text on close.
 */
export function AiMenu({ editor, ai, onClose }: { editor: Editor; ai: Ai; onClose: () => void }) {
	const [step, setStep] = useState<Step>(() => {
		const target = resolveTarget(editor.state, locale());
		const first: Step =
			'error' in target ? { kind: 'message', text: target.error } : { kind: 'menu' };
		return disclosureAccepted() || first.kind === 'message'
			? first
			: { kind: 'disclosure', then: first };
	});
	const [instruction, setInstruction] = useState('');
	const [email, setEmail] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const errorId = useId();

	// Anchor below the start of the target; stays put while open.
	const [position] = useState(() => {
		const { bottom, left } = editor.view.coordsAtPos(editor.state.selection.from);
		return {
			top: bottom + window.scrollY + 6,
			left: Math.max(8, Math.min(left, window.innerWidth - 336)),
		};
	});

	useEffect(() => {
		box.current
			?.querySelector<HTMLElement>('[autofocus], [role="menuitem"], input, button')
			?.focus();
	}, [step.kind]);

	function close() {
		onClose();
		// Synchronous: commands.focus() waits a frame, and a quick ⌘J/Esc in between would go nowhere.
		editor.view.focus();
	}

	async function choose(action: Action, text: string | null = null) {
		if (busy) return;
		setBusy(true);
		const account = await checkAccount();
		setBusy(false);
		if (account === 'signed-out') return setStep({ kind: 'signin' });
		if (account === 'not-allowed')
			return setStep({ kind: 'message', text: 'This account isn’t on the beta list.' });
		if (account === 'offline')
			return setStep({
				kind: 'message',
				text: 'Can’t reach the AI service. Your writing is still saved.',
			});
		const problem = ai.run(action, text);
		if (problem) return setStep({ kind: 'message', text: problem });
		close();
	}

	async function sendLink(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		const problem = await requestSignInLink(email.trim());
		setBusy(false);
		if (problem) setError(problem);
		else setStep({ kind: 'sent' });
	}

	function submitCustom(event: FormEvent) {
		event.preventDefault();
		if (!instruction.trim()) return setError('Type an instruction first.');
		void choose('custom', instruction.trim());
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			return close();
		}
		const items = [...box.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const index = items.indexOf(document.activeElement as HTMLElement);
		if (index === -1) return;
		const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[
			event.key
		];
		if (next !== undefined) {
			event.preventDefault();
			items[(next + items.length) % items.length].focus();
		}
	}

	let body;
	switch (step.kind) {
		case 'disclosure':
			body = (
				<>
					<h2 id={titleId}>Before you use AI</h2>
					<Disclosure />
					<div className="ai-actions">
						<button
							type="button"
							autoFocus
							onClick={() => {
								try {
									localStorage.setItem(DISCLOSURE_KEY, '1');
								} catch {
									// Storage blocked: the notice shows again next time, which is fine.
								}
								setStep(step.then);
							}}
						>
							Continue
						</button>
						<button type="button" onClick={close}>
							Not now
						</button>
					</div>
				</>
			);
			break;
		case 'menu':
			body = (
				<>
					<h2 id={titleId} className="visually-hidden">
						AI actions
					</h2>
					<div role="menu" aria-labelledby={titleId} aria-busy={busy || undefined}>
						{ACTIONS.map((a) => (
							<button
								key={a}
								type="button"
								role="menuitem"
								onClick={() => (a === 'custom' ? setStep({ kind: 'custom' }) : void choose(a))}
							>
								{ACTION_LABELS[a]}
							</button>
						))}
					</div>
					<button
						type="button"
						className="ai-link"
						onClick={() => setStep({ kind: 'disclosure', then: { kind: 'menu' } })}
					>
						How AI uses your text
					</button>
				</>
			);
			break;
		case 'custom':
			body = (
				<form onSubmit={submitCustom}>
					<label id={titleId} htmlFor={`${titleId}-input`}>
						What should Claude do with this text?
					</label>
					<input
						id={`${titleId}-input`}
						type="text"
						maxLength={500}
						autoFocus
						value={instruction}
						onChange={(e) => (setInstruction(e.target.value), setError(''))}
						placeholder="e.g. make it friendlier"
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? errorId : undefined}
					/>
					<div className="ai-actions">
						<button type="submit" aria-disabled={busy || undefined}>
							Send
						</button>
						<button type="button" onClick={() => setStep({ kind: 'menu' })}>
							Back
						</button>
					</div>
				</form>
			);
			break;
		case 'signin':
			body = (
				<form onSubmit={(e) => void sendLink(e)}>
					<h2 id={titleId}>Sign in to use AI</h2>
					<p>Writedown AI is in private beta. We’ll email you a sign-in link.</p>
					<label htmlFor={`${titleId}-email`}>Email</label>
					<input
						id={`${titleId}-email`}
						type="email"
						autoComplete="email"
						required
						autoFocus
						value={email}
						onChange={(e) => (setEmail(e.target.value), setError(''))}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? errorId : undefined}
					/>
					<div className="ai-actions">
						<button type="submit" aria-disabled={busy || undefined}>
							Send link
						</button>
						<button type="button" onClick={close}>
							Cancel
						</button>
					</div>
				</form>
			);
			break;
		case 'sent':
			body = (
				<>
					<h2 id={titleId}>Check your email</h2>
					<p>
						If {email.trim()} is on the beta list, a sign-in link is on its way. Open it, then come
						back and press {MOD}J.
					</p>
					<button type="button" autoFocus onClick={close}>
						Done
					</button>
				</>
			);
			break;
		case 'message':
			body = (
				<>
					<p id={titleId} role="alert">
						{step.text}
					</p>
					<button type="button" autoFocus onClick={close}>
						OK
					</button>
				</>
			);
	}

	return (
		<div
			ref={box}
			className="ai-menu"
			role="dialog"
			aria-labelledby={titleId}
			style={position}
			onKeyDown={onKeyDown}
			onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && onClose()}
		>
			{body}
			{error && (
				<p id={errorId} role="alert" className="ai-error">
					{error}
				</p>
			)}
		</div>
	);
}
