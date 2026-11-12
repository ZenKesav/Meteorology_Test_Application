/**
 * Energy Meter Simulator - Single Phase
 * Implementation for Renesas RL78/I1C Dual Controller UART Interface (SRS v1.4)
 */

(() => {
  'use strict';

  // --- Parameter Configuration & Specifications ---
  const PARAM_CONFIG = {
    voltage: {
      name: 'Voltage',
      type: 'uint32_t',
      min: 0,
      max: 65535,
      defaultCount: 23050,
      scale: 0.01,
      unit: 'V',
      decimals: 2,
      example: '23050 = 230.50 V',
      color: '#1976d2'
    },
    phaseCurrent: {
      name: 'Phase Current',
      type: 'uint32_t',
      min: 0,
      max: 65535,
      defaultCount: 5250,
      scale: 0.001,
      unit: 'A',
      decimals: 3,
      example: '5250 = 5.250 A',
      color: '#00897b'
    },
    neutralCurrent: {
      name: 'Neutral Current',
      type: 'uint32_t',
      min: 0,
      max: 65535,
      defaultCount: 150,
      scale: 0.001,
      unit: 'A',
      decimals: 3,
      example: '150 = 0.150 A',
      color: '#692387'
    },
    phaseAngle: {
      name: 'Phase Angle',
      type: 'int16_t',
      min: -32768,
      max: 32767,
      defaultCount: 3008,
      scale: 0.01,
      unit: '°',
      decimals: 2,
      example: '3008 = 30.00°',
      color: '#ef6c00'
    },
    neutralAngle: {
      name: 'Neutral Angle',
      type: 'int16_t',
      min: -32768,
      max: 32767,
      defaultCount: 2850,
      scale: 0.01,
      unit: '°',
      decimals: 2,
      example: '2850 = 28.50°',
      color: '#0097a7'
    },
    powerFactorAngle: {
      name: 'Power Factor (Angle)',
      type: 'int16_t',
      min: -32768,
      max: 32767,
      defaultCount: 2500,
      scale: 0.01,
      unit: '°',
      decimals: 2,
      example: '2500 = 25.00°',
      color: '#c2185b'
    }
  };

  // Preset Configurations
  const PRESETS = {
    default: {
      voltage: 23050,
      phaseCurrent: 5250,
      neutralCurrent: 150,
      phaseAngle: 3008,
      neutralAngle: 2850,
      powerFactorAngle: 2500
    },
    standard: {
      voltage: 23008,
      phaseCurrent: 5000,
      neutralCurrent: 50,
      phaseAngle: 3008,
      neutralAngle: 2800,
      powerFactorAngle: 2500
    },
    light: {
      voltage: 23008,
      phaseCurrent: 500,
      neutralCurrent: 20,
      phaseAngle: 1000,
      neutralAngle: 950,
      powerFactorAngle: 1000
    },
    heavy: {
      voltage: 24000,
      phaseCurrent: 25000,
      neutralCurrent: 1200,
      phaseAngle: 4500,
      neutralAngle: 4200,
      powerFactorAngle: 4000
    },
    resistive: {
      voltage: 23008,
      phaseCurrent: 10000,
      neutralCurrent: 0,
      phaseAngle: 0,
      neutralAngle: 0,
      powerFactorAngle: 0
    },
    inductive: {
      voltage: 23008,
      phaseCurrent: 10000,
      neutralCurrent: 100,
      phaseAngle: 6000,
      neutralAngle: 5800,
      powerFactorAngle: 6000
    }
  };

  // State Management
  const state = {
    counts: { ...PRESETS.default },
    transmissionInterval: 1000, // ms
    isPeriodicSending: false,
    periodicTimerId: null,
    packetsSent: 0,
    serialPort: null,
    serialWriter: null,
    isConnected: true,
    portName: 'COM3',
    baudRate: 9600,
    isHardwareSerial: false
  };

  // Rotary Knob Angle bounds (in degrees, 220° sweep)
  const KNOB_MIN_ANGLE = -135;
  const KNOB_MAX_ANGLE = 135;

  // --- Initializer ---
  document.addEventListener('DOMContentLoaded', () => {
    initKnobTicks();
    setupKnobInteractions();
    setupInputsAndSteppers();
    setupCalculations();
    setupSerialAndFooter();
    setupModals();
    startClock();
    updateAll();
  });

  // --- Render Dial Ticks ---
  function initKnobTicks() {
    const tickCount = 21;
    const radius = 42;
    const cx = 50;
    const cy = 50;

    Object.keys(PARAM_CONFIG).forEach(paramKey => {
      const svg = document.querySelector(`#knob-${paramKey} .knob-ticks`);
      if (!svg) return;

      let svgHtml = '';
      for (let i = 0; i < tickCount; i++) {
        const fraction = i / (tickCount - 1);
        const angleDeg = KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);
        const angleRad = (angleDeg - 90) * (Math.PI / 180);

        const isMajor = (i === 0 || i === tickCount - 1 || i === Math.floor(tickCount / 2));
        const tickLength = isMajor ? 6 : 4;
        const tickColor = isMajor ? '#3b5f88' : '#8faac6';
        const strokeWidth = isMajor ? '1.8' : '1.2';

        const x1 = cx + (radius - tickLength) * Math.cos(angleRad);
        const y1 = cy + (radius - tickLength) * Math.sin(angleRad);
        const x2 = cx + radius * Math.cos(angleRad);
        const y2 = cy + radius * Math.sin(angleRad);

        svgHtml += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${tickColor}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
      }
      svg.innerHTML = svgHtml;
    });
  }

  // --- Knob Drag & Touch Interactions ---
  function setupKnobInteractions() {
    Object.keys(PARAM_CONFIG).forEach(paramKey => {
      const container = document.getElementById(`knob-${paramKey}`);
      if (!container) return;

      let isDragging = false;
      let startY = 0;
      let startCount = 0;

      const onMouseDown = (e) => {
        isDragging = true;
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        startCount = state.counts[paramKey];
        document.body.style.userSelect = 'none';

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const currentY = e.clientY || (e.touches && e.touches[0].clientY);
        const deltaY = startY - currentY; // Moving up increases value

        const conf = PARAM_CONFIG[paramKey];
        const range = conf.max - conf.min;
        // Sensitivity: 200px drag traverses 40% of the range
        const stepRate = range / 500;
        let newCount = Math.round(startCount + deltaY * stepRate);
        newCount = clamp(newCount, conf.min, conf.max);

        setCount(paramKey, newCount);
        if (e.cancelable) e.preventDefault();
      };

      const onMouseUp = () => {
        isDragging = false;
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onMouseMove);
        window.removeEventListener('touchend', onMouseUp);
      };

      container.addEventListener('mousedown', onMouseDown);
      container.addEventListener('touchstart', onMouseDown, { passive: true });

      // Mouse Wheel Support for Knobs
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const conf = PARAM_CONFIG[paramKey];
        const step = (conf.max - conf.min) > 10000 ? 50 : 10;
        const delta = e.deltaY < 0 ? step : -step;
        setCount(paramKey, state.counts[paramKey] + delta);
      }, { passive: false });
    });
  }

  // --- Inputs and Steppers Sync ---
  function setupInputsAndSteppers() {
    Object.keys(PARAM_CONFIG).forEach(paramKey => {
      const input = document.getElementById(`count-${paramKey}`);
      if (!input) return;

      input.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) return;
        const conf = PARAM_CONFIG[paramKey];
        val = clamp(val, conf.min, conf.max);
        state.counts[paramKey] = val;
        updateKnobRotation(paramKey);
        updateConvertedDisplay(paramKey);
        updateCalculations();
      });

      input.addEventListener('blur', (e) => {
        let val = parseInt(e.target.value, 10);
        const conf = PARAM_CONFIG[paramKey];
        if (isNaN(val)) val = conf.defaultCount;
        setCount(paramKey, val);
      });
    });

    // Up / Down Stepper Buttons
    document.querySelectorAll('.step-btn').forEach(btn => {
      let intervalId = null;
      let timeoutId = null;

      const doStep = () => {
        const paramKey = btn.getAttribute('data-target');
        const step = parseInt(btn.getAttribute('data-step'), 10) || 1;
        setCount(paramKey, state.counts[paramKey] + step);
      };

      const startHold = (e) => {
        e.preventDefault();
        doStep();
        timeoutId = setTimeout(() => {
          intervalId = setInterval(doStep, 60);
        }, 300);
      };

      const stopHold = () => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
      };

      btn.addEventListener('mousedown', startHold);
      btn.addEventListener('mouseup', stopHold);
      btn.addEventListener('mouseleave', stopHold);
      btn.addEventListener('touchstart', startHold, { passive: false });
      btn.addEventListener('touchend', stopHold);
    });
  }

  // --- Core State Updates ---
  function setCount(paramKey, newCount) {
    const conf = PARAM_CONFIG[paramKey];
    const clamped = clamp(Math.round(newCount), conf.min, conf.max);
    state.counts[paramKey] = clamped;

    const input = document.getElementById(`count-${paramKey}`);
    if (input && document.activeElement !== input) {
      input.value = clamped;
    }

    updateKnobRotation(paramKey);
    updateConvertedDisplay(paramKey);
    updateCalculations();
    updateLiveProtocolModal();
  }

  function updateKnobRotation(paramKey) {
    const container = document.getElementById(`knob-${paramKey}`);
    if (!container) return;

    const dial = container.querySelector('.knob-dial');
    if (!dial) return;

    const conf = PARAM_CONFIG[paramKey];
    const fraction = (state.counts[paramKey] - conf.min) / (conf.max - conf.min);
    const angle = KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);

    dial.style.transform = `rotate(${angle.toFixed(1)}deg)`;
  }

  function updateConvertedDisplay(paramKey) {
    const conf = PARAM_CONFIG[paramKey];
    const displayEl = document.getElementById(`val-${paramKey}`);
    if (!displayEl) return;

    const physicalVal = state.counts[paramKey] * conf.scale;
    displayEl.textContent = `${physicalVal.toFixed(conf.decimals)} ${conf.unit}`;
  }

  // --- Metrology & Electrical Calculations ---
  function setupCalculations() {
    // Initial calculation will run in updateAll
  }

  function updateCalculations() {
    const v = state.counts.voltage * PARAM_CONFIG.voltage.scale; // Volts
    const i = state.counts.phaseCurrent * PARAM_CONFIG.phaseCurrent.scale; // Amperes
    const phaseDeg = state.counts.phaseAngle * PARAM_CONFIG.phaseAngle.scale; // Degrees
    const phaseRad = phaseDeg * (Math.PI / 180);

    // 1. Apparent Power S = V * I (VA)
    const s_va = v * i;
    const s_kva = s_va / 1000;

    // 2. Active Power P = V * I * cos(phi) (Watts)
    const p_w = v * i * Math.cos(phaseRad);
    const p_kw = p_w / 1000;

    // 3. Reactive Power Q = V * I * sin(phi) (VAr)
    const q_var = v * i * Math.sin(phaseRad);
    const q_kvar = q_var / 1000;

    // 4. Power Factor PF = cos(phi)
    const pf = Math.cos(phaseRad);

    // 5. Energy over 1 Hour Simulation
    // Energy (kWh) = Power (kW) * 1 hour
    const actEnergy_kwh = Math.abs(p_kw);
    const racEnergy_kvarh = Math.abs(q_kvar);
    const apEnergy_kvah = Math.abs(s_kva);

    // Update UI elements with exact styling format matching the screenshot
    const elP = document.getElementById('metric-p');
    const elQ = document.getElementById('metric-q');
    const elS = document.getElementById('metric-s');
    const elPF = document.getElementById('metric-pf');

    const elAct = document.getElementById('metric-energy-act');
    const elRac = document.getElementById('metric-energy-rac');
    const elAp = document.getElementById('metric-energy-ap');

    if (elP) elP.textContent = `${p_kw.toFixed(3)} kW`;
    if (elQ) elQ.textContent = `${q_kvar.toFixed(3)} kvar`;
    if (elS) elS.textContent = `${s_kva.toFixed(3)} kVA`;
    if (elPF) elPF.textContent = `${Math.abs(pf).toFixed(3)}`;

    if (elAct) elAct.textContent = `${actEnergy_kwh.toFixed(3)} kWh`;
    if (elRac) elRac.textContent = `${racEnergy_kvarh.toFixed(3)} kvarh`;
    if (elAp) elAp.textContent = `${apEnergy_kvah.toFixed(3)} kVAh`;
  }

  // --- UART Frame Serializer (SRS v1.4 Section 5) ---
  function generateUartMessage() {
    const v = (state.counts.voltage * PARAM_CONFIG.voltage.scale).toFixed(2);
    const pc = (state.counts.phaseCurrent * PARAM_CONFIG.phaseCurrent.scale).toFixed(3);
    const nc = (state.counts.neutralCurrent * PARAM_CONFIG.neutralCurrent.scale).toFixed(3);
    const pa = (state.counts.phaseAngle * PARAM_CONFIG.phaseAngle.scale).toFixed(2);
    const na = (state.counts.neutralAngle * PARAM_CONFIG.neutralAngle.scale).toFixed(2);
    const pfa = (state.counts.powerFactorAngle * PARAM_CONFIG.powerFactorAngle.scale).toFixed(2);

    return `VOLTAGE=${v},PHASE_CURRENT=${pc},NEUTRAL_CURRENT=${nc},PHASE_ANGLE=${pa},NEUTRAL_ANGLE=${na},POWER_FACTOR_ANGLE=${pfa}\n`;
  }

  // --- Generate C Structure Text (SRS v1.4 Section 4) ---
  function generateCStructText() {
    return `#include <stdint.h>

typedef struct
{
    uint32_t voltage_centi_v;           // ${state.counts.voltage}  (${(state.counts.voltage * 0.01).toFixed(2)} V)
    uint32_t phase_current_milli_a;     // ${state.counts.phaseCurrent}   (${(state.counts.phaseCurrent * 0.001).toFixed(3)} A)
    uint32_t neutral_current_milli_a;   // ${state.counts.neutralCurrent}    (${(state.counts.neutralCurrent * 0.001).toFixed(3)} A)
    int16_t  phase_angle_centi_deg;     // ${state.counts.phaseAngle}   (${(state.counts.phaseAngle * 0.01).toFixed(2)}°)
    int16_t  neutral_angle_centi_deg;   // ${state.counts.neutralAngle}   (${(state.counts.neutralAngle * 0.01).toFixed(2)}°)
    int16_t  power_factor_angle_centi_deg; // ${state.counts.powerFactorAngle} ( ${(state.counts.powerFactorAngle * 0.01).toFixed(2)}°)
} serial_parameters_t;                  // Total: 18 bytes (RL78/I1C Static Memory)`;
  }

  function updateLiveProtocolModal() {
    const frameEl = document.getElementById('liveUartFrame');
    const cstructEl = document.getElementById('liveCStructCode');
    if (frameEl) frameEl.textContent = generateUartMessage();
    if (cstructEl) cstructEl.textContent = generateCStructText();
  }

  // --- Transmit Parameter Frame via UART ---
  async function sendParametersToDevice(isAuto = false) {
    const rawFrame = generateUartMessage();
    state.packetsSent++;

    const txCountEl = document.getElementById('txCount');
    if (txCountEl) txCountEl.textContent = state.packetsSent;

    // Flash send button & activity dot
    const btnSend = document.getElementById('btnSend');
    const dot = document.getElementById('txActivityDot');

    if (btnSend && !isAuto) {
      btnSend.classList.add('sending');
      setTimeout(() => btnSend.classList.remove('sending'), 400);
    }
    if (dot) {
      dot.classList.add('active');
      setTimeout(() => dot.classList.remove('active'), 250);
    }

    // Hardware Web Serial API transmission if connected
    if (state.isHardwareSerial && state.serialWriter) {
      try {
        const encoder = new TextEncoder();
        await state.serialWriter.write(encoder.encode(rawFrame));
      } catch (err) {
        console.error('Serial TX error:', err);
        showToast('Error writing to COM port: ' + err.message);
        return;
      }
    }

    if (!isAuto) {
      showToast(`Frame sent to ${state.portName} (${rawFrame.trim().slice(0, 38)}...)`);
    }
  }

  // --- Periodic Transmission Scheduler (SRS FR-11) ---
  function updatePeriodicScheduler() {
    if (state.periodicTimerId) {
      clearInterval(state.periodicTimerId);
      state.periodicTimerId = null;
    }

    if (state.isPeriodicSending) {
      state.periodicTimerId = setInterval(() => {
        sendParametersToDevice(true);
      }, state.transmissionInterval);
    }
  }

  // --- Serial Connection & Footer Controls ---
  function setupSerialAndFooter() {
    // Reset Button
    const btnReset = document.getElementById('btnReset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        applyPreset('default');
        showToast('Reset all parameters to default!');
      });
    }

    // Load Preset Button
    const btnLoadPreset = document.getElementById('btnLoadPreset');
    const presetSelect = document.getElementById('presetSelect');
    if (btnLoadPreset && presetSelect) {
      btnLoadPreset.addEventListener('click', () => {
        const val = presetSelect.value;
        applyPreset(val);
        showToast(`Loaded preset: ${presetSelect.options[presetSelect.selectedIndex].text}`);
      });
    }

    // Send to Device Button
    const btnSend = document.getElementById('btnSend');
    if (btnSend) {
      btnSend.addEventListener('click', () => {
        sendParametersToDevice(false);
      });
    }

    // Update Interval Selector
    const intervalSelect = document.getElementById('updateIntervalSelect');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', (e) => {
        state.transmissionInterval = parseInt(e.target.value, 10) || 1000;
        updatePeriodicScheduler();
        showToast(`Update interval set to ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Connection badge toggle
    const connBadge = document.getElementById('connectionStatusBadge');
    if (connBadge) {
      connBadge.addEventListener('click', () => {
        state.isConnected = !state.isConnected;
        connBadge.className = `status-indicator ${state.isConnected ? 'connected' : 'disconnected'}`;
        const label = document.getElementById('statusLabel');
        if (label) label.textContent = state.isConnected ? 'Connected' : 'Offline';
        showToast(state.isConnected ? 'UART Port Connected' : 'UART Port Disconnected');
      });
    }

    // COM Port & Baud selectors open settings modal
    const comBtn = document.getElementById('comPortBtn');
    const baudBtn = document.getElementById('baudBtn');
    if (comBtn) comBtn.addEventListener('click', openComModal);
    if (baudBtn) baudBtn.addEventListener('click', openComModal);

    // Save COM Settings in modal
    const saveComBtn = document.getElementById('saveComSettingsBtn');
    if (saveComBtn) {
      saveComBtn.addEventListener('click', handleComSave);
    }
  }

  function applyPreset(presetName) {
    const preset = PRESETS[presetName] || PRESETS.default;
    Object.keys(preset).forEach(key => {
      setCount(key, preset[key]);
    });
  }

  // --- Modals Setup ---
  function setupModals() {
    // UART Frame Modal
    const viewProtocolBtn = document.getElementById('viewProtocolBtn');
    const protocolModal = document.getElementById('protocolModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalOkBtn = document.getElementById('modalOkBtn');
    const copyFrameBtn = document.getElementById('copyFrameBtn');

    if (viewProtocolBtn && protocolModal) {
      viewProtocolBtn.addEventListener('click', () => {
        updateLiveProtocolModal();
        protocolModal.classList.add('active');
      });
    }

    [modalCloseBtn, modalOkBtn].forEach(b => {
      if (b && protocolModal) {
        b.addEventListener('click', () => protocolModal.classList.remove('active'));
      }
    });

    if (copyFrameBtn) {
      copyFrameBtn.addEventListener('click', () => {
        const frameText = generateUartMessage();
        navigator.clipboard.writeText(frameText).then(() => {
          copyFrameBtn.textContent = 'Copied!';
          setTimeout(() => copyFrameBtn.textContent = 'Copy', 1500);
        });
      });
    }

    // Periodic Checkbox inside modal
    const autoStreamCheckbox = document.getElementById('autoStreamCheckbox');
    if (autoStreamCheckbox) {
      autoStreamCheckbox.addEventListener('change', (e) => {
        state.isPeriodicSending = e.target.checked;
        updatePeriodicScheduler();
        showToast(state.isPeriodicSending ? 'Periodic transmission started' : 'Periodic transmission paused');
      });
    }

    // COM Modal Close
    const comModal = document.getElementById('comModal');
    const comModalCloseBtn = document.getElementById('comModalCloseBtn');
    if (comModalCloseBtn && comModal) {
      comModalCloseBtn.addEventListener('click', () => comModal.classList.remove('active'));
    }

    // Close on backdrop click
    [protocolModal, comModal].forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) m.classList.remove('active');
        });
      }
    });

    // Window controls mock
    const winMin = document.getElementById('winMinimize');
    const winMax = document.getElementById('winMaximize');
    const winClose = document.getElementById('winClose');

    if (winMin) winMin.addEventListener('click', () => showToast('Application minimized to taskbar'));
    if (winMax) winMax.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
    if (winClose) winClose.addEventListener('click', () => showToast('Session active (Renesas RL78 Simulator)'));
  }

  function openComModal() {
    const modal = document.getElementById('comModal');
    if (modal) modal.classList.add('active');
  }

  async function handleComSave() {
    const modeSelect = document.getElementById('serialModeSelect');
    const baudSelect = document.getElementById('comBaudSelect');
    const comModal = document.getElementById('comModal');

    const baud = parseInt(baudSelect.value, 10) || 9600;
    state.baudRate = baud;
    const baudLabel = document.getElementById('baudLabel');
    if (baudLabel) baudLabel.textContent = `${baud} bps`;

    if (modeSelect.value === 'webserial' && navigator.serial) {
      try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: baud });
        state.serialPort = port;
        state.serialWriter = port.writable.getWriter();
        state.isHardwareSerial = true;
        state.portName = 'HARDWARE-UART';
        state.isConnected = true;
        document.getElementById('comPortLabel').textContent = 'USB-UART';
        showToast(`Connected to Hardware UART at ${baud} bps!`);
      } catch (err) {
        console.warn('Web Serial connection canceled or failed:', err);
        showToast('Web Serial canceled. Staying in Simulated COM3 mode.');
      }
    } else {
      state.isHardwareSerial = false;
      state.portName = 'COM3';
      state.isConnected = true;
      document.getElementById('comPortLabel').textContent = 'COM3';
      showToast(`Port configured: COM3 @ ${baud} bps (8N1)`);
    }

    if (comModal) comModal.classList.remove('active');
  }

  // --- Real-Time Clock Simulator ---
  function startClock() {
    const clockEl = document.getElementById('clockDisplay');
    if (!clockEl) return;

    // Use current date or live time matching format
    const updateTime = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const year = now.getFullYear();
      const month = pad(now.getMonth() + 1);
      const day = pad(now.getDate());
      const hours = pad(now.getHours());
      const mins = pad(now.getMinutes());
      const secs = pad(now.getSeconds());
      clockEl.textContent = `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  // --- Toast Notification Helper ---
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;

    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // --- Clamp Utility ---
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // --- Update All Controls ---
  function updateAll() {
    Object.keys(PARAM_CONFIG).forEach(key => {
      const input = document.getElementById(`count-${key}`);
      if (input) input.value = state.counts[key];
      updateKnobRotation(key);
      updateConvertedDisplay(key);
    });
    updateCalculations();
    updateLiveProtocolModal();
  }

})();
