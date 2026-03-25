import React from 'react';
import type { Alert } from '../types';

interface DetailPanelProps {
  alert: Alert | null;
  country: string | null;
  onClose: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ alert, country, onClose }) => {
  const fallbackLocation = country ?? 'UNKNOWN';

  const getScore = () => {
    if (!alert) {
      return 0;
    }
    return alert.score ?? alert.change_score ?? 0;
  };

  const formatLocation = () => {
    if (!alert) {
      return fallbackLocation;
    }

    let location = alert.location;
    if (alert.country) {
      location += `, ${alert.country}`;
    }
    return location;
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-location">{formatLocation()}</div>
        <button className="detail-close" onClick={onClose}>
          ✕ DISMISS
        </button>
      </div>

      <div className="detail-body">
        <div className="detail-col">
          <div className="detail-row">
            <span className="detail-label">SEVERITY</span>
            <span className="detail-value">{(alert?.severity ?? 'low').toUpperCase()}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">SCORE</span>
            <span className="detail-value">{(getScore() * 100).toFixed(1)}%</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">CAUSE</span>
            <span className="detail-value">{alert?.cause ?? alert?.probable_cause ?? 'REGIONAL SUMMARY'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">LATITUDE</span>
            <span className="detail-value">{alert?.latitude ?? '--'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">LONGITUDE</span>
            <span className="detail-value">{alert?.longitude ?? '--'}</span>
          </div>
        </div>

        <div className="detail-col">
          <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
            BEFORE IMAGE
          </div>
          {alert?.before_image ? (
            <img
              src={alert.before_image}
              alt="Before"
              style={{
                width: '100%',
                aspectRatio: '1',
                border: '1px solid var(--border-dim)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                border: '1px solid var(--border-dim)',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-dim)',
                fontSize: '10px',
              }}
            >
              NO DATA
            </div>
          )}
          <button className="detail-export-btn" style={{ marginTop: '6px', width: '100%' }}>
            ⇩ EXPORT
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetailPanel;
