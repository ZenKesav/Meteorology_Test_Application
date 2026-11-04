# Energy Meter Simulator (Single Phase) - React & Node.js

This application is built with **React 18** and **Vite**, specifically designed for serial parameter transmission to the **Renesas RL78/I1C Dual Controller** over UART based on **SRS v1.4**.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

Vite listens on all network interfaces at port `3000`. Open `http://<computer-LAN-IP>:3000` from another device on the same network. For example, if the computer's Wi-Fi IPv4 address is `192.168.20.28`, use `http://192.168.20.28:3000`.

On Windows, allow inbound TCP port `3000` from the local subnet in an elevated PowerShell window if the firewall blocks connections:

```powershell
New-NetFirewallRule -DisplayName "Outdid Sync (Vite)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Domain,Private -RemoteAddress LocalSubnet
```

The app is a client-side React application; it has no backend service or database. App state stays in the browser, and serial preferences are stored in that browser's local storage. Web Serial hardware access requires a secure context (HTTPS or localhost), so it is not available to other devices when they open the plain-HTTP LAN URL.

### 3. Production Build
```bash
npm run build
```

---

## 📂 Architecture Overview

```
Zenmeter/
├── index.html                 # Vite HTML entry point
├── package.json               # React 18, Vite dependencies & scripts
├── vite.config.js             # Vite config with React plugin (Port 3000)
└── src/
    ├── main.jsx               # React 18 DOM mount
    ├── App.jsx                # Main orchestrator (state, serial TX, metrology)
    ├── index.css              # Custom styles, rotary knob bevels & animations
    ├── constants/
    │   ├── parameters.js      # 6 RL78 parameters, data types, scales & units
    │   └── presets.js         # Default, Nominal, Light, Heavy, Resistive, Inductive
    ├── components/
    │   ├── Header.jsx         # Titlebar, COM status, baud rate, window buttons
    │   ├── ParameterCard.jsx  # Reusable card with stepper & converted display
    │   ├── RotaryKnob.jsx     # Interactive rotary knob with radial tick marks
    │   ├── PowerCalculation.jsx   # Active (P), Reactive (Q), Apparent (S), PF
    │   ├── EnergyCalculation.jsx  # 1-Hour simulation energy values
    │   ├── FooterControls.jsx # Simulation clock, interval, presets, send button
    │   ├── UartModal.jsx      # Live ASCII frame & C structure inspector
    │   ├── ComModal.jsx       # Serial simulation & Web Serial API settings
    │   └── Toast.jsx          # User feedback popups
    └── utils/
        └── uartProtocol.js    # ASCII framing (SRS Section 5) & math formulas
```

---

## 🛠 Features

1. **6 Renesas RL78/I1C Metrology Parameters**:
   - `Voltage` (uint32_t, 0.01 V/count, default: `23050` = `230.50 V`)
   - `Phase Current` (uint32_t, 0.001 A/count, default: `5250` = `5.250 A`)
   - `Neutral Current` (uint32_t, 0.001 A/count, default: `150` = `0.150 A`)
   - `Phase Angle` (int16_t, 0.01°/count, default: `3000` = `30.00°`)
   - `Neutral Angle` (int16_t, 0.01°/count, default: `2850` = `28.50°`)
   - `Power Factor` is displayed as `|cos(φ)|` derived from the phase angle. The PF-angle control and phase-angle control stay synchronized so the UART `PHASE_ANGLE` and `POWER_FACTOR_ANGLE` fields agree (default: `3000` = `30.00°`, PF `0.866`).
   - Numeric parameter inputs are raw protocol counts; calculations convert them once using each parameter's engineering scale (for example, `24000` voltage counts = `240 V`, `50` phase-current counts = `0.05 A`). Power and energy recalculate from the unrounded engineering values whenever counts change.

2. **Rotary Knob Controls**:
   - Realistic 3D metallic bevel dial with radial tick lines.
   - Drag pointer up/down, scroll with mouse wheel, or type directly into the integer stepper.

3. **Real-time Electrical Math**:
   - Active Power: $P = V \times I \times PF = 1.048\text{ kW}$
   - Reactive Power: $Q = V \times I \times \sin(\phi) = 0.605\text{ kvar}$
   - Apparent Power: $S = V \times I = 1.210\text{ kVA}$
   - Power Factor: $\cos(\phi) = 0.866$
   - 1-Hour Energy: $1.048\text{ kWh}$, $0.605\text{ kvarh}$, $1.210\text{ kVAh}$

4. **UART JSON Framing**:
   - Generates a JSON object with a `load` command and parameter values in engineering units, terminated by CRLF. Frames do not include a payload timestamp:
     `{"command":"load","voltage":240.00,"phase_current":5.00,"neutral_current":0.00,"phase_angle":30.00,"neutral_angle":28.50,"power_factor_angle":1.00}<CR><LF>`
   - Real hardware Web Serial API support (`navigator.serial`) and simulated mode, with Send/Receive and receive-only Monitoring modes. The communication settings page shows the number and names of connected USB serial devices visible to the app, plus each device's connection status. Set the serial settings and click **Connect USB Device** to connect without leaving the app page. The browser's device picker is required the first time to grant permission; after permission is granted, the app reconnects automatically when the authorized adapter is plugged in. The header shows the connection type and visible USB-device count, and shows a green **Connected** status only while the serial port is open. The last selected adapter name and serial settings are saved in the browser so the device remains identifiable after disconnects or reloads. The Silicon Labs CP210x appears as **Silicon Labs CP210x USB to UART Bridge**. The browser does not expose Windows COM names or unauthorized devices, so COM3 and the total Windows port count cannot be inferred. Baud rate, data bits, parity, and stop bits are configurable.
   - Automatic UART transmission supports editable intervals in seconds or minutes and an optional packet limit (`0` means unlimited). The sent total increments only after a frame is successfully transmitted.
   - Manual sends open the in-app **Serial Terminal** and display each successfully sent UART frame with a timestamp and destination. Simulated frames are clearly labeled and are not represented as hardware transmissions.
   - Hardware connections require an explicit baud rate; set baud rate, data bits, parity, and stop bits to match the RL78 UART configuration. Before hardware testing, confirm the RL78 UART channel/pin assignment, TX/RX/GND wiring, compatible logic voltage, and the firmware's expected message/response format. The browser's Web Serial API does not expose Windows COM labels such as COM3.
   - Periodic transmission scheduler with configurable interval (100ms - 5s).
