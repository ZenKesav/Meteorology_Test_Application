import React from 'react';

export default function Toast({ message, isVisible, type = 'success' }) {
  return (
    <div
      className={`toast toast-${type} ${isVisible ? 'show' : ''}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {message}
    </div>
  );
}
