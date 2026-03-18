import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ReviewQueue } from './pages/ReviewQueue.js';
import { PostMonitor } from './pages/PostMonitor.js';
import { VerticalManagement } from './pages/VerticalManagement.js';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/review" replace />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/posts" element={<PostMonitor />} />
        <Route path="/verticals" element={<VerticalManagement />} />
      </Routes>
    </Layout>
  );
}
