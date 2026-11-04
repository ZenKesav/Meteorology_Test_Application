import React, { useEffect, useState } from 'react';

const STANDARD_BAUD_RATES = [
  110, 300, 600, 1200, 2400, 4800, 9600, 14400,
  19200, 28800, 38400, 56000, 57600, 115200, 230400
];

const getBaudRateOption = (rate) => (
  STANDARD_BAUD_RATES.includes(rate) ? String(rate) : 'custom'
);

function getPortLabel(port, index) {
  const { usbVendorId, usbProductId } = port.getInfo();
  if (usbVendorId === 0x10c4) {
    return 'Silicon Labs CP210x USB to UART Bridge';
  }
  if (usbVendorId == null && usbProductId == null) {
    return `Authorized USB serial device ${index + 1}`;
  }
  const vendor = usbVendorId == null ? '----' : usbVendorId.toString(16).padStart(4, '0');
  const product = usbProductId == null ? '----' : usbProductId.toString(16).padStart(4, '0');
  return `USB serial device (${vendor} : ${product})`;
}

function getPortIdentityKey(port) {
  const { usbVendorId, usbProductId } = port.getInfo();
  return usbVendorId == null && usbProductId == null
    ? null
    : `${usbVendorId ?? ''}:${usbProductId ?? ''}`;
}

export default function ComModal({
  isOpen,
  connection,
  onSave,
  onClose
}) {
  const [portMode, setPortMode] = useState(connection.isHardwareSerial ? 'webserial' : 'simulated');
  const [baudRate, setBaudRate] = useState(
    connection.isHardwareSerial && !connection.baudRateConfirmed
      ? ''
      : getBaudRateOption(connection.baudRate)
  );
  const [customBaudRate, setCustomBaudRate] = useState(connection.baudRate);
  const [dataBits, setDataBits] = useState(String(connection.dataBits ?? 8));
  const [parity, setParity] = useState(connection.parity ?? 'none');
  const [stopBits, setStopBits] = useState(String(connection.stopBits ?? 1));
  const [communicationMode, setCommunicationMode] = useState(connection.communicationMode ?? 'sendReceive');
  const [authorizedPorts, setAuthorizedPorts] = useState([]);
  const [serialError, setSerialError] = useState('');
  const [isSelectingDevice, setIsSelectingDevice] = useState(false);
  const serialSupported = typeof navigator !== 'undefined' && Boolean(navigator.serial);
  const isConnectedToApp = Boolean(
    connection.isHardwareSerial &&
    connection.isConnected &&
    authorizedPorts.some((port) => port === connection.serialPort)
  );
  const deviceCountLabel = authorizedPorts.length === 1
    ? '1 device detected'
    : `${authorizedPorts.length} devices detected`;

  useEffect(() => {
    if (!isOpen) return;
    setPortMode(connection.isHardwareSerial ? 'webserial' : 'simulated');
    setBaudRate(connection.isHardwareSerial && !connection.baudRateConfirmed
      ? ''
      : getBaudRateOption(connection.baudRate));
    setCustomBaudRate(connection.baudRate);
    setDataBits(String(connection.dataBits ?? 8));
    setParity(connection.parity ?? 'none');
    setStopBits(String(connection.stopBits ?? 1));
    setCommunicationMode(connection.communicationMode ?? 'sendReceive');
    setAuthorizedPorts([]);
    setSerialError('');
  }, [isOpen, connection.baudRate, connection.baudRateConfirmed, connection.dataBits, connection.parity, connection.stopBits, connection.communicationMode, connection.isHardwareSerial]);

  useEffect(() => {
    if (!isOpen || portMode !== 'webserial' || !serialSupported) return undefined;
    let active = true;
    const refreshPorts = () => navigator.serial.getPorts().then((ports) => {
      if (!active) return;
      const connectedPorts = ports.filter((port) => port.connected);
      setAuthorizedPorts(connectedPorts);
    }).catch((err) => {
      console.error('Unable to list authorized USB serial channels:', err);
      if (active) setSerialError(`Unable to list authorized USB devices: ${err.message}`);
    });
    const handlePortChange = () => {
      void refreshPorts();
    };
    void refreshPorts();
    navigator.serial.addEventListener('connect', handlePortChange);
    navigator.serial.addEventListener('disconnect', handlePortChange);
    return () => {
      active = false;
      navigator.serial.removeEventListener('connect', handlePortChange);
      navigator.serial.removeEventListener('disconnect', handlePortChange);
    };
  }, [isOpen, portMode, serialSupported]);

  if (!isOpen) return null;

  const getSerialSettings = () => {
    const selectedBaudRate = baudRate === 'custom' ? Number(customBaudRate) : Number(baudRate);
    if (!baudRate || !Number.isSafeInteger(selectedBaudRate) || selectedBaudRate < 1) {
      setSerialError('Select a valid baud rate before connecting.');
      return null;
    }

    const selectedDataBits = Number(dataBits);
    if (![7, 8].includes(selectedDataBits)) {
      setSerialError('Data Bits must be 7 or 8. These are the values supported by the browser serial connection.');
      return null;
    }

    const selectedStopBits = Number(stopBits);
    if (![1, 2].includes(selectedStopBits)) {
      setSerialError('Stop Bits must be 1 or 2. These are the values supported by the browser serial connection.');
      return null;
    }

    return {
      portMode,
      baudRate: selectedBaudRate,
      dataBits: selectedDataBits,
      parity,
      stopBits: selectedStopBits,
      communicationMode
    };
  };

  const handleConnectUsbDevice = async () => {
    if (!serialSupported) {
      setSerialError('Web Serial is unavailable. Use a supported Chrome or Edge browser on a secure (HTTPS or localhost) page.');
      return;
    }

    const settings = getSerialSettings();
    if (!settings) return;

    setSerialError('');
    setIsSelectingDevice(true);
    try {
      const currentPort = connection.serialPort?.connected ? connection.serialPort : null;
      const selectedPort = currentPort ??
        (authorizedPorts.length === 1 ? authorizedPorts[0] : null) ??
        await navigator.serial.requestPort();
      const refreshedPorts = await navigator.serial.getPorts();
      const availablePorts = refreshedPorts.filter((port) => port.connected);
      if (selectedPort.connected && !availablePorts.includes(selectedPort)) {
        availablePorts.push(selectedPort);
      }
      if (!selectedPort.connected) {
        setSerialError('The selected USB device is not currently connected. Check the adapter and try again.');
        return;
      }

      setAuthorizedPorts(availablePorts);
      await onSave({
        ...settings,
        selectedPort,
        connectedDeviceCount: availablePorts.length
      });
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setSerialError('No device selected. Choose your USB-UART adapter in the browser dialog to connect.');
      } else if (err.name === 'SecurityError') {
        setSerialError('The browser blocked USB access. Allow serial devices for this page and try again.');
      } else {
        console.error('Unable to connect USB serial device:', err);
        setSerialError(`Unable to connect USB serial device: ${err.message}`);
      }
    } finally {
      setIsSelectingDevice(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (portMode === 'webserial') return;
    const settings = getSerialSettings();
    if (settings) onSave({ ...settings, selectedPort: null });
  };

  return (
    <div className="modal-backdrop active" onClick={onClose}>
      <div className="modal-window com-modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Communication Port Settings</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {portMode === 'webserial' && serialSupported && (
              <section className={`serial-device-panel ${isConnectedToApp ? 'connected' : ''}`} aria-live="polite">
                <div className="serial-device-panel-heading">
                  <div>
                    <span className="serial-device-panel-eyebrow">USB SERIAL STATUS</span>
                    <h4>{deviceCountLabel}</h4>
                  </div>
                  <span className={`serial-device-count ${authorizedPorts.length ? 'has-devices' : ''}`}>
                    {authorizedPorts.length}
                  </span>
                </div>
                <p className="serial-device-panel-note">
                  {isConnectedToApp
                    ? 'Your adapter is connected and ready to communicate.'
                    : authorizedPorts.length
                      ? 'The adapter is plugged in. Connect it below to start communication.'
                      : 'No authorized USB serial device is visible. Plug in your TTL adapter. The browser will ask permission the first time only.'}
                </p>
                {authorizedPorts.length > 0 && (
                  <div className="serial-device-list" role="list" aria-label="Connected USB serial devices">
                    {authorizedPorts.map((port, index) => {
                      const connectedToApp = connection.isConnected && connection.serialPort === port;
                      return (
                        <div
                          key={`${getPortIdentityKey(port) ?? 'device'}-${index}`}
                          className={`serial-device-entry ${connectedToApp ? 'active' : ''}`}
                          role="listitem"
                        >
                          <span className="serial-device-dot" aria-hidden="true"></span>
                          <span>{getPortLabel(port, index)}</span>
                          <span className="serial-device-state">
                            {connectedToApp ? 'Connected' : 'Ready'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <small className="serial-device-privacy-note">
                  This count includes connected devices this browser has permission to show, not every Windows COM port.
                </small>
              </section>
            )}

            {portMode === 'webserial' && !serialSupported && (
              <p className="serial-error" role="alert">
                USB serial is unavailable here. Open this page in Chrome or Edge using localhost or HTTPS.
              </p>
            )}

            <p className="modal-desc">
              Choose the communication mode and match the serial settings to your controller. The app stays on this page while connecting.
            </p>

            <fieldset className="communication-mode-fieldset">
              <legend>Communication Mode</legend>
              <label className="communication-mode-option">
                <input
                  type="radio"
                  name="communication-mode"
                  value="sendReceive"
                  checked={communicationMode === 'sendReceive'}
                  onChange={() => setCommunicationMode('sendReceive')}
                />
                <span>Send/Receive</span>
                <span className="communication-mode-icon" aria-hidden="true">
                  <span>1</span><span className="mode-arrow mode-arrow-forward">➜</span>
                  <span>2</span><span className="mode-arrow mode-arrow-return">⬅</span>
                </span>
              </label>
              <label className="communication-mode-option">
                <input
                  type="radio"
                  name="communication-mode"
                  value="monitoring"
                  checked={communicationMode === 'monitoring'}
                  onChange={() => setCommunicationMode('monitoring')}
                />
                <span>Monitoring<br />(receive only)</span>
                <span className="communication-mode-icon monitoring-icon" aria-hidden="true">
                  <span>1</span><span className="mode-arrow mode-arrow-forward">➜</span>
                  <span>2</span><span className="mode-arrow mode-arrow-return">⬅</span>
                  <span className="mode-arrow mode-arrow-monitor">↓</span>
                </span>
              </label>
            </fieldset>

            <div className="form-row">
              <label htmlFor="serial-port-mode">Connection Type</label>
              <select
                id="serial-port-mode"
                className="styled-select"
                value={portMode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setPortMode(nextMode);
                  if (nextMode === 'webserial' && !connection.isHardwareSerial) {
                    setBaudRate('');
                  } else if (nextMode === 'simulated' && !baudRate) {
                    setBaudRate(getBaudRateOption(connection.baudRate));
                  }
                }}
              >
                <option value="simulated">Simulation (no hardware)</option>
                <option value="webserial">Hardware USB Serial</option>
              </select>
            </div>

            <div className="form-row">
              {serialError && <p className="serial-error" role="alert">{serialError}</p>}
            </div>

            <div className="form-row">
              <label htmlFor="serial-baud-rate">Baud Rate</label>
              <select
                id="serial-baud-rate"
                className="styled-select"
                value={baudRate}
                required
                onChange={(e) => setBaudRate(e.target.value)}
              >
                <option value="">Select the baud rate from the RL78 configuration</option>
                {STANDARD_BAUD_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} bps{rate === 9600 ? ' (SRS Standard)' : ''}
                  </option>
                ))}
                <option value="custom">Custom Rate</option>
              </select>
            </div>

            {baudRate === 'custom' && (
              <div className="form-row">
                <label htmlFor="custom-baud-rate">Custom Baud Rate</label>
                <input
                  id="custom-baud-rate"
                  className="custom-baud-rate-input"
                  type="number"
                  min="1"
                  max={Number.MAX_SAFE_INTEGER}
                  step="1"
                  required
                  value={customBaudRate}
                  onChange={(e) => setCustomBaudRate(e.target.value)}
                />
              </div>
            )}

            <div className="serial-framing-row">
              <div className="form-row">
                <label htmlFor="serial-data-bits">Data Bits</label>
                <input
                  id="serial-data-bits"
                  className="custom-baud-rate-input"
                  type="number"
                  min="7"
                  max="8"
                  step="1"
                  list="serial-data-bit-options"
                  required
                  value={dataBits}
                  onChange={(e) => setDataBits(e.target.value)}
                />
                <datalist id="serial-data-bit-options">
                  <option value="7" />
                  <option value="8" />
                </datalist>
              </div>
              <div className="form-row">
                <label htmlFor="serial-parity">Parity</label>
                <select
                  id="serial-parity"
                  className="styled-select"
                  value={parity}
                  onChange={(e) => setParity(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="even">Even</option>
                  <option value="odd">Odd</option>
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="serial-stop-bits">Stop Bits</label>
                <input
                  id="serial-stop-bits"
                  className="custom-baud-rate-input"
                  type="number"
                  min="1"
                  max="2"
                  step="1"
                  list="serial-stop-bit-options"
                  required
                  value={stopBits}
                  onChange={(e) => setStopBits(e.target.value)}
                />
                <datalist id="serial-stop-bit-options">
                  <option value="1" />
                  <option value="2" />
                </datalist>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {portMode === 'webserial' ? (
              <button
                type="button"
                className="btn-primary"
                disabled={!serialSupported || isSelectingDevice}
                onClick={handleConnectUsbDevice}
              >
                {isSelectingDevice ? 'Connecting…' : 'Connect USB Device'}
              </button>
            ) : (
              <button type="submit" className="btn-primary">Apply Simulation Settings</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
