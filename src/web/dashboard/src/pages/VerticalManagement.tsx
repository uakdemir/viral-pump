import React, { useState, useEffect } from 'react';
import { fetchVerticals, toggleVertical, toggleTriggerRule } from '../api.js';

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
};

const sectionStyle: React.CSSProperties = {
  marginTop: '16px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: '#0f172a',
  borderRadius: '6px',
  marginBottom: '4px',
  fontSize: '14px',
};

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: '40px', height: '22px', borderRadius: '11px', border: 'none',
      background: enabled ? '#22c55e' : '#475569', cursor: 'pointer',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
        position: 'absolute', top: '3px', transition: 'left 0.2s',
        left: enabled ? '20px' : '4px',
      }} />
    </button>
  );
}

export function VerticalManagement() {
  const [verticals, setVerticals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await fetchVerticals();
      setVerticals(data);
    } catch (err) {
      console.error('Failed to load verticals', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleVertical = async (id: string) => {
    await toggleVertical(id);
    load();
  };

  const handleToggleRule = async (id: string) => {
    await toggleTriggerRule(id);
    load();
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Verticals</h2>

      {verticals.map(v => (
        <div key={v.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '16px', fontWeight: 600 }}>{v.name}</span>
              <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '8px' }}>({v.slug})</span>
            </div>
            <Toggle enabled={v.status === 'active'} onToggle={() => handleToggleVertical(v.id)} />
          </div>

          {v.accounts?.length > 0 && (
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px' }}>
              Accounts: {v.accounts.map((a: any) => `${a.name} (${a.platform})`).join(', ')}
            </div>
          )}

          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Data Sources</div>
            {v.dataSources?.map((ds: any) => (
              <div key={ds.id} style={rowStyle}>
                <span>{ds.provider}</span>
                <span style={{ color: '#64748b' }}>
                  Poll: {(ds.pollIntervalMs / 1000).toFixed(0)}s
                  {ds.lastPolledAt && <> &middot; Last: {new Date(ds.lastPolledAt).toLocaleTimeString()}</>}
                </span>
              </div>
            ))}
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Trigger Rules</div>
            {v.triggerRules?.map((rule: any) => (
              <div key={rule.id} style={rowStyle}>
                <div>
                  <span>{rule.name}</span>
                  <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>
                    {rule.fireMode} &middot; Cooldown: {(rule.cooldownMs / 3600000).toFixed(0)}h
                    {rule.lastFiredAt && <> &middot; Last: {new Date(rule.lastFiredAt).toLocaleTimeString()}</>}
                  </span>
                </div>
                <Toggle enabled={rule.enabled} onToggle={() => handleToggleRule(rule.id)} />
              </div>
            ))}
          </div>

          <div style={sectionStyle}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Content Templates</div>
            {v.contentTemplates?.map((t: any) => (
              <div key={t.id} style={rowStyle}>
                <span>{t.name}</span>
                <span style={{ color: '#64748b' }}>{t.contentLayer} &middot; {t.category}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
