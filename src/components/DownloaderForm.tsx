'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, Zap, Package, Download } from '@react-zero-ui/icon-sprite';
import { StatusPanel, type ConsoleLogEntry } from './StatusPanel';
import type { ProgressEventPayload } from '@/types/progress';

export const DownloaderForm: React.FC = () => {
  const [postUrl, setPostUrl] = useState<string>('');
  const [zipName, setZipName] = useState<string>('facebook_photos');
  const [concurrency, setConcurrency] = useState<string>('6');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showStatus, setShowStatus] = useState<boolean>(false);
  const [statusTitle, setStatusTitle] = useState<string>('');
  const [statusSubtitle, setStatusSubtitle] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isError, setIsError] = useState<boolean>(false);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const addLog = useCallback((text: string, isHighlight = false): void => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setLogs((prev) => [...prev, { id, time, text, isHighlight }]);
  }, []);

  const cleanupSSE = useCallback((): void => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupSSE();
    };
  }, [cleanupSSE]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();

    const cleanUrl = postUrl.trim();
    const cleanZipName = (zipName.trim() || 'facebook_photos').replace(/[/\\?%*:|"<>]/g, '_');

    if (!cleanUrl) {
      alert('Please enter a Facebook post URL.');
      return;
    }

    cleanupSSE();

    setIsLoading(true);
    setShowStatus(true);
    setIsError(false);
    setLogs([]);
    setStatusTitle('Starting process...');
    setStatusSubtitle(`Connecting to concurrency engine (${concurrency} threads)...`);
    setProgressPercent(10);

    addLog(`Request initiated for: ${cleanUrl}`);
    addLog(`Configuration: ${concurrency} simultaneous download threads (Multithreading)`, true);
    addLog(`ZIP archive name: ${cleanZipName}.zip`);

    const sessionId = `session_${Math.random().toString(36).substring(2, 10)}`;

    const eventSource = new EventSource(`/api/progress/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event: MessageEvent<string>): void => {
      try {
        const data: ProgressEventPayload = JSON.parse(event.data);
        if (data.message) {
          addLog(data.message, data.stage === 'completed' || data.stage === 'zipping');
        }

        switch (data.stage) {
          case 'connected':
            setStatusTitle('Connected');
            setStatusSubtitle(`Async engine ready (${concurrency} threads)`);
            setProgressPercent(15);
            break;
          case 'browser_launch':
            setStatusTitle('Launching browser');
            setStatusSubtitle('Preparing scraping environment...');
            setProgressPercent(20);
            break;
          case 'navigating':
            setStatusTitle('Loading post');
            setStatusSubtitle('Accessing Facebook...');
            setProgressPercent(30);
            break;
          case 'inspecting':
          case 'theater_mode':
            setStatusTitle('Extracting photos');
            setStatusSubtitle('Scanning photos in maximum resolution...');
            setProgressPercent(45);
            break;
          case 'batch_scraping':
          case 'batch_start':
            setStatusTitle('Batch scraping');
            setStatusSubtitle('Processing posts concurrently...');
            setProgressPercent(40);
            break;
          case 'found_image':
            setStatusTitle('Detecting photos');
            setStatusSubtitle(`${data.count ?? 0} photos found...`);
            setProgressPercent(55);
            break;
          case 'zipping':
            setStatusTitle('Starting download');
            setStatusSubtitle(`Preparing ${data.count ?? 0} photos with ${concurrency} threads...`);
            setProgressPercent(60);
            break;
          case 'downloading_file': {
            const current = data.current ?? 1;
            const total = data.total ?? 1;
            const threads = data.activeThreads ?? concurrency;
            const pct = 60 + Math.floor((current / total) * 35);
            setStatusTitle(`Multithreaded download (${threads} active)`);
            setStatusSubtitle(`Photo ${current} of ${total} completed`);
            setProgressPercent(pct);
            break;
          }
          case 'completed': {
            const duration = data.downloadDuration ? ` in ${data.downloadDuration}s` : '';
            const rate = data.photosPerSec ? ` (~${data.photosPerSec} photos/s)` : '';
            setStatusTitle('Download completed!');
            setStatusSubtitle(`Download finished${duration}${rate}.`);
            setProgressPercent(100);
            setIsLoading(false);
            cleanupSSE();
            break;
          }
          case 'error':
            setStatusTitle('An error occurred');
            setStatusSubtitle(data.message || 'Could not download photos.');
            setIsError(true);
            setProgressPercent(100);
            setIsLoading(false);
            cleanupSSE();
            break;
        }
      } catch (err: unknown) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (): void => {
      cleanupSSE();
    };

    const downloadUrl = `/api/download?url=${encodeURIComponent(cleanUrl)}&name=${encodeURIComponent(cleanZipName)}&concurrency=${encodeURIComponent(concurrency)}&sessionId=${sessionId}`;

    if (iframeRef.current) {
      iframeRef.current.src = downloadUrl;
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} id="downloadForm">
        <div className="form-group">
          <label htmlFor="postUrl">
            <span className="label-icon">
              <Link size={18} />
            </span>
            <span>Facebook Post URL</span>
          </label>
          <div className="input-wrapper">
            <input
              type="text"
              id="postUrl"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://www.facebook.com/... (or multiple URLs separated by commas)"
              required
              autoComplete="off"
            />
          </div>
          <span className="helper-text">
            Supports single post URLs, photo albums, or multiple URLs separated by commas.
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="concurrency">
            <span className="label-icon">
              <Zap size={18} />
            </span>
            <span>Concurrency / Parallel Threads (Multithreading)</span>
          </label>
          <div className="input-wrapper">
            <select
              id="concurrency"
              className="select-input"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
            >
              <option value="4">4 parallel threads</option>
              <option value="6">6 parallel threads (Recommended - Optimal balance)</option>
              <option value="8">8 parallel threads (High speed)</option>
              <option value="12">12 parallel threads (High bandwidth connections)</option>
            </select>
          </div>
          <span className="helper-text">
            Concurrent asynchronous downloading and processing to accelerate the task up to 800%.
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="zipName">
            <span className="label-icon">
              <Package size={18} />
            </span>
            <span>ZIP File Name</span>
          </label>
          <div className="input-wrapper zip-input-wrapper">
            <input
              type="text"
              id="zipName"
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              placeholder="my_vacation_photos"
              required
              autoComplete="off"
            />
            <span className="extension-pill">.zip</span>
          </div>
          <span className="helper-text">Choose the name for the downloaded ZIP archive.</span>
        </div>

        <button type="submit" id="submitBtn" className="btn-primary" disabled={isLoading}>
          <span className="btn-icon">
            <Download size={20} />
          </span>
          <span className="btn-text">
            {isLoading ? 'Processing parallel download...' : 'Download Photos as ZIP'}
          </span>
        </button>
      </form>

      <StatusPanel
        visible={showStatus}
        title={statusTitle}
        subtitle={statusSubtitle}
        progressPercent={progressPercent}
        isLoading={isLoading}
        isError={isError}
        logs={logs}
      />

      <iframe ref={iframeRef} style={{ display: 'none' }} title="hidden-download-iframe" />
    </>
  );
};
