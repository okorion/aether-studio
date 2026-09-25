import type { Page } from '@playwright/test'
import { sceneToScroll, scrollToScene } from '../src/ScrollTimeline'

/** Navigate to an authored pose, retaining pixel rounding from actual scroll. */
export async function scrollToProgress(page: Page, progress: number) {
  const actual = await page.evaluate(raw => {
    const maximum = document.documentElement.scrollHeight - innerHeight
    scrollTo({ top: maximum * raw, behavior: 'instant' })
    return scrollY / maximum
  }, sceneToScroll(progress))
  return scrollToScene(actual).toFixed(6)
}
