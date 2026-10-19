import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import path from 'path';
import type { ScraperOptions, MultiPostScraperOptions } from '../types/scraper';
import { asyncPool } from './concurrency';

const USER_DATA_DIR = path.join(process.cwd(), '.fb_session');

/**
 * Normalizes Facebook URL to ensure full URL format
 */
export function normalizeFbUrl(url: string): string {
  let clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean;
}

/**
 * Cleans and validates a Facebook CDN image URL, removing invalid parameters
 */
function cleanFbImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\/g, '');
  if (
    clean.includes('emoji.php') ||
    clean.includes('/rsrc.php') ||
    clean.includes('/p50x50/') ||
    clean.includes('/s50x50/') ||
    clean.includes('/p24x24/') ||
    clean.includes('profile')
  ) {
    return null;
  }
  return clean;
}

function getBrowserLaunchArgs(userDataDir: string, headless: boolean): LaunchOptions {
  return {
    headless: headless ? true : false,
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US,en,es',
      '--window-size=1280,900'
    ],
    defaultViewport: { width: 1280, height: 900 }
  };
}

/**
 * Extracts solely the photos belonging to the specific Facebook post
 * by navigating the post's isolated photo viewer gallery.
 */
export async function scrapeFacebookPostImages(
  postUrl: string,
  options: ScraperOptions = {}
): Promise<string[]> {
  const {
    headless = true,
    onProgress = () => {},
    timeout = 45000,
    userDataDir = USER_DATA_DIR,
    maxPhotos = 120
  } = options;

  const cleanUrl = normalizeFbUrl(postUrl);

  onProgress({
    stage: 'browser_launch',
    message: 'Launching automated browser...'
  });

  const browser: Browser = await puppeteer.launch(getBrowserLaunchArgs(userDataDir, headless));

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    onProgress({ stage: 'navigating', message: `Navigating to post: ${cleanUrl}` });
    await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout });

    // Dismiss cookie modals if present
    try {
      await page.evaluate((): void => {
        const dismissSelectors = [
          'div[aria-label="Cerrar"]',
          'div[aria-label="Close"]',
          '[aria-label*="cookie" i]',
          '[aria-label*="Rechazar" i]',
          '[aria-label*="Decline" i]'
        ];
        for (const sel of dismissSelectors) {
          const el = document.querySelector<HTMLElement>(sel);
          if (el) el.click();
        }
      });
    } catch {
      // Ignore if no modal
    }

    onProgress({
      stage: 'inspecting',
      message: 'Analyzing post photos...'
    });

    const isAlreadyPhotoViewer = page.url().includes('/photo') || (await page.$('div[role="dialog"]')) !== null;

    if (!isAlreadyPhotoViewer) {
      const firstPhotoUrl = await page.evaluate((): string | null => {
        const a = document.querySelector<HTMLAnchorElement>('a[href*="/photo"], a[href*="fbid="]');
        return a ? a.href : null;
      });

      if (firstPhotoUrl) {
        onProgress({ stage: 'navigating_viewer', message: 'Entering post photo viewer...' });
        await page.goto(firstPhotoUrl, { waitUntil: 'networkidle2', timeout });
      }
    }

    onProgress({
      stage: 'theater_mode',
      message: 'Traversing post gallery in maximum resolution...'
    });

    const collected = new Map<string, string>();
    const seenFbids = new Set<string>();

    for (let i = 0; i < maxPhotos; i++) {
      const currentUrl = page.url();
      const fbidMatch = currentUrl.match(/fbid=(\d+)/);
      const currentFbid = fbidMatch ? fbidMatch[1] : null;

      // When the viewer loops back to an already visited fbid, full gallery cycle is complete
      if (currentFbid) {
        if (seenFbids.has(currentFbid)) {
          onProgress({
            stage: 'loop_finished',
            message: `Post gallery traversed completely (${collected.size} photos found).`
          });
          break;
        }
        seenFbids.add(currentFbid);
      }

      // Wait reactively for the main photo in viewer to be rendered with natural dimensions
      let bestImg: { src: string; w: number; h: number } | null = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        bestImg = await page.evaluate((): { src: string; w: number; h: number } | null => {
          const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
          let candidate: { src: string; w: number; h: number } | null = null;
          let maxArea = 0;
          for (const img of imgs) {
            const src = img.currentSrc || img.src || '';
            if (!src.includes('fbcdn.net')) continue;
            if (
              src.includes('emoji.php') ||
              src.includes('rsrc.php') ||
              src.includes('/p50x50/') ||
              src.includes('/s50x50/') ||
              src.includes('profile')
            ) {
              continue;
            }

            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            const area = w * h;
            if (area > maxArea && (w >= 200 || h >= 200)) {
              maxArea = area;
              candidate = { src, w, h };
            }
          }
          return candidate;
        });

        if (bestImg) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (bestImg) {
        const clean = cleanFbImageUrl(bestImg.src);
        if (clean) {
          const key = currentFbid || `img_${i}`;
          collected.set(key, clean);
          onProgress({
            stage: 'found_image',
            count: collected.size,
            message: `Photo found #${collected.size}`
          });
        }
      }

      // Navigate to next photo in post
      const prevUrl = currentUrl;
      await page.keyboard.press('ArrowRight');

      let advanced = false;
      try {
        await page.waitForFunction(
          (oldUrl: string): boolean => window.location.href !== oldUrl,
          { timeout: 2500, polling: 60 },
          prevUrl
        );
        advanced = true;
      } catch {
        // If ArrowRight key didn't advance URL, attempt clicking Next button
        const clicked: boolean = await page.evaluate((): boolean => {
          const nextSelectors = [
            'div[aria-label="Foto siguiente"]',
            'div[aria-label="Siguiente"]',
            'div[aria-label="Next photo"]',
            'div[aria-label="Next"]',
            '[aria-label*="Foto siguiente" i]',
            '[aria-label*="siguiente" i]',
            '[aria-label*="Next" i]'
          ];
          for (const sel of nextSelectors) {
            const btn = document.querySelector<HTMLElement>(sel);
            if (
              btn &&
              btn.getAttribute('aria-label') !== 'Cerrar' &&
              btn.getAttribute('aria-label') !== 'Close'
            ) {
              btn.click();
              return true;
            }
          }
          return false;
        });

        if (clicked) {
          try {
            await page.waitForFunction(
              (oldUrl: string): boolean => window.location.href !== oldUrl,
              { timeout: 2000, polling: 60 },
              prevUrl
            );
            advanced = true;
          } catch {
            advanced = false;
          }
        }
      }

      if (!advanced) {
        break;
      }
    }

    // Fallback: only if viewer didn't open, scan direct container photos
    if (collected.size === 0) {
      onProgress({ stage: 'fallback_scan', message: 'Scanning direct post images...' });

      const pageImages: string[] = await page.evaluate((): string[] => {
        const container = document.querySelector('[role="main"]') || document;
        const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img[src*="fbcdn.net"]'));
        const found: string[] = [];
        for (const img of imgs) {
          const src = img.src || '';
          if (
            src.includes('emoji.php') ||
            src.includes('/rsrc.php') ||
            src.includes('/p50x50/') ||
            src.includes('/s50x50/') ||
            src.includes('profile')
          ) {
            continue;
          }
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;
          if (width >= 200 && height >= 200) {
            found.push(src);
          }
        }
        return found;
      });

      for (let j = 0; j < pageImages.length; j++) {
        const rawUrl = pageImages[j];
        const clean = cleanFbImageUrl(rawUrl);
        if (clean) collected.set(`fallback_${j}`, clean);
      }
    }

    const results = Array.from(collected.values());
    onProgress({
      stage: 'completed_scan',
      count: results.length,
      message: `Total photos found in post: ${results.length}.`
    });

    return results;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    onProgress({ stage: 'error', message: `Error during extraction: ${err.message}` });
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Search and extraction for multiple different post URLs.
 */
export async function scrapeMultipleFacebookPosts(
  postUrls: readonly string[],
  options: MultiPostScraperOptions = {}
): Promise<Map<string, string[]>> {
  const {
    concurrency = 2,
    headless = true,
    userDataDir = USER_DATA_DIR,
    onProgress = () => {}
  } = options;

  const validUrls = postUrls.map((u) => normalizeFbUrl(u)).filter(Boolean);
  if (validUrls.length === 0) return new Map();

  const resultsMap = new Map<string, string[]>();

  await asyncPool(validUrls, concurrency, async (url: string, idx: number): Promise<string[]> => {
    onProgress({
      stage: 'scraping_post',
      index: idx + 1,
      total: validUrls.length,
      message: `Processing post [${idx + 1}/${validUrls.length}]: ${url}`
    });

    try {
      const imgs = await scrapeFacebookPostImages(url, {
        headless,
        userDataDir,
        onProgress: (p) => {
          onProgress({
            ...p,
            message: `[Post ${idx + 1}] ${p.message}`
          });
        }
      });
      resultsMap.set(url, imgs);
      return imgs;
    } catch {
      resultsMap.set(url, []);
      return [];
    }
  });

  return resultsMap;
}
