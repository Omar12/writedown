import { expect, test, type Page } from '@playwright/test';

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' });
const switcher = (page: Page) => page.getByRole('button', { name: /^Documents:/ });

async function newDocument(page: Page, text: string) {
	const empty = page.getByRole('button', { name: 'New document', exact: true });
	await expect(empty.or(switcher(page))).toBeVisible(); // wait for the initial load
	if (await empty.isVisible()) await empty.click();
	else {
		await switcher(page).click();
		await page.getByRole('button', { name: '+ New document' }).click();
	}
	await doc(page).click();
	await page.keyboard.type(text);
	await expect(page.getByRole('status')).toHaveText('Saved');
}

test('documents persist independently across reload and switch correctly', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('No documents yet.')).toBeVisible();
	await newDocument(page, 'First doc\nAlpha body');
	await newDocument(page, 'Second doc\nBeta body');

	await page.reload();
	await expect(switcher(page)).toContainText('Second doc'); // most recent opens
	await expect(doc(page)).toContainText('Beta body');

	await switcher(page).click();
	await page.getByRole('button', { name: 'First doc', exact: true }).click();
	await expect(doc(page)).toContainText('Alpha body');
	await expect(doc(page)).not.toContainText('Beta');

	// Edit then switch immediately: the edit is flushed, not lost or written to the other doc.
	await doc(page).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' edited');
	await switcher(page).click();
	await page.getByRole('button', { name: 'Second doc', exact: true }).click();
	await expect(doc(page)).not.toContainText('edited');
	await page.reload();
	await switcher(page).click();
	await page.getByRole('button', { name: 'First doc', exact: true }).click();
	await expect(doc(page)).toContainText('Alpha body edited');
});

test('delete requires confirmation', async ({ page }) => {
	await page.goto('/');
	await newDocument(page, 'Keep me');
	await newDocument(page, 'Delete me');

	await switcher(page).click();
	await page.getByRole('button', { name: 'Delete Delete me' }).click();
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('button', { name: 'Delete me', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Delete Delete me' }).click();
	await expect(page.getByRole('alert')).toContainText('can’t be undone');
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(switcher(page)).toContainText('Keep me');
	await page.reload();
	await switcher(page).click();
	await expect(page.getByRole('button', { name: 'Delete me', exact: true })).toHaveCount(0);
});

test('second tab takes the document; first tab shows a scrim and can take it back', async ({
	page,
	context,
}) => {
	await page.goto('/');
	await newDocument(page, 'Shared doc');

	const other = await context.newPage();
	await other.goto('/');
	await expect(doc(other)).toContainText('Shared doc');
	const scrim = page.getByRole('alertdialog');
	await expect(scrim).toContainText('“Shared doc” is open in another tab.');
	await expect(page.locator('main')).toHaveAttribute('inert', '');

	await doc(other).click();
	await other.keyboard.press('End');
	await other.keyboard.type(' from tab two');
	await expect(other.getByRole('status')).toHaveText('Saved');

	await page.getByRole('button', { name: 'Edit here instead' }).click();
	await expect(scrim).toHaveCount(0);
	await expect(doc(page)).toContainText('Shared doc from tab two');
	await expect(other.getByRole('alertdialog')).toBeVisible();
});

test('failed writes never show Saved and can be retried', async ({ page }) => {
	await page.addInitScript(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
			if ((window as unknown as { failWrites?: boolean }).failWrites)
				throw new DOMException('Quota exceeded', 'QuotaExceededError');
			return put.apply(this, args);
		};
	});
	await page.goto('/');
	await newDocument(page, 'Draft');

	await page.evaluate(() => ((window as unknown as { failWrites: boolean }).failWrites = true));
	await page.keyboard.type(' more');
	const problem = page.getByRole('alert');
	await expect(problem).toContainText('Couldn’t save');
	await expect(page.getByRole('status')).toHaveCount(0);

	await page.evaluate(() => ((window as unknown as { failWrites: boolean }).failWrites = false));
	await problem.getByRole('button', { name: 'Retry' }).click();
	await expect(page.getByRole('status')).toHaveText('Saved');
	await page.reload();
	await expect(doc(page)).toContainText('Draft more');
});

test('without tab coordination, a stale save warns instead of overwriting', async ({
	page,
	context,
}) => {
	await context.addInitScript(() => {
		// Simulate a browser without BroadcastChannel so both tabs edit at once.
		delete (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel;
	});
	await page.goto('/');
	await newDocument(page, 'Base');
	const other = await context.newPage();
	await other.goto('/');
	await doc(other).click();
	await other.keyboard.press('End');
	await other.keyboard.type(' theirs');
	await expect(other.getByRole('status')).toHaveText('Saved');

	await doc(page).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' mine');
	const warning = page.getByRole('alert');
	await expect(warning).toContainText('changed in another tab');

	await warning.getByRole('button', { name: 'Load latest' }).click();
	await expect(doc(page)).toHaveText('Base theirs');
	await expect(page.getByRole('status')).toHaveText('Saved');
});
