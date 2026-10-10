import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type SuggestBody = {
	requestId: string;
	action: string;
	targetText: string;
	instruction: string | null;
};

/** Fakes the WD-007 API. `reply` maps a request to the replacement text (or an error code). */
async function mockApi(
	page: Page,
	opts: {
		signedIn?: boolean;
		reply?: (b: SuggestBody) => string | { error: string; status: number };
		delayMs?: number;
	} = {},
) {
	const calls: SuggestBody[] = [];
	await page.route('/api/auth/me', (r) =>
		opts.signedIn === false
			? r.fulfill({ status: 401, json: { error: 'unauthenticated' } })
			: r.fulfill({ json: { email: 'alice@example.com' } }),
	);
	await page.route('/api/auth/request', (r) => r.fulfill({ status: 202, json: { ok: true } }));
	await page.route('/api/ai/suggest', async (r) => {
		const body = r.request().postDataJSON() as SuggestBody;
		calls.push(body);
		if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
		const out = opts.reply?.(body) ?? body.targetText;
		if (typeof out !== 'string')
			return r.fulfill({
				status: out.status,
				json: { error: out.error, requestId: body.requestId },
			});
		await r
			.fulfill({
				json: {
					requestId: body.requestId,
					status: out === body.targetText ? 'no_change' : 'suggestion',
					replacementText: out,
				},
			})
			.catch(() => undefined); // aborted by the page
	});
	return calls;
}

async function start(page: Page, text: string, { disclosureSeen = true } = {}) {
	if (disclosureSeen)
		await page.addInitScript(() => localStorage.setItem('writedown.aiDisclosureAccepted', '1'));
	await page.goto('/');
	await page.getByRole('button', { name: 'New document' }).click();
	const doc = page.getByRole('textbox', { name: 'Document' });
	await doc.click();
	await page.keyboard.type(text);
	return doc;
}

test('proofread: caret sentence, inline review, accept with ⌘Enter, one undo', async ({ page }) => {
	const calls = await mockApi(page, { reply: (b) => b.targetText.replace('ideas is', 'idea is') });
	const doc = await start(page, 'First one. The ideas is good. Last one.');
	await page.keyboard.press('ArrowLeft'); // caret inside "Last one."
	for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft'); // into the middle sentence
	// Let the browser deliver selectionchange; Playwright presses keys faster than any person.
	await page.evaluate(() => new Promise(requestAnimationFrame));

	await page.keyboard.press('ControlOrMeta+j');
	const menu = page.getByRole('menu', { name: 'AI actions' });
	await expect(menu.getByRole('menuitem', { name: 'Proofread' })).toBeFocused();
	expect(calls).toHaveLength(0); // opening sends nothing
	await page.keyboard.press('Enter');

	await expect(doc).toBeFocused();
	await expect.poll(() => calls.length).toBe(1);
	await expect(doc.locator('del')).toHaveText('ideas');
	await expect(doc.locator('ins')).toHaveText('idea');
	expect(calls).toHaveLength(1);
	expect(calls[0]).toMatchObject({
		action: 'proofread',
		targetText: 'The ideas is good.',
		instruction: null,
	});
	await expect(page.getByRole('group', { name: 'AI suggestion' })).toBeVisible();

	await page.keyboard.press('ControlOrMeta+Enter');
	await expect(doc).toHaveText('First one. The idea is good. Last one.');
	await expect(doc.locator('del, ins')).toHaveCount(0);
	await expect(
		page.getByRole('status', { name: 'AI status' }).filter({ hasText: 'Change applied.' }),
	).toBeVisible();

	await page.keyboard.press('ControlOrMeta+z');
	await expect(doc).toHaveText('First one. The ideas is good. Last one.');
});

test('selection wins; Escape rejects; Mod+/ fallback; Escape in menu returns focus', async ({
	page,
}) => {
	const calls = await mockApi(page, { reply: () => 'Better words' });
	const doc = await start(page, 'Keep this. Change these words please.');
	await page.keyboard.press('ControlOrMeta+a');

	await page.keyboard.press('ControlOrMeta+/');
	await expect(page.getByRole('menuitem', { name: 'Proofread' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(doc).toBeFocused();
	expect(calls).toHaveLength(0);

	await page.keyboard.press('ControlOrMeta+j');
	await page.keyboard.press('ArrowDown'); // Rewrite
	await page.keyboard.press('Enter');
	await expect(page.getByRole('group', { name: 'AI suggestion' })).toContainText(
		'Suggested: Better words.',
	);
	expect(calls[0]).toMatchObject({
		action: 'rewrite',
		targetText: 'Keep this. Change these words please.',
	});

	await page.keyboard.press('Escape');
	await expect(doc.locator('del, ins')).toHaveCount(0);
	await expect(doc).toHaveText('Keep this. Change these words please.');
});

test('custom instruction is required', async ({ page }) => {
	const calls = await mockApi(page, { reply: (b) => `${b.targetText} (${b.instruction})` });
	await start(page, 'Make me shout.');
	await page.getByRole('button', { name: '✦ AI' }).click();
	await page.getByRole('menuitem', { name: 'Custom instruction…' }).click();
	const input = page.getByRole('textbox', { name: 'What should Claude do with this text?' });
	await expect(input).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('alert')).toHaveText('Type an instruction first.');
	expect(calls).toHaveLength(0);
	await input.fill('uppercase');
	await page.keyboard.press('Enter');
	await expect.poll(() => calls.length).toBe(1);
	expect(calls[0]).toMatchObject({ action: 'custom', instruction: 'uppercase' });
});

test('first use shows the data notice, then sign-in when signed out', async ({ page }) => {
	const calls = await mockApi(page, { signedIn: false });
	await start(page, 'Hello there.', { disclosureSeen: false });
	await page.keyboard.press('ControlOrMeta+j');
	const notice = page.getByRole('dialog', { name: 'Before you use AI' });
	await expect(notice).toContainText('up to 30 days');
	await expect(notice).toContainText('up to 2 years');

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(
			violations
				.filter((v) => v.impact === 'serious' || v.impact === 'critical')
				.map((v) => `${scheme}: ${v.id}`),
		).toEqual([]);
	}

	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('menuitem', { name: 'Proofread' }).click();
	await expect(page.getByRole('dialog', { name: 'Sign in to use AI' })).toBeVisible();
	await page.getByLabel('Email').fill('alice@example.com');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Check your email' })).toBeVisible();
	expect(calls).toHaveLength(0);

	// The notice is not shown twice.
	await page.getByRole('button', { name: 'Done' }).click();
	await page.keyboard.press('ControlOrMeta+j');
	await expect(page.getByRole('menuitem', { name: 'Proofread' })).toBeFocused();
});

test('errors leave the text alone; editing the target discards the late reply', async ({
	page,
}) => {
	let mode: 'limit' | 'slow' = 'limit';
	await mockApi(page, {
		reply: (b) =>
			mode === 'limit' ? { error: 'daily_limit', status: 429 } : b.targetText.toUpperCase(),
		delayMs: 400,
	});
	const doc = await start(page, 'Some text here.');
	await page.keyboard.press('ControlOrMeta+j');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('status', { name: 'AI status' })).toContainText(
		'today’s 100 AI requests',
	);
	await expect(doc).toHaveText('Some text here.');

	mode = 'slow';
	await page.keyboard.press('ControlOrMeta+j');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('status', { name: 'AI status' })).toHaveText('Proofreading…');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.type('X'); // edit inside the pending target
	await expect(page.getByRole('status', { name: 'AI status' })).toContainText(
		'discarded because the text changed',
	);
	await expect(doc).toHaveText('Some text hereX.');
	await expect(doc.locator('ins')).toHaveCount(0);
});
