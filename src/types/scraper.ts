import type { ProgressListener } from './progress';

/**
 * Tipos estrictos para el motor de scraping con Puppeteer.
 * Sin 'any'.
 */

export interface ScraperOptions {
  headless?: boolean;
  onProgress?: ProgressListener;
  timeout?: number;
  userDataDir?: string;
  maxPhotos?: number;
  concurrency?: number;
}

export interface MultiPostScraperOptions extends Omit<ScraperOptions, 'maxPhotos'> {
  concurrency?: number;
}

export interface PhotoData {
  fbid: string | null;
  imgSrc: string | null;
}
