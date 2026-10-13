import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Body = { requestId: string; action: string; targetText: string };

/** Signed-in user who has seen the data notice; `reply` maps a request to its replacement or an error. */
async function setup(
	page: Page,
	reply: (b: Body) => string | { error: string; status: number } = (b) => b.targetText,
) {
	const calls: Body[] = [];
	await page.addInitScript(() => localStorage.setItem('writedown.aiDisclosureAccepted', '1'));
	await page.route('/api/auth/me', (r) => r.fulfill({ json: { email: 'alice@example.com' } }));
	await page.route('/api/ai/suggest', (r) => {
		const body = r.request().postDataJSON() as Body;
		calls.push(body);
		const out = reply(body);
		if (typeof out !== 'string')
			return r.fulfill({
				status: out.status,
				json: { error: out.error, requestId: body.requestId },
			});
		return r.fulfill({
			json: {
				requestId: body.requestId,
				status: out === body.targetText ? 'no_change' : 'suggestion',
				replacementText: out,
			},
		});
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'New document' }).click();
	return calls;
}

async function toggle(page: Page) {
	await page.getByRole('button', { name: /^Documents:/ }).click();
	await page.getByRole('switch', { name: 'Check as I write' }).click();
	await page.keyboard.press('Escape');
}

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' });

test('off by default: finishing a sentence sends nothing', async ({ page }) => {
	const calls = await setup(page);
	await page.getByRole('button', { name: /^Documents:/ }).click();
	await expect(page.getByRole('switch', { name: 'Check as I write' })).toHaveAttribute(
		'aria-checked',
		'false',
	);
	await page.keyboard.press('Escape');
	await doc(page).click();
	await page.keyboard.type('Teh plan is good. ');
	await page.waitForTimeout(3500);
	expect(calls).toHaveLength(0);
});

test('on: checks the finished sentence after 3 s, quietly; click opens the review', async ({
	page,
}) => {
	const calls = await setup(page, (b) => b.targetText.replace('Teh', 'The'));
	await toggle(page);
	await doc(page).click();
	await page.keyboard.type('Teh plan is good.');

	await page.waitForTimeout(2500);
	expect(calls).toHaveLength(0); // not before 3 s of inactivity
	await expect.poll(() => calls.length, { timeout: 3000 }).toBe(1);
	expect(calls[0]).toMatchObject({ action: 'proofread', targetText: 'Teh plan is good.' });

	const issue = doc(page).locator('.wd-auto-issue');
	await expect(issue).toHaveText('Teh plan is good.');
	await expect(doc(page)).toBeFocused();
	await expect(page.getByRole('group', { name: 'AI suggestion' })).toHaveCount(0);
	await expect(page.getByRole('status', { name: 'AI status' })).toHaveText('');

	// The caret didn't move: typing continues at the end, and the annotation stays.
	await page.keyboard.type(' Next');
	await expect(doc(page)).toHaveText('Teh plan is good. Next');
	await expect(issue).toHaveCount(1);

	await issue.click();
	await expect(doc(page).locator('del')).toHaveText('Teh');
	await expect(doc(page).locator('ins')).toHaveText('The');
	await page.keyboard.press('ControlOrMeta+Enter');
	await expect(doc(page)).toHaveText('The plan is good. Next');

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
});

test('unfinished sentences, resumed typing and repeats are not checked', async ({ page }) => {
	const calls = await setup(page);
	await toggle(page);
	await doc(page).click();
	await page.keyboard.type('No period here');
	await page.waitForTimeout(3500);
	expect(calls).toHaveLength(0);

	await page.keyboard.type('.');
	await page.waitForTimeout(2000);
	await page.keyboard.type(' And'); // activity restarts the wait
	await page.waitForTimeout(2000);
	expect(calls).toHaveLength(0);
	await expect.poll(() => calls.length, { timeout: 3000 }).toBe(1);
	expect(calls[0].targetText).toBe('No period here.');

	// Same unchanged sentence is not checked again; a new finished one is.
	await page.keyboard.type(' more');
	await page.waitForTimeout(3500);
	expect(calls).toHaveLength(1);
	await page.keyboard.type('.');
	await expect.poll(() => calls.length, { timeout: 4000 }).toBe(2);
	expect(calls[1].targetText).toBe('And more.');
});

test('turning it off clears annotations; quota errors pause checks', async ({ page }) => {
	let limit = false;
	const calls = await setup(page, (b) =>
		limit ? { error: 'daily_limit', status: 429 } : b.targetText.replace('Teh', 'The'),
	);
	await toggle(page);
	await doc(page).click();
	await page.keyboard.type('Teh one.');
	await expect(doc(page).locator('.wd-auto-issue')).toHaveCount(1, { timeout: 5000 });
	await toggle(page);
	await expect(doc(page).locator('.wd-auto-issue')).toHaveCount(0);
	await expect(doc(page)).toHaveText('Teh one.');

	limit = true;
	await toggle(page);
	await doc(page).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' Two.');
	await expect(page.getByRole('status', { name: 'AI status' })).toContainText(
		'Automatic checks paused',
		{ timeout: 5000 },
	);
	const sent = calls.length;
	await page.keyboard.type(' Three.');
	await page.waitForTimeout(3500);
	expect(calls).toHaveLength(sent);
});
