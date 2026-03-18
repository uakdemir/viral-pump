import React, { useState, useEffect, useCallback } from 'react';
import { fetchPosts, retryPost } from '../api.js';

type TabStatus = 'ready' | 'posted' | 'failed';

const tabStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
  background: 'transparent',
  color: '#94a3b8',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#334155',
  color: '#f1f5f9',
};

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '12px',
};

const statusDot: Record<string, React.CSSProperties> = {
  ready: { width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' },
  posted: { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' },
  failed: { width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' },
};

export function PostMonitor() {
  const [tab, setTab] = useState<TabStatus>('ready');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchPosts(tab);
      setPosts(data);
    } catch (err) {
      console.error('Failed to load posts', err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleRetry = async (id: string) => {
    await retryPost(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
        {(['ready', 'posted', 'failed'] as TabStatus[]).map(s => (
          <button key={s} onClick={() => setTab(s)} style={tab === s ? activeTabStyle : tabStyle}>
            {s === 'ready' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading...</div>
      ) : posts.length === 0 ? (
        <div style={{ color: '#64748b', padding: '40px', textAlign: 'center', background: '#1e293b', borderRadius: '8px' }}>
          No {tab} posts.
        </div>
      ) : (
        posts.map(post => (
          <div key={post.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={statusDot[post.status] ?? statusDot.ready} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
                {post.accountName ?? 'Unknown Account'} ({post.platform ?? 'twitter'})
              </span>
            </div>

            {post.postedAt && (
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                Posted: {new Date(post.postedAt).toLocaleString()}
                {post.platformPostId && <> &middot; ID: {post.platformPostId}</>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {post.visualUrl && (
                <img src={post.visualUrl} alt="" style={{ width: '120px', height: '63px', objectFit: 'cover', borderRadius: '4px' }} />
              )}
              <div style={{ flex: 1, fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, minWidth: '200px' }}>
                {post.finalText ?? post.generatedText ?? ''}
              </div>
            </div>

            {post.status === 'failed' && (
              <div style={{ marginTop: '12px' }}>
                <button onClick={() => handleRetry(post.id)} style={{
                  padding: '6px 14px', borderRadius: '6px', border: 'none',
                  background: '#f59e0b', color: '#000', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                }}>
                  Retry Now
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
