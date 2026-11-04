import React, { useEffect, useState } from 'react';
import RotaryKnob from './RotaryKnob.jsx';
import { calculatePowerFactor } from '../utils/uartProtocol.js';

export default function ParameterCard({
  paramKey,
  config,
  value,
  onChange
}) {
  const {
    name,
    min,
    max,
    scale,
    unit,
    decimals,
    gaugeMin,
    gaugeMax,
    badgeType,
    indicatorClass,
    stepDefault
  } = config;

  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const isPowerFactor = paramKey === 'powerFactorAngle';
  const displayDecimals = Math.min(decimals, 2);
  const unroundedPhysicalValue = isPowerFactor
    ? calculatePowerFactor(value * scale)
    : value * scale;
  const physicalValue = unroundedPhysicalValue.toFixed(displayDecimals);
  const gaugeValue = unroundedPhysicalValue;

  const handleInputChange = (e) => {
    const nextInput = e.target.value;
    setInputValue(nextInput);
    if (!/^-?\d+$/.test(nextInput)) return;
    const parsed = Number(nextInput);
    if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  const handleInputBlur = () => {
    const parsed = Number(inputValue);
    const valid = Number.isSafeInteger(parsed);
    const clamped = valid ? Math.max(min, Math.min(max, parsed)) : value;
    setInputValue(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const handleStep = (step) => {
    const next = Math.max(min, Math.min(max, value + step));
    onChange(next);
  };

  // Render SVG Icon depending on badge type
  const renderIcon = () => {
    if (badgeType === 'pink') {
      return <span className="pf-text-icon">PF</span>;
    }
    if (badgeType === 'green' || badgeType === 'purple') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3 12c3-8 6-8 9 0s6 8 9 0" />
        </svg>
      );
    }
    // Lightning bolt for blue, orange, teal
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .73.27.56.57L11 21z" />
      </svg>
    );
  };

  return (
    <div className={`param-card card-${paramKey}`}>
      <div className="card-top">
        <div className={`card-icon-badge ${badgeType}-badge`}>
          {renderIcon()}
        </div>
        <span className="card-name">{name}</span>
      </div>

      <div className="card-body">
        <div className={`knob-column ${gaugeMax ? 'industrial-gauge-column' : ''}`}>
          <RotaryKnob
            paramKey={paramKey}
            value={value}
            gaugeValue={gaugeValue}
            gaugeMin={gaugeMin}
            gaugeMax={gaugeMax}
            gaugeScale={scale}
            min={min}
            max={max}
            step={stepDefault}
            indicatorClass={indicatorClass}
            onChange={onChange}
          />
          {!gaugeMax && (
            <>
              <div className="knob-range-labels">
                <span className="min-lbl">{min}</span>
                <span className="max-lbl">{max}</span>
              </div>
              <div className="knob-type-label">Count range</div>
            </>
          )}
        </div>

        <div className="values-column">
          <div className="count-input-group">
            <label htmlFor={`count-${paramKey}`} className="sr-only">Count</label>
            <div className="stepper-box">
              <input
                id={`count-${paramKey}`}
                type="number"
                className="count-input"
                value={inputValue}
                min={min}
                max={max}
                step="1"
                onChange={handleInputChange}
                onBlur={handleInputBlur}
              />
              <div className="stepper-buttons">
                <button
                  type="button"
                  className="step-btn up"
                  onClick={() => handleStep(stepDefault)}
                  disabled={value >= max}
                  title={`+${stepDefault}`}
                  aria-label={`Increase ${name} count`}
                >
                  +
                </button>
                <button
                  type="button"
                  className="step-btn down"
                  onClick={() => handleStep(-stepDefault)}
                  disabled={value <= min}
                  title={`-${stepDefault}`}
                  aria-label={`Decrease ${name} count`}
                >
                  −
                </button>
              </div>
            </div>
          </div>

          <div className="converted-display-group">
            <div className="converted-lbl">{name}{unit ? ` (${unit})` : ''}</div>
            <div className="converted-val">
              {physicalValue}{unit ? ` ${unit}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
