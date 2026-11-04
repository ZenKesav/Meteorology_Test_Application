import React, { useRef, useMemo, useEffect } from 'react';

const KNOB_MIN_ANGLE = -135;
const KNOB_MAX_ANGLE = 135;

export default function RotaryKnob({
  paramKey,
  value,
  gaugeValue,
  gaugeMin,
  gaugeMax,
  gaugeScale,
  min,
  max,
  step = 1,
  indicatorClass = 'blue-ind',
  onChange
}) {
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Compute rotation angle from value
  const angle = useMemo(() => {
    const rawFraction = gaugeMax
      ? (gaugeValue - gaugeMin) / (gaugeMax - gaugeMin)
      : (value - min) / (max - min);
    const fraction = Math.max(0, Math.min(1, rawFraction));
    return KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);
  }, [value, gaugeValue, gaugeMin, gaugeMax, min, max]);

  // Generate radial ticks
  const ticksSvg = useMemo(() => {
    const tickCount = gaugeMax ? 31 : 21;
    const radius = gaugeMax ? 48 : 42;
    const cx = gaugeMax ? 60 : 50;
    const cy = gaugeMax ? 60 : 50;
    const elements = [];

    for (let i = 0; i < tickCount; i++) {
      const fraction = i / (tickCount - 1);
      const angleDeg = KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);
      const angleRad = (angleDeg - 90) * (Math.PI / 180);

      const majorInterval = gaugeMax ? 5 : 20;
      const isMajor = i % majorInterval === 0;
      const tickLength = isMajor ? 6 : 3;
      const tickColor = isMajor ? '#3b5f88' : '#8faac6';
      const strokeWidth = isMajor ? 1.8 : 1;

      const x1 = cx + (radius - tickLength) * Math.cos(angleRad);
      const y1 = cy + (radius - tickLength) * Math.sin(angleRad);
      const x2 = cx + radius * Math.cos(angleRad);
      const y2 = cy + radius * Math.sin(angleRad);

      elements.push(
        <line
          key={i}
          x1={x1.toFixed(1)}
          y1={y1.toFixed(1)}
          x2={x2.toFixed(1)}
          y2={y2.toFixed(1)}
          stroke={tickColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      );
    }
    return elements;
  }, [gaugeMax]);

  const scaleNumbers = useMemo(() => {
    if (!gaugeMax) return null;

    return Array.from({ length: 6 }, (_, index) => {
      const fraction = index / 5;
      const angleRad = (KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE) - 90) * (Math.PI / 180);
      const tickValue = gaugeMin + fraction * (gaugeMax - gaugeMin);
      const label = gaugeMax <= 1
        ? tickValue.toFixed(1)
        : String(Math.round(tickValue));

      return (
        <text
          key={index}
          x={(60 + 56 * Math.cos(angleRad)).toFixed(1)}
          y={(60 + 56 * Math.sin(angleRad)).toFixed(1)}
          textAnchor="middle"
          dominantBaseline="central"
          className="knob-scale-number"
        >
          {label}
        </text>
      );
    });
  }, [gaugeMin, gaugeMax]);

  const updateFromPointer = (event) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    if (Math.hypot(dx, dy) < bounds.width * 0.12) return;

    const pointerAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const knobAngle = ((pointerAngle + 90 + 180) % 360 + 360) % 360 - 180;
    const clampedAngle = Math.max(KNOB_MIN_ANGLE, Math.min(KNOB_MAX_ANGLE, knobAngle));
    const fraction = (clampedAngle - KNOB_MIN_ANGLE) / (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);

    let nextValue;
    if (gaugeMax && gaugeScale) {
      const selectedGaugeValue = gaugeMin + fraction * (gaugeMax - gaugeMin);
      nextValue = paramKey === 'powerFactorAngle'
        ? Math.acos(Math.max(0, Math.min(1, selectedGaugeValue))) * (180 / Math.PI) / gaugeScale
        : selectedGaugeValue / gaugeScale;
    } else {
      nextValue = min + fraction * (max - min);
    }

    const nextCount = Math.max(min, Math.min(max, Math.round(nextValue)));
    if (nextCount !== value) onChange(nextCount);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerMove = (event) => {
    if (isDraggingRef.current) updateFromPointer(event);
  };

  const endPointerDrag = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    const clamped = Math.max(min, Math.min(max, value + delta));
    onChange(clamped);
  };

  const handleKeyDown = (e) => {
    const direction = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1
        : 0;
    if (direction === 0) return;
    e.preventDefault();
    onChange(Math.max(min, Math.min(max, value + (direction * step))));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [value, min, max, onChange]);

  return (
    <div className={`knob-outer-ring ${gaugeMax ? 'industrial-gauge' : ''}`}>
      <div
        ref={containerRef}
        className={`knob-container ${gaugeMax ? 'industrial-gauge-control' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={`${paramKey} count`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        title="Drag, scroll, or use arrow keys to adjust"
      >
        <svg className={`knob-ticks ${scaleNumbers ? 'numbered' : ''}`} viewBox={scaleNumbers ? '0 0 120 120' : '0 0 100 100'}>
          {ticksSvg}
          {scaleNumbers}
        </svg>
        <div
          className="knob-dial"
          style={{ transform: `rotate(${angle.toFixed(1)}deg)` }}
        >
          <div className="knob-bevel">
            <div className="knob-cap">
              <div className={`knob-indicator ${indicatorClass}`}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
