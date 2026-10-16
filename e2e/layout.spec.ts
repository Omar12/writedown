import { expect, test, type Locator, type Page } from '@playwright/test';

// NFR-001: 1024-1920 px wide, and 200% zoom. Zoom is emulated as half the CSS width at
// device scale 2, which is what the page sees when the browser zooms.
const sizes = [
	{ name: '1024 px', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 },
	{ name: '1920 px', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
	{ name: '1024 px at 200%', viewport: { width: 512, height: 384 }, deviceScaleFactor: 2 },
];

async function expectOnScreen(page: Page, target: Locator) {
	await expect(target).toBeVisible();
	const box = (await target.boundingBox())!;
	const width = page.viewportSize()!.width;
	expect(box.x, 'left edge').toBeGreaterThanOrEqual(0);
	expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(width);
}

async function expectNoSideScroll(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

for (const size of sizes) {
	test.describe(size.name, () => {
		test.use({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor });

		test('primary controls stay on screen with no sideways scroll', async ({ page }) => {
			await page.addInitScript(() => localStorage.setItem('writedown.aiDisclosureAccepted', '1'));
			await page.route('/api/auth/me', (r) =>
				r.fulfill({ status: 401, json: { error: 'unauthenticated' } }),
			);
			await page.goto('/');
			await page.getByRole('button', { name: 'New document' }).click();
			const doc = page.getByRole('textbox', { name: 'Document' });
			await doc.click();
			await page.keyboard.type('A title\n' + 'A long line of words that should wrap. '.repeat(20));
			await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');

			await expectNoSideScroll(page);
			await expectOnScreen(page, doc);
			const switcher = page.getByRole('button', { name: /^Documents:/ });
			await expectOnScreen(page, switcher);
			for (const button of await page
				.getByRole('toolbar', { name: 'Formatting' })
				.getByRole('button')
				.all())
				await expectOnScreen(page, button);
			await expectOnScreen(page, page.getByRole('button', { name: '✦ AI' }));
			await expectOnScreen(page, page.getByRole('status', { name: 'Save status' }));

			await switcher.click();
			await expectOnScreen(page, page.getByRole('button', { name: '+ New document' }));
			await expectOnScreen(page, page.getByRole('button', { name: 'Delete A title' }));
			await page.keyboard.press('Escape');

			await doc.click();
			await page.keyboard.press('ControlOrMeta+j');
			await expectOnScreen(page, page.getByRole('dialog'));
			await expectNoSideScroll(page);
		});
	});
}
