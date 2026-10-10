import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' });
const switcher = (page: Page) => page.getByRole('button', { name: /^Documents:/ });
const mdFile = (name: string, text: string) => ({
	name,
	mimeType: 'text/markdown',
	buffer: Buffer.from(text),
});

async function chooseFile(page: Page, file: ReturnType<typeof mdFile>, from: 'empty' | 'switcher') {
	const chooser = page.waitForEvent('filechooser');
	if (from === 'empty') await page.getByRole('button', { name: 'Import .md…' }).click();
	else {
		await switcher(page).click();
		await page.getByRole('button', { name: 'Import .md…' }).click();
	}
	await (await chooser).setFiles(file);
}

test('import a clean file creates a new document without touching existing ones', async ({
	page,
}) => {
	await page.goto('/');
	await chooseFile(page, mdFile('first.md', '# First\n\nOriginal text.'), 'empty');
	await expect(doc(page)).toContainText('Original text.');
	await expect(page.getByRole('status')).toHaveText('Saved');

	await chooseFile(
		page,
		mdFile('trip.md', '# Trip\n\n- [map](https://e.com/a_(b))\n\n```js\nconst x = 1 < 2;\n```'),
		'switcher',
	);
	await expect(switcher(page)).toContainText('Trip');
	await expect(doc(page).locator('a')).toHaveAttribute('href', 'https://e.com/a_(b)');
	await expect(doc(page).locator('pre')).toHaveText('const x = 1 < 2;');

	await page.reload();
	await switcher(page).click();
	await page.getByRole('button', { name: 'First', exact: true }).click();
	await expect(doc(page)).toContainText('Original text.');
});

test('unsupported syntax warns before import; Cancel creates nothing', async ({ page }) => {
	await page.goto('/');
	const file = mdFile(
		'table.md',
		'# Data\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>window.pwned = 1</script>\n\n[bad](javascript:alert(1))',
	);
	await chooseFile(page, file, 'empty');
	const dialog = page.getByRole('dialog', { name: 'Import “table.md”?' });
	await expect(dialog).toContainText('Tables will be removed.');
	await expect(dialog).toContainText('HTML will be converted');
	await expect(dialog).toContainText('Unsafe links');
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('No documents yet.')).toBeVisible();

	await chooseFile(page, file, 'empty');
	await page.getByRole('button', { name: 'Import anyway' }).click();
	await expect(switcher(page)).toContainText('Data');
	await expect(doc(page).locator('table, script, a')).toHaveCount(0);
	await expect(doc(page)).toContainText('bad');
	expect(
		await page.evaluate(() => (window as unknown as { pwned?: number }).pwned),
	).toBeUndefined();
});

test('invalid file shows an error and imports nothing', async ({ page }) => {
	await page.goto('/');
	await chooseFile(
		page,
		{ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50]) },
		'empty',
	);
	const dialog = page.getByRole('dialog', { name: 'Couldn’t import' });
	await expect(dialog).toContainText('isn’t a Markdown file');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('No documents yet.')).toBeVisible();
});

test('drop a file onto the page imports it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('No documents yet.')).toBeVisible();
	const data = await page.evaluateHandle(() => {
		const dt = new DataTransfer();
		dt.items.add(new File(['# Dropped\n\nHello'], 'dropped.md', { type: 'text/markdown' }));
		return dt;
	});
	await page.dispatchEvent('main', 'dragover', { dataTransfer: data });
	await page.dispatchEvent('main', 'drop', { dataTransfer: data });
	await expect(switcher(page)).toContainText('Dropped');
	await expect(doc(page)).toContainText('Hello');
});

test('export downloads sanitized .md from the switcher and the shortcut, including unsaved edits', async ({
	page,
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'New document', exact: true }).click();
	await doc(page).click();
	await page.keyboard.type('Plans: 2026/27?\nBody with ');
	await page.keyboard.press('ControlOrMeta+b');
	await page.keyboard.type('bold');

	let download = page.waitForEvent('download');
	await switcher(page).click();
	await page.getByRole('button', { name: /Export \.md/ }).click();
	let file = await download;
	expect(file.suggestedFilename()).toBe('Plans 202627.md');
	expect(await readFile(await file.path(), 'utf8')).toBe('Plans: 2026/27?\n\nBody with **bold**\n');

	await expect(doc(page)).toBeFocused(); // export returned focus with the caret where it was
	await page.keyboard.type(' more');
	download = page.waitForEvent('download'); // immediately, before autosave
	await page.keyboard.press('ControlOrMeta+Shift+E');
	file = await download;
	// Bold is still on at the caret, so the new words join the bold run.
	expect(await readFile(await file.path(), 'utf8')).toBe(
		'Plans: 2026/27?\n\nBody with **bold more**\n',
	);
});

test('save error offers export as a rescue', async ({ page }) => {
	await page.addInitScript(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
			if ((window as unknown as { failWrites?: boolean }).failWrites)
				throw new DOMException('Quota', 'QuotaExceededError');
			return put.apply(this, args);
		};
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'New document', exact: true }).click();
	await page.evaluate(() => ((window as unknown as { failWrites: boolean }).failWrites = true));
	await doc(page).click();
	await page.keyboard.type('Precious words');
	const alert = page.getByRole('alert');
	await expect(alert).toContainText('Couldn’t save');
	const download = page.waitForEvent('download');
	await alert.getByRole('button', { name: 'Export .md' }).click();
	expect(await readFile(await (await download).path(), 'utf8')).toBe('Precious words\n');
});
