import React, { useEffect, useMemo, useState } from 'react';

export default function SimulationInfo({
  updateInterval,
  onUpdateIntervalChange,
  sendingCount,
  packetLimit,
  autoPacketsSent,
  onPacketLimitChange,
  isAutoStreaming,
  autoSendStatus
}) {
  const [clockString, setClockString] = useState('');
  const [intervalUnit, setIntervalUnit] = useState(
    updateInterval % 60000 === 0 ? 'minutes' : 'seconds'
  );
  const intervalMultiplier = intervalUnit === 'minutes' ? 60000 : 1000;
  const intervalValue = useMemo(
    () => Math.max(1, Math.round(updateInterval / intervalMultiplier)),
    [updateInterval, intervalMultiplier]
  );
  const [intervalInput, setIntervalInput] = useState(String(intervalValue));
  const [packetLimitInput, setPacketLimitInput] = useState(String(packetLimit));

  useEffect(() => {
    setIntervalInput(String(intervalValue));
  }, [intervalValue]);

  useEffect(() => {
    setPacketLimitInput(String(packetLimit));
  }, [packetLimit]);

  useEffect(() => {
    const pad = (value) => String(value).padStart(2, '0');
    const updateTime = () => {
      const now = new Date();
      setClockString(
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="simulation-info" aria-label="Simulation Info">
      <div className="simulation-info-heading">
        <div className="panel-header-icon blue-calc" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <span className="simulation-info-title">Simulation Info</span>
      </div>

      <div className="sim-details-row">
        <div className="sim-item">
          <span className="sim-lbl">Current time</span>
          <time className="sim-val sim-time" dateTime={clockString.replace(' ', 'T')}>{clockString}</time>
        </div>
        <div className="sim-item">
          <span className="sim-lbl">Operating mode</span>
          <span className="sim-val sim-mode">Single Phase</span>
        </div>
        <div className="sim-item">
          <label className="sim-lbl" htmlFor="simulation-interval">Update interval</label>
          <div className="interval-input-wrap">
            <input
              id="simulation-interval"
              className="interval-number-input"
              type="number"
              min="1"
              max={intervalUnit === 'minutes' ? 1440 : 86400}
              step="1"
              value={intervalInput}
              aria-label="Update interval value"
              onChange={(event) => {
                setIntervalInput(event.target.value);
              }}
              onBlur={() => {
                const nextValue = Number(intervalInput);
                if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
                  setIntervalInput(String(intervalValue));
                  return;
                }
                onUpdateIntervalChange(nextValue * intervalMultiplier);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <select
              className="interval-unit-select"
              aria-label="Update interval unit"
              value={intervalUnit}
              onChange={(event) => {
                const nextUnit = event.target.value;
                const nextMultiplier = nextUnit === 'minutes' ? 60000 : 1000;
                const nextValue = Math.max(1, Math.round(updateInterval / nextMultiplier));
                setIntervalUnit(nextUnit);
                onUpdateIntervalChange(nextValue * nextMultiplier);
              }}
            >
              <option value="seconds">sec</option>
              <option value="minutes">min</option>
            </select>
          </div>
        </div>
        <div className="sim-item">
          <label className="sim-lbl" htmlFor="auto-send-limit">Auto-send limit (0 = unlimited)</label>
          <input
            id="auto-send-limit"
            className="interval-number-input packet-limit-input"
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            value={packetLimitInput}
            onChange={(event) => {
              setPacketLimitInput(event.target.value);
            }}
            onBlur={() => {
              const nextLimit = Number(packetLimitInput);
              if (!packetLimitInput.trim() || !Number.isSafeInteger(nextLimit) || nextLimit < 0) {
                setPacketLimitInput(String(packetLimit));
                return;
              }
              onPacketLimitChange(nextLimit);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <span className="sim-lbl sent-total-label" aria-live="polite">
            Sent total: <strong>{sendingCount}</strong>
          </span>
        </div>
      </div>
      <div className="auto-send-controls">
        <span className={`auto-send-status ${isAutoStreaming ? 'running' : ''}`} role="status" aria-live="polite">
          {autoSendStatus}
          {isAutoStreaming && packetLimit > 0
            ? ` · Every ${intervalValue} ${intervalUnit === 'minutes' ? 'min' : 'sec'} · ${autoPacketsSent} / ${packetLimit} sent`
            : isAutoStreaming
              ? ` · Every ${intervalValue} ${intervalUnit === 'minutes' ? 'min' : 'sec'} · ${autoPacketsSent} sent`
            : ''}
        </span>
      </div>
    </section>
  );
}
