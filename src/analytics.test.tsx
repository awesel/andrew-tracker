import React from 'react';
import { render } from '@testing-library/react';
import { inject } from '@vercel/analytics';
import App from './App';

// Mock the analytics inject function
jest.mock('@vercel/analytics', () => ({
  inject: jest.fn(),
}));

// Mock the useAuthState hook
jest.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({ user: null, loading: false, needsOnboarding: false })
}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Analytics Integration', () => {
  const mockInject = inject as jest.MockedFunction<typeof inject>;

  beforeEach(() => {
    mockInject.mockClear();
  });

  it('should call inject function when app initializes', () => {
    render(<App />);
    
    expect(mockInject).toHaveBeenCalledTimes(1);
  });

  it('should call inject without any parameters', () => {
    render(<App />);
    
    expect(mockInject).toHaveBeenCalledWith();
  });
}); 