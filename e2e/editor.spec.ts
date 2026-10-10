import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('keyboard-only writing journey', async ({ page }) => {
	await page.goto('/');
	const doc = page.getByRole('textbox', { name: 'Document' });
	await doc.click();

	await page.keyboard.press('ControlOrMeta+Alt+1');
	await page.keyboard.type('My title');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Some ');
	await page.keyboard.press('ControlOrMeta+b');
	await page.keyboard.type('bold');
	await page.keyboard.press('ControlOrMeta+b');
	await page.keyboard.type(' text and a ');

	await page.keyboard.press('ControlOrMeta+k');
	const url = page.getByLabel('Link URL');
	await expect(url).toBeFocused();
	await url.fill('example.com');
	await page.keyboard.press('Enter');
	await expect(doc).toBeFocused();

	await expect(doc.locator('h1')).toHaveText('My title');
	await expect(doc.locator('strong')).toHaveText('bold');
	await expect(doc.locator('a')).toHaveAttribute('href', 'https://example.com');

	// Reach the toolbar from the text, move by arrow key, and come back.
	await page.keyboard.press('Alt+F10');
	await expect(page.getByRole('button', { name: 'Bold' })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('button', { name: 'Italic' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(doc).toBeFocused();

	await page.keyboard.press('ControlOrMeta+z');
	await expect(doc.locator('a')).toHaveCount(0);
});

test('selection shows the bubble menu', async ({ page }) => {
	await page.goto('/');
	const doc = page.getByRole('textbox', { name: 'Document' });
	await doc.click();
	await page.keyboard.type('Select these words');
	await page.keyboard.press('ControlOrMeta+a');
	const bubble = page.getByRole('toolbar', { name: 'Selection formatting' });
	await expect(bubble).toBeVisible();
	await bubble.getByRole('button', { name: 'Italic' }).click();
	await expect(doc.locator('em')).toHaveText('Select these words');
	await expect(doc).toBeFocused();
});

test('no serious or critical accessibility violations', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('textbox', { name: 'Document' }).click();
	await page.keyboard.type('Accessible text');
	await page.keyboard.press('ControlOrMeta+k');
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		expect(
			blocking.map((v) => `${scheme}: ${v.id} ${v.nodes.map((n) => n.target).join(', ')}`),
		).toEqual([]);
	}
});
