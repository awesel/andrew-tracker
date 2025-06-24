import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Auth } from './Auth';
import { Onboarding } from './components/Onboarding';
import { EditGoals } from './components/EditGoals';
import { Dashboard } from './components/Dashboard';
import { useAuthState } from './hooks/useAuthState';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function LoadingScreen() {
  return (
    <div className="app">
      <div className="loading">
        <div className="loading-spinner"></div>
        <div className="logo mb-4">
          <div className="logo-icon">🍔</div>
          <span>Munch Club</span>
        </div>
        <p className="text-gray-600">Loading your nutrition data...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, needsOnboarding } = useAuthState();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Auth />;
  }

  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <div className="app">{children}</div>;
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route 
            path="/onboarding" 
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/edit-goals"
            element={
              <ProtectedRoute>
                <EditGoals />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
