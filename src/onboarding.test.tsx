import React from 'react';
// React import kept for TypeScript compilation (JSX transformation)
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Onboarding } from './components/Onboarding';
import '@testing-library/jest-dom';

// Mock the useAuthState hook to provide a fake user context
jest.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({
    user: { uid: 'testUID' },
    loading: false,
    userData: null,
    needsOnboarding: true,
  }),
}));

// Using var for hoisting so jest.mock factory can reference
var setDocMock = jest.fn();
var docMock = jest.fn(() => 'docRef');

jest.mock('firebase/firestore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: (...args: any[]) => {
    // @ts-ignore
    docMock(...args);
    return 'docRef';
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: (...args: any[]) => {
    return setDocMock(...args as unknown[]);
  },
  getFirestore: jest.fn(() => ({})),
}));

describe('Onboarding Wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves from step 1 to step 2 when API key is provided', async () => {
    render(<Onboarding />);

    // Step 1 should render API key input
    const apiKeyInput = screen.getByLabelText(/api key/i);
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test' } });

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    // API key should be saved immediately
    expect(setDocMock).toHaveBeenCalled();

    // Wait for Step 2 UI
    await waitFor(() => {
      expect(screen.getByLabelText(/calories/i)).toBeInTheDocument();
    });
  });

  it('saves goals to firestore and shows completion step', async () => {
    render(<Onboarding />);

    // Step 1
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Wait for Step 2 to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/calories/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/calories/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/protein/i), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText(/fat/i), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText(/carbs/i), { target: { value: '250' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      // Called once for API key save + once for goals save
      expect(setDocMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/all set/i)).toBeInTheDocument();
    });
  });
}); 