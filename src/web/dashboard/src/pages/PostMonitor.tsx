import React, { useState, useEffect, useCallback } from 'react';
import { fetchPostsWithFilters, retryPost } from '../api.js';
import { MetricsChart } from '../components/MetricsChart.js';

type TabStatus = 'ready' | 'posted' | 'failed';

const tabStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 500, background: 'transparent', color: '#94a3b8',
};
const activeTabStyle: React.CSSProperties = { ...tabStyle, background: '#334155', color: '#f1f5f9' };
const cardStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '20px', marginBottom: '12px',
};
const statusDot: Record<string, React.CSSProperties> = {
  ready: { width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' },
  posted: { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' },
  failed: { width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' },
};
const selectStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155',
  background: '#0f172a', color: '#f1f5f9', fontSize: '13px', cursor: 'pointer',
};

const DATE_RANGES: Record<string, string> = {
  '': 'All Time',
  '1d': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

function getDateSince(range: string): string | undefined {
  if (!range) return undefined;
  const ms = range === '1d' ? 86400000 : range === '7d' ? 7 * 86400000 : 30 * 86400000;
  return new Date(Date.now() - ms).toISOString();
}

export function PostMonitor() {
  const [tab, setTab] = useState<TabStatus>('posted');
  const [posts, setPosts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [dateRange, setDateRange] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchPostsWithFilters({
        status: tab,
        platform: platformFilter || undefined,
        vertical: verticalFilter || undefined,
        since: getDateSince(dateRange),
        summary: true,
      });

      if (data.items) {
        setPosts(data.items);
        setSummary(data.summary);
      } else {
        setPosts(data);
        setSummary(null);
      }
    } catch (err) {
      console.error('Failed to load posts', err);
    } finally {
      setLoading(false);
    }
  }, [tab, platformFilter, verticalFilter, dateRange]);

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
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['ready', 'posted', 'failed'] as TabStatus[]).map(s => (
          <button key={s} onClick={() => setTab(s)} style={tab === s ? activeTabStyle : tabStyle}>
            {s === 'ready' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={selectStyle}>
          <option value="">All Platforms</option>
          <option value="twitter">Twitter</option>
          <option value="instagram">Instagram</option>
          <option value="linkedin">LinkedIn</option>
          <option value="pinterest">Pinterest</option>
          <option value="telegram">Telegram</option>
        </select>
        <select value={verticalFilter} onChange={e => setVerticalFilter(e.target.value)} style={selectStyle}>
          <option value="">All Verticals</option>
          <option value="gold-forex">Gold/Forex</option>
          <option value="fitness">Fitness</option>
          <option value="dating">Dating</option>
        </select>
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={selectStyle}>
          {Object.entries(DATE_RANGES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      {summary && (
        <div style={{
          padding: '12px 16px', background: '#0f172a', borderRadius: '6px',
          marginBottom: '16px', fontSize: '13px', color: '#94a3b8',
        }}>
          {summary.totalPosts} posts
          {summary.totalViews > 0 && <> &middot; {summary.totalViews.toLocaleString()} views</>}
          {summary.totalLikes > 0 && <> &middot; {summary.totalLikes.toLocaleString()} likes</>}
          {summary.totalShares > 0 && <> &middot; {summary.totalShares.toLocaleString()} shares</>}
          {summary.totalComments > 0 && <> &middot; {summary.totalComments.toLocaleString()} comments</>}
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading...</div>
      ) : posts.length === 0 ? (
        <div style={{ color: '#64748b', padding: '40px', textAlign: 'center', background: '#1e293b', borderRadius: '8px' }}>
          No {tab} posts.
        </div>
      ) : (
        posts.map((post: any) => (
          <div key={post.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={statusDot[post.status] ?? statusDot.ready} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
                {post.accountName ?? 'Unknown'} ({post.platform ?? 'twitter'})
              </span>
            </div>

            {post.postedAt && (
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                Posted: {new Date(post.postedAt).toLocaleString()}
                {post.platformPostId && <> &middot; ID: {post.platformPostId}</>}
                {post.url && <> &middot; <a href={post.url} target="_blank" rel="noopener" style={{ color: '#3b82f6' }}>View</a></>}
              </div>
            )}

            {/* Inline Metrics */}
            {post.metrics && typeof post.metrics === 'object' && Object.keys(post.metrics).length > 0 && (
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
                {post.metrics.views != null && <span>Views: {post.metrics.views.toLocaleString()} </span>}
                {post.metrics.likes != null && <span>&middot; Likes: {post.metrics.likes} </span>}
                {post.metrics.shares != null && <span>&middot; Shares: {post.metrics.shares} </span>}
                {post.metrics.comments != null && <span>&middot; Comments: {post.metrics.comments} </span>}
                {post.metrics.saves != null && <span>&middot; Saves: {post.metrics.saves} </span>}
              </div>
            )}

            {post.failureReason && (
              <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '8px' }}>
                Error: {post.failureReason}
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              {post.status === 'failed' && (
                <button onClick={() => handleRetry(post.id)} style={{
                  padding: '6px 14px', borderRadius: '6px', border: 'none',
                  background: '#f59e0b', color: '#000', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                }}>
                  Retry Now
                </button>
              )}
              {post.status === 'posted' && post.postedAt && (
                <button
                  onClick={() => setExpandedChart(expandedChart === post.id ? null : post.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155',
                    background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  {expandedChart === post.id ? 'Hide Chart' : 'View Chart'}
                </button>
              )}
            </div>

            {/* Engagement Chart */}
            {expandedChart === post.id && post.postedAt && (
              <MetricsChart postId={post.id} postedAt={post.postedAt} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
