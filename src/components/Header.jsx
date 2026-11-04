import React from 'react';

export default function Header({
  connection,
  connectedUsbDeviceCount,
  isUsbActionPending,
  onConnectUsb,
  onDisconnectUsb,
  onOpenComModal
}) {
  const { baudRate } = connection;
  const isConnected = Boolean(
    connection.isHardwareSerial &&
    connection.isConnected &&
    connection.serialPort?.connected &&
    connection.serialPort?.readable &&
    connection.serialPort?.writable &&
    connection.serialReader &&
    (connection.communicationMode === 'monitoring' || connection.serialWriter)
  );
  const portLabel = connection.portName || (connection.isHardwareSerial ? 'Select USB Device' : 'Simulation');
  const connectionType = connection.isHardwareSerial ? 'USB Serial' : 'Simulation';
  const connectionHint = isConnected
    ? `USB serial port connected to ${portLabel}${connection.communicationMode === 'monitoring' ? ' (receive only)' : ''}.`
    : connection.isHardwareSerial && connection.portName
      ? `${portLabel} is saved, but not open. Click here to view USB status and connect.`
      : 'Click to view USB status and configure the serial connection.';

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="app-logo">
          <svg className="bolt-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .73.27.56.57L11 21z" />
          </svg>
        </div>
        <h1 className="app-title">Energy Meter Simulator</h1>
        <span className="header-divider">|</span>
        <span className="app-subtitle">Single Phase</span>
      </div>

      <div className="header-right">
        {/* Connection Status & Port Indicators */}
        <div className="serial-status-group">
          <button
            type="button"
            className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
            aria-live="polite"
            onClick={onOpenComModal}
            title={connectionHint}
          >
            <span className="status-dot"></span>
            <span className="status-text">{isConnected ? 'Connected' : 'Not Connected'}</span>
          </button>

          <span className="status-sep">|</span>

          <span className="connection-type-label">{connectionType}</span>

          <span
            className="device-count-label"
            title="Connected USB serial devices visible to this app. Windows COM ports that have not been authorized are not included."
          >
            USB devices: {connectedUsbDeviceCount}
          </span>

          <span className="status-sep">|</span>

          <div
            className="com-port-selector"
            onClick={onOpenComModal}
            title={isConnected
              ? `Connected to ${portLabel}`
              : connection.isHardwareSerial && connection.portName
                ? `${portLabel} saved, not connected`
                : 'Configure Serial Port'}
          >
            <span className="com-icon">🔌</span>
            <span>{portLabel}</span>
            <svg className="chevron-down" viewBox="0 0 24 24" width="12" height="12">
              <path fill="currentColor" d="M7 10l5 5 5-5z" />
            </svg>
          </div>

          <span className="status-sep">|</span>

          <div
            className="baud-selector"
            onClick={onOpenComModal}
            title="Configure Baud Rate"
          >
            <span>{baudRate} bps</span>
            <svg className="chevron-down" viewBox="0 0 24 24" width="12" height="12">
              <path fill="currentColor" d="M7 10l5 5 5-5z" />
            </svg>
          </div>
        </div>

        <button
          type="button"
          className={`header-tool-btn usb-dashboard-action ${isConnected ? 'disconnect' : 'connect'}`}
          onClick={isConnected ? onDisconnectUsb : onConnectUsb}
          disabled={isUsbActionPending}
        >
          {isUsbActionPending ? 'Working…' : isConnected ? 'Disconnect' : 'Connect USB'}
        </button>
      </div>
    </header>
  );
}
