import React from 'react';

export default function EnergyCalculation({ metrics }) {
  return (
    <div className="calc-sub-card">
      <div className="sub-card-header">
        <div className="sub-card-icon blue-chart">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
          </svg>
        </div>
        <h3 className="sub-card-title">
          Energy Calculation <span className="header-dim">(1 Hour Simulation)</span>
        </h3>
      </div>

      <div className="energy-calc-list">
        {/* Active Energy */}
        <div className="energy-row">
          <div className="energy-icon-wrap green-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
            </svg>
          </div>
          <div className="energy-meta">
            <span className="energy-name">Active Energy (ACT)</span>
          </div>
          <div className="energy-val green-val">{metrics.activeEnergyValue} {metrics.activeEnergyUnit}</div>
        </div>

        {/* Reactive Energy */}
        <div className="energy-row">
          <div className="energy-icon-wrap blue-circle">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .73.27.56.57L11 21z" />
            </svg>
          </div>
          <div className="energy-meta">
            <span className="energy-name">Reactive Energy (RAC)</span>
          </div>
          <div className="energy-val blue-val">{metrics.reactiveEnergyValue} {metrics.reactiveEnergyUnit}</div>
        </div>

        {/* Apparent Energy */}
        <div className="energy-row">
          <div className="energy-icon-wrap purple-circle">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .73.27.56.57L11 21z" />
            </svg>
          </div>
          <div className="energy-meta">
            <span className="energy-name">Apparent Energy (AP)</span>
          </div>
          <div className="energy-val purple-val">{metrics.apparentEnergyValue} {metrics.apparentEnergyUnit}</div>
        </div>
      </div>

    </div>
  );
}
