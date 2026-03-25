import React from 'react';
import type { Alert } from '../types';

interface RightPanelProps {
  alerts: Alert[];
  selectedAlert: Alert | null;
  onSelectAlert: (alert: Alert) => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  alerts,
  selectedAlert,
  onSelectAlert,
}) => {
  const getSeverityClass = (severity: string) => {
    if (severity === 'critical') return 'alert-critical';
    if (severity === 'moderate') return 'alert-moderate';
    return 'alert-low';
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical') return '▲';
    if (severity === 'moderate') return '■';
    return '●';
  };

  const formatTime = (timestamp?: string | Date) => {
    if (!timestamp) return '--:--';
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const getScore = (alert: Alert) => {
    return alert.score ?? alert.change_score ?? 0;
  };

  return (
    <div className="right-panel with-brackets">
      <div className="panel-header">
        ◈ ALERT FEED
        <div className="live-indicator"></div>
      </div>

      <div className="panel-body">
        {alerts.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '20px' }}>
            NO ALERTS
          </div>
        ) : (
          alerts.map((alert) => {
            const severity = alert.severity ?? 'low';
            const score = getScore(alert);
            return (
              <div
                key={alert.id}
                className={`alert-card ${getSeverityClass(severity)} ${selectedAlert?.id === alert.id ? 'selected' : ''}`}
                onClick={() => onSelectAlert(alert)}
                style={{
                  borderColor:
                    severity === 'critical'
                      ? 'var(--red-critical)'
                      : severity === 'moderate'
                        ? 'var(--orange-alert)'
                        : 'var(--yellow-objective)',
                }}
              >
                <div className="alert-card-header">
                  <div className="alert-severity">
                    <span className="alert-severity-icon">{getSeverityIcon(severity)}</span>
                    {severity.toUpperCase()}
                  </div>
                  <div className="alert-time">{formatTime(alert.timestamp ?? alert.fired_at)}</div>
                </div>

                <div className="alert-location">
                  {alert.location}
                  {alert.country && `, ${alert.country}`}
                </div>

                <div className="alert-cause">
                  {alert.cause ?? alert.probable_cause ?? 'NDVI LOSS'}
                </div>

                <div>
                  <div className="alert-score-label">
                    SCORE <span className="alert-score-value">{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="alert-progress">
                    <div
                      className="alert-progress-bar"
                      style={{ width: `${Math.min(score * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RightPanel;
