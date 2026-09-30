/** Usage: PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node scripts/check-sidebar-ui.mjs URL [storage-state.json] */
import assert from "node:assert/strict"
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core")
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, ...(process.argv[3] ? { storageState: process.argv[3] } : {}) })
  await page.goto(process.argv[2])
  // The development indicator floats directly over the collapsed footer.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important }" })
  if (await page.getByRole("button", { name: "Expand sidebar", exact: true }).count()) {
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
    await page.waitForTimeout(300)
  }
  const rail = page.locator("aside[data-collapsed]")
  const expanded = await rail.boundingBox()
  assert.equal(expanded.width, 256)
  const switcher = page.getByRole("button", { name: /^Switch organization:/ })
  assert.equal(await switcher.isVisible(), true)
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await page.waitForTimeout(300)
  const collapsed = await rail.boundingBox()
  assert.equal(collapsed.width, 64)
  await switcher.click()
  assert.equal(await page.getByRole("listbox", { name: "Organizations", exact: true }).isVisible(), true)
  console.log(JSON.stringify({ expanded: expanded.width, collapsed: collapsed.width, collapsedOrganizationMenu: true }))
} finally { await browser.close() }
