import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStatus } from '../hooks/useHealthStatus.js';

const dotColors: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

const stripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginLeft: '16px',
};

const dotGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px',
};

const dotStyle = (color: string): React.CSSProperties => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: color,
  flexShrink: 0,
});

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#94a3b8',
  fontWeight: 500,
};

interface Signal {
  key: string;
  label: string;
  hash: string;
  tooltip: string;
  status: string;
}

export function HealthStatusStrip() {
  const { data, error } = useHealthStatus();
  const navigate = useNavigate();

  if (error || !data) {
    return (
      <div style={stripStyle} title="Health check unavailable">
        {['Queue', 'Failures', 'Polling', 'Accounts'].map(label => (
          <div key={label} style={dotGroupStyle}>
            <span style={dotStyle('#64748b')} />
            <span className="health-label" style={labelStyle}>
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const signals: Signal[] = [
    {
      key: 'queue',
      label: 'Queue',
      hash: '#queue',
      tooltip: `${data.jobQueue.pending} pending, ${data.jobQueue.failedLastHour} failed/hr`,
      status: data.jobQueue.status,
    },
    {
      key: 'failures',
      label: 'Failures',
      hash: '#failures',
      tooltip: `${data.failureRate.failed24h}/${data.failureRate.total24h} failed (${Math.round(data.failureRate.rate * 100)}%)`,
      status: data.failureRate.status,
    },
    {
      key: 'polling',
      label: 'Polling',
      hash: '#polling',
      tooltip: `${data.dataSources.sources.length} sources`,
      status: data.dataSources.status,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      hash: '#accounts',
      tooltip: `${data.accounts.accounts.length} accounts`,
      status: data.accounts.status,
    },
  ];

  return (
    <div style={stripStyle}>
      {signals.map(s => (
        <div
          key={s.key}
          style={dotGroupStyle}
          title={s.tooltip}
          onClick={() => navigate(`/health${s.hash}`)}
        >
          <span style={dotStyle(dotColors[s.status] ?? '#64748b')} />
          <span className="health-label" style={labelStyle}>
            {s.label}
          </span>
        </div>
      ))}
      <style>{`
        @media (max-width: 640px) {
          .health-label { display: none !important; }
        }
      `}</style>
    </div>
  );
}
