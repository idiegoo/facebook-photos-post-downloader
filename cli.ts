import readline from 'readline';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { scrapeFacebookPostImages, scrapeMultipleFacebookPosts } from './src/lib/scraper';
import { asyncPool } from './src/lib/concurrency';

function askQuestion(query: string, defaultVal = ''): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultVal);
    })
  );
}

function sanitizeFilename(name: string): string {
  if (!name) return 'facebook_photos';
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

async function runCli(): Promise<void> {
  console.log('\n======================================================');
  console.log('   FACEBOOK POST PHOTO DOWNLOADER (NEXT.js / TS)');
  console.log('======================================================\n');

  const postUrl = await askQuestion('[URL] Enter Facebook post URL (or multiple separated by commas): ');
  if (!postUrl) {
    console.error('[Error] Post URL is required.');
    process.exit(1);
  }

  const rawZipName = await askQuestion('[Name] Enter ZIP file name [facebook_photos]: ', 'facebook_photos');
  const zipName = sanitizeFilename(rawZipName);

  const rawThreads = await askQuestion('[Threads] Number of concurrent download threads [6]: ', '6');
  const concurrency = Math.max(1, Math.min(16, parseInt(rawThreads, 10) || 6));

  const outputDir = path.join(process.cwd(), 'downloads');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const zipPath = path.join(outputDir, `${zipName}.zip`);

  console.log(`\n[*] Analyzing post with asynchronous reactive search...`);
  const searchStartTime = Date.now();

  try {
    const urls = postUrl.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean);
    let imageUrls: string[] = [];

    if (urls.length > 1) {
      console.log(`   Processing ${urls.length} posts concurrently...`);
      const resultsMap = await scrapeMultipleFacebookPosts(urls, {
        concurrency: Math.min(3, urls.length),
        onProgress: (p) => {
          if (p.message) console.log(`   [Batch Scraper] ${p.message}`);
        }
      });
      for (const list of resultsMap.values()) {
        for (const img of list) {
          if (!imageUrls.includes(img)) imageUrls.push(img);
        }
      }
    } else {
      const singleUrl = urls[0];
      if (!singleUrl) {
        console.error('[Error] Invalid URL.');
        return;
      }
      imageUrls = await scrapeFacebookPostImages(singleUrl, {
        concurrency,
        onProgress: (p) => {
          if (p.message) console.log(`   [Scraper] ${p.message}`);
        }
      });
    }

    const searchTime = ((Date.now() - searchStartTime) / 1000).toFixed(1);

    if (imageUrls.length === 0) {
      console.log('\n[Notice] No photos found in the post.');
      console.log('   (Make sure the post is public or the URL is valid)');
      return;
    }

    console.log(`\n[OK] Search completed in ${searchTime}s: ${imageUrls.length} photos detected.`);
    console.log(`[Download] Starting parallel download (${concurrency} simultaneous threads)...`);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(output);

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

    await asyncPool(
      imageUrls,
      concurrency,
      async (imgUrl: string, index: number): Promise<void> => {
        try {
          const response = await fetch(imgUrl);
          if (!response.ok) {
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
        } catch {
          readyBuffers.set(index, null);
          flushReadyBuffers();
        }
      },
      {
        onProgress: ({ completed, total, active }) => {
          const percent = Math.round((completed / total) * 100);
          process.stdout.write(
            `\r   [${active} active threads] Downloaded: ${completed}/${total} (${percent}%)`
          );
        }
      }
    );

    flushReadyBuffers();
    process.stdout.write('\n');

    await archive.finalize();

    output.on('close', () => {
      const downloadTime = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
      const rate = (imageUrls.length / (parseFloat(downloadTime) || 1)).toFixed(1);
      console.log('\n======================================================');
      console.log(`[OK] Download completed successfully.`);
      console.log(`File saved at: ${zipPath}`);
      console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Download time: ${downloadTime}s (~${rate} photos/second)`);
      console.log('======================================================\n');
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('\n[Error] An error occurred:', error.message);
  }
}

void runCli();
