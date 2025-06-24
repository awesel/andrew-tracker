import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Auth } from './Auth';
import { useAuthState } from './hooks/useAuthState';

// Mock the authentication hook so we can control the auth state
jest.mock('./hooks/useAuthState');

const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;

describe('Branding', () => {
  it('shows the Munch Club name and burger logo in the unauthenticated Auth screen', () => {
    // Arrange: simulate an unauthenticated, non-loading state
    mockUseAuthState.mockReturnValue({
      user: null,
      userData: null,
      loading: false,
      needsOnboarding: false,
    } as any);

    // Act
    render(<Auth />);

    // Assert
    expect(screen.getByText('Munch Club')).toBeInTheDocument();
    // The logo emoji lives inside the .logo-icon div, which renders as plain text
    expect(screen.getByText('🍔')).toBeInTheDocument();
  });
}); 