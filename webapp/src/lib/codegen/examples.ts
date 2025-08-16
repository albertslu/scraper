// Compact exemplars used as in-context references for the code generator.
// IMPORTANT: These are for style/patterns only. They must not be copied verbatim.

export const PLAYWRIGHT_EXEMPLAR = `
Use as reference for style/patterns only. Do not copy selectors or site‑specific logic. Wire selectors and schema from the current SiteSpec.

Reference Exemplar (Playwright, TypeScript)
— Robust navigation, pagination, selector fallbacks, rate limiting, Cloudflare patience, per-item resilience, cleanup.

// NOTE: Replace __LISTING_URL__, __LISTING_ITEM_SELECTOR__, __DETAIL_LINK_SELECTOR__, __FIELD_SELECTORS__
// with values from the current SiteSpec when generating real code.

import { chromium } from 'playwright';
import { z } from 'zod';

const ItemSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().url().optional(),
});

function normalizePhone(text?: string): string | undefined {
  if (!text) return undefined;
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return undefined;
}

export async function main(): Promise<any[]> {
  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Phase 1: collect listing URLs with early stop and rate limiting
    const allUrls: string[] = [];
    for (let p = 1; p <= 5; p++) {
      const url = '__LISTING_URL__'.replace('PAGE', String(p));
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Cloudflare patience pattern
      const title = await page.title();
      if (title.includes('Just a moment') || title.toLowerCase().includes('checking your browser')) {
        await page.waitForFunction(() => document.title && !document.title.includes('Just a moment') && !document.body.textContent?.includes('Checking your browser'), { timeout: 60000 });
      }
      await page.waitForTimeout(2000);

      // Multi-selector link fallbacks (use SiteSpec selectors)
      const urls = await page.evaluate((selA: string, selB: string) => {
        const set = new Set<string>();
        for (const sel of [selA, selB, 'a']) {
          document.querySelectorAll(sel).forEach(a => {
            const href = (a as HTMLAnchorElement).href;
            if (href && href.startsWith('http') && href.includes('/profile/')) set.add(href);
          });
          if (set.size) break;
        }
        return Array.from(set);
      }, '__DETAIL_LINK_SELECTOR__', '__LISTING_ITEM_SELECTOR__');

      if (!urls.length) break;
      allUrls.push(...urls);
      await page.waitForTimeout(800);
    }

    const uniqueUrls = Array.from(new Set(allUrls));
    const results: any[] = [];
    const nameSelectors = ['__FIELD_SELECTORS__.name_A', '__FIELD_SELECTORS__.name_B', 'h1'];
    const phoneSelectors = ['a[href^="tel:"]', '__FIELD_SELECTORS__.phone_A'];

    // Phase 2: visit details and extract
    for (let i = 0; i < uniqueUrls.length; i++) {
      const detailUrl = uniqueUrls[i];
      await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);

      // Fallbacks for name
      let name: string | undefined;
      for (const sel of nameSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { name = (await el.textContent() || '').trim(); if (name) break; }
        } catch {}
      }
      // Fallbacks for phone
      let phone: string | undefined;
      for (const sel of phoneSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { phone = normalizePhone(await el.textContent() || undefined); if (phone) break; }
        } catch {}
      }

      const parsed = ItemSchema.safeParse({ name, phone, url: detailUrl });
      if (parsed.success) results.push(parsed.data);
      if (results.length && results.length % 10 === 0) console.log('progress: ' + results.length);
      await page.waitForTimeout(500);
    }

    return results;
  } finally {
    await browser.close();
  }
}
`;

export const STAGEHAND_EXEMPLAR = `
Use as reference for style/patterns only. Do not copy selectors or site‑specific logic. Wire selectors and schema from the current SiteSpec.

Reference Exemplar (Stagehand, TypeScript)
— Schema-first extraction, defensive waits, per-item validation, progress logs, cleanup.

// NOTE: Replace __LISTING_URL__, __DETAIL_LINK_SELECTOR__ with SiteSpec values.

import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

const ItemSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().url().optional(),
});

export async function main(): Promise<any[]> {
  const stagehand = new Stagehand({ env: 'LOCAL', domSettleTimeoutMs: 5000 });
  const results: any[] = [];
  try {
    await stagehand.init();
    const page = stagehand.page;

    // Phase 1: collect URLs
    const allUrls: string[] = [];
    for (let p = 1; p <= 5; p++) {
      await page.goto('__LISTING_URL__&page=' + p, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(r => setTimeout(r, 1000));
      const urls = await page.evaluate((detailSel: string) => {
        const set = new Set<string>();
        document.querySelectorAll(detailSel).forEach(a => {
          const href = (a as HTMLAnchorElement).href;
          if (href && href.startsWith('http')) set.add(href);
        });
        return Array.from(set);
      }, '__DETAIL_LINK_SELECTOR__');
      if (!urls.length) break;
      allUrls.push(...urls);
    }

    // Phase 2: extract with schema
    const unique = Array.from(new Set(allUrls));
    for (let i = 0; i < unique.length; i++) {
      const url = unique[i];
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await new Promise(r => setTimeout(r, 800));
      const item = await page.extract({ instruction: 'Extract requested fields anywhere on the page', schema: ItemSchema });
      const parsed = ItemSchema.safeParse({ ...item, url });
      if (parsed.success) results.push(parsed.data);
      if (results.length && results.length % 10 === 0) console.log('progress:', results.length);
      await new Promise(r => setTimeout(r, 400));
    }

    return results;
  } finally {
    await stagehand.close();
  }
}
`;

export const PLAYWRIGHT_MINIDOCS = `
Playwright scraping notes (TypeScript):

- Setup & lifecycle: use chromium.launch({ headless: true }); create a BrowserContext with userAgent + viewport; newPage() for a tab; always close in finally.
- Navigation & waits: prefer waitUntil 'domcontentloaded'; after goto, wait for a stable container locator before extracting.
- Locators: use getByRole/getByText/getByLabel first; fallback to locator('css:visible'); avoid brittle XPath unless necessary.
- Extract pattern: count a cards locator; iterate nth(i); innerText().trim(); attribute('href'); normalize URLs with new URL(href, page.url()).toString().
- Pagination (next button): while true { extract; find Next link by role; if not visible break; click + wait for domcontentloaded }.
- Pagination (URL param): for pageIndex from 1..N, goto(base + ?page=pageIndex), extract; stop when no new items.
- Infinite scroll helper: mouse.wheel(0, step); pause; stop when body.scrollHeight stops increasing; cap steps.
- API-first: waitForResponse(url includes '/api' and ok), parse json, map directly into { title, price, url } objects; faster and more stable than DOM.
- Network control: route('**/*'): abort images/fonts, continue others; set extraHTTPHeaders in context if needed.
- Timeouts & reliability: setDefaultTimeout 15000; setDefaultNavigationTimeout 30000; small random waits between actions; de-duplicate results; stop loops when no new items.
- Optional hardening: if transport blocks, launch args may include disable-http2 and use realistic UA/headers/proxy.
(Reference only; wire selectors/schema from current SiteSpec).`;


