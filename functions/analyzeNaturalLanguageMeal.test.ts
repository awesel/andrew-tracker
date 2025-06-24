/** @jest-environment node */

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }));
});

// Mock Firebase Admin
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn()
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn()
}));

// Mock checkAndIncrementUsage
const mockCheckAndIncrementUsage = jest.fn();
jest.mock('./src/index', () => ({
  checkAndIncrementUsage: mockCheckAndIncrementUsage
}));

// Mock Firebase Functions config
import * as functions from 'firebase-functions';
jest.mock('firebase-functions', () => ({
  ...jest.requireActual('firebase-functions'),
  config: jest.fn()
}));

// Import the function after mocking
import { analyzeNaturalLanguageMeal } from './src/analyzeNaturalLanguageMeal';
import functionsTest from 'firebase-functions-test';

const test = functionsTest();

describe('analyzeNaturalLanguageMeal', () => {
  let mockCompletion: any;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock completion
    mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            reasoning: "User described chicken and rice. Estimating 4oz chicken breast (200 cal, 35g protein) and 1 cup brown rice (250 cal, 5g protein, 50g carbs).",
            result: {
              title: "Chicken Rice Bowl",
              calories: 450,
              protein_g: 40,
              fat_g: 8,
              carbs_g: 50
            }
          })
        }
      }]
    };

    // Mock successful usage check
    mockCheckAndIncrementUsage.mockResolvedValue(true);

    mockRequest = {
      data: {
        description: 'I had grilled chicken and brown rice for lunch'
      },
      auth: {
        uid: 'test-user-id'
      }
    };

    mockCreate.mockResolvedValue(mockCompletion);
  });

  afterAll(() => {
    test.cleanup();
  });

  it('should analyze chicken and rice meal description', async () => {
    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    const result = await wrapped(mockRequest);
    
    expect(result).toEqual({
      reasoning: "User described chicken and rice. Estimating 4oz chicken breast (200 cal, 35g protein) and 1 cup brown rice (250 cal, 5g protein, 50g carbs).",
      result: {
        title: "Chicken Rice Bowl",
        calories: 450,
        protein_g: 40,
        fat_g: 8,
        carbs_g: 50
      }
    });
  });

  it('should handle complex meal descriptions', async () => {
    mockRequest.data.description = 'Large portion of pasta with marinara sauce, garlic bread, and a side salad with italian dressing';
    
    mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            reasoning: "Large pasta portion (2 cups), marinara sauce, garlic bread (2 slices), side salad with dressing. High carb meal.",
            result: {
              title: "Pasta Dinner",
              calories: 850,
              protein_g: 25,
              fat_g: 28,
              carbs_g: 120
            }
          })
        }
      }]
    };

    mockCreate.mockResolvedValue(mockCompletion);

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    const result = await wrapped(mockRequest);
    
    expect(result).toEqual({
      reasoning: "Large pasta portion (2 cups), marinara sauce, garlic bread (2 slices), side salad with dressing. High carb meal.",
      result: {
        title: "Pasta Dinner",
        calories: 850,
        protein_g: 25,
        fat_g: 28,
        carbs_g: 120
      }
    });
  });

  it('should reject descriptions longer than 100 words', async () => {
    const longDescription = 'word '.repeat(101).trim(); // 101 words
    mockRequest.data.description = longDescription;

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'Meal description cannot exceed 100 words.'
    );
  });

  it('should handle portion adjustments correctly', async () => {
    mockRequest.data.description = 'Based on photo analysis: Grilled chicken breast with vegetables and rice. I ate half of what\'s in the photo';
    
    mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            reasoning: "Photo showed full portion, user ate half. Adjusting all values by 50%.",
            result: {
              title: "Half Portion Mixed Meal",
              calories: 225,
              protein_g: 20,
              fat_g: 4,
              carbs_g: 25
            }
          })
        }
      }]
    };

    mockCreate.mockResolvedValue(mockCompletion);

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    const result = await wrapped(mockRequest) as any;
    expect(result.result.title).toBe('Half Portion Mixed Meal');
  });

  it('should handle missing authentication', async () => {
    mockRequest.auth = null;

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'The function must be called while authenticated.'
    );
  });

  it('should handle usage limit exceeded', async () => {
    mockCheckAndIncrementUsage.mockResolvedValue(false);

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'Daily API limit reached. Please use manual entry for additional meals today.'
    );
  });

  it('should handle missing OpenAI API key', async () => {
    (functions.config as jest.Mock).mockReturnValue({});

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'OpenAI API key not configured'
    );
  });

  it('should handle missing description', async () => {
    mockRequest.data = {};

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'The function must be called with a "description" argument.'
    );
  });

  it('should handle empty description', async () => {
    mockRequest.data.description = '';

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'The function must be called with a "description" argument.'
    );
  });

  it('should handle empty description with whitespace', async () => {
    mockRequest.data.description = '   ';

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'The function must be called with a "description" argument.'
    );
  });

  it('should handle OpenAI API errors', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI API error'));

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'OpenAI API error'
    );
  });

  it('should handle OpenAI empty response', async () => {
    mockCompletion = {
      choices: [{
        message: {
          content: null
        }
      }]
    };
    mockCreate.mockResolvedValue(mockCompletion);

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'OpenAI returned empty content.'
    );
  });

  it('should handle invalid JSON response from OpenAI', async () => {
    mockCompletion = {
      choices: [{
        message: {
          content: 'invalid json'
        }
      }]
    };
    mockCreate.mockResolvedValue(mockCompletion);

    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await expect(wrapped(mockRequest)).rejects.toThrow(
      'Failed to parse OpenAI response.'
    );
  });

  it('should call OpenAI with correct parameters', async () => {
    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await wrapped(mockRequest);
    
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calledWith = mockCreate.mock.calls[0][0];
    
    expect(calledWith).toMatchObject({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' }
    });
    
    expect(calledWith.messages).toHaveLength(2);
    expect(calledWith.messages[0].role).toBe('system');
    expect(calledWith.messages[1].role).toBe('user');
    expect(calledWith.messages[1].content).toContain(mockRequest.data.description);
  });

  it('should include title in system prompt', async () => {
    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    await wrapped(mockRequest);
    
    const calledWith = mockCreate.mock.calls[0][0];
    const systemPrompt = calledWith.messages[0].content;
    
    expect(systemPrompt).toContain('"title"');
  });

  it('should handle proper response format', async () => {
    const wrapped = test.wrap(analyzeNaturalLanguageMeal);
    const result = await wrapped(mockRequest) as any;
    
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('result');
    expect(result.result).toHaveProperty('title');
    expect(result.result).toHaveProperty('calories');
    expect(result.result).toHaveProperty('protein_g');
    expect(result.result).toHaveProperty('fat_g');
    expect(result.result).toHaveProperty('carbs_g');
  });
}); 