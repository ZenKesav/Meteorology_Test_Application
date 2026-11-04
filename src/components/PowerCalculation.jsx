import React from 'react';

export default function PowerCalculation({ metrics }) {
  return (
    <div className="calc-sub-card">
      <div className="sub-card-header">
        <div className="sub-card-icon blue-bolt">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .73.27.56.57L11 21z" />
          </svg>
        </div>
        <h3 className="sub-card-title">Power Calculation</h3>
      </div>

      <div className="power-calc-grid">
        {/* Active Power (P) */}
        <div className="metric-block">
          <div className="metric-title">Active Power (P)</div>
          <div className="metric-value green-val">{metrics.activePowerValue} {metrics.activePowerUnit}</div>
        </div>

        {/* Reactive Power (Q) */}
        <div className="metric-block">
          <div className="metric-title">Reactive Power (Q)</div>
          <div className="metric-value blue-val">{metrics.reactivePowerValue} {metrics.reactivePowerUnit}</div>
        </div>

        {/* Apparent Power (S) */}
        <div className="metric-block">
          <div className="metric-title">Apparent Power (S)</div>
          <div className="metric-value dark-blue-val">{metrics.apparentPowerValue} {metrics.apparentPowerUnit}</div>
        </div>

        {/* Power Factor (PF) */}
        <div className="metric-block">
          <div className="metric-title">Power Factor (PF)</div>
          <div className="metric-value orange-val">{metrics.powerFactor}</div>
        </div>
      </div>
    </div>
  );
}
