import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header.jsx';
import ParameterCard from './components/ParameterCard.jsx';
import PowerCalculation from './components/PowerCalculation.jsx';
import EnergyCalculation from './components/EnergyCalculation.jsx';
import FooterControls from './components/FooterControls.jsx';
import SimulationInfo from './components/SimulationInfo.jsx';
import UartModal from './components/UartModal.jsx';
import ComModal from './components/ComModal.jsx';
import SerialTerminal from './components/SerialTerminal.jsx';
import Toast from './components/Toast.jsx';

import { PARAM_DEFINITIONS } from './constants/parameters.js';
import { PRESET_VALUES } from './constants/presets.js';
import { calculatePowerAndEnergy, generateUartMessage } from './utils/uartProtocol.js';
import { extractCompleteSerialMessages } from './utils/serialReceiveBuffer.js';

const PARAMETER_ORDER = [
  'voltage',
  'phaseCurrent',
  'neutralCurrent',
  'powerFactorAngle',
  'phaseAngle',
  'neutralAngle'
];

const SERIAL_PREFERENCE_KEY = 'zenmeter.serial-device';

function readSerialPreference() {
  try {
    const preference = localStorage.getItem(SERIAL_PREFERENCE_KEY);
    return preference ? JSON.parse(preference) : null;
  } catch (err) {
    console.error('Unable to read saved USB serial device:', err);
    return null;
  }
}

function getSerialDeviceIdentity(port) {
  const { usbVendorId, usbProductId } = port.getInfo();
  if (usbVendorId == null && usbProductId == null) return null;
  return { usbVendorId: usbVendorId ?? null, usbProductId: usbProductId ?? null };
}

function getSerialPortDisplayName(port) {
  const { usbVendorId, usbProductId } = getSerialDeviceIdentity(port) ?? {};
  if (usbVendorId === 0x10c4) return 'Silicon Labs CP210x USB to UART Bridge';
  if (usbVendorId == null && usbProductId == null) return 'Authorized USB serial device';
  const vendor = usbVendorId == null ? '----' : usbVendorId.toString(16).padStart(4, '0');
  const product = usbProductId == null ? '----' : usbProductId.toString(16).padStart(4, '0');
  return `USB serial device (${vendor}:${product})`;
}

function getSavedSerialPortDisplayName(preference) {
  if (typeof preference?.portName === 'string' && preference.portName.trim()) {
    return preference.portName;
  }
  if (preference?.usbVendorId === 0x10c4) return 'Silicon Labs CP210x USB to UART Bridge';
  return 'Authorized USB serial device';
}

function getInitialConnection() {
  const preference = readSerialPreference();
  const hasSavedDevice = preference?.enabled === true;

  return {
    isConnected: false,
    portName: hasSavedDevice ? getSavedSerialPortDisplayName(preference) : 'Simulation',
    baudRate: Number.isSafeInteger(preference?.baudRate) ? preference.baudRate : 9600,
    baudRateConfirmed: preference?.baudRateConfirmed === true,
    dataBits: preference?.dataBits === 7 ? 7 : 8,
    parity: ['none', 'even', 'odd'].includes(preference?.parity) ? preference.parity : 'none',
    stopBits: preference?.stopBits === 2 ? 2 : 1,
    communicationMode: preference?.communicationMode === 'monitoring' ? 'monitoring' : 'sendReceive',
    isHardwareSerial: hasSavedDevice,
    serialPort: null,
    serialWriter: null,
    serialReader: null,
    serialReadTask: null,
    receivedData: '',
    receivedHexData: ''
  };
}

function serialPortsMatch(firstPort, secondPort) {
  if (firstPort === secondPort) return true;
  if (!firstPort || !secondPort) return false;
  const firstIdentity = getSerialDeviceIdentity(firstPort);
  const secondIdentity = getSerialDeviceIdentity(secondPort);
  return firstIdentity?.usbVendorId != null &&
    firstIdentity.usbProductId != null &&
    firstIdentity.usbVendorId === secondIdentity?.usbVendorId &&
    firstIdentity.usbProductId === secondIdentity.usbProductId;
}

function matchesSerialPreference(port, preference) {
  if (!preference || preference.usbVendorId == null && preference.usbProductId == null) {
    return false;
  }
  const identity = getSerialDeviceIdentity(port);
  return identity?.usbVendorId === preference.usbVendorId &&
    identity?.usbProductId === preference.usbProductId;
}

function resolveAuthorizedPort(ports, preference) {
  const connectedPorts = ports.filter((port) => port.connected);
  if (preference && (preference.usbVendorId != null || preference.usbProductId != null)) {
    const matchingPorts = connectedPorts.filter((port) => matchesSerialPreference(port, preference));
    return matchingPorts.length === 1 ? matchingPorts[0] : null;
  }
  return connectedPorts.length === 1 ? connectedPorts[0] : null;
}

function getSerialPortDiagnostics(port) {
  const identity = getSerialDeviceIdentity(port);
  return {
    ...identity,
    connected: Boolean(port.connected),
    readable: Boolean(port.readable),
    writable: Boolean(port.writable)
  };
}

function saveSerialPreference(port, {
  baudRate,
  dataBits,
  parity,
  stopBits,
  communicationMode
}) {
  try {
    localStorage.setItem(SERIAL_PREFERENCE_KEY, JSON.stringify({
      enabled: true,
      ...getSerialDeviceIdentity(port),
      portName: getSerialPortDisplayName(port),
      baudRate,
      dataBits,
      parity,
      stopBits,
      communicationMode,
      baudRateConfirmed: true
    }));
  } catch (err) {
    console.error('Unable to save USB serial device preference:', err);
  }
}

function disableAutomaticSerialConnection() {
  try {
    const preference = readSerialPreference();
    localStorage.setItem(SERIAL_PREFERENCE_KEY, JSON.stringify({
      ...preference,
      enabled: false
    }));
  } catch (err) {
    console.error('Unable to save USB serial connection preference:', err);
  }
}

export default function App() {
  // Metrology parameter counts state
  const [counts, setCounts] = useState(PRESET_VALUES.default);
  const [lockedPairs, setLockedPairs] = useState({
    current: false,
    angle: false
  });

  // Connection settings
  const [connection, setConnection] = useState(getInitialConnection);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const [connectedUsbDeviceCount, setConnectedUsbDeviceCount] = useState(0);
  const [isUsbActionPending, setIsUsbActionPending] = useState(false);
  const serialOpenPromisesRef = useRef(new WeakMap());
  const serialReceiveBuffersRef = useRef(new WeakMap());
  const serialLifecycleVersionRef = useRef(0);

  // Simulation & Scheduler
  const [updateInterval, setUpdateInterval] = useState(1000);
  const [isAutoStreaming, setIsAutoStreaming] = useState(false);
  const [packetsSent, setPacketsSent] = useState(0);
  const [autoSendLimit, setAutoSendLimit] = useState(0);
  const [autoPacketsSent, setAutoPacketsSent] = useState(0);
  const [autoSendStatus, setAutoSendStatus] = useState('Auto-send stopped');
  const autoSendSettingsRef = useRef({ updateInterval, autoSendLimit });
  autoSendSettingsRef.current = { updateInterval, autoSendLimit };
  const [isTxActive, setIsTxActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSerialTerminalOpen, setIsSerialTerminalOpen] = useState(false);
  const [serialTerminalEntries, setSerialTerminalEntries] = useState([]);
  const serialEntryIdRef = useRef(0);
  const appendSerialTerminalEntry = useCallback((direction, deviceName, data) => {
    const entry = {
      id: serialEntryIdRef.current++,
      timestamp: new Date().toISOString(),
      direction,
      deviceName,
      data
    };
    setSerialTerminalEntries((entries) => [...entries, entry]);
  }, []);

  // Modals & Feedback
  const [activeModal, setActiveModal] = useState(null); // 'protocol' | 'com' | null
  const [toast, setToast] = useState({ message: '', isVisible: false, type: 'success' });
  const toastTimeoutRef = useRef(null);
  const sendOperationInFlightRef = useRef(false);
  const autoPacketsSentRef = useRef(0);
  const lastAutoSendAtRef = useRef(null);

  // Show Toast helper
  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message: msg, isVisible: true, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast({ message: '', isVisible: false, type });
    }, 2800);
  }, []);

  const openSerialPort = useCallback(async (port, serialOptions, lifecycleVersion) => {
    const { baudRate, dataBits, parity, stopBits, communicationMode } = serialOptions;
    const pendingOpen = serialOpenPromisesRef.current.get(port);
    if (pendingOpen) {
      if (pendingOpen.lifecycleVersion === lifecycleVersion) return pendingOpen.promise;
      await pendingOpen.promise;
      const currentOpen = serialOpenPromisesRef.current.get(port);
      if (currentOpen) return currentOpen.promise;
      if (lifecycleVersion !== serialLifecycleVersionRef.current) return false;
    }

    const openPromise = Promise.resolve().then(async () => {
      let reader = null;
      let writer = null;
      try {
        if (!port.connected) return false;
        if (!port.readable || !port.writable) {
          await port.open({ baudRate, dataBits, parity, stopBits });
        }

        reader = port.readable?.getReader() ?? null;
        if (!reader) throw new Error('The selected serial port is not readable.');
        writer = communicationMode === 'sendReceive' ? port.writable?.getWriter() ?? null : null;
        if (communicationMode === 'sendReceive' && !writer) {
          throw new Error('The selected serial port is not writable.');
        }
        if (!port.connected || lifecycleVersion !== serialLifecycleVersionRef.current) {
          writer?.releaseLock();
          await reader.cancel();
          reader.releaseLock();
          if (port.readable || port.writable) await port.close();
          return false;
        }

        const nextConnection = {
          ...connectionRef.current,
          isConnected: true,
          portName: getSerialPortDisplayName(port),
          baudRate,
          baudRateConfirmed: true,
          dataBits,
          parity,
          stopBits,
          communicationMode,
          isHardwareSerial: true,
          serialPort: port,
          serialWriter: writer,
          serialReader: reader,
          serialReadTask: null,
          receivedData: '',
          receivedHexData: ''
        };
        connectionRef.current = nextConnection;
        setConnection(nextConnection);
        saveSerialPreference(port, serialOptions);
        console.info('[USB] Serial port opened.', {
          port: getSerialPortDiagnostics(port),
          communicationMode,
          hasWriter: Boolean(writer),
          hasReader: Boolean(reader)
        });
        const receiveTask = (async () => {
          const decoder = new TextDecoder();
          let receiveBuffer = serialReceiveBuffersRef.current.get(port) ?? '';
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (!value?.length) continue;

              const chunk = decoder.decode(value, { stream: true });
              const hexChunk = Array.from(value, (byte) => (
                byte.toString(16).padStart(2, '0').toUpperCase()
              )).join(' ');
              const current = connectionRef.current;
              if (current.serialPort !== port || current.serialReader !== reader) break;
              const { messages, remainder } = extractCompleteSerialMessages(receiveBuffer, chunk);
              receiveBuffer = remainder;
              serialReceiveBuffersRef.current.set(port, receiveBuffer);
              messages.forEach((message) => {
                appendSerialTerminalEntry('RX', current.portName, message);
              });
              const updatedConnection = {
                ...current,
                receivedData: `${current.receivedData ?? ''}${chunk}`.slice(-8000),
                receivedHexData: `${current.receivedHexData ?? ''} ${hexChunk}`.trim().slice(-24000)
              };
              connectionRef.current = updatedConnection;
              setConnection(updatedConnection);
            }
          } catch (err) {
            if (connectionRef.current.serialReader === reader && port.connected) {
              console.error('[USB] Serial receive stream failed:', err);
              showToast(`UART receive error: ${err.message}`, 'error');
            }
          } finally {
            try {
              reader.releaseLock();
            } catch (err) {
              console.warn('Unable to release serial reader:', err);
            }
            const current = connectionRef.current;
            if (current.serialReader === reader) {
              serialReceiveBuffersRef.current.set(port, receiveBuffer);
              const physicallyDisconnected = !port.connected;
              if (physicallyDisconnected) {
                serialLifecycleVersionRef.current += 1;
                console.warn('[USB] Receive stream ended because the physical serial device was removed.');
              }
              const endedConnection = {
                ...current,
                isConnected: false,
                portName: current.portName,
                serialPort: physicallyDisconnected ? null : current.serialPort,
                serialWriter: physicallyDisconnected ? null : current.serialWriter,
                serialReader: null,
                serialReadTask: null
              };
              connectionRef.current = endedConnection;
              setConnection(endedConnection);
            }
          }
        })();
        const readingConnection = {
          ...connectionRef.current,
          serialReadTask: receiveTask
        };
        connectionRef.current = readingConnection;
        setConnection(readingConnection);
        return true;
      } catch (err) {
        console.error('Unable to open authorized USB serial device:', err);
        try {
          writer?.releaseLock();
        } catch (cleanupError) {
          console.warn('Unable to release failed USB serial writer:', cleanupError);
        }
        try {
          await reader?.cancel();
        } catch (cleanupError) {
          console.warn('Unable to cancel failed USB serial reader:', cleanupError);
        }
        try {
          reader?.releaseLock();
        } catch (cleanupError) {
          console.warn('Unable to release failed USB serial reader:', cleanupError);
        }
        try {
          if (port.readable || port.writable) await port.close();
        } catch (cleanupError) {
          console.warn('Unable to close serial port after failed open:', cleanupError);
        }
        const failedConnection = {
          ...connectionRef.current,
          isConnected: false,
          portName: getSerialPortDisplayName(port),
          baudRate,
          baudRateConfirmed: true,
          dataBits,
          parity,
          stopBits,
          communicationMode,
          isHardwareSerial: true,
          serialPort: port,
          serialWriter: null,
          serialReader: null,
          serialReadTask: null,
          receivedData: '',
          receivedHexData: ''
        };
        connectionRef.current = failedConnection;
        setConnection(failedConnection);
        showToast(`Unable to connect to USB-UART: ${err.message}`, 'error');
        return false;
      } finally {
        if (serialOpenPromisesRef.current.get(port)?.promise === openPromise) {
          serialOpenPromisesRef.current.delete(port);
        }
      }
    });

    serialOpenPromisesRef.current.set(port, { promise: openPromise, lifecycleVersion });
    return openPromise;
  }, [appendSerialTerminalEntry, showToast]);

  useEffect(() => {
    const serial = globalThis.navigator?.serial;
    if (!serial) {
      console.warn('[USB] Web Serial is unavailable in this browser or context.', {
        isSecureContext: globalThis.isSecureContext,
        origin: globalThis.location?.origin
      });
      return undefined;
    }

    let active = true;
    const activateAuthorizedPort = async (ports, requestedPort = null) => {
      const preference = readSerialPreference();
      if (preference?.enabled === false) {
        console.info('[USB] Automatic connection is disabled in the saved preference.');
        return;
      }
      if (preference?.baudRateConfirmed !== true) {
        console.info('[USB] Automatic connection skipped: select an explicit firmware baud rate first.');
        return;
      }

      const authorizedPort = resolveAuthorizedPort(ports, preference);
      let port = authorizedPort;
      if (requestedPort) {
        const hasSavedIdentity = preference?.usbVendorId != null || preference?.usbProductId != null;
        const uniquelyAuthorized = ports.filter((candidate) => candidate.connected).length === 1;
        const matchesSavedIdentity = hasSavedIdentity && authorizedPort &&
          matchesSerialPreference(requestedPort, preference);
        const eventPortIsAuthorized = authorizedPort === requestedPort ||
          matchesSavedIdentity || (!hasSavedIdentity && uniquelyAuthorized);
        port = requestedPort.connected && eventPortIsAuthorized ? requestedPort : null;
        console.info('[USB] Connect event authorization check.', {
          eventPort: getSerialPortDiagnostics(requestedPort),
          authorizedPort: authorizedPort ? getSerialPortDiagnostics(authorizedPort) : null,
          eventPortIsAuthorized
        });
      }
      if (!port || !active) {
        console.info('[USB] No unambiguous authorized, connected USB serial port to open.', {
          authorizedPorts: ports.map(getSerialPortDiagnostics)
        });
        return;
      }

      const baudRate = preference.baudRate;
      const dataBits = preference?.dataBits === 7 ? 7 : 8;
      const parity = ['none', 'even', 'odd'].includes(preference?.parity)
        ? preference.parity
        : 'none';
      const stopBits = preference?.stopBits === 2 ? 2 : 1;
      const communicationMode = preference?.communicationMode === 'monitoring'
        ? 'monitoring'
        : 'sendReceive';
      const serialOptions = { baudRate, dataBits, parity, stopBits, communicationMode };
      console.info('[USB] Opening authorized serial port.', {
        port: getSerialPortDiagnostics(port),
        ...serialOptions
      });
      const pendingConnection = {
        ...connectionRef.current,
        isConnected: false,
        portName: getSerialPortDisplayName(port),
        baudRate,
        baudRateConfirmed: true,
        dataBits,
        parity,
        stopBits,
        communicationMode,
        isHardwareSerial: true,
        serialPort: port,
        serialWriter: null,
        serialReader: null,
        serialReadTask: null
      };
      connectionRef.current = pendingConnection;
      setConnection(pendingConnection);
      await openSerialPort(port, serialOptions, serialLifecycleVersionRef.current);
    };

    const refreshAuthorizedPorts = async () => {
      try {
        const ports = await serial.getPorts();
        if (active) {
          setConnectedUsbDeviceCount(ports.filter((port) => port.connected).length);
        }
        console.info('[USB] navigator.serial.getPorts() returned authorized ports.', {
          count: ports.length,
          ports: ports.map(getSerialPortDiagnostics)
        });
        await activateAuthorizedPort(ports);
      } catch (err) {
        console.error('Unable to detect USB serial devices:', err);
      }
    };

    const handleDisconnect = (event) => {
      const disconnectedPort = event.port;
      void serial.getPorts()
        .then((ports) => {
          if (active) {
            setConnectedUsbDeviceCount(ports.filter((port) => port.connected).length);
          }
        })
        .catch((err) => {
          console.error('Unable to refresh connected USB device count:', err);
        });
      const current = connectionRef.current;
      const samePort = serialPortsMatch(current.serialPort, disconnectedPort);
      const activePortConnected = Boolean(current.serialPort?.connected);
      console.info('[USB] Serial disconnect event received.', {
        eventPort: getSerialPortDiagnostics(disconnectedPort),
        activePort: current.serialPort ? getSerialPortDiagnostics(current.serialPort) : null,
        samePort
      });
      if (!current.isHardwareSerial || !current.serialPort || !samePort) {
        console.info('[USB] Ignoring disconnect event; it does not match the active serial port.', {
          activePortConnected
        });
        return;
      }
      serialLifecycleVersionRef.current += 1;

      try {
        current.serialWriter?.releaseLock();
      } catch (err) {
        console.warn('Unable to release disconnected serial writer:', err);
      }
      void current.serialReader?.cancel().catch((err) => {
        console.warn('Unable to cancel disconnected serial reader:', err);
      });
      const disconnectedConnection = {
        ...current,
        isConnected: false,
        serialPort: null,
        serialWriter: null,
        serialReader: null,
        serialReadTask: null
      };
      connectionRef.current = disconnectedConnection;
      setConnection(disconnectedConnection);
      console.warn('[USB] Active USB serial connection marked disconnected.', {
        connected: Boolean(disconnectedPort.connected),
        readable: Boolean(disconnectedPort.readable),
        writable: Boolean(disconnectedPort.writable)
      });
    };

    const handleConnect = (event) => {
      console.info('[USB] Serial connect event received.', getSerialPortDiagnostics(event.port));
      void serial.getPorts()
        .then((ports) => {
          if (active) {
            setConnectedUsbDeviceCount(ports.filter((port) => port.connected).length);
          }
          return activateAuthorizedPort(ports, event.port);
        })
        .catch((err) => {
          console.error('Unable to reconnect authorized USB serial device:', err);
        });
    };

    console.info('[USB] Web Serial supported; registering connect/disconnect listeners.', {
      isSecureContext: globalThis.isSecureContext,
      origin: globalThis.location?.origin
    });
    serial.addEventListener('disconnect', handleDisconnect);
    serial.addEventListener('connect', handleConnect);
    void refreshAuthorizedPorts();
    return () => {
      active = false;
      serial.removeEventListener('disconnect', handleDisconnect);
      serial.removeEventListener('connect', handleConnect);
      console.info('[USB] Removed connect/disconnect listeners during effect cleanup.');
    };
  }, [openSerialPort]);

  useEffect(() => {
    if (!connection.isHardwareSerial || !connection.serialPort) return undefined;

    const serialPort = connection.serialPort;
    const reconcilePhysicalConnection = async () => {
      const current = connectionRef.current;
      if (current.serialPort !== serialPort || !current.isHardwareSerial) return;

      if (!serialPort.connected) {
        console.warn('[USB] Active serial device is physically disconnected; clearing active device.');
        serialLifecycleVersionRef.current += 1;
        try {
          current.serialWriter?.releaseLock();
        } catch (err) {
          console.warn('Unable to release disconnected serial writer:', err);
        }
        try {
          await current.serialReader?.cancel();
        } catch (err) {
          console.warn('Unable to cancel disconnected serial reader:', err);
        }
        const disconnectedConnection = {
          ...current,
          isConnected: false,
          serialPort: null,
          serialWriter: null,
          serialReader: null,
          serialReadTask: null
        };
        connectionRef.current = disconnectedConnection;
        setConnection(disconnectedConnection);
        return;
      }

      const isActuallyOpen = Boolean(
        serialPort.readable &&
        serialPort.writable &&
        current.serialReader &&
        (current.communicationMode === 'monitoring' || current.serialWriter)
      );
      if (current.isConnected === isActuallyOpen) return;

      console.warn('[USB] Serial port state changed without a matching app state update; reconciling.', {
        isActuallyOpen,
        port: getSerialPortDiagnostics(serialPort),
        hasWriter: Boolean(current.serialWriter)
      });
      if (!isActuallyOpen) {
        try {
          current.serialWriter?.releaseLock();
        } catch (err) {
          console.warn('Unable to release serial writer while reconciling port state:', err);
        }
        try {
          await current.serialReader?.cancel();
        } catch (err) {
          console.warn('Unable to cancel serial reader while reconciling port state:', err);
        }
      }
      const reconciledConnection = {
        ...current,
        isConnected: isActuallyOpen,
        serialWriter: isActuallyOpen ? current.serialWriter : null,
        serialReader: isActuallyOpen ? current.serialReader : null,
        serialReadTask: isActuallyOpen ? current.serialReadTask : null
      };
      connectionRef.current = reconciledConnection;
      setConnection(reconciledConnection);
    };

    const timer = setInterval(reconcilePhysicalConnection, 500);
    return () => clearInterval(timer);
  }, [connection.isHardwareSerial, connection.serialPort]);

  // Keep paired counts synchronized only while their corresponding lock is enabled.
  const handleCountChange = useCallback((paramKey, nextVal) => {
    setCounts((prev) => {
      const next = { ...prev, [paramKey]: nextVal };
      if (lockedPairs.current && ['phaseCurrent', 'neutralCurrent'].includes(paramKey)) {
        next[paramKey === 'phaseCurrent' ? 'neutralCurrent' : 'phaseCurrent'] = nextVal;
      }
      if (lockedPairs.angle && ['phaseAngle', 'neutralAngle'].includes(paramKey)) {
        next[paramKey === 'phaseAngle' ? 'neutralAngle' : 'phaseAngle'] = nextVal;
      }
      return next;
    });
  }, [lockedPairs]);

  const handlePairLockChange = useCallback((pair, enabled) => {
    setLockedPairs((prev) => ({ ...prev, [pair]: enabled }));
    if (enabled) {
      const [primary, secondary] = pair === 'current'
        ? ['phaseCurrent', 'neutralCurrent']
        : ['phaseAngle', 'neutralAngle'];
      setCounts((prev) => ({ ...prev, [secondary]: prev[primary] }));
    }
  }, []);

  // Reset to default
  const handleReset = useCallback(() => {
    const defaults = { ...PRESET_VALUES.default };
    if (lockedPairs.current) defaults.neutralCurrent = defaults.phaseCurrent;
    if (lockedPairs.angle) defaults.neutralAngle = defaults.phaseAngle;
    setCounts(defaults);
    showToast('Reset all parameters to default!');
  }, [lockedPairs, showToast]);

  // Transmit UART frame (simulated or real hardware)
  const performSendFrame = useCallback(async (isAuto = false) => {
    if (connection.communicationMode === 'monitoring') {
      if (!isAuto) showToast('Monitoring mode is receive-only.', 'error');
      return false;
    }

    if (!isAuto) {
      setIsSending(true);
      setTimeout(() => setIsSending(false), 400);
    }

    if (
      connection.isHardwareSerial &&
      (
        !connection.isConnected ||
        !connection.serialPort?.connected ||
        !connection.serialWriter
      )
    ) {
      if (!isAuto) showToast('USB-UART is not connected.', 'error');
      return false;
    }

    const rawFrame = generateUartMessage(counts, PARAM_DEFINITIONS);

    // Hardware Web Serial TX
    if (connection.isHardwareSerial) {
      try {
        const encoder = new TextEncoder();
        await connection.serialWriter.write(encoder.encode(rawFrame));
      } catch (err) {
        console.error('Serial TX error:', err);
        try {
          connection.serialWriter.releaseLock();
        } catch (releaseError) {
          console.warn('Unable to release failed serial writer:', releaseError);
        }
        const failedConnection = connectionRef.current.serialPort === connection.serialPort
          ? { ...connectionRef.current, isConnected: false, serialWriter: null }
          : connectionRef.current;
        connectionRef.current = failedConnection;
        setConnection(failedConnection);
        showToast('Error transmitting to COM port: ' + err.message, 'error');
        return false;
      }
    }

    if (isAuto) lastAutoSendAtRef.current = performance.now();
    setPacketsSent((prev) => prev + 1);
    if (isAuto) {
      autoPacketsSentRef.current += 1;
      const currentAutoPacketsSent = autoPacketsSentRef.current;
      setAutoPacketsSent(currentAutoPacketsSent);
      const limit = autoSendSettingsRef.current.autoSendLimit;
      if (limit > 0 && currentAutoPacketsSent >= limit) {
        setIsAutoStreaming(false);
        setAutoSendStatus('Auto-send limit reached');
        showToast('Auto-send limit reached');
      }
    }
    setIsTxActive(true);
    setTimeout(() => setIsTxActive(false), 250);

    if (!isAuto) {
      showToast(`Frame sent to ${connection.portName} (${rawFrame.trim().slice(0, 38)}...)`);
    }
    return true;
  }, [counts, connection, showToast]);

  const handleSendFrame = useCallback(async (isAuto = false) => {
    if (sendOperationInFlightRef.current) {
      if (!isAuto) showToast('A serial transmission is already in progress.', 'error');
      return false;
    }

    sendOperationInFlightRef.current = true;
    try {
      return await performSendFrame(isAuto);
    } finally {
      sendOperationInFlightRef.current = false;
    }
  }, [performSendFrame, showToast]);

  const handleToggleAutoStream = useCallback((enabled) => {
    if (enabled) {
      autoPacketsSentRef.current = 0;
      lastAutoSendAtRef.current = null;
      setAutoPacketsSent(0);
      setAutoSendStatus('Auto-send running');
    } else {
      setAutoSendStatus('Auto-send stopped');
    }
    setIsAutoStreaming(enabled);
  }, []);

  const handleSendButton = useCallback(() => {
    const hardwareReady = connection.isHardwareSerial &&
      connection.isConnected &&
      connection.communicationMode !== 'monitoring' &&
      connection.serialPort?.connected &&
      connection.serialPort?.readable &&
      connection.serialPort?.writable &&
      connection.serialWriter;
    if (isAutoStreaming) {
      handleToggleAutoStream(false);
    } else if (hardwareReady) {
      handleToggleAutoStream(true);
    } else {
      handleSendFrame(false);
    }
  }, [connection, handleSendFrame, handleToggleAutoStream, isAutoStreaming]);

  const autoSendFrameRef = useRef(handleSendFrame);
  autoSendFrameRef.current = handleSendFrame;

  // Schedule only while a writable hardware UART connection is active.
  useEffect(() => {
    if (!isAutoStreaming) return;

    let timer;
    let cancelled = false;
    const isConnectionReady = () => {
      const current = connectionRef.current;
      return current.isHardwareSerial &&
        current.isConnected &&
        current.communicationMode !== 'monitoring' &&
        current.serialPort?.connected &&
        current.serialPort?.readable &&
        current.serialPort?.writable &&
        current.serialWriter;
    };

    if (!isConnectionReady()) {
      setIsAutoStreaming(false);
      setAutoSendStatus('Connect a writable USB UART device to start auto-send');
      showToast('Connect a writable USB UART device before starting auto-send.', 'error');
      return undefined;
    }

    if (autoSendLimit > 0 && autoPacketsSentRef.current >= autoSendLimit) {
      setIsAutoStreaming(false);
      setAutoSendStatus('Auto-send limit reached');
      showToast('Auto-send limit reached');
      return undefined;
    }

    const scheduleNext = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(sendNextFrame, Math.max(0, delay));
    };
    const sendNextFrame = async () => {
      if (cancelled) return;

      const interval = autoSendSettingsRef.current.updateInterval;
      if (lastAutoSendAtRef.current !== null) {
        const remainingInterval = interval - (performance.now() - lastAutoSendAtRef.current);
        if (remainingInterval > 0) {
          scheduleNext(remainingInterval);
          return;
        }
      }

      if (!isConnectionReady()) {
        setIsAutoStreaming(false);
        setAutoSendStatus('UART disconnected; auto-send stopped');
        showToast('UART disconnected. Auto-send stopped.', 'error');
        return;
      }

      if (sendOperationInFlightRef.current) {
        scheduleNext(25);
        return;
      }

      let sent;
      try {
        sent = await autoSendFrameRef.current(true);
      } catch (error) {
        console.error('Automatic UART transmission failed:', error);
        setIsAutoStreaming(false);
        setAutoSendStatus('Auto-send stopped after transmission error');
        showToast(`Auto-send stopped: ${error.message}`, 'error');
        return;
      }
      if (cancelled) return;

      if (!sent) {
        setIsAutoStreaming(false);
        setAutoSendStatus('Auto-send stopped after unsuccessful transmission');
        return;
      }

      if (autoSendSettingsRef.current.autoSendLimit > 0 &&
          autoPacketsSentRef.current >= autoSendSettingsRef.current.autoSendLimit) return;
      const currentInterval = autoSendSettingsRef.current.updateInterval;
      scheduleNext(currentInterval);
    };
    const initialDelay = lastAutoSendAtRef.current === null
      ? 0
      : Math.max(0, updateInterval - (performance.now() - lastAutoSendAtRef.current));
    scheduleNext(initialDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isAutoStreaming,
    updateInterval,
    autoSendLimit,
    connection.isHardwareSerial,
    connection.isConnected,
    connection.communicationMode,
    connection.serialPort,
    connection.serialWriter,
    showToast
  ]);

  // Save COM Settings (Web Serial or Virtual)
  const handleSaveComSettings = useCallback(async ({
    portMode,
    baudRate,
    dataBits,
    parity,
    stopBits,
    communicationMode,
    selectedPort: requestedPort,
    connectedDeviceCount
  }) => {
    if (communicationMode === 'monitoring') {
      setIsAutoStreaming(false);
      setAutoSendStatus('Auto-send stopped');
    }
    if (communicationMode === 'monitoring' && portMode !== 'webserial') {
      showToast('Monitoring mode requires a hardware USB serial port.', 'error');
      return;
    }
    if (Number.isSafeInteger(connectedDeviceCount) && connectedDeviceCount >= 0) {
      setConnectedUsbDeviceCount(connectedDeviceCount);
    }
    if (portMode === 'webserial' && navigator.serial) {
      try {
        const current = connectionRef.current;
        const preference = readSerialPreference();
        if (requestedPort && !requestedPort.connected) {
          throw new Error('The selected USB device is disconnected. Reconnect it and select it again.');
        }
        let selectedPort = requestedPort ??
          (current.isHardwareSerial && current.serialPort?.connected ? current.serialPort : null);

        if (!selectedPort && preference) {
          const ports = await navigator.serial.getPorts();
          selectedPort = resolveAuthorizedPort(ports, preference);
        }
        if (!selectedPort) {
          throw new Error('Select the connected USB serial device before connecting.');
        }

        if (
          current.isHardwareSerial &&
          current.serialPort === selectedPort &&
          current.isConnected &&
          current.baudRate === baudRate &&
          current.dataBits === dataBits &&
          current.parity === parity &&
          current.stopBits === stopBits &&
          current.communicationMode === communicationMode
        ) {
          setActiveModal(null);
          return;
        }

        if (current.isHardwareSerial && current.serialPort) {
          try {
            current.serialWriter?.releaseLock();
            await current.serialReader?.cancel();
            await current.serialReadTask;
            await current.serialPort.close();
          } catch (err) {
            console.warn('Unable to close previous serial connection:', err);
          }
        }
        serialLifecycleVersionRef.current += 1;
        const pendingConnection = {
          ...connectionRef.current,
          isConnected: false,
          portName: getSerialPortDisplayName(selectedPort),
          baudRate,
          baudRateConfirmed: true,
          dataBits,
          parity,
          stopBits,
          communicationMode,
          isHardwareSerial: true,
          serialPort: selectedPort,
          serialWriter: null,
          serialReader: null,
          serialReadTask: null,
          receivedData: '',
          receivedHexData: ''
        };
        connectionRef.current = pendingConnection;
        setConnection(pendingConnection);
        const opened = await openSerialPort(
          selectedPort,
          { baudRate, dataBits, parity, stopBits, communicationMode },
          serialLifecycleVersionRef.current
        );
        if (opened) {
          showToast(communicationMode === 'monitoring'
            ? `Monitoring USB-UART at ${baudRate} bps (receive only).`
            : `Connected to Hardware UART at ${baudRate} bps!`);
        }
      } catch (err) {
        if (err.name === 'NotFoundError') {
          console.info('USB serial port selection was canceled.');
          setActiveModal(null);
          return;
        }
        console.error('Unable to configure USB serial device:', err);
        showToast(`Unable to connect to USB-UART: ${err.message}`, 'error');
      }
    } else if (portMode === 'webserial') {
      const disconnectedConnection = {
        ...connectionRef.current,
        isConnected: false,
        isHardwareSerial: false,
        serialPort: null,
        serialWriter: null,
        serialReader: null,
        serialReadTask: null
      };
      connectionRef.current = disconnectedConnection;
      setConnection(disconnectedConnection);
      showToast('Web Serial is unavailable in this browser.', 'error');
    } else {
      const current = connectionRef.current;
      if (current.isHardwareSerial && current.serialPort) {
        try {
          current.serialWriter?.releaseLock();
          await current.serialReader?.cancel();
          await current.serialReadTask;
          await current.serialPort.close();
        } catch (err) {
          console.warn('Unable to close serial connection:', err);
        }
      }
      serialLifecycleVersionRef.current += 1;
      const simulatedConnection = {
        ...connectionRef.current,
        isConnected: false,
        portName: 'Simulation',
        baudRate,
        baudRateConfirmed: false,
        dataBits,
        parity,
        stopBits,
        communicationMode,
        isHardwareSerial: false,
        serialPort: null,
        serialWriter: null,
        serialReader: null,
        serialReadTask: null,
        receivedData: '',
        receivedHexData: ''
      };
      disableAutomaticSerialConnection();
      connectionRef.current = simulatedConnection;
      setConnection(simulatedConnection);
      showToast(`Configured serial simulation at ${baudRate} bps`);
    }
    setActiveModal(null);
  }, [openSerialPort, showToast]);

  const handleConnectUsb = useCallback(async () => {
    if (!globalThis.navigator?.serial) {
      showToast('Web Serial is unavailable in this browser.', 'error');
      return;
    }

    const current = connectionRef.current;
    setIsUsbActionPending(true);
    try {
      const authorizedPorts = await navigator.serial.getPorts();
      const connectedPorts = authorizedPorts.filter((port) => port.connected);
      const preference = readSerialPreference();
      const cp210xPorts = connectedPorts.filter(
        (port) => getSerialDeviceIdentity(port)?.usbVendorId === 0x10c4
      );
      const preferredCp210xPorts = preference
        ? cp210xPorts.filter((port) => matchesSerialPreference(port, preference))
        : [];
      let selectedPort = preferredCp210xPorts.length === 1
        ? preferredCp210xPorts[0]
        : cp210xPorts.length === 1
          ? cp210xPorts[0]
          : null;

      if (!selectedPort) {
        selectedPort = await navigator.serial.requestPort({
          filters: [{ usbVendorId: 0x10c4 }]
        });
      }

      await handleSaveComSettings({
        portMode: 'webserial',
        baudRate: current.baudRate,
        dataBits: current.dataBits,
        parity: current.parity,
        stopBits: current.stopBits,
        communicationMode: current.communicationMode,
        selectedPort,
        connectedDeviceCount: authorizedPorts.filter((port) => port.connected).length
      });
    } catch (err) {
      if (err.name === 'NotFoundError') {
        console.info('USB serial device selection was canceled.');
        return;
      }
      console.error('Unable to select USB serial device:', err);
      showToast(`Unable to connect to USB-UART: ${err.message}`, 'error');
    } finally {
      setIsUsbActionPending(false);
    }
  }, [handleSaveComSettings, showToast]);

  const handleDisconnectUsb = useCallback(async () => {
    const current = connectionRef.current;
    if (!current.isHardwareSerial || !current.serialPort) return;

    setIsUsbActionPending(true);
    setIsAutoStreaming(false);
    setAutoSendStatus('Auto-send stopped');
    serialLifecycleVersionRef.current += 1;
    const disconnectedConnection = {
      ...current,
      isConnected: false,
      serialPort: null,
      serialWriter: null,
      serialReader: null,
      serialReadTask: null
    };
    connectionRef.current = disconnectedConnection;
    setConnection(disconnectedConnection);
    disableAutomaticSerialConnection();

    let closeError = null;
    try {
      try {
        current.serialWriter?.releaseLock();
      } catch (err) {
        console.warn('Unable to release USB serial writer during disconnect:', err);
      }
      try {
        await current.serialReader?.cancel();
      } catch (err) {
        console.warn('Unable to cancel USB serial reader during disconnect:', err);
      }
      try {
        await current.serialReadTask;
      } catch (err) {
        console.warn('USB serial read task ended with an error during disconnect:', err);
      }
      if (current.serialPort.connected && (current.serialPort.readable || current.serialPort.writable)) {
        await current.serialPort.close();
      }
    } catch (err) {
      closeError = err;
      console.error('Unable to close USB serial port:', err);
    } finally {
      setIsUsbActionPending(false);
    }

    if (closeError) {
      showToast(`USB serial disconnected, but the port could not be closed: ${closeError.message}`, 'error');
    } else {
      showToast('USB serial device disconnected.');
    }
  }, [showToast]);

  // Real-time Power & Energy Calculations
  const calculatedMetrics = calculatePowerAndEnergy(counts);

  return (
    <div className="window-container">
      {/* Header Bar */}
      <Header
        connection={connection}
        connectedUsbDeviceCount={connectedUsbDeviceCount}
        isUsbActionPending={isUsbActionPending}
        onConnectUsb={handleConnectUsb}
        onDisconnectUsb={handleDisconnectUsb}
        onOpenComModal={() => setActiveModal('com')}
      />

      {/* Main Grid: Parameter Controls (Left) & Calculations (Right) */}
      <main className="main-layout">
        {/* Left Section: Parameter Controls */}
        <section className="panel parameter-panel">
          <div className="panel-header">
            <div className="panel-header-icon blue-gear">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
            </div>
            <h2 className="panel-title">Parameter Controls</h2>
          </div>

          <div className="cards-grid">
            {PARAMETER_ORDER.map((paramKey) => (
              <ParameterCard
                key={paramKey}
                paramKey={paramKey}
                config={PARAM_DEFINITIONS[paramKey]}
                value={counts[paramKey]}
                onChange={(nextVal) => handleCountChange(paramKey, nextVal)}
              />
            ))}
            <button
              type="button"
              className={`grid-pair-lock ${lockedPairs.current ? 'is-locked' : ''}`}
              onClick={() => handlePairLockChange('current', !lockedPairs.current)}
              aria-label={`${lockedPairs.current ? 'Unlock' : 'Lock'} Phase and neutral current`}
              aria-pressed={lockedPairs.current}
              title={`${lockedPairs.current ? 'Unlock' : 'Lock'} Phase and neutral current`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d={lockedPairs.current ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M8 10V7a4 4 0 0 1 7-2'} />
              </svg>
            </button>
            <button
              type="button"
              className={`grid-pair-lock angle-grid-pair-lock ${lockedPairs.angle ? 'is-locked' : ''}`}
              onClick={() => handlePairLockChange('angle', !lockedPairs.angle)}
              aria-label={`${lockedPairs.angle ? 'Unlock' : 'Lock'} Phase and neutral angle`}
              aria-pressed={lockedPairs.angle}
              title={`${lockedPairs.angle ? 'Unlock' : 'Lock'} Phase and neutral angle`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d={lockedPairs.angle ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M8 10V7a4 4 0 0 1 7-2'} />
              </svg>
            </button>
          </div>
          <div className="parameter-panel-footer">
            <SimulationInfo
              updateInterval={updateInterval}
              onUpdateIntervalChange={setUpdateInterval}
              sendingCount={packetsSent}
              packetLimit={autoSendLimit}
              autoPacketsSent={autoPacketsSent}
              onPacketLimitChange={setAutoSendLimit}
              isAutoStreaming={isAutoStreaming}
              autoSendStatus={autoSendStatus}
            />
          </div>
        </section>

        {/* Right Section: Calculated Values (Single Phase) */}
        <section className="panel calculation-panel">
          <div className="panel-header">
            <div className="panel-header-icon blue-calc">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 16H7v-2h10v2zm0-4H7v-2h10v2zm0-4H7V9h10v2zm-8-4H7V5h2v2zm4 0h-2V5h2v2zm4 0h-2V5h2v2z" />
              </svg>
            </div>
            <h2 className="panel-title">Calculated Values (Single Phase)</h2>
          </div>

          <div className="calc-cards-container">
            <PowerCalculation metrics={calculatedMetrics} />
            <EnergyCalculation metrics={calculatedMetrics} />
          </div>
          <SerialTerminal
            isOpen={isSerialTerminalOpen}
            entries={serialTerminalEntries}
            onClose={() => setIsSerialTerminalOpen(false)}
            onClear={() => setSerialTerminalEntries([])}
            onExportSuccess={() => showToast('Serial logs downloaded successfully.')}
            onExportError={(error) => {
              console.error('Unable to export serial logs:', error);
              showToast(`Unable to download serial logs: ${error.message}`, 'error');
            }}
          />
        </section>
      </main>

      {/* Parameter actions */}
      <FooterControls
        onReset={handleReset}
        onSendFrame={handleSendButton}
        isSending={isSending}
        isAutoStreaming={isAutoStreaming}
        onToggleTerminal={() => setIsSerialTerminalOpen((isOpen) => !isOpen)}
        isTerminalOpen={isSerialTerminalOpen}
      />

      {/* UART Protocol & RL78 C Struct Modal */}
      <UartModal
        isOpen={activeModal === 'protocol'}
        counts={counts}
        packetsSent={packetsSent}
        isTxActive={isTxActive}
        communicationMode={connection.communicationMode}
        receivedData={connection.receivedData}
        receivedHexData={connection.receivedHexData}
        onClose={() => setActiveModal(null)}
      />

      {/* COM Port Configuration Modal */}
      <ComModal
        isOpen={activeModal === 'com'}
        connection={connection}
        onSave={handleSaveComSettings}
        onClose={() => setActiveModal(null)}
      />

      {/* Toast Feedback */}
      <Toast message={toast.message} isVisible={toast.isVisible} type={toast.type} />
    </div>
  );
}
