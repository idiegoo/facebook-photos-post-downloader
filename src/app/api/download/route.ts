import { PassThrough, Readable } from 'stream';
import archiver from 'archiver';
import { scrapeFacebookPostImages, scrapeMultipleFacebookPosts } from '@/lib/scraper';
import { asyncPool } from '@/lib/concurrency';
import { progressManager } from '@/lib/progress';
import type { ProgressEventPayload } from '@/types/progress';

export const dynamic = 'force-dynamic';

function sanitizeFilename(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return 'facebook_photos';
  let safe = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  if (safe.endsWith('.zip')) {
    safe = safe.slice(0, -4);
  }
  return safe || 'facebook_photos';
}

interface BufferEntry {
  buffer: Buffer;
  filename: string;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawPostUrl = searchParams.get('url');
  const rawZipName = searchParams.get('name');
  const sessionId = searchParams.get('sessionId');
  const rawConcurrency = parseInt(searchParams.get('concurrency') ?? '6', 10);
  const downloadConcurrency = isNaN(rawConcurrency) ? 6 : Math.max(1, Math.min(16, rawConcurrency));

  if (!rawPostUrl) {
    return new Response('Missing Facebook post URL.', { status: 400 });
  }

  const zipName = sanitizeFilename(rawZipName);

  const notify = (data: ProgressEventPayload): void => {
    progressManager.notify(sessionId, data);
  };

  try {
    notify({
      stage: 'started',
      message: `Starting process [Configured concurrency: ${downloadConcurrency} simultaneous threads]...`
    });

    const urlCandidates = rawPostUrl
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 5);

    let imageUrls: string[] = [];
    const searchStartTime = Date.now();

    if (urlCandidates.length > 1) {
      notify({
        stage: 'batch_scraping',
        message: `Detected ${urlCandidates.length} URLs. Starting concurrent post scraping...`
      });

      const multiMap = await scrapeMultipleFacebookPosts(urlCandidates, {
        concurrency: Math.min(3, urlCandidates.length),
        onProgress: notify
      });

      for (const list of multiMap.values()) {
        for (const img of list) {
          if (!imageUrls.includes(img)) imageUrls.push(img);
        }
      }
    } else {
      const firstUrl = urlCandidates[0];
      if (!firstUrl) {
        return new Response('Invalid URL.', { status: 400 });
      }
      imageUrls = await scrapeFacebookPostImages(firstUrl, {
        concurrency: downloadConcurrency,
        onProgress: notify
      });
    }

    const searchDuration = ((Date.now() - searchStartTime) / 1000).toFixed(1);

    if (imageUrls.length === 0) {
      notify({
        stage: 'error',
        message: 'No photos found in the provided post or the post requires an active login session.'
      });
      return new Response('No images found in the post.', { status: 404 });
    }

    notify({
      stage: 'zipping',
      count: imageUrls.length,
      searchDuration,
      message: `Extraction ready in ${searchDuration}s (${imageUrls.length} photos). Starting parallel download (${downloadConcurrency} threads)...`
    });

    const passThrough = new PassThrough();
    const webStream = Readable.toWeb(passThrough);

    const archive = archiver('zip', {
      zlib: { level: 5 }
    });

    archive.on('error', (err: Error) => {
      console.error('Error in archiver:', err);
      notify({ stage: 'error', message: `ZIP generation error: ${err.message}` });
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    // =========================================================================
    // ASYNCHRONOUS MULTITHREADED DOWNLOAD WITH IN-ORDER BUFFER FLUSH
    // =========================================================================
    const downloadStartTime = Date.now();
    const readyBuffers = new Map<number, BufferEntry | null>();
    let nextIndexToAppend = 0;

    const flushReadyBuffers = (): void => {
      while (readyBuffers.has(nextIndexToAppend)) {
        const item = readyBuffers.get(nextIndexToAppend);
        readyBuffers.delete(nextIndexToAppend);
        if (item && item.buffer) {
          archive.append(item.buffer, { name: item.filename });
        }
        nextIndexToAppend++;
      }
    };

    void (async (): Promise<void> => {
      try {
        await asyncPool(
          imageUrls,
          downloadConcurrency,
          async (imgUrl: string, index: number): Promise<void> => {
            try {
              const response = await fetch(imgUrl, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
              });

              if (!response.ok) {
                console.warn(`HTTP ${response.status} downloading photo ${index + 1}`);
                readyBuffers.set(index, null);
                flushReadyBuffers();
                return;
              }

              const arrayBuffer = await response.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const fileIndex = String(index + 1).padStart(2, '0');
              const filename = `${zipName}_${fileIndex}.jpg`;

              readyBuffers.set(index, { buffer, filename });
              flushReadyBuffers();
            } catch (err: unknown) {
              const error = err instanceof Error ? err : new Error(String(err));
              console.error(`Error in parallel download of photo ${index + 1}:`, error.message);
              readyBuffers.set(index, null);
              flushReadyBuffers();
            }
          },
          {
            onProgress: ({ completed, total, active }) => {
              notify({
                stage: 'downloading_file',
                current: completed,
                total,
                activeThreads: active,
                concurrency: downloadConcurrency,
                message: `Downloading image ${completed} of ${total} [${active} active threads]...`
              });
            }
          }
        );

        flushReadyBuffers();

        const downloadDuration = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
        const photosPerSec = (imageUrls.length / (parseFloat(downloadDuration) || 1)).toFixed(1);

        notify({
          stage: 'completed',
          downloadDuration,
          photosPerSec,
          totalPhotos: imageUrls.length,
          message: `Completed! ${imageUrls.length} photos downloaded in ${downloadDuration}s (~${photosPerSec} photos/s with ${downloadConcurrency} threads). ZIP generated successfully.`
        });

        await archive.finalize();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Error in download and compression process:', error.message);
        notify({ stage: 'error', message: `Error: ${error.message}` });
        passThrough.destroy(error);
      }
    })();

    return new Response(webStream as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}.zip"`
      }
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('Error in /api/download:', error);
    notify({ stage: 'error', message: `Error: ${error.message}` });
    return new Response(`Error processing post: ${error.message}`, { status: 500 });
  }
}
