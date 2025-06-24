import React from 'react';
// React import kept for TypeScript compilation
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditGoals } from './components/EditGoals';
import '@testing-library/jest-dom';

// Mock the useAuthState hook to provide fake user context with existing goals
jest.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({
    user: { uid: 'testUID' },
    loading: false,
    userData: {
      dailyGoals: {
        calories: 2000,
        protein: 150,
        fat: 70,
        carbs: 250,
      },
    },
    needsOnboarding: false,
  }),
}));

// Mock Firestore functions
var setDocMock = jest.fn();
var docMock = jest.fn();

jest.mock('firebase/firestore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: (...args: any[]) => {
    docMock(...args);
    return 'docRef';
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: (...args: any[]) => {
    return setDocMock(...args as unknown[]);
  },
  getFirestore: jest.fn(() => ({})),
}));

describe('EditGoals Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pre-fills the form with existing goals', () => {
    render(<EditGoals />);

    expect(screen.getByLabelText(/daily calories/i)).toHaveValue(2000);
    expect(screen.getByLabelText(/protein/i)).toHaveValue(150);
    expect(screen.getByLabelText(/fat/i)).toHaveValue(70);
    expect(screen.getByLabelText(/carbs/i)).toHaveValue(250);
  });

  it('updates goals and saves to firestore', async () => {
    render(<EditGoals />);

    // Change calories input
    const caloriesInput = screen.getByLabelText(/daily calories/i);
    fireEvent.change(caloriesInput, { target: { value: '1800' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(setDocMock).toHaveBeenCalledWith(
        'docRef',
        expect.objectContaining({
          dailyGoals: expect.objectContaining({ calories: 1800 }),
        }),
        { merge: true },
      );
    });
  });
}); 