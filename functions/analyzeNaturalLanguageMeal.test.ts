import * as functions from 'firebase-functions';
import OpenAI from 'openai';

// Mock Firebase Admin and Functions
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn(),
            set: jest.fn(),
          })),
        })),
      })),
    })),
    runTransaction: jest.fn(),
  })),
}));

jest.mock('firebase-functions', () => ({
  config: jest.fn(),
  https: {
    HttpsError: class MockHttpsError extends Error {
      constructor(public code: string, message: string) {
        super(message);
        this.name = 'HttpsError';
      }
    },
  },
}));

// Mock Firebase Functions v2
jest.mock('firebase-functions/v2/https', () => ({
  onCall: jest.fn((_options: any, handler: any) => handler),
}));

jest.mock('openai');

const mockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

// Mock the checkAndIncrementUsage function
const mockCheckAndIncrementUsage = jest.fn();
jest.mock('./src/index', () => ({
  checkAndIncrementUsage: mockCheckAndIncrementUsage,
}));

// Import the handler after mocking
import { analyzeNaturalLanguageMeal } from './src/analyzeNaturalLanguageMeal';

describe('analyzeNaturalLanguageMeal', () => {
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Firebase Functions config
    (functions.config as jest.Mock).mockReturnValue({
      openai: { key: 'test-api-key' }
    });

    // Mock successful usage check
    mockCheckAndIncrementUsage.mockResolvedValue(true);

    mockRequest = {
      auth: { uid: 'test-user-id' },
      data: { description: 'chicken and rice' }
    };

    // Mock OpenAI response
    const mockCompletion = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: 'This appears to be chicken and rice.',
              result: {
                title: 'Chicken & Rice',
                calories: 450,
                protein_g: 35.5,
                fat_g: 8.2,
                carbs_g: 45.3
              }
            })
          }
        }
      ]
    };

    mockOpenAI.prototype.chat = {
      completions: {
        create: jest.fn().mockResolvedValue(mockCompletion)
      }
    } as any;
  });

  it('should analyze chicken and rice meal description', async () => {
    const result = await analyzeNaturalLanguageMeal(mockRequest);
    
    expect(result).toEqual({
      reasoning: 'This appears to be chicken and rice.',
      result: {
        title: 'Chicken & Rice',
        calories: 450,
        protein_g: 35.5,
        fat_g: 8.2,
        carbs_g: 45.3
      }
    });
    
    expect(mockCheckAndIncrementUsage).toHaveBeenCalledWith('test-user-id');
  });

  it('should handle simple meal descriptions', async () => {
    mockRequest.data.description = 'apple';
    
    const mockCompletion = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: 'A single medium apple.',
              result: {
                title: 'Apple',
                calories: 95,
                protein_g: 0.5,
                fat_g: 0.3,
                carbs_g: 25.0
              }
            })
          }
        }
      ]
    };

    mockOpenAI.prototype.chat = {
      completions: {
        create: jest.fn().mockResolvedValue(mockCompletion)
      }
    } as any;

    const result = await analyzeNaturalLanguageMeal(mockRequest);
    
    expect(result).toEqual({
      reasoning: 'A single medium apple.',
      result: {
        title: 'Apple',
        calories: 95,
        protein_g: 0.5,
        fat_g: 0.3,
        carbs_g: 25.0
      }
    });
  });

  it('should reject descriptions with more than 100 words', async () => {
    const longDescription = Array(101).fill('word').join(' ');
    mockRequest.data.description = longDescription;

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'Meal description cannot exceed 100 words.'
    );
  });

  it('should accept descriptions with exactly 100 words', async () => {
    const exactDescription = Array(100).fill('word').join(' ');
    mockRequest.data.description = exactDescription;

    const mockCompletion = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: 'Analysis of the meal.',
              result: {
                title: 'Mixed Meal',
                calories: 500,
                protein_g: 20.0,
                fat_g: 15.0,
                carbs_g: 60.0
              }
            })
          }
        }
      ]
    };

    mockOpenAI.prototype.chat = {
      completions: {
        create: jest.fn().mockResolvedValue(mockCompletion)
      }
    } as any;

    const result = await analyzeNaturalLanguageMeal(mockRequest);
    expect(result.result.title).toBe('Mixed Meal');
  });

  it('should handle unauthenticated requests', async () => {
    mockRequest.auth = null;

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'The function must be called while authenticated.'
    );
  });

  it('should handle usage limit exceeded', async () => {
    mockCheckAndIncrementUsage.mockResolvedValue(false);

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'Daily API limit reached. Please use manual entry for additional meals today.'
    );
  });

  it('should handle missing OpenAI API key', async () => {
    (functions.config as jest.Mock).mockReturnValue({});

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'OpenAI API key not configured in Firebase Functions.'
    );
  });

  it('should handle empty description', async () => {
    mockRequest.data.description = '';

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'The function must be called with a "description" argument.'
    );
  });

  it('should handle missing description', async () => {
    delete mockRequest.data.description;

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'The function must be called with a "description" argument.'
    );
  });

  it('should handle invalid OpenAI response format', async () => {
    const mockCompletion = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              // Missing required fields
              invalid: 'response'
            })
          }
        }
      ]
    };

    mockOpenAI.prototype.chat = {
      completions: {
        create: jest.fn().mockResolvedValue(mockCompletion)
      }
    } as any;

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'Invalid response format from OpenAI.'
    );
  });

  it('should handle database errors gracefully', async () => {
    mockCheckAndIncrementUsage.mockRejectedValue(new Error('Database connection failed'));

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'Error checking usage limit'
    );
  });
}); 