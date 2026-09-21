import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
}

test('work navigation, project sequence, Escape, and focus restoration', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await navigation.getByRole('link', { name: 'Work', exact: true }).click()
  await expect(page).toHaveURL(/#work$/)
  await expect(navigation.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
    'aria-current',
    'location',
  )

  const card = page.getByRole('button', { name: 'Explore Liminal', exact: true })
  await card.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
    'Somewhere between the real and the imagined.',
  )
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await dialog.getByRole('button', { name: 'Next project' }).click()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
    'A living canvas. A collective rhythm.',
  )
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(card).toBeFocused()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')

  await page.getByRole('button', { name: 'Explore Solstice', exact: true }).click()
  await dialog.getByRole('button', { name: 'Next project' }).click()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
    'Somewhere between the real and the imagined.',
  )
  await dialog.getByRole('button', { name: 'Close project' }).click()
  await expect(dialog).not.toBeVisible()
  expect(errors).toEqual([])
})

test('contact navigation and return to the hero', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  const contact = navigation.getByRole('link', { name: 'Contact', exact: true })
  await contact.click()
  await expect(page).toHaveURL(/#contact$/)
  await expect(contact).toHaveAttribute('aria-current', 'location')
  await expect(page.getByRole('heading', { name: /Let's make the unexpected/ })).toBeInViewport()
  await expect(page.getByRole('link', { name: /hello@aether.example/ })).toHaveAttribute(
    'href',
    'mailto:hello@aether.example',
  )
  await page.getByRole('link', { name: 'Back to the surface' }).click()
  await expect(page).toHaveURL(/#home$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5)
})

test('ambient sound is opt-in and soundscape controls wrap in both directions', async ({
  page,
}) => {
  await page.goto('/')
  const enable = page.getByRole('button', { name: 'Enable ambient sound' })
  await expect(enable).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Next soundscape' })).toHaveCount(0)
  await enable.click()
  const mute = page.getByRole('button', { name: 'Mute ambient sound' })
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('01 — Blue hour', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous soundscape' }).click()
  await expect(page.getByText('03 — Afterlight', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next soundscape' }).click()
  await expect(page.getByText('01 — Blue hour', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next soundscape' }).click()
  await expect(page.getByText('02 — Slow current', { exact: true })).toBeVisible()
  await mute.click()
  await expect(enable).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Next soundscape' })).toHaveCount(0)
  await enable.click()
  await expect(page.getByText('02 — Slow current', { exact: true })).toBeVisible()
  await mute.click()
})

test('viewport stays contained and each project opens with visible close controls', async ({
  page,
}) => {
  await page.goto('/')
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeInViewport()
  await page.getByRole('link', { name: 'Explore selected work' }).click()
  await expect(page).toHaveURL(/#work$/)
  for (const name of ['Liminal', 'Pulse', 'Orbital', 'Solstice']) {
    const card = page.getByRole('button', { name: `Explore ${name}`, exact: true })
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeInViewport()
    await card.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole('button', { name: 'Close project' })
    await expect(close).toBeInViewport()
    await expectNoHorizontalOverflow(page)
    await close.click()
    await expect(dialog).not.toBeVisible()
  }
  await expectNoHorizontalOverflow(page)
})

test('manual motion pause can be resumed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pause motion' }).click()
  const resume = page.getByRole('button', { name: 'Motion reduced' })
  await expect(resume).toHaveAttribute('aria-pressed', 'true')
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(page.getByRole('button', { name: 'Pause motion' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test.describe('system reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('respects the preference while keeping the project journey available', async ({ page }) => {
    await page.goto('/')
    const motion = page.getByRole('button', { name: 'Motion reduced' })
    await expect(motion).toHaveAttribute('aria-pressed', 'true')
    await expect(motion).toBeDisabled()
    await expect(page.locator('.experience')).toHaveClass(/motion-paused/)
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Work', exact: true })
      .click()
    await page.getByRole('button', { name: 'Explore Orbital', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading')).toHaveText(
      'A new perspective is closer than you think.',
    )
    await page.getByRole('button', { name: 'Close project' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})

test('scene chunk network failure preserves the fallback and complete content journey', async ({
  page,
}) => {
  let blockedRequests = 0
  await page.route(/(?:\/src\/Scene\.tsx|\/assets\/Scene-[^/]+\.js)(?:\?.*)?$/, (route) => {
    blockedRequests += 1
    return route.abort('failed')
  })
  await page.goto('/')
  await expect.poll(() => blockedRequests).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.scene-fallback')).toBeVisible()
  await expect(page.locator('.fallback-ring')).toHaveCSS('opacity', '1')
  await expect(page.getByText('SCROLL TO EXPLORE', { exact: true })).toBeVisible()
  await expect(page.locator('.experience')).toHaveClass(/is-ready/)

  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await navigation.getByRole('link', { name: 'Work', exact: true }).click()
  const card = page.getByRole('button', { name: 'Explore Liminal', exact: true })
  await card.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toHaveText(
    'Somewhere between the real and the imagined.',
  )
  await dialog.getByRole('button', { name: 'Close project' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(card).toBeFocused()
  await navigation.getByRole('link', { name: 'Contact', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Let's make the unexpected/ })).toBeInViewport()
  await page.getByRole('link', { name: 'Back to the surface' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
})

test('@fallback WebGL unavailability preserves the hero and project navigation', async ({
  page,
}) => {
  await page.goto('/')
  const available = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  })
  expect(available).toBe(false)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.scene-fallback')).toBeVisible()
  await expect(page.locator('.experience')).toHaveClass(/is-ready/)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Work', exact: true })
    .click()
  await page.getByRole('button', { name: 'Explore Liminal', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
