export default function FooterControls({
  onReset,
  onSendFrame,
  isSending,
  isAutoStreaming,
  onToggleTerminal,
  isTerminalOpen
}) {
  return (
    <footer className="app-footer">
      <div className="footer-section actions-section">
        <button
          type="button"
          className={`action-btn btn-terminal ${isTerminalOpen ? 'active' : ''}`}
          onClick={onToggleTerminal}
          aria-expanded={isTerminalOpen}
          title="Open the in-app serial transmission terminal"
        >
          <span aria-hidden="true">&gt;_</span>
          <span>Terminal</span>
        </button>

        <button
          type="button"
          className="action-btn btn-reset"
          onClick={onReset}
          title="Reset all parameters to default"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
          </svg>
          <span>Reset</span>
        </button>

        <button
          type="button"
          className={`action-btn btn-send ${isSending ? 'sending' : ''} ${isAutoStreaming ? 'active' : ''}`}
          onClick={onSendFrame}
          disabled={isSending}
          aria-busy={isSending || isAutoStreaming}
          aria-pressed={isAutoStreaming}
          title={isAutoStreaming
            ? 'Stop automatic UART transmission'
            : 'Send now and start timed UART transmission'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            {isAutoStreaming
              ? <path d="M6 6h12v12H6z" />
              : <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />}
          </svg>
          <span>
            {isSending
              ? 'Sending...'
              : isAutoStreaming
                ? 'Stop Auto-send'
                : 'Send to Device'}
          </span>
        </button>
      </div>
    </footer>
  );
}
