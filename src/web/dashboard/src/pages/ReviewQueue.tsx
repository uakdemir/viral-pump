import React, { useState, useEffect, useCallback } from 'react';
import { ContentCard } from '../components/ContentCard.js';
import { EditModal } from '../components/EditModal.js';
import { fetchPendingContent, approveContent, editAndApprove, rejectContent } from '../api.js';

export function ReviewQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPendingContent();
      setItems(data);
    } catch (err) {
      console.error('Failed to load pending content', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleApprove = async (id: string) => {
    await approveContent(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleEdit = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) setEditingItem(item);
  };

  const handleSaveEdit = async (finalText: string) => {
    if (!editingItem) return;
    await editAndApprove(editingItem.id, finalText);
    setItems(prev => prev.filter(i => i.id !== editingItem.id));
    setEditingItem(null);
  };

  const handleReject = async (id: string) => {
    await rejectContent(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>
        Pending Review ({items.length})
      </h2>

      {items.length === 0 ? (
        <div style={{ color: '#64748b', padding: '40px', textAlign: 'center', background: '#1e293b', borderRadius: '8px' }}>
          No content pending review. The worker will generate new content when events are detected.
        </div>
      ) : (
        items.map(item => (
          <ContentCard
            key={item.id}
            item={item}
            onApprove={handleApprove}
            onEdit={handleEdit}
            onReject={handleReject}
          />
        ))
      )}

      {editingItem && (
        <EditModal
          originalText={editingItem.generatedText ?? ''}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
