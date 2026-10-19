// ==UserScript==
// @name         Facebook Post Photo Downloader (ZIP - Multithreaded)
// @namespace    https://github.com/
// @version      1.3.0
// @description  Download all photos from any Facebook post into a ZIP archive with asynchronous multithreading.
// @author       Antigravity
// @match        https://*.facebook.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      fbcdn.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Concurrency pool for parallel downloads in browser
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

  function createFloatingButton() {
    if (document.getElementById('fb-zip-dl-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'fb-zip-dl-btn';
    btn.innerHTML = 'Download Photos as ZIP';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '999999',
      backgroundColor: '#1877f2',
      color: '#ffffff',
      border: 'none',
      borderRadius: '50px',
      padding: '12px 22px',
      fontSize: '14px',
      fontWeight: 'bold',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      cursor: 'pointer',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      transition: 'all 0.2s ease'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.backgroundColor = '#166fe5';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.backgroundColor = '#1877f2';
    });

    btn.addEventListener('click', showDownloadModal);
    document.body.appendChild(btn);
  }

  function showDownloadModal() {
    let existingModal = document.getElementById('fb-zip-modal');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fb-zip-modal';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      zIndex: '1000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(5px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      backgroundColor: '#242526',
      color: '#e4e6eb',
      padding: '28px',
      borderRadius: '16px',
      width: '440px',
      maxWidth: '90%',
      boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    });

    modal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0; font-size:18px; color:#ffffff;">Download Photos (Multithreaded)</h3>
        <button id="fb-zip-close" style="background:none; border:none; color:#b0b3b8; font-size:22px; cursor:pointer;">&times;</button>
      </div>
      <p style="margin:0; font-size:13px; color:#b0b3b8; line-height:1.4;">
        Parallel downloading with async acceleration. Set file name and thread count:
      </p>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#e4e6eb;">ZIP File Name:</label>
        <div style="display:flex; align-items:center; background:#3a3b3c; border-radius:8px; border:1px solid #4e4f50; overflow:hidden;">
          <input id="fb-zip-filename" type="text" value="facebook_photos" placeholder="e.g. vacation_photos" 
            style="width:100%; padding:10px 14px; background:transparent; border:none; color:#ffffff; font-size:14px; outline:none;" />
          <span style="padding:0 12px; color:#b0b3b8; font-size:13px; font-weight:600; border-left:1px solid #4e4f50;">.zip</span>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#e4e6eb;">Parallel Threads (Concurrency):</label>
        <select id="fb-zip-threads" style="width:100%; padding:9px 12px; background:#3a3b3c; border:1px solid #4e4f50; border-radius:8px; color:#ffffff; font-size:13px; outline:none;">
          <option value="4">4 parallel threads</option>
          <option value="6" selected>6 parallel threads (Recommended)</option>
          <option value="8">8 parallel threads (High speed)</option>
          <option value="12">12 parallel threads (Maximum)</option>
        </select>
      </div>
      <div id="fb-zip-progress" style="display:none; font-size:13px; color:#2e89ff; font-weight:500;">
        <div id="fb-zip-status-text">Scanning photos in high resolution...</div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
        <button id="fb-zip-cancel-btn" style="padding:9px 16px; background:#3a3b3c; color:#e4e6eb; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Cancel</button>
        <button id="fb-zip-start-btn" style="padding:9px 18px; background:#1877f2; color:#ffffff; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Download ZIP</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const inputName = modal.querySelector('#fb-zip-filename');
    const selectThreads = modal.querySelector('#fb-zip-threads');
    const startBtn = modal.querySelector('#fb-zip-start-btn');
    const cancelBtn = modal.querySelector('#fb-zip-cancel-btn');
    const closeBtn = modal.querySelector('#fb-zip-close');
    const progressDiv = modal.querySelector('#fb-zip-progress');
    const statusText = modal.querySelector('#fb-zip-status-text');

    inputName.focus();
    inputName.select();

    const closeModal = () => overlay.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    startBtn.addEventListener('click', async () => {
      const zipName = (inputName.value.trim() || 'facebook_photos').replace(/[/\\?%*:|"<>]/g, '_');
      const concurrency = parseInt(selectThreads.value, 10) || 6;
      startBtn.disabled = true;
      cancelBtn.disabled = true;
      startBtn.style.opacity = '0.6';
      progressDiv.style.display = 'block';

      try {
        await processAndDownloadZip(zipName, concurrency, (msg) => {
          statusText.textContent = msg;
        });
        setTimeout(closeModal, 2500);
      } catch (err) {
        statusText.textContent = 'Error: ' + err.message;
        statusText.style.color = '#fa383e';
        startBtn.disabled = false;
        cancelBtn.disabled = false;
        startBtn.style.opacity = '1';
      }
    });
  }

  function fetchImageBlob(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          responseType: 'blob',
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve(res.response);
            } else {
              reject(new Error(`HTTP ${res.status}`));
            }
          },
          onerror: reject
        });
      } else {
        fetch(url)
          .then((r) => r.blob())
          .then(resolve)
          .catch(reject);
      }
    });
  }

  async function processAndDownloadZip(zipName, concurrency, updateStatus) {
    updateStatus('Opening photo viewer and detecting post photos...');

    const isDialog = !!document.querySelector('div[role="dialog"]') || window.location.href.includes('/photo');
    if (!isDialog) {
      const firstPhoto = document.querySelector('a[href*="/photo"], a[href*="fbid="], [data-visualcompletion="media-vc-image"] img');
      if (firstPhoto) {
        firstPhoto.click();
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
          updateStatus(`Gallery traversed completely (${images.size} photos found).`);
          break;
        }
        seenFbids.add(fbid);
      }

      // Find the main theater photo with maximum area
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
        updateStatus(`Searching photos: ${images.size} found...`);
      }

      // Advance to next photo
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

      // Wait for URL/fbid to change
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

    const imageList = Array.from(images);
    if (imageList.length === 0) {
      throw new Error('No photos detected in this post.');
    }

    updateStatus(`Downloading ${imageList.length} photos in parallel (${concurrency} threads)...`);
    const zip = new JSZip();
    const downloadStart = Date.now();

    // Multithreaded download via browserAsyncPool
    await browserAsyncPool(
      imageList,
      concurrency,
      async (url, idx) => {
        const blob = await fetchImageBlob(url);
        const num = String(idx + 1).padStart(2, '0');
        zip.file(`${zipName}_${num}.jpg`, blob);
      },
      (completed, total, active) => {
        updateStatus(`Downloaded ${completed}/${total} photos (${active} active threads)...`);
      }
    );

    const duration = ((Date.now() - downloadStart) / 1000).toFixed(1);
    const speed = (imageList.length / (parseFloat(duration) || 1)).toFixed(1);

    updateStatus(`Compressing ZIP archive (${duration}s at ~${speed} photos/s)...`);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${zipName}.zip`);

    updateStatus(`Completed! ${zipName}.zip downloaded (${imageList.length} photos in ${duration}s).`);
  }

  window.addEventListener('load', () => setTimeout(createFloatingButton, 1000));
  setInterval(createFloatingButton, 3000);
})();
