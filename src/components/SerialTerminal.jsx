import React, { useEffect, useRef, useState } from 'react';
import writeExcelFile from 'write-excel-file/browser';

function formatLocalDate(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function SerialTerminal({
  isOpen,
  entries,
  onClose,
  onClear,
  onExportSuccess,
  onExportError
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const outputRef = useRef(null);
  const shouldFollowLatestRef = useRef(true);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
      return;
    }
    shouldFollowLatestRef.current = true;
  }, [isOpen]);

  useEffect(() => {
    const output = outputRef.current;
    if (!isOpen || !output || !shouldFollowLatestRef.current) return;
    output.scrollTop = output.scrollHeight;
    output.scrollLeft = output.scrollWidth;
  }, [isOpen, isExpanded, entries]);

  const handleOutputScroll = (event) => {
    const output = event.currentTarget;
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 16;
    const atRight = output.scrollWidth - output.scrollLeft - output.clientWidth < 16;
    shouldFollowLatestRef.current = atBottom && atRight;
  };

  const handleDownload = async () => {
    try {
      const worksheet = [
        ['Date', 'Time', 'Direction', 'Device Name', 'Received/Sent Data'],
        ...entries.map((entry) => [
          formatLocalDate(entry.timestamp),
          formatLocalTime(entry.timestamp),
          entry.direction,
          entry.deviceName,
          entry.data
        ])
      ];
      await writeExcelFile(worksheet).toFile(
        `Energy_Meter_Serial_Logs_${formatLocalDate(Date.now())}.xlsx`
      );
      onExportSuccess?.();
    } catch (error) {
      const exportError = error instanceof Error ? error : new Error(String(error));
      if (onExportError) onExportError(exportError);
      else throw exportError;
    }
  };

  if (!isOpen) return null;

  return (
    <section
      className={`serial-terminal ${isExpanded ? 'expanded' : ''}`}
      aria-label="Serial terminal"
    >
      <header className="serial-terminal-header">
        <div>
          <strong>Serial Terminal</strong>
          <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div className="serial-terminal-actions">
          <button type="button" onClick={onClear} disabled={entries.length === 0}>Clear</button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={entries.length === 0}
            aria-label="Download serial logs as Excel"
            title="Download all serial logs as an Excel workbook"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 17v4h14v-4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-label={isExpanded ? 'Exit fullscreen' : 'Expand serial terminal'}
            aria-pressed={isExpanded}
            title={isExpanded ? 'Exit fullscreen' : 'Expand terminal to full screen'}
          >
            {isExpanded ? 'Exit fullscreen' : '⛶'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close serial terminal">×</button>
        </div>
      </header>
      <div
        className="serial-terminal-output"
        ref={outputRef}
        onScroll={handleOutputScroll}
        role="log"
        aria-live="polite"
      >
        {entries.length ? entries.map((entry) => (
          <div className="serial-terminal-entry" key={entry.id}>
            <span className="serial-terminal-time">
              {formatLocalDate(entry.timestamp)} {formatLocalTime(entry.timestamp)}
            </span>
            <span className={`serial-terminal-direction ${entry.direction.toLowerCase()}`}>
              {entry.direction}
            </span>
            <span className="serial-terminal-destination">{entry.deviceName}</span>
            <code title={entry.data}>{entry.data}</code>
          </div>
        )) : (
          <p className="serial-terminal-empty">Received UART messages will appear here.</p>
        )}
      </div>
    </section>
  );
}
