import type {
  ContentItemDTO,
  PostsResponse,
  VerticalDTO,
  MetricsHistoryResponse,
} from './api-types.js';

const BASE = '';

// Review Queue
export async function fetchPendingContent(): Promise<ContentItemDTO[]> {
  const res = await fetch(`${BASE}/api/content-items?status=pending`);
  return res.json();
}

export async function approveContent(id: string) {
  const res = await fetch(`${BASE}/api/content-items/${id}/approve`, { method: 'POST' });
  return res.json();
}

export async function editAndApprove(id: string, finalText: string) {
  const res = await fetch(`${BASE}/api/content-items/${id}/edit-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ finalText }),
  });
  return res.json();
}

export async function rejectContent(id: string, notes?: string) {
  const res = await fetch(`${BASE}/api/content-items/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  return res.json();
}

// Post Monitor
export async function fetchPostsWithFilters(params: {
  status?: string;
  platform?: string;
  vertical?: string;
  since?: string;
  until?: string;
  summary?: boolean;
}): Promise<PostsResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.platform) qs.set('platform', params.platform);
  if (params.vertical) qs.set('vertical', params.vertical);
  if (params.since) qs.set('since', params.since);
  if (params.until) qs.set('until', params.until);
  if (params.summary) qs.set('summary', 'true');
  const res = await fetch(`${BASE}/api/posts?${qs}`);
  return res.json();
}

export async function fetchMetricsHistory(postId: string): Promise<MetricsHistoryResponse> {
  const res = await fetch(`${BASE}/api/posts/${postId}/metrics-history`);
  return res.json();
}

export async function retryPost(id: string) {
  const res = await fetch(`${BASE}/api/posts/${id}/retry`, { method: 'POST' });
  return res.json();
}

// Verticals
export async function fetchVerticals(): Promise<VerticalDTO[]> {
  const res = await fetch(`${BASE}/api/verticals`);
  return res.json();
}

export async function toggleVertical(id: string) {
  const res = await fetch(`${BASE}/api/verticals/${id}/toggle`, { method: 'PATCH' });
  return res.json();
}

export async function toggleTriggerRule(id: string) {
  const res = await fetch(`${BASE}/api/verticals/trigger-rules/${id}/toggle`, { method: 'PATCH' });
  return res.json();
}
