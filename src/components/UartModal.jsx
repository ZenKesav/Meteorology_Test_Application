import React, { useState } from 'react';
import { generateUartMessage, generateCStructCode } from '../utils/uartProtocol.js';
import { PARAM_DEFINITIONS } from '../constants/parameters.js';

export default function UartModal({
  isOpen,
  counts,
  packetsSent,
  isTxActive,
  communicationMode,
  receivedData,
  receivedHexData,
  onClose
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const rawFrame = generateUartMessage(counts, PARAM_DEFINITIONS);
  const cStructCode = generateCStructCode(counts);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawFrame).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="modal-backdrop active" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-badge">SRS v1.4 Spec</span>
            <h3>UART Message Format & Renesas RL78 C Structure</h3>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* UART Frame View */}
          <div className="spec-section">
            <h4>Live Formatted Serial Frame (Web App → RL78 Controller)</h4>
            <div className="frame-code-box">
              <code>{rawFrame}</code>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="spec-note">
              Frames contain the load command and parameter values without a payload timestamp. JSON uses engineering units and ends with carriage return and line feed (<code>&lt;CR&gt;&lt;LF&gt;</code>); received ASCII is shown as received.
            </p>
          </div>

          {/* C Structure Definition */}
          <div className="spec-section">
            <h4>Corresponding C Structure Definition (18 Bytes Static Allocation)</h4>
            <div className="code-preview-block">
              <pre>
                <code>{cStructCode}</code>
              </pre>
            </div>
          </div>

          <div className="spec-section">
            <h4>Received UART Data ({communicationMode === 'monitoring' ? 'receive only' : 'ASCII and hexadecimal'})</h4>
            <label className="received-data-label" htmlFor="received-uart-ascii">ASCII</label>
            <pre id="received-uart-ascii" className="serial-receive-output" aria-live="polite">
              {receivedData || 'Waiting for serial data...'}
            </pre>
            <label className="received-data-label" htmlFor="received-uart-hex">Hexadecimal</label>
            <pre id="received-uart-hex" className="serial-receive-output serial-receive-hex">
              {receivedHexData || 'No bytes received yet.'}
            </pre>
          </div>

        </div>

        <div className="modal-footer">
          <div className="tx-stats">
            <span>Packets Sent: <b>{packetsSent}</b></span>
            <span className={`tx-dot ${isTxActive ? 'active' : ''}`}></span>
          </div>
          <button className="btn-close-modal" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
