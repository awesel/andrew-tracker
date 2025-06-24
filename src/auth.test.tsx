import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { BrowserRouter } from 'react-router-dom';
import { Auth } from './Auth';
import { useAuthState } from './hooks/useAuthState';

// Mock Firebase
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('./hooks/useAuthState');

const mockSignInWithPopup = signInWithPopup as jest.MockedFunction<typeof signInWithPopup>;
const mockSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;

describe('Auth Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders Google sign-in button when user is not authenticated', () => {
    mockUseAuthState.mockReturnValue({ user: null, userData: null, loading: false, needsOnboarding: false });
    
    render(
      <BrowserRouter>
        <Auth />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  test('calls signInWithPopup when Google sign-in button is clicked', async () => {
    mockUseAuthState.mockReturnValue({ user: null, userData: null, loading: false, needsOnboarding: false });
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com'
    };
    mockSignInWithPopup.mockResolvedValue({ user: mockUser } as any);
    
    render(
      <BrowserRouter>
        <Auth />
      </BrowserRouter>
    );
    
    const signInButton = screen.getByText('Sign in with Google');
    fireEvent.click(signInButton);
    
    await waitFor(() => {
      expect(mockSignInWithPopup).toHaveBeenCalledWith(
        expect.any(Object), // auth instance
        expect.any(GoogleAuthProvider)
      );
    });
  });

  test('creates user document on first login', async () => {
    mockUseAuthState.mockReturnValue({ user: null, userData: null, loading: false, needsOnboarding: false });
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com'
    };
    mockSignInWithPopup.mockResolvedValue({ user: mockUser } as any);
    mockGetDoc.mockResolvedValue({ exists: () => false } as any);
    
    render(
      <BrowserRouter>
        <Auth />
      </BrowserRouter>
    );
    
    const signInButton = screen.getByText('Sign in with Google');
    fireEvent.click(signInButton);
    
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.any(Object), // doc reference
        {
          email: 'test@example.com',
          createdAt: expect.any(Date)
        }
      );
    });
  });

  test('does not create user document if it already exists', async () => {
    mockUseAuthState.mockReturnValue({ user: null, userData: null, loading: false, needsOnboarding: false });
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com'
    };
    mockSignInWithPopup.mockResolvedValue({ user: mockUser } as any);
    mockGetDoc.mockResolvedValue({ exists: () => true } as any);
    
    render(
      <BrowserRouter>
        <Auth />
      </BrowserRouter>
    );
    
    const signInButton = screen.getByText('Sign in with Google');
    fireEvent.click(signInButton);
    
    await waitFor(() => {
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });
});

describe('useAuthState hook', () => {
  test('redirects to /onboarding when goals are missing', () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com'
    };
    
    // This test would verify the redirect logic
    // Implementation depends on routing library used
  });
}); 