import React from 'react';
import { Camera, Lightbulb, Zap, Lock, FolderArchive } from '@react-zero-ui/icon-sprite';
import { DownloaderForm } from '@/components/DownloaderForm';

export default function HomePage(): React.ReactElement {
  return (
    <>
      <div className="background-glow" />

      <main className="container">
        <header className="header">
          <div className="badge">
            <Camera size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Next.js & TypeScript • Multithreaded Engine
          </div>
          <h1>Facebook Post Photo Downloader</h1>
          <p className="subtitle">
            Download all photos from any Facebook post in maximum resolution into a .ZIP archive with multithreaded asynchronous acceleration.
          </p>
        </header>

        <div className="card main-card">
          <DownloaderForm />
        </div>

        {/* Support section for private posts / active session */}
        <div className="card info-card">
          <div className="info-header">
            <span className="label-icon">
              <Lightbulb size={20} />
            </span>
            <h2>Is the post private or from a closed group?</h2>
          </div>
          <p>
            Facebook restricts posts that require an active logged-in session. To download photos from private posts, groups, or friends without restrictions, you can use the <strong>Browser Script (Tampermonkey / Console)</strong> included in this project:
          </p>
          <div className="userscript-badge-row">
            <div className="badge-tag">
              <Zap size={14} />
              <span>100% in your browser</span>
            </div>
            <div className="badge-tag">
              <Lock size={14} />
              <span>Uses your active session</span>
            </div>
            <div className="badge-tag">
              <FolderArchive size={14} />
              <span>Multithreaded parallel download</span>
            </div>
          </div>
          <p className="file-mention">
            Script file available at: <code>userscript/fb-post-downloader.user.js</code>
          </p>
        </div>
      </main>
    </>
  );
}
