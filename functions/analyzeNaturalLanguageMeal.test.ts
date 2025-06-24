// Mock Firebase functions logger and errors
const mockHttpsError = jest.fn().mockImplementation((code, message) => {
  const error = new Error(message);
  (error as any).code = code;
  return error;
});

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  https: {
    HttpsError: mockHttpsError,
  },
}));

// Mock Firebase functions v2
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: any, handler: any) => handler,
}));

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

// Mock Firebase Admin
const mockGetDoc = jest.fn();
const mockDocRef = jest.fn(() => ({ get: mockGetDoc }));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    doc: mockDocRef,
  })),
}));

// Import the actual implementation to test the handler directly
import * as impl from './src/analyzeNaturalLanguageMeal';

// Get the handler function directly
const analyzeNaturalLanguageMeal = (impl as any).analyzeNaturalLanguageMeal;

describe('analyzeNaturalLanguageMeal', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGetDoc.mockResolvedValue({ data: () => ({ apiKey: 'test-api-key' }) });
  });

  it('should analyze chicken and rice meal description', async () => {
    const mockOpenAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: 'Analyzed chicken, rice, and broccoli',
              result: {
                title: 'Chicken Rice & Broccoli',
                calories: 600,
                protein_g: 45,
                fat_g: 12,
                carbs_g: 65,
              },
            }),
          },
        },
      ],
    };
    mockCreate.mockResolvedValueOnce(mockOpenAiResponse);

    const mockRequest = {
      auth: { uid: 'user1' },
      data: {
        description: 'I had grilled chicken breast with brown rice and steamed broccoli',
      },
    };

    const result = await analyzeNaturalLanguageMeal(mockRequest);

    expect(result.result.title).toBe('Chicken Rice & Broccoli');
    expect(result.result.calories).toBeGreaterThan(0);
    expect(result.reasoning).toContain('chicken');
  });

  it('should handle simple meal descriptions', async () => {
    const mockOpenAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              reasoning: 'Simple breakfast',
              result: {
                title: 'Eggs and Toast',
                calories: 300,
                protein_g: 20,
                fat_g: 15,
                carbs_g: 25,
              },
            }),
          },
        },
      ],
    };
    mockCreate.mockResolvedValueOnce(mockOpenAiResponse);

    const mockRequest = {
      auth: { uid: 'user1' },
      data: { description: 'Two eggs and toast' },
    };

    const result = await analyzeNaturalLanguageMeal(mockRequest);
    expect(result.result.title).toBe('Eggs and Toast');
  });

  it('should throw error for empty description', async () => {
    const mockRequest = {
      auth: { uid: 'user1' },
      data: { description: '' },
    };

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow();
  });

  it('should reject descriptions with more than 100 words', async () => {
    const over100Words = Array(101).fill('word').join(' ');
    
    const mockRequest = {
      data: { description: over100Words },
      auth: { uid: 'test-user' }
    };

    await expect(analyzeNaturalLanguageMeal(mockRequest)).rejects.toThrow(
      'Meal description cannot exceed 100 words.'
    );
  });

  it('should accept descriptions with exactly 100 words', async () => {
    const exactly100Words = Array(100).fill('word').join(' ');
    
    const mockOpenAiResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            reasoning: 'Test reasoning for 100 words',
            result: {
              title: 'Test Meal',
              calories: 500,
              protein_g: 30,
              fat_g: 20,
              carbs_g: 40
            }
          })
        }
      }]
    };
    mockCreate.mockResolvedValueOnce(mockOpenAiResponse);
    
    const mockRequest = {
      data: { description: exactly100Words },
      auth: { uid: 'test-user' }
    };

    const result = await analyzeNaturalLanguageMeal(mockRequest);
    expect(result).toBeDefined();
    expect(result.result.title).toBe('Test Meal');
  });
}); 