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

  it('displays welcome section with input options', () => {
    render(<Onboarding />);
    
    // Check for welcome message
    expect(screen.getByText(/Welcome to Your Food Tracker/i)).toBeInTheDocument();
    
    // Check for photo input option
    expect(screen.getByText(/Snap a Photo/i)).toBeInTheDocument();
    expect(screen.getByText(/take a photo of your meal/i)).toBeInTheDocument();
    
    // Check for natural language input option
    expect(screen.getByText(/Natural Language/i)).toBeInTheDocument();
    expect(screen.getByText(/type what you ate naturally/i)).toBeInTheDocument();
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

    // Wait for Step 2 UI (user metrics form)
    await waitFor(() => {
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    });
  });

  it('defaults to imperial units and allows switching to metric', async () => {
    render(<Onboarding />);

    // Step 1: API Key
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Wait for Step 2 to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    });

    // Should show imperial inputs by default
    expect(screen.getByText(/ft/i)).toBeInTheDocument();
    expect(screen.getByText(/in/i)).toBeInTheDocument();
    expect(screen.getByText(/lbs/i)).toBeInTheDocument();

    // Switch to metric
    fireEvent.click(screen.getByRole('button', { name: /metric/i }));

    // Should now show metric inputs
    expect(screen.getByText(/cm/i)).toBeInTheDocument();
    expect(screen.getByText(/kg/i)).toBeInTheDocument();
  });

  it('calculates suggested macros based on imperial metrics', async () => {
    render(<Onboarding />);

    // Step 1: API Key
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Wait for Step 2 to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    });

    // Fill out user metrics in imperial
    fireEvent.change(screen.getByLabelText(/gender/i), { target: { value: 'male' } });
    const feetInput = screen.getByPlaceholderText('5');
    const inchesInput = screen.getByPlaceholderText('8');
    const weightInput = screen.getByLabelText(/weight/i);
    
    fireEvent.change(feetInput, { target: { value: '5' } });
    fireEvent.change(inchesInput, { target: { value: '8' } });
    fireEvent.change(weightInput, { target: { value: '154' } });
    fireEvent.change(screen.getByLabelText(/activity level/i), { target: { value: 'moderate' } });

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    // Wait for Step 3 to appear (suggested macros)
    await waitFor(() => {
      expect(screen.getByText(/suggested macros/i)).toBeInTheDocument();
      // Verify that reasonable macro suggestions are shown
      expect(screen.getByLabelText(/calories/i)).toHaveValue();
      expect(screen.getByLabelText(/protein/i)).toHaveValue();
      expect(screen.getByLabelText(/fat/i)).toHaveValue();
      expect(screen.getByLabelText(/carbs/i)).toHaveValue();
    });
  });

  it('calculates suggested macros based on metric metrics', async () => {
    render(<Onboarding />);

    // Step 1: API Key
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Wait for Step 2 to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    });

    // Switch to metric
    fireEvent.click(screen.getByRole('button', { name: /metric/i }));

    // Fill out user metrics in metric
    fireEvent.change(screen.getByLabelText(/gender/i), { target: { value: 'male' } });
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '173' } });
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText(/activity level/i), { target: { value: 'moderate' } });

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    // Wait for Step 3 to appear (suggested macros)
    await waitFor(() => {
      expect(screen.getByText(/suggested macros/i)).toBeInTheDocument();
      // Verify that reasonable macro suggestions are shown
      expect(screen.getByLabelText(/calories/i)).toHaveValue();
      expect(screen.getByLabelText(/protein/i)).toHaveValue();
      expect(screen.getByLabelText(/fat/i)).toHaveValue();
      expect(screen.getByLabelText(/carbs/i)).toHaveValue();
    });
  });

  it('allows editing suggested macros before saving', async () => {
    render(<Onboarding />);

    // Step 1: API Key
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Step 2: User Metrics
    await waitFor(() => {
      expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/gender/i), { target: { value: 'male' } });
    const feetInput = screen.getByPlaceholderText('5');
    const inchesInput = screen.getByPlaceholderText('8');
    const weightInput = screen.getByLabelText(/weight/i);
    
    fireEvent.change(feetInput, { target: { value: '5' } });
    fireEvent.change(inchesInput, { target: { value: '8' } });
    fireEvent.change(weightInput, { target: { value: '154' } });
    fireEvent.change(screen.getByLabelText(/activity level/i), { target: { value: 'moderate' } });
    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    // Step 3: Edit Suggested Macros
    await waitFor(() => {
      expect(screen.getByText(/suggested macros/i)).toBeInTheDocument();
    });

    // Edit the suggested values
    fireEvent.change(screen.getByLabelText(/calories/i), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText(/protein/i), { target: { value: '180' } });
    fireEvent.change(screen.getByLabelText(/fat/i), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/carbs/i), { target: { value: '300' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // Verify final save and completion
    await waitFor(() => {
      expect(setDocMock).toHaveBeenCalledTimes(2); // Once for API key, once for final goals
      expect(screen.getByText(/all set/i)).toBeInTheDocument();
    });
  });
}); 