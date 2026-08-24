import { expect, test, type Locator, type Page } from '@playwright/test';

async function lightFamily(page: Page, name: string): Promise<Locator> {
  const family = page.getByTestId('catalog-light').locator(`[data-family="${name}"]`);
  await family.scrollIntoViewIfNeeded();
  return family;
}

async function mouseSwipe(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + Math.sign(end.x - start.x) * 8, start.y);
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

async function waitForRestingTransform(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return Math.max(Math.abs(matrix.m41), Math.abs(matrix.m42));
      }),
    )
    .toBeLessThan(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/catalog.html');
  await expect(page.getByTestId('component-catalog')).toBeVisible();
});

test('renders all 38 families with default Mira identities in light and dark themes', async ({ page }) => {
  const light = page.getByTestId('catalog-light');
  const dark = page.getByTestId('catalog-dark');
  const custom = page.getByTestId('catalog-custom');

  await expect(light.locator('[data-family]')).toHaveCount(37);
  await expect(light.locator('[data-includes="RadioGroup"]')).toHaveCount(1);
  await expect(dark.locator('[data-family]')).toHaveCount(37);

  const button = light.getByTestId('focus-button');
  await expect(button).toHaveClass(/wheel-Button/);
  await expect(button).toHaveAttribute('data-slot', 'button');
  await expect(button).toHaveCSS('font-family', /Inter Variable/);
  await expect(button).toHaveCSS('height', '28px');

  await expect(custom.locator('[data-family]')).toHaveCount(3);
  const customButton = custom.getByTestId('focus-button');
  await expect(customButton).toHaveCSS('border-radius', '9999px');
  await expect(customButton).toHaveCSS('background-color', 'oklch(0.55 0.22 264)');
});

test('keeps keyboard focus visible', async ({ page }) => {
  const button = (await lightFamily(page, 'Button')).getByTestId('focus-button');
  await button.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  const shadow = await button.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).not.toBe('none');
});

test('anchors NavigationMenu to the active trigger', async ({ page }) => {
  const family = await lightFamily(page, 'NavigationMenu');
  const overview = family.getByTestId('nav-overview');
  await overview.click();

  const positioner = page.getByTestId('nav-positioner').filter({ visible: true });
  await expect(positioner).toBeVisible();
  const [triggerBox, positionerBox, anchorWidth] = await Promise.all([
    overview.boundingBox(),
    positioner.boundingBox(),
    positioner.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).getPropertyValue('--anchor-width')),
    ),
  ]);
  expect(triggerBox).not.toBeNull();
  expect(positionerBox).not.toBeNull();
  expect(
    Math.abs(positionerBox!.y - (triggerBox!.y + triggerBox!.height + 10)),
  ).toBeLessThan(2);
  expect(Math.abs(anchorWidth - triggerBox!.width)).toBeLessThan(2);
});

test('keeps a parent open after a drag starts in a nested portal', async ({ page }) => {
  const childTrigger = page.getByTestId('child-trigger');
  await childTrigger.click();
  const childPopup = page.getByTestId('child-popup');
  await expect(childPopup).toBeVisible();

  const start = await childPopup.boundingBox();
  const outside = await page.getByTestId('outside-target').boundingBox();
  expect(start).not.toBeNull();
  expect(outside).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside!.x + outside!.width / 2, outside!.y + outside!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await expect(page.getByTestId('parent-popup')).toBeVisible();
});

test('positions Select and commits a keyboard choice', async ({ page }) => {
  const family = await lightFamily(page, 'Select');
  const trigger = family.getByTestId('select-trigger');
  await trigger.click();
  const popup = page.getByTestId('select-popup').filter({ visible: true });
  await expect(popup).toBeVisible();

  const [triggerBox, popupBox] = await Promise.all([trigger.boundingBox(), popup.boundingBox()]);
  expect(triggerBox).not.toBeNull();
  expect(popupBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(popupBox!.x).toBeGreaterThanOrEqual(0);
  expect(popupBox!.y).toBeGreaterThanOrEqual(0);
  expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(viewport!.height);
  expect(popupBox!.x).toBeLessThan(triggerBox!.x + triggerBox!.width);
  expect(popupBox!.x + popupBox!.width).toBeGreaterThan(triggerBox!.x);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Gala');
});

test('uses real ScrollArea geometry', async ({ page }) => {
  const family = await lightFamily(page, 'ScrollArea');
  const viewport = family.getByTestId('scroll-viewport');
  const geometry = await viewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  await expect(family.getByTestId('scrollbar')).toBeVisible();
  await expect(family.getByTestId('scroll-thumb')).toBeVisible();
});

test('dismisses Drawer and Toast with pointer swipes', async ({ page }) => {
  const drawer = await lightFamily(page, 'Drawer');
  await drawer.getByTestId('drawer-trigger').click();
  const drawerPopup = page.getByTestId('drawer-popup').filter({ visible: true });
  await expect(drawerPopup).toBeVisible();
  await expect(drawerPopup).not.toHaveAttribute('data-starting-style');
  await waitForRestingTransform(drawerPopup);
  const drawerBox = await drawerPopup.boundingBox();
  expect(drawerBox).not.toBeNull();
  await mouseSwipe(
    page,
    { x: drawerBox!.x + 24, y: drawerBox!.y + drawerBox!.height - 24 },
    { x: drawerBox!.x + drawerBox!.width - 4, y: drawerBox!.y + drawerBox!.height - 24 },
  );
  await expect(drawerPopup).toBeHidden();

  const toast = await lightFamily(page, 'Toast');
  await toast.getByTestId('toast-create').click();
  const toastRoot = page.getByTestId('toast-root');
  await expect(toastRoot).toBeVisible();
  await expect(toastRoot).not.toHaveAttribute('data-starting-style');
  await waitForRestingTransform(toastRoot);
  const toastBox = await toastRoot.boundingBox();
  expect(toastBox).not.toBeNull();
  const toastStart = {
    x: toastBox!.x + toastBox!.width / 2,
    y: toastBox!.y + toastBox!.height / 2,
  };
  const toastEnd = { x: toastStart.x + 100, y: toastStart.y };
  await page.mouse.move(toastStart.x, toastStart.y);
  await page.mouse.down();
  await expect(toastRoot).toHaveAttribute('data-swiping', '');
  await page.mouse.move(toastStart.x + 1, toastStart.y);
  await page.mouse.move(toastEnd.x, toastEnd.y);
  await expect(toastRoot).toHaveAttribute('data-swipe-direction', 'right');
  await page.mouse.up();
  await expect(toastRoot).toBeHidden();
});
