import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { useDailyTotals } from '../hooks/useDailyTotals';
import { useDailyEntries } from '../hooks/useDailyEntries';
import { useAuthState } from '../hooks/useAuthState';
import { doc, deleteDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import '@testing-library/jest-dom';

// Mock the hooks
jest.mock('../hooks/useDailyTotals');
jest.mock('../hooks/useDailyEntries');
jest.mock('../hooks/useAuthState');

// Mock Firebase
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

jest.mock('../firebase', () => ({
  default: {},
  db: {},
}));

jest.mock('../utils/imageConversion', () => ({
  convertImageToJpeg: jest.fn(),
}));

const mockUseDailyTotals = useDailyTotals as jest.MockedFunction<typeof useDailyTotals>;
const mockUseDailyEntries = useDailyEntries as jest.MockedFunction<typeof useDailyEntries>;
const mockUseAuthState = useAuthState as jest.MockedFunction<typeof useAuthState>;

// Mock Firebase Functions
const mockHttpsCallable = jest.fn();
const mockGetFunctions = jest.fn();
const mockUploadBytes = jest.fn();
const mockGetDownloadURL = jest.fn();
const mockDeleteObject = jest.fn().mockResolvedValue(undefined);

// Mock Firebase Storage
const mockStorageRef = {
  delete: jest.fn().mockResolvedValue(undefined),
};

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
  ref: jest.fn(() => ({ delete: jest.fn().mockResolvedValue(undefined) })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn().mockResolvedValue(undefined),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks before each test
    mockGetFunctions.mockReturnValue({});
    const mockAnalyzeMealFn = jest.fn().mockResolvedValue({ data: {} });
    mockHttpsCallable.mockReturnValue(mockAnalyzeMealFn);
    mockUploadBytes.mockResolvedValue(undefined);
    mockGetDownloadURL.mockResolvedValue('https://example.com/image.jpg');
    
    // Setup Firebase module mocks
    jest.mocked(require('firebase/functions').getFunctions).mockImplementation(mockGetFunctions);
    jest.mocked(require('firebase/functions').httpsCallable).mockImplementation(mockHttpsCallable);
    jest.mocked(require('firebase/storage').uploadBytes).mockImplementation(mockUploadBytes);
    jest.mocked(require('firebase/storage').getDownloadURL).mockImplementation(mockGetDownloadURL);
    jest.mocked(require('firebase/storage').deleteObject).mockImplementation(mockDeleteObject);
    jest.mocked(require('../utils/imageConversion').convertImageToJpeg).mockResolvedValue(new Blob());
    mockUseDailyTotals.mockReturnValue({
      totals: {
        calories: 1500,
        protein_g: 100,
        fat_g: 50,
        carbs_g: 150,
      },
      loading: false,
    });

    mockUseDailyEntries.mockReturnValue({
      entries: [
        {
          id: '1',
          name: 'Test Meal',
          calories: 500,
          protein_g: 30,
          fat_g: 20,
          carbs_g: 40,
          reasoning: 'This is a test meal with AI analysis',
          imageUrl: 'https://example.com/image.jpg',
          createdAt: new Date(),
        },
      ],
      loading: false,
    });

    mockUseAuthState.mockReturnValue({
      user: { uid: 'test-user', email: 'test@example.com' } as any,
      userData: {
        email: 'test@example.com',
        createdAt: new Date(),
        dailyGoals: {
          calories: 2000,
          protein: 150,
          fat: 70,
          carbs: 250,
        },
      },
      loading: false,
      needsOnboarding: false,
    });
  });

  it('should display edit button with correct icon', () => {
    render(<Dashboard />);
    
    const editButton = screen.getByTitle('Edit meal');
    expect(editButton).toBeInTheDocument();
    expect(editButton).toHaveTextContent('✏️');
  });

  it('should collapse AI analysis by default and expand when clicked', async () => {
    render(<Dashboard />);
    
    // AI analysis should be collapsed by default
    const aiAnalysis = screen.queryByText('This is a test meal with AI analysis');
    expect(aiAnalysis).not.toBeInTheDocument();
    
    // Click to expand
    const toggleButton = screen.getByText('🤖 AI Analysis');
    fireEvent.click(toggleButton);
    
    // AI analysis should now be visible
    await waitFor(() => {
      expect(screen.getByText('This is a test meal with AI analysis')).toBeInTheDocument();
    });
  });

  it('should show manual meal entry button with pencil icon', () => {
    render(<Dashboard />);
    
    const manualMealButton = screen.getByTitle('Add Manual Meal');
    expect(manualMealButton).toBeInTheDocument();
    expect(manualMealButton).toHaveTextContent('✏️');
  });

  it('should show natural language meal button with message bubble icon', () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    expect(naturalLanguageButton).toBeInTheDocument();
    expect(naturalLanguageButton).toHaveTextContent('💬');
  });

  it('should open manual meal entry modal when manual meal button is clicked', async () => {
    render(<Dashboard />);
    
    const manualMealButton = screen.getByTitle('Add Manual Meal');
    fireEvent.click(manualMealButton);
    
    await waitFor(() => {
      expect(screen.getByText('Manual Meal Entry')).toBeInTheDocument();
    });
  });

  it('should open natural language meal modal when natural language button is clicked', async () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    fireEvent.click(naturalLanguageButton);
    
    await waitFor(() => {
      expect(screen.getByText('Describe Your Meal')).toBeInTheDocument();
    });
  });

  it('should allow manual entry of meal data', async () => {
    render(<Dashboard />);
    
    const manualMealButton = screen.getByTitle('Add Manual Meal');
    fireEvent.click(manualMealButton);
    
    await waitFor(() => {
      expect(screen.getByText('Manual Meal Entry')).toBeInTheDocument();
    });
    
    // Fill in the form
    const nameInput = screen.getByPlaceholderText('Enter meal name');
    const inputs = screen.getAllByDisplayValue('0');
    const caloriesInput = inputs[0]; // First input with value 0 should be calories
    
    fireEvent.change(nameInput, { target: { value: 'Test Manual Meal' } });
    fireEvent.change(caloriesInput, { target: { value: '600' } });
    
    expect(nameInput).toHaveValue('Test Manual Meal');
    expect(caloriesInput).toHaveValue(600);
  });

  it('should allow natural language meal description input', async () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    fireEvent.click(naturalLanguageButton);
    
    await waitFor(() => {
      expect(screen.getByText('Describe Your Meal')).toBeInTheDocument();
    });
    
    const textarea = screen.getByPlaceholderText('e.g., I had grilled chicken breast with steamed broccoli and brown rice');
    fireEvent.change(textarea, { target: { value: 'I had a grilled chicken breast with steamed broccoli and brown rice' } });
    
    expect(textarea).toHaveValue('I had a grilled chicken breast with steamed broccoli and brown rice');
  });

  it('should enforce 100 word limit on natural language meal description', async () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    fireEvent.click(naturalLanguageButton);
    
    await waitFor(() => {
      expect(screen.getByText('Describe Your Meal')).toBeInTheDocument();
    });
    
    const textarea = screen.getByPlaceholderText('e.g., I had grilled chicken breast with steamed broccoli and brown rice');
    
    // Test 100 words exactly (should be allowed)
    const exactly100Words = Array(100).fill('word').join(' ');
    fireEvent.change(textarea, { target: { value: exactly100Words } });
    expect(textarea).toHaveValue(exactly100Words);
    
    // Test 101 words (should be truncated to 100)
    const over100Words = Array(101).fill('word').join(' ');
    fireEvent.change(textarea, { target: { value: over100Words } });
    expect(textarea).toHaveValue(exactly100Words);
  });

  it('should show warning when approaching word limit', async () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    fireEvent.click(naturalLanguageButton);
    
    await waitFor(() => {
      expect(screen.getByText('Describe Your Meal')).toBeInTheDocument();
    });
    
    const textarea = screen.getByPlaceholderText('e.g., I had grilled chicken breast with steamed broccoli and brown rice');
    
    // Test 90 words (should show warning)
    const words90 = Array(90).fill('word').join(' ');
    fireEvent.change(textarea, { target: { value: words90 } });
    
    await waitFor(() => {
      expect(screen.getByText(/\(10 remaining\)/)).toBeInTheDocument();
    });
    
    // Test 95 words (should show warning)
    const words95 = Array(95).fill('word').join(' ');
    fireEvent.change(textarea, { target: { value: words95 } });
    
    await waitFor(() => {
      expect(screen.getByText(/\(5 remaining\)/)).toBeInTheDocument();
    });
  });

  it('should truncate pasted content to 100 words', async () => {
    render(<Dashboard />);
    
    const naturalLanguageButton = screen.getByTitle('Describe Your Meal');
    fireEvent.click(naturalLanguageButton);
    
    await waitFor(() => {
      expect(screen.getByText('Describe Your Meal')).toBeInTheDocument();
    });
    
    const textarea = screen.getByPlaceholderText('e.g., I had grilled chicken breast with steamed broccoli and brown rice');
    
    // Simulate pasting 150 words
    const over100Words = Array(150).fill('word').join(' ');
    const clipboardData = {
      getData: () => over100Words,
    };
    
    fireEvent.paste(textarea, { clipboardData });
    
    // Should be truncated to exactly 100 words
    const expected100Words = Array(100).fill('word').join(' ');
    expect(textarea).toHaveValue(expected100Words);
  });

  describe('Enhanced Macro Widget', () => {
    it('should display enhanced macro rings with proper percentages', () => {
      render(<Dashboard />);
      
      // Check that all macro rings are present
      const proteinRing = screen.getByTestId('protein-ring');
      const fatRing = screen.getByTestId('fat-ring');
      const carbsRing = screen.getByTestId('carbs-ring');
      
      expect(proteinRing).toBeInTheDocument();
      expect(fatRing).toBeInTheDocument();
      expect(carbsRing).toBeInTheDocument();
    });

    it('should show percentage completion for each macro', () => {
      render(<Dashboard />);
      
      // With the mock data: protein 100/150g = 66.7%
      const proteinRing = screen.getByTestId('protein-ring');
      expect(proteinRing).toHaveTextContent('67%');
      
      // Fat 50/70g = 71.4%
      const fatRing = screen.getByTestId('fat-ring');
      expect(fatRing).toHaveTextContent('71%');
      
      // Carbs 150/250g = 60%
      const carbsRing = screen.getByTestId('carbs-ring');
      expect(carbsRing).toHaveTextContent('60%');
    });

    it('should show remaining amounts for each macro', () => {
      render(<Dashboard />);
      
      // Protein: 50g remaining
      expect(screen.getByText('50g left')).toBeInTheDocument();
      
      // Fat: 20g remaining  
      expect(screen.getByText('20g left')).toBeInTheDocument();
      
      // Carbs: 100g remaining
      expect(screen.getByText('100g left')).toBeInTheDocument();
    });

    it('should have enhanced visual styling with gradients and shadows', () => {
      render(<Dashboard />);
      
      const macroOverview = screen.getByText("Today's Macros").closest('.card');
      expect(macroOverview).toHaveClass('enhanced-macro-card');
    });

    it('should show different styles when macro is over goal', () => {
      // Mock data where protein is over goal
      mockUseDailyTotals.mockReturnValue({
        totals: {
          calories: 1500,
          protein_g: 180, // Over the 150g goal
          fat_g: 50,
          carbs_g: 150,
        },
        loading: false,
      });

      render(<Dashboard />);
      
      const proteinRing = screen.getByTestId('protein-ring');
      expect(proteinRing).toHaveClass('over-goal');
    });
  });

  describe('Header Component Sign Out', () => {
    test('sign out dropdown should be properly positioned and not cut off', async () => {
      const mockUser = {
        uid: 'test123',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: 'https://example.com/photo.jpg'
      };

      const mockSignOut = jest.fn();

      render(
        <div className="mobile-container">
          <Dashboard />
        </div>
      );

      // Find the user menu button using aria-label
      const userMenuButton = screen.getByLabelText('User menu');
      fireEvent.click(userMenuButton);

      // Check if sign out button appears
      const signOutButton = await screen.findByText(/sign out/i);
      expect(signOutButton).toBeInTheDocument();

      // Check that the dropdown has proper z-index (z-50)
      const dropdown = signOutButton.closest('.z-50');
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveClass('z-50');

      // Check that there's a backdrop with proper z-index
      const backdrop = document.querySelector('.fixed.inset-0.z-40');
      expect(backdrop).toBeInTheDocument();

      // Verify sign out functionality
      fireEvent.click(signOutButton);
      // Note: The actual sign out would be tested with proper mocks
    });

    test('user menu should close when clicking outside', async () => {
      render(<Dashboard />);

      // Open menu using aria-label
      const userMenuButton = screen.getByLabelText('User menu');
      fireEvent.click(userMenuButton);

      // Verify menu is open
      const signOutButton = await screen.findByText(/sign out/i);
      expect(signOutButton).toBeInTheDocument();

      // Click outside (on backdrop)
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      // Menu should be closed
      await waitFor(() => {
        expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Dashboard Header', () => {
    it('shows the sign out button when user menu is open', () => {
      render(<Dashboard />);
      // Open the user menu by clicking the avatar button
      const avatarButton = screen.getByLabelText(/user menu/i);
      fireEvent.click(avatarButton);
      // The sign out button should be visible
      expect(screen.getByText(/sign out/i)).toBeVisible();
    });
  });

  describe('Date Navigation', () => {
    it('should navigate to previous and next day', () => {
      render(<Dashboard />);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Date input should show today initially
      const dateInput = screen.getByDisplayValue(todayStr);
      expect(dateInput).toBeInTheDocument();

      // Click previous day
      const prevButton = screen.getByLabelText('Previous day');
      fireEvent.click(prevButton);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yestStr = yesterday.toISOString().split('T')[0];

      expect(screen.getByDisplayValue(yestStr)).toBeInTheDocument();

      // Click next day to return to today
      const nextButton = screen.getByLabelText('Next day');
      fireEvent.click(nextButton);
      expect(screen.getByDisplayValue(todayStr)).toBeInTheDocument();
    });
  });

  describe('Meal Deletion with Image Cleanup', () => {
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Mock Firebase Firestore
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({
          imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Ftest-user%2Fentries%2Ftest-image.jpg?alt=media'
        })
      });
    });

    it('should delete both meal document and associated image when meal is deleted', async () => {
      // Setup test data
      const mockMealWithImage = {
        id: 'meal-with-image',
        calories: 500,
        protein_g: 25,
        fat_g: 20,
        carbs_g: 30,
        createdAt: new Date(),
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Ftest-user%2Fentries%2Ftest-image.jpg?alt=media'
      };

      (useDailyEntries as jest.Mock).mockReturnValue({
        entries: [mockMealWithImage],
        loading: false,
      });

      render(<Dashboard />);

      // Find and click the delete button for the meal
      const deleteButton = screen.getByLabelText('Delete meal');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // Verify Firestore document deletion was called
        expect(deleteDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            _key: expect.objectContaining({
              path: expect.objectContaining({
                segments: ['users', 'test-user', 'entries', 'meal-with-image']
              })
            })
          })
        );

        // Verify storage ref creation and deletion
        expect(ref).toHaveBeenCalledWith(
          expect.anything(),
          'users/test-user/entries/test-image.jpg'
        );
        expect(require('firebase/storage').deleteObject).toHaveBeenCalled();
      });
    });

    it('should still delete meal document even if image deletion fails', async () => {
      // Setup storage deletion to fail
      require('firebase/storage').deleteObject.mockRejectedValue(new Error('Storage deletion failed'));

      const mockMealWithImage = {
        id: 'meal-with-failing-image',
        calories: 500,
        protein_g: 25,
        fat_g: 20,
        carbs_g: 30,
        createdAt: new Date(),
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Ftest-user%2Fentries%2Ftest-image.jpg?alt=media'
      };

      (useDailyEntries as jest.Mock).mockReturnValue({
        entries: [mockMealWithImage],
        loading: false,
      });

      render(<Dashboard />);

      // Find and click the delete button
      const deleteButton = screen.getByLabelText('Delete meal');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // Verify Firestore document deletion still succeeded
        expect(deleteDoc).toHaveBeenCalledWith(
          expect.objectContaining({
            _key: expect.objectContaining({
              path: expect.objectContaining({
                segments: ['users', 'test-user', 'entries', 'meal-with-failing-image']
              })
            })
          })
        );

        // Verify storage deletion was attempted
        expect(require('firebase/storage').deleteObject).toHaveBeenCalled();
      });
    });

    it('should handle meals without images gracefully', async () => {
      // Mock meal without image
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({
          calories: 300,
          protein_g: 15,
          fat_g: 10,
          carbs_g: 25,
          // No imageUrl property
        })
      });

      const mockMealWithoutImage = {
        id: 'meal-without-image',
        calories: 300,
        protein_g: 15,
        fat_g: 10,
        carbs_g: 25,
        createdAt: new Date(),
        // No imageUrl
      };

      (useDailyEntries as jest.Mock).mockReturnValue({
        entries: [mockMealWithoutImage],
        loading: false,
      });

      render(<Dashboard />);

      // Find and click the delete button
      const deleteButton = screen.getByLabelText('Delete meal');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // Verify Firestore document deletion was called
        expect(deleteDoc).toHaveBeenCalled();

        // Verify storage deletion was NOT attempted since there's no image
        expect(require('firebase/storage').deleteObject).not.toHaveBeenCalled();
      });
    });
  });

  it('should show natural language modal after photo upload and analysis', async () => {
    // Mock successful photo upload and analysis
    const mockAnalysisResult = {
      result: {
        title: 'Grilled Chicken',
        calories: 300,
        protein_g: 30,
        fat_g: 10,
        carbs_g: 5
      },
      reasoning: 'Analysis of grilled chicken'
    };
    
    // Reset and setup the specific mock for this test
    const mockAnalyzeMealFn = jest.fn().mockResolvedValue({ data: mockAnalysisResult });
    mockHttpsCallable.mockReturnValue(mockAnalyzeMealFn);

    render(<Dashboard />);
    
    const photoButton = screen.getByTitle('Take Photo');
    fireEvent.click(photoButton);
    
    const fileInput = screen.getByTestId('file-input');
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Wait for photo analysis to complete and natural language modal to appear
    await waitFor(() => {
      expect(screen.getByText('Add More Details')).toBeInTheDocument();
    });
    
    // Check for the specific placeholder text
    const textarea = screen.getByPlaceholderText('I ate half of what\'s in the photo');
    expect(textarea).toBeInTheDocument();
    
    // Check the modal content
    expect(screen.getByText(/Is there anything else you'd like to add/)).toBeInTheDocument();
  });

  it('should handle combined photo and natural language analysis', async () => {
    // Mock photo analysis
    const mockPhotoAnalysis = {
      result: {
        title: 'Grilled Chicken',
        calories: 300,
        protein_g: 30,
        fat_g: 10,
        carbs_g: 5
      },
      reasoning: 'Analysis of grilled chicken'
    };
    
    // Mock natural language analysis
    const mockNaturalLanguageAnalysis = {
      result: {
        title: 'Half Grilled Chicken',
        calories: 150,
        protein_g: 15,
        fat_g: 5,
        carbs_g: 2.5
      },
      reasoning: 'Adjusted analysis for half portion'
    };
    
    // Setup mocks for both calls
    const mockAnalyzeMealFn = jest.fn().mockResolvedValue({ data: mockPhotoAnalysis });
    const mockAnalyzeNaturalLanguageFn = jest.fn().mockResolvedValue({ data: mockNaturalLanguageAnalysis });
    
    mockHttpsCallable
      .mockReturnValueOnce(mockAnalyzeMealFn)  // Photo analysis
      .mockReturnValueOnce(mockAnalyzeNaturalLanguageFn);  // Natural language analysis

    render(<Dashboard />);
    
    // Upload photo
    const photoButton = screen.getByTitle('Take Photo');
    fireEvent.click(photoButton);
    
    const fileInput = screen.getByTestId('file-input');
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Wait for natural language modal to appear
    await waitFor(() => {
      expect(screen.getByText('Add More Details')).toBeInTheDocument();
    });
    
    // Add natural language description
    const textarea = screen.getByPlaceholderText('I ate half of what\'s in the photo');
    fireEvent.change(textarea, { target: { value: 'I ate half of what\'s in the photo' } });
    
    // Submit the additional description
    const analyzeButton = screen.getByRole('button', { name: /🤖 Analyze Meal/ });
    fireEvent.click(analyzeButton);
    
    // Verify the function was called with the correct parameters
    await waitFor(() => {
      expect(mockHttpsCallable).toHaveBeenCalledWith('analyzeNaturalLanguageMeal');
    });
  });

  it('should enforce 100 word limit in photo followup modal', async () => {
    // Mock photo analysis
    const mockPhotoAnalysis = {
      result: {
        title: 'Grilled Chicken',
        calories: 300,
        protein_g: 30,
        fat_g: 10,
        carbs_g: 5
      },
      reasoning: 'Analysis of grilled chicken'
    };
    
    mockHttpsCallable.mockResolvedValueOnce({ data: mockPhotoAnalysis });
    mockUploadBytes.mockResolvedValue(undefined);
    mockGetDownloadURL.mockResolvedValue('https://example.com/image.jpg');

    render(<Dashboard />);
    
    // Upload photo
    const photoButton = screen.getByTitle('Take Photo');
    fireEvent.click(photoButton);
    
    const fileInput = screen.getByTestId('file-input');
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Wait for natural language modal to appear
    await waitFor(() => {
      expect(screen.getByText('Add More Details')).toBeInTheDocument();
    });
    
    // Test word limit enforcement
    const textarea = screen.getByPlaceholderText('I ate half of what\'s in the photo');
    
    // Test 101 words (should be truncated to 100)
    const over100Words = Array(101).fill('word').join(' ');
    const exactly100Words = Array(100).fill('word').join(' ');
    
    fireEvent.change(textarea, { target: { value: over100Words } });
    expect(textarea).toHaveValue(exactly100Words);
  });

  it('shows "add your first meal" message for today when no meals are logged', async () => {
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('📷 Add Your First Meal')).toBeInTheDocument();
      expect(screen.getByText('Start tracking your nutrition by adding your first meal!')).toBeInTheDocument();
    });
  });

  it('shows "days in the past are not editable" message for past days when no meals are logged', async () => {
    // Mock empty entries for this test
    mockUseDailyEntries.mockReturnValue({
      entries: [],
      loading: false
    });
    
    render(<Dashboard />);
    
    // Navigate to previous day
    const prevButton = screen.getByLabelText('Previous day');
    fireEvent.click(prevButton);
    
    await waitFor(() => {
      expect(screen.getByText('Days in the past are not editable right now')).toBeInTheDocument();
      expect(screen.queryByText('📷 Add Your First Meal')).not.toBeInTheDocument();
    });
  });
}); 