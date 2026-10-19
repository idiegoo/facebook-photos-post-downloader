/**
 * Facebook Post Photo Downloader (Console Snippet / Bookmarklet - Multithreaded)
 * 
 * Instructions:
 * 1. Open Facebook in your browser and navigate to the post with photos.
 * 2. Open Developer Tools (F12 or Ctrl + Shift + I -> "Console" tab).
 * 3. Paste this entire code and press Enter.
 * 4. A modal will appear allowing you to set the ZIP name and concurrency level for instant parallel download.
 */

(async function fbPostPhotoDownloader() {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // In-browser async pool
  async function browserAsyncPool(items, concurrency = 6, iteratorFn, onProgress) {
    const total = items.length;
    if (total === 0) return [];
    const limit = Math.max(1, Math.min(concurrency, total));
    const executing = new Set();
    let completed = 0;

    for (let index = 0; index < total; index++) {
      const item = items[index];
      const p = (async () => {
        try {
          await iteratorFn(item, index);
        } catch (_) {}
        completed++;
        if (onProgress) onProgress(completed, total, executing.size);
      })();

      executing.add(p);
      const clean = () => executing.delete(p);
      p.then(clean, clean);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
  }

  console.log('%c[FB Downloader] Loading required libraries...', 'color: #1877f2; font-weight: bold;');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js');

  let existing = document.getElementById('fb-console-dl-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'fb-console-dl-modal';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: '9999999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(6px)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    backgroundColor: '#242526',
    color: '#e4e6eb',
    padding: '28px',
    borderRadius: '16px',
    width: '440px',
    maxWidth: '90%',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  });

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h3 style="margin:0; font-size:18px; color:#ffffff;">Download Photos (Multithreaded)</h3>
      <button id="fb-dl-close" style="background:none; border:none; color:#b0b3b8; font-size:22px; cursor:pointer;">&times;</button>
    </div>
    <p style="margin:0; font-size:13px; color:#b0b3b8; line-height:1.4;">
      Parallel downloading with async acceleration. Configure filename and concurrency:
    </p>
    <div>
      <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#e4e6eb;">ZIP File Name:</label>
      <div style="display:flex; align-items:center; background:#3a3b3c; border-radius:8px; border:1px solid #4e4f50; overflow:hidden;">
        <input id="fb-dl-zipname" type="text" value="facebook_photos" placeholder="e.g. my_photos" 
          style="width:100%; padding:10px 14px; background:transparent; border:none; color:#ffffff; font-size:14px; outline:none;" />
        <span style="padding:0 12px; color:#b0b3b8; font-size:13px; font-weight:600; border-left:1px solid #4e4f50;">.zip</span>
      </div>
    </div>
    <div>
      <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#e4e6eb;">Parallel Threads (Concurrency):</label>
      <select id="fb-dl-concurrency" style="width:100%; padding:9px 12px; background:#3a3b3c; border:1px solid #4e4f50; border-radius:8px; color:#ffffff; font-size:13px; outline:none;">
        <option value="4">4 parallel threads</option>
        <option value="6" selected>6 parallel threads (Recommended)</option>
        <option value="8">8 parallel threads (High speed)</option>
        <option value="12">12 parallel threads (Maximum)</option>
      </select>
    </div>
    <div id="fb-dl-progress" style="display:none; font-size:13px; color:#2e89ff; font-weight:600;">
      <div id="fb-dl-status">Starting reactive scan...</div>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
      <button id="fb-dl-cancel" style="padding:9px 16px; background:#3a3b3c; color:#e4e6eb; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Cancel</button>
      <button id="fb-dl-start" style="padding:9px 18px; background:#1877f2; color:#ffffff; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Download ZIP</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const inputName = card.querySelector('#fb-dl-zipname');
  const selectConcurrency = card.querySelector('#fb-dl-concurrency');
  const startBtn = card.querySelector('#fb-dl-start');
  const cancelBtn = card.querySelector('#fb-dl-cancel');
  const closeBtn = card.querySelector('#fb-dl-close');
  const progressDiv = card.querySelector('#fb-dl-progress');
  const statusText = card.querySelector('#fb-dl-status');

  inputName.focus();
  inputName.select();

  const close = () => overlay.remove();
  closeBtn.onclick = close;
  cancelBtn.onclick = close;

  startBtn.onclick = async () => {
    const zipName = (inputName.value.trim() || 'facebook_photos').replace(/[/\\?%*:|"<>]/g, '_');
    const concurrency = parseInt(selectConcurrency.value, 10) || 6;
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    cancelBtn.disabled = true;
    progressDiv.style.display = 'block';

    const setMsg = (t) => {
      statusText.innerText = t;
    };

    try {
      setMsg('Opening photo viewer and detecting post photos...');

      const isDialog = !!document.querySelector('div[role="dialog"]') || window.location.href.includes('/photo');
      if (!isDialog) {
        const photoAnchor = document.querySelector('a[href*="/photo"], a[href*="fbid="], [data-visualcompletion="media-vc-image"] img');
        if (photoAnchor) {
          photoAnchor.click();
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      const images = new Set();
      const seenFbids = new Set();

      for (let i = 0; i < 150; i++) {
        const currentUrl = window.location.href;
        const match = currentUrl.match(/fbid=(\d+)/);
        const fbid = match ? match[1] : null;

        if (fbid) {
          if (seenFbids.has(fbid)) {
            setMsg(`Gallery traversed completely (${images.size} photos found).`);
            break;
          }
          seenFbids.add(fbid);
        }

        let best = null;
        for (let attempt = 0; attempt < 15; attempt++) {
          const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"], img[data-visualcompletion="media-vc-image"]'));
          let maxArea = 0;
          for (const img of imgs) {
            const src = img.currentSrc || img.src || '';
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
              best = src;
            }
          }
          if (best) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        if (best) {
          images.add(best);
          setMsg(`Searching photos: ${images.size} found...`);
        }

        const nextSelectors = [
          'div[aria-label="Foto siguiente"]',
          'div[aria-label="Siguiente"]',
          'div[aria-label="Next photo"]',
          'div[aria-label="Next"]',
          '[aria-label*="Foto siguiente" i]',
          '[aria-label*="siguiente" i]',
          '[aria-label*="Next" i]'
        ];

        let clicked = false;
        for (const sel of nextSelectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.getAttribute('aria-label') !== 'Cerrar' && btn.getAttribute('aria-label') !== 'Close') {
            btn.click();
            clicked = true;
            break;
          }
        }

        if (!clicked) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
        }

        const startPoll = Date.now();
        const prevUrl = currentUrl;
        let changed = false;
        while (Date.now() - startPoll < 2200) {
          if (window.location.href !== prevUrl) {
            changed = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 60));
        }

        if (!changed) {
          break;
        }
      }

      if (images.size === 0) {
        const allImgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
        for (const img of allImgs) {
          const src = img.currentSrc || img.src || '';
          if (src.includes('emoji.php') || src.includes('rsrc.php') || src.includes('profile')) continue;
          if ((img.naturalWidth || img.width) >= 200 && (img.naturalHeight || img.height) >= 200) {
            images.add(src);
          }
        }
      }

      const list = Array.from(images);
      if (list.length === 0) {
        throw new Error('No photos found in this post.');
      }

      setMsg(`Downloading ${list.length} images in parallel (${concurrency} threads)...`);
      const zip = new JSZip();
      const downloadStart = Date.now();

      await browserAsyncPool(
        list,
        concurrency,
        async (url, idx) => {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const num = String(idx + 1).padStart(2, '0');
          zip.file(`${zipName}_${num}.jpg`, blob);
        },
        (completed, total, active) => {
          setMsg(`Downloaded ${completed}/${total} photos (${active} active threads)...`);
        }
      );

      const duration = ((Date.now() - downloadStart) / 1000).toFixed(1);
      const speed = (list.length / (parseFloat(duration) || 1)).toFixed(1);

      setMsg(`Compressing ZIP file (${duration}s at ~${speed} photos/s)...`);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${zipName}.zip`);

      setMsg(`Completed! ${zipName}.zip downloaded (${list.length} photos in ${duration}s).`);
      setTimeout(close, 2500);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
    }
  };
})();
