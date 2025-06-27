import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Moderator } from './Moderator';
import { useAuthState } from '../hooks/useAuthState';

// Mock the auth hook
jest.mock('../hooks/useAuthState');
const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;

// Mock Firebase functions
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Moderator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show access denied for non-moderator users', () => {
    mockUseAuthState.mockReturnValue({
      user: { email: 'user@example.com' } as any,
      userData: null,
      loading: false,
      needsOnboarding: false,
    });

    renderWithRouter(<Moderator />);
    
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('This page is restricted to moderators only.')).toBeInTheDocument();
  });

  it('should show loading state while checking authentication', () => {
    mockUseAuthState.mockReturnValue({
      user: null,
      userData: null,
      loading: true,
      needsOnboarding: false,
    });

    renderWithRouter(<Moderator />);
    
    expect(screen.getByText('Loading moderator dashboard...')).toBeInTheDocument();
  });

  it('should allow access for andrew.wesel@gmail.com', async () => {
    mockUseAuthState.mockReturnValue({
      user: { email: 'andrew.wesel@gmail.com', uid: 'test-uid' } as any,
      userData: null,
      loading: false,
      needsOnboarding: false,
    });

    // Mock the analytics data fetch
    const mockHttpsCallable = require('firebase/functions').httpsCallable;
    mockHttpsCallable.mockReturnValue(() => Promise.resolve({
      data: {
        userCount: 25,
        weeklyAnalytics: [
          { date: '2024-01-01', photoAnalyses: 5, textAnalyses: 3 },
          { date: '2024-01-02', photoAnalyses: 8, textAnalyses: 2 },
        ],
        allPhotos: [
          { id: '1', imageUrl: 'http://example.com/photo1.jpg', createdAt: '2024-01-01' },
          { id: '2', imageUrl: 'http://example.com/photo2.jpg', createdAt: '2024-01-02' },
        ]
      }
    }));

    renderWithRouter(<Moderator />);
    
    expect(screen.getByText('Moderator Dashboard')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Total Users: 25')).toBeInTheDocument();
    });
  });

  it('should display analytics charts when data is loaded', async () => {
    mockUseAuthState.mockReturnValue({
      user: { email: 'andrew.wesel@gmail.com', uid: 'test-uid' } as any,
      userData: null,
      loading: false,
      needsOnboarding: false,
    });

    const mockHttpsCallable = require('firebase/functions').httpsCallable;
    mockHttpsCallable.mockReturnValue(() => Promise.resolve({
      data: {
        userCount: 25,
        weeklyAnalytics: [
          { date: '2024-01-01', photoAnalyses: 5, textAnalyses: 3 },
          { date: '2024-01-02', photoAnalyses: 8, textAnalyses: 2 },
        ],
        allPhotos: []
      }
    }));

    renderWithRouter(<Moderator />);
    
    await waitFor(() => {
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  it('should display photo gallery when photos are loaded', async () => {
    mockUseAuthState.mockReturnValue({
      user: { email: 'andrew.wesel@gmail.com', uid: 'test-uid' } as any,
      userData: null,
      loading: false,
      needsOnboarding: false,
    });

    const mockHttpsCallable = require('firebase/functions').httpsCallable;
    mockHttpsCallable.mockReturnValue(() => Promise.resolve({
      data: {
        userCount: 25,
        weeklyAnalytics: [],
        allPhotos: [
          { id: '1', imageUrl: 'http://example.com/photo1.jpg', createdAt: '2024-01-01', userName: 'User 1' },
          { id: '2', imageUrl: 'http://example.com/photo2.jpg', createdAt: '2024-01-02', userName: 'User 2' },
        ]
      }
    }));

    renderWithRouter(<Moderator />);
    
    await waitFor(() => {
      expect(screen.getByText('All User Photos')).toBeInTheDocument();
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
    });
  });
}); 