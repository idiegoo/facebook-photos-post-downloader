/**
 * Tipos estrictos para el sistema de Server-Sent Events (SSE) y seguimiento de progreso.
 * Sin ningún uso de 'any'.
 */

export type ScrapingStage =
  | 'connected'
  | 'started'
  | 'browser_launch'
  | 'navigating'
  | 'navigating_viewer'
  | 'inspecting'
  | 'theater_mode'
  | 'found_image'
  | 'loop_finished'
  | 'fallback_scan'
  | 'completed_scan'
  | 'batch_start'
  | 'batch_scraping'
  | 'scraping_post'
  | 'post_done'
  | 'zipping'
  | 'downloading_file'
  | 'completed'
  | 'error';

export interface ProgressEventPayload {
  stage: ScrapingStage;
  message: string;
  count?: number;
  current?: number;
  total?: number;
  activeThreads?: number;
  concurrency?: number;
  searchDuration?: string;
  downloadDuration?: string;
  photosPerSec?: string;
  totalPhotos?: number;
  index?: number;
}

export type ProgressListener = (data: ProgressEventPayload) => void;
