import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ReviewQueue } from './pages/ReviewQueue.js';
import { PostMonitor } from './pages/PostMonitor.js';
import { VerticalManagement } from './pages/VerticalManagement.js';
import { HealthDashboard } from './pages/HealthDashboard.js';
import { HealthStatusProvider } from './hooks/useHealthStatus.js';

export function App() {
  return (
    <HealthStatusProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/review" replace />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/posts" element={<PostMonitor />} />
          <Route path="/verticals" element={<VerticalManagement />} />
          <Route path="/health" element={<HealthDashboard />} />
        </Routes>
      </Layout>
    </HealthStatusProvider>
  );
}
