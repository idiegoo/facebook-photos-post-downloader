'use client';

import React, { useEffect, useRef } from 'react';

export interface ConsoleLogEntry {
  id: string;
  time: string;
  text: string;
  isHighlight?: boolean;
}

export interface StatusPanelProps {
  visible: boolean;
  title: string;
  subtitle: string;
  progressPercent: number;
  isLoading: boolean;
  isError: boolean;
  logs: ConsoleLogEntry[];
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  visible,
  title,
  subtitle,
  progressPercent,
  isLoading,
  isError,
  logs
}) => {
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!visible) return null;

  return (
    <div className="status-panel">
      <div className="status-header">
        {isLoading ? <div className="spinner" /> : null}
        <div className="status-title-container">
          <h3 style={{ color: isError ? '#ef4444' : '#f3f4f6' }}>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{
            width: `${Math.min(100, Math.max(0, progressPercent))}%`,
            background: isError ? '#ef4444' : undefined
          }}
        />
      </div>

      <div className="console-box" role="log" aria-live="polite">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`console-line ${log.isHighlight ? 'console-line-highlight' : ''}`}
          >
            [{log.time}] {log.text}
          </div>
        ))}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
