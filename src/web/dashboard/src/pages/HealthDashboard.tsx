import React from 'react';
import { useHealthStatus } from '../hooks/useHealthStatus.js';

const dotColors: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '16px',
  marginTop: '16px',
};

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
};

const cardTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '16px',
  fontWeight: 600,
  color: '#f1f5f9',
  marginBottom: '12px',
};

const dot = (status: string): React.CSSProperties => ({
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  backgroundColor: dotColors[status] ?? '#64748b',
  flexShrink: 0,
});

const metricRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '14px',
  color: '#cbd5e1',
};

const barOuter: React.CSSProperties = {
  height: '6px',
  background: '#334155',
  borderRadius: '3px',
  marginTop: '8px',
  overflow: 'hidden',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function HealthDashboard() {
  const { data, error, lastUpdated } = useHealthStatus();

  if (error || !data) {
    return (
      <div>
        <h1 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 700 }}>System Health</h1>
        <p style={{ color: '#94a3b8', marginTop: '16px' }}>Health check unavailable.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 700 }}>System Health</h1>

      <div style={gridStyle}>
        {/* Job Queue Card */}
        <div id="queue" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.jobQueue.status)} />
            Job Queue
          </div>
          <div style={metricRow}>
            <span>Pending</span>
            <span>{data.jobQueue.pending}</span>
          </div>
          <div style={metricRow}>
            <span>Processing</span>
            <span>{data.jobQueue.processing}</span>
          </div>
          <div style={metricRow}>
            <span>Failed (1h)</span>
            <span>{data.jobQueue.failedLastHour}</span>
          </div>
        </div>

        {/* Failure Rate Card */}
        <div id="failures" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.failureRate.status)} />
            Failure Rate
          </div>
          <div style={metricRow}>
            <span>Posts (24h)</span>
            <span>{data.failureRate.total24h}</span>
          </div>
          <div style={metricRow}>
            <span>Failed</span>
            <span>{data.failureRate.failed24h}</span>
          </div>
          <div style={metricRow}>
            <span>Rate</span>
            <span>{Math.round(data.failureRate.rate * 100)}%</span>
          </div>
          <div style={barOuter}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(data.failureRate.rate * 100, 100)}%`,
                background: dotColors[data.failureRate.status] ?? '#64748b',
                borderRadius: '3px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>

        {/* Data Sources Card */}
        <div id="polling" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.dataSources.status)} />
            Data Sources
          </div>
          {data.dataSources.sources.map(s => (
            <div key={s.id} style={metricRow}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={dot(s.status)} />
                {s.provider}
              </span>
              <span>{timeAgo(s.lastPolledAt)}</span>
            </div>
          ))}
          {data.dataSources.sources.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '14px' }}>No active data sources</p>
          )}
        </div>

        {/* Accounts Card */}
        <div id="accounts" style={cardStyle}>
          <div style={cardTitleStyle}>
            <span style={dot(data.accounts.status)} />
            Accounts
          </div>
          {data.accounts.accounts.map(a => (
            <div key={a.id} style={metricRow}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={dot(a.status)} />
                {a.name}
              </span>
              <span style={{ textTransform: 'capitalize' }}>{a.lastPostStatus ?? 'no posts'}</span>
            </div>
          ))}
          {data.accounts.accounts.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '14px' }}>No active accounts</p>
          )}
        </div>
      </div>

      {lastUpdated && (
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '16px', textAlign: 'right' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
