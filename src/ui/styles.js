/**
 * OpenVault UI Styles
 * CSS-in-JS for progressive disclosure UI components
 */

export const styles = `
/* Warning Banner */
.openvault-warning-banner {
  display: flex;
  gap: 12px;
  padding: 15px;
  margin-bottom: 15px;
  background: rgba(255, 193, 7, 0.1);
  border-left: 3px solid #ffc107;
  border-radius: 4px;
}

.openvault-warning-icon {
  font-size: 1.5em;
  flex-shrink: 0;
}

.openvault-warning-title {
  font-weight: bold;
  color: #ffc107;
  margin-bottom: 4px;
}

.openvault-warning-text {
  font-size: 0.9em;
  color: var(--SmartThemeBodyColor);
  line-height: 1.4;
}

/* Graph Stats Card */
.openvault-graph-stats {
  margin-bottom: 15px;
}

.openvault-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  padding: 15px;
}

.openvault-stat-item {
  text-align: center;
}

.openvault-stat-number {
  font-size: 1.8em;
  font-weight: bold;
  color: var(--SmartThemeQuoteColor);
}

.openvault-stat-label {
  font-size: 0.8em;
  color: var(--SmartThemeEmColor);
  margin-top: 4px;
}

.openvault-stats-footer {
  padding: 10px 15px;
  border-top: 1px solid rgba(255,255,255,0.1);
  text-align: center;
  font-size: 0.85em;
  color: var(--SmartThemeEmColor);
}

/* Payload Calculator Colors */
.openvault-payload-calc {
  padding: 12px;
  margin-top: 15px;
  border-radius: 4px;
  font-size: 0.95em;
}

.openvault-payload-calc.payload-safe {
  background: rgba(40, 167, 69, 0.15);
  border: 1px solid #28a745;
}

.openvault-payload-calc.payload-caution {
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid #ffc107;
}

.openvault-payload-calc.payload-warning {
  background: rgba(253, 126, 20, 0.15);
  border: 1px solid #fd7e14;
}

.openvault-payload-calc.payload-danger {
  background: rgba(220, 53, 69, 0.15);
  border: 1px solid #dc3545;
}

.openvault-payload-warning {
  font-size: 0.85em;
  margin-top: 8px;
  opacity: 0.8;
}
`;

/**
 * Inject styles into the document head
 * Call this when initializing the settings panel
 */
export function injectStyles() {
  const existingStyle = document.getElementById('openvault-ui-styles');
  if (existingStyle) return; // Already injected

  const styleEl = document.createElement('style');
  styleEl.id = 'openvault-ui-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}
