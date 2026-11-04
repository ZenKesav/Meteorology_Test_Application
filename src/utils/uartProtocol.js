/**
 * UART Protocol and Metrology Calculations
 * Compliant with Renesas RL78/I1C SRS v1.4
 */
import { PARAM_DEFINITIONS } from '../constants/parameters.js';

export function generateUartMessage(counts, params) {
  const v = (counts.voltage * params.voltage.scale).toFixed(2);
  const pc = (counts.phaseCurrent * params.phaseCurrent.scale).toFixed(2);
  const neutralCurrent = counts.neutralCurrent * params.neutralCurrent.scale;
  const nc = neutralCurrent === 0 ? '0' : neutralCurrent.toFixed(2);
  const pa = (counts.phaseAngle * params.phaseAngle.scale).toFixed(2);
  const na = (counts.neutralAngle * params.neutralAngle.scale).toFixed(2);
  const pfa = (counts.powerFactorAngle * params.powerFactorAngle.scale).toFixed(2);

  return `{"command":"load","voltage":${v},"phase_current":${pc},"neutral_current":${nc},"phase_angle":${pa},"neutral_angle":${na},"power_factor_angle":${pfa}}\r\n`;
}

export function generateCStructCode(counts) {
  const vVal = (counts.voltage * 0.01).toFixed(2);
  const pcVal = (counts.phaseCurrent * 0.001).toFixed(3);
  const ncVal = (counts.neutralCurrent * 0.001).toFixed(3);
  const paVal = (counts.phaseAngle * 0.01).toFixed(2);
  const naVal = (counts.neutralAngle * 0.01).toFixed(2);
  const pfaVal = (counts.powerFactorAngle * 0.01).toFixed(2);

  return `#include <stdint.h>

typedef struct
{
    uint32_t voltage_centi_v;           // ${counts.voltage}  (${vVal} V)
    uint32_t phase_current_milli_a;     // ${counts.phaseCurrent}   (${pcVal} A)
    uint32_t neutral_current_milli_a;   // ${counts.neutralCurrent}    (${ncVal} A)
    int16_t  phase_angle_centi_deg;     // ${counts.phaseAngle}   (${paVal}°)
    int16_t  neutral_angle_centi_deg;   // ${counts.neutralAngle}   (${naVal}°)
    int16_t  power_factor_angle_centi_deg; // ${counts.powerFactorAngle} (${pfaVal}°)
} serial_parameters_t;                  // Total: 18 bytes (3x4B + 3x2B)`;
}

export function calculatePowerFactor(angleDegrees) {
  if (!Number.isFinite(angleDegrees)) return 0;
  const cosine = Math.cos(angleDegrees * (Math.PI / 180));
  if (Math.abs(cosine) < 1e-12) return 0;
  return Math.min(1, Math.max(0, Math.abs(cosine)));
}

function getEngineeringValue(count, definition) {
  const rawCount = Number(count);
  return Number.isFinite(rawCount) ? rawCount * definition.scale : 0;
}

function formatDisplayValue(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  return Number(value.toPrecision(5)).toString();
}

function formatPower(value, baseUnit, kiloUnit) {
  if (Math.abs(value) >= 1000) {
    return { value: formatDisplayValue(value / 1000), unit: kiloUnit };
  }
  return { value: formatDisplayValue(value), unit: baseUnit };
}

export function calculatePowerAndEnergy(counts, timeHours = 1) {
  const voltage = getEngineeringValue(counts.voltage, PARAM_DEFINITIONS.voltage);
  const phaseCurrent = getEngineeringValue(counts.phaseCurrent, PARAM_DEFINITIONS.phaseCurrent);
  const phaseAngle = getEngineeringValue(counts.phaseAngle, PARAM_DEFINITIONS.phaseAngle);
  const hours = Number.isFinite(timeHours) && timeHours >= 0 ? timeHours : 0;
  const apparentPowerVa = voltage * phaseCurrent;
  const phaseRadians = phaseAngle * (Math.PI / 180);
  const powerFactor = calculatePowerFactor(phaseAngle);
  const activePowerW = apparentPowerVa * powerFactor;
  const activeEnergyKwh = (voltage * phaseCurrent * powerFactor * hours) / 1000;
  const sine = Math.sin(phaseRadians);
  const reactivePowerVar = apparentPowerVa * (Math.abs(sine) < 1e-12 ? 0 : sine);

  const activePower = formatPower(activePowerW, 'W', 'kW');
  const reactivePower = formatPower(reactivePowerVar, 'var', 'kvar');
  const apparentPower = formatPower(apparentPowerVa, 'VA', 'kVA');

  return {
    activePowerValue: activePower.value,
    activePowerUnit: activePower.unit,
    reactivePowerValue: reactivePower.value,
    reactivePowerUnit: reactivePower.unit,
    apparentPowerValue: apparentPower.value,
    apparentPowerUnit: apparentPower.unit,
    powerFactor: formatDisplayValue(powerFactor),
    activeEnergyValue: formatDisplayValue(activeEnergyKwh),
    activeEnergyUnit: 'kWh',
    reactiveEnergyValue: formatDisplayValue(reactivePowerVar * hours / 1000),
    reactiveEnergyUnit: 'kvarh',
    apparentEnergyValue: formatDisplayValue(apparentPowerVa * hours / 1000),
    apparentEnergyUnit: 'kVAh'
  };
}
