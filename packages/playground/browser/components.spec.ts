import { expect, test, type Locator, type Page } from '@playwright/test';

async function lightFamily(page: Page, name: string): Promise<Locator> {
  const family = page.getByTestId('catalog-light').locator(`[data-family="${name}"]`);
  await family.scrollIntoViewIfNeeded();
  return family;
}

async function themedFamily(page: Page, theme: 'light' | 'dark' | 'custom', name: string) {
  const family = page.getByTestId(`catalog-${theme}`).locator(`[data-family="${name}"]`);
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

test('renders all 156 component pages with default Mira identities in light and dark themes', async ({ page }) => {
  const light = page.getByTestId('catalog-light');
  const dark = page.getByTestId('catalog-dark');
  const custom = page.getByTestId('catalog-custom');

  await expect(light.locator('[data-family]')).toHaveCount(156);
  await expect(dark.locator('[data-family]')).toHaveCount(156);

  const button = light.getByTestId('focus-button');
  await expect(button).toHaveClass(/wheel-Button/);
  await expect(button).toHaveAttribute('data-slot', 'button');
  await expect(button).toHaveCSS('font-family', /Inter Variable/);
  await expect(button).toHaveCSS('height', '28px');

  await expect(custom.locator('[data-family]')).toHaveCount(12);
  const customButton = custom.getByTestId('focus-button');
  await expect(customButton).toHaveCSS('border-radius', '9999px');
  await expect(customButton).toHaveCSS('background-color', 'oklch(0.55 0.22 264)');
});

test('runs Button actions, preserves link semantics, and accepts interrupting actions', async ({ page }) => {
  const family = await lightFamily(page, 'Button');
  const link = family.getByTestId('button-link');
  const asyncButton = family.getByTestId('button-async');
  const interruptible = family.getByTestId('button-interruptible');
  // The fixture's actions stay pending until this is pressed, so the busy
  // state can be asserted in full instead of raced against a timer.
  const release = family.getByTestId('button-release');

  await expect(link).toHaveRole('link');
  await expect(link).toHaveAttribute('href', '#button-link-target');

  await asyncButton.focus();
  await page.keyboard.press('Enter');
  await expect(asyncButton).toHaveAttribute('aria-busy', 'true');
  await expect(asyncButton).toBeDisabled();
  await release.click();
  await expect(asyncButton).toHaveAttribute('data-runs', '1');
  await expect(asyncButton).not.toHaveAttribute('aria-busy', 'true');
  await expect(asyncButton).toBeEnabled();

  // Interruptible: a pending action accepts another activation, so two clicks
  // land while the first is still in flight and the button never disables.
  await interruptible.click();
  await interruptible.click();
  await expect(interruptible).toHaveAttribute('aria-busy', 'true');
  await expect(interruptible).toBeEnabled();
  await expect(interruptible).toHaveAttribute('data-interrupts', '2');
  await release.click();
  await expect(interruptible).not.toHaveAttribute('aria-busy', 'true');
});

test('keeps ButtonGroup to one roving focus stop and uses orientation keys', async ({ page }) => {
  const family = await lightFamily(page, 'ButtonGroup');
  const horizontal = family.getByTestId('button-group-horizontal');
  const buttons = horizontal.getByRole('button');

  await expect(buttons.nth(0)).toHaveAttribute('tabindex', '0');
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '-1');
  await buttons.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(buttons.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(buttons.nth(0)).toBeFocused();

  const links = family.getByRole('group', { name: 'Navigation actions' }).getByRole('link');
  await links.first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#previous$/);

  const vertical = family.getByTestId('button-group-vertical');
  await expect(vertical).toHaveAttribute('data-orientation', 'vertical');
  const verticalButtons = vertical.getByRole('button');
  await verticalButtons.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(verticalButtons.nth(1)).toBeFocused();

  const unavailable = family.getByRole('group', { name: 'Unavailable actions' });
  await expect(unavailable.getByRole('button', { includeHidden: true }).first()).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  const rtlButtons = family.getByTestId('button-group-rtl').getByRole('button');
  await rtlButtons.first().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(rtlButtons.nth(1)).toBeFocused();
});

test('keeps IconButton square and named at every size', async ({ page }) => {
  const family = await lightFamily(page, 'IconButton');
  for (const size of ['sm', 'md', 'lg'] as const) {
    const button = family.getByRole('button', { name: `${size} create` });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);
    await expect(button).toHaveAttribute('data-size', size);
  }

  const link = family.getByRole('link', { name: 'Open details' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#details$/);
});

test('changes typed ToggleGroup selections and fills available width', async ({ page }) => {
  const family = await lightFamily(page, 'ToggleGroup');
  const single = family.getByTestId('toggle-group-single');
  const center = single.getByRole('button', { name: 'Align center' });

  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await expect(single.getByRole('button', { name: 'Align left' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'false');

  const multiple = family.getByTestId('toggle-group-multiple');
  const underline = multiple.getByRole('button', { name: 'Underline' });
  await underline.click();
  await expect(underline).toHaveAttribute('aria-pressed', 'true');
  await expect(multiple.getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const fill = family.getByTestId('toggle-group-fill');
  const fillBox = await fill.boundingBox();
  const fillButtons = fill.getByRole('button');
  const firstBox = await fillButtons.first().boundingBox();
  const lastBox = await fillButtons.last().boundingBox();
  expect(fillBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(fillBox!.width).toBeGreaterThan(250);
  expect(Math.abs(firstBox!.width - lastBox!.width)).toBeLessThan(1);

  const vertical = family.getByTestId('toggle-group-vertical');
  const verticalButtons = vertical.getByRole('button');
  await verticalButtons.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(verticalButtons.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(verticalButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');

  const rtlButtons = family.getByTestId('toggle-group-rtl').getByRole('button');
  await rtlButtons.first().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(rtlButtons.nth(1)).toBeFocused();
});

test('repeats Checkbox pointer and keyboard changes with immediate entry', async ({ page }) => {
  const family = await lightFamily(page, 'Checkbox');
  const checkbox = family.getByRole('checkbox', { name: 'Unchecked', exact: true });

  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await expect(checkbox).toHaveCSS('transition-duration', '0s');
  const indicator = checkbox.locator('.wheel-Checkbox-Indicator');
  await expect(indicator).not.toHaveAttribute('data-starting-style');

  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await expect(checkbox).toHaveCSS('transition-duration', '0.1s, 0.1s');
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
});

test('keeps every selected Checkbox mark white and readable in light and dark themes', async ({
  page,
}) => {
  for (const theme of ['light', 'dark'] as const) {
    const family = await themedFamily(page, theme, 'Checkbox');
    for (const name of ['Checked', 'Success', 'Warning', 'Error']) {
      const checkbox = family.getByRole('checkbox', { name, exact: true });
      await expect(checkbox.locator('.wheel-Checkbox-Indicator')).toHaveCSS(
        'color',
        'oklch(1 0 0)',
      );
      const background = await checkbox.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      const match = background.match(
        /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/,
      );
      expect(match, `Expected an OKLCH selected surface, received ${background}`).not.toBeNull();
      const [, lightness, chroma, hue] = match!;
      const hueRadians = (Number(hue) * Math.PI) / 180;
      const a = Number(chroma) * Math.cos(hueRadians);
      const b = Number(chroma) * Math.sin(hueRadians);
      const lRoot = Number(lightness) + 0.3963377774 * a + 0.2158037573 * b;
      const mRoot = Number(lightness) - 0.1055613458 * a - 0.0638541728 * b;
      const sRoot = Number(lightness) - 0.0894841775 * a - 1.291485548 * b;
      const l = lRoot ** 3;
      const m = mRoot ** 3;
      const s = sRoot ** 3;
      const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
      const luminance =
        0.2126 * Math.max(0, Math.min(1, red)) +
        0.7152 * Math.max(0, Math.min(1, green)) +
        0.0722 * Math.max(0, Math.min(1, blue));
      const contrast = 1.05 / (luminance + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(3);
    }
  }
});

test('updates CheckboxGroup values and parent mixed state', async ({ page }) => {
  const family = await lightFamily(page, 'CheckboxGroup');
  const parent = family.getByTestId('checkbox-parent');
  const email = family.getByRole('checkbox', { name: 'Email', exact: true });
  const push = family.getByRole('checkbox', { name: 'Push', exact: true });
  const sms = family.getByRole('checkbox', { name: 'SMS', exact: true });

  await expect(parent).toHaveAttribute('aria-checked', 'mixed');
  await parent.click();
  await expect(email).toHaveAttribute('aria-checked', 'true');
  await expect(push).toHaveAttribute('aria-checked', 'true');
  await expect(sms).toHaveAttribute('aria-checked', 'false');
  await expect(parent).toHaveAttribute('aria-checked', 'mixed');

  const horizontal = family.getByRole('group', { name: 'Export fields' });
  const horizontalItems = horizontal.getByRole('checkbox');
  await horizontalItems.first().focus();
  await page.keyboard.press('Tab');
  await expect(horizontalItems.nth(1)).toBeFocused();
});

test('keeps CheckboxList rows selectable and field relationships intact', async ({ page }) => {
  const family = await lightFamily(page, 'CheckboxList');
  const projectAccess = family.getByRole('group', { name: 'Project access' });
  const view = projectAccess.getByRole('checkbox', { name: 'View' });

  await expect(view).toHaveAttribute('aria-checked', 'false');
  await view.click();
  await expect(view).toHaveAttribute('aria-checked', 'true');
  await view.click();
  await expect(view).toHaveAttribute('aria-checked', 'false');

  const required = family.getByRole('group', { name: 'Required channels' });
  await expect(required).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await required.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  await expect(family.locator(`#${describedBy!.split(' ').at(-1)}`)).toHaveText(
    'Choose at least one channel',
  );
});

test('activates standalone CheckboxListItem rows without losing focus behavior', async ({ page }) => {
  const family = await lightFamily(page, 'CheckboxListItem');
  const row = family.getByTestId('checkbox-list-item-focus');
  const checkbox = row.getByRole('checkbox', { name: 'Checked' });

  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await row.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await expect(family.getByRole('checkbox', { name: 'Indeterminate' })).toHaveAttribute(
    'aria-checked',
    'mixed',
  );
});

test('uses immediate state entry, exit-only motion, and system contrast fallbacks', async ({ page }) => {
  const family = await lightFamily(page, 'Button');
  const secondary = family.getByRole('button', { name: 'secondary' });

  await expect(secondary).toHaveCSS('transition-duration', '0.1s');
  await secondary.hover();
  await expect(secondary).toHaveCSS('transition-duration', '0s');
  await page.mouse.move(0, 0);
  await expect(secondary).toHaveCSS('transition-duration', '0.1s');

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  const loading = family.getByRole('button', { name: /Loading/ });
  const spinner = loading.locator('.wheel-Button-spinner');
  const reducedTransition = await secondary.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  );

  expect(reducedTransition).toBeLessThan(0.001);
  await expect(spinner).toHaveCSS('animation-name', 'none');
  await expect(loading).toHaveCSS('outline-style', 'solid');
  await expect(secondary).toHaveCSS('border-top-style', 'solid');
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

test('positions Select and supports repeated pointer and keyboard choices', async ({ page }) => {
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

  await popup.getByRole('option', { name: 'Gala' }).click();
  await expect(trigger).toContainText('Gala');
  await expect(popup).toBeHidden();

  await trigger.click();
  const reopenedPopup = page.getByTestId('select-popup').filter({ visible: true });
  await expect(reopenedPopup).toBeVisible();
  await reopenedPopup.getByRole('option', { name: 'Fuji' }).click();
  await expect(trigger).toContainText('Fuji');
  await expect(reopenedPopup).toBeHidden();

  await trigger.press('ArrowDown');
  const keyboardPopup = page.getByTestId('select-popup').filter({ visible: true });
  await expect(keyboardPopup).toBeVisible();
  await page.keyboard.press('h');
  await expect(keyboardPopup.getByRole('option', { name: 'Honeycrisp' })).toHaveAttribute('data-highlighted');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Honeycrisp');
  await expect(keyboardPopup).toBeHidden();
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
