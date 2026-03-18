import React, { useState } from 'react';

interface EditModalProps {
  originalText: string;
  onSave: (finalText: string) => void;
  onCancel: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px',
};

const modalStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '24px',
  width: '100%',
  maxWidth: '560px',
};

export function EditModal({ originalText, onSave, onCancel }: EditModalProps) {
  const [text, setText] = useState(originalText);

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Edit Content</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
            {'\u2715'}
          </button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            Original (read-only)
          </label>
          <div style={{
            padding: '12px', background: '#0f172a', borderRadius: '6px',
            fontSize: '14px', color: '#64748b', lineHeight: 1.5,
          }}>
            {originalText}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
            Your edit
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            style={{
              width: '100%', minHeight: '120px', padding: '12px',
              background: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
              color: '#f1f5f9', fontSize: '14px', lineHeight: 1.5, resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {text.length} / 280 characters
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155',
            background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 500,
          }}>
            Cancel
          </button>
          <button onClick={() => onSave(text)} style={{
            padding: '8px 16px', borderRadius: '6px', border: 'none',
            background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600,
          }}>
            Save &amp; Approve
          </button>
        </div>
      </div>
    </div>
  );
}
