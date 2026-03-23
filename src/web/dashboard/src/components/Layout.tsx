import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HealthStatusStrip } from './HealthStatusStrip.js';

const navStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 24px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
};

const linkStyle: React.CSSProperties = {
  color: '#94a3b8',
  textDecoration: 'none',
  padding: '8px 16px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
};

const activeLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: '#f1f5f9',
  background: '#334155',
};

const mobileMenuStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '12px 24px',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div>
      <nav style={navStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>ViralEngine</span>
        </div>

        {/* Desktop nav */}
        <div className="desktop-nav" style={{ display: 'flex', gap: '4px' }}>
          <NavLink to="/review" style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}>
            Review Queue
          </NavLink>
          <NavLink to="/posts" style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}>
            Posts
          </NavLink>
          <NavLink
            to="/verticals"
            style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          >
            Verticals
          </NavLink>
        </div>

        <HealthStatusStrip />

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="mobile-menu-btn"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            color: '#f1f5f9',
            fontSize: '24px',
            cursor: 'pointer',
          }}
        >
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      {menuOpen && (
        <div style={mobileMenuStyle} className="mobile-nav">
          <NavLink
            to="/review"
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          >
            Review Queue
          </NavLink>
          <NavLink
            to="/posts"
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          >
            Posts
          </NavLink>
          <NavLink
            to="/verticals"
            onClick={() => setMenuOpen(false)}
            style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
          >
            Verticals
          </NavLink>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        @media (min-width: 641px) {
          .mobile-nav { display: none !important; }
        }
      `}</style>

      <main style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>{children}</main>
    </div>
  );
}
