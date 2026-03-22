import React from 'react';
import type { ContentItemAiConfig, ContentItemCost } from '../api-types.js';

interface ContentCardProps {
  item: {
    id: string;
    generatedText?: string | null;
    finalText?: string | null;
    visualUrl?: string | null;
    generationStatus: string;
    reviewStatus: string;
    aiConfig: ContentItemAiConfig;
    cost: ContentItemCost;
    createdAt: string;
  };
  onApprove?: (id: string) => void;
  onEdit?: (id: string) => void;
  onReject?: (id: string) => void;
}

const cardStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '16px',
};

const btnBase: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
};

export function ContentCard({ item, onApprove, onEdit, onReject }: ContentCardProps) {
  const templateName = item.aiConfig.templateName ?? 'Unknown';
  const tokensUsed = item.cost.apiTokens ?? 0;
  const timeAgo = getTimeAgo(item.createdAt);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {item.visualUrl && (
          <img
            src={item.visualUrl}
            alt="Preview"
            style={{
              width: '180px',
              height: '94px',
              objectFit: 'cover',
              borderRadius: '6px',
              background: '#0f172a',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
            {templateName} &middot; {timeAgo} &middot; {tokensUsed} tokens
          </div>
          <div style={{ fontSize: '15px', lineHeight: 1.6, color: '#e2e8f0' }}>
            {item.finalText ?? item.generatedText ?? 'No text generated'}
          </div>
        </div>
      </div>

      {(onApprove || onEdit || onReject) && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {onApprove && (
            <button
              onClick={() => onApprove(item.id)}
              style={{ ...btnBase, background: '#22c55e', color: '#000' }}
            >
              Approve
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(item.id)}
              style={{ ...btnBase, background: '#3b82f6', color: '#fff' }}
            >
              Edit
            </button>
          )}
          {onReject && (
            <button
              onClick={() => onReject(item.id)}
              style={{ ...btnBase, background: '#ef4444', color: '#fff' }}
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
