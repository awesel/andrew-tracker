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
import { analyzeMeal } from './src/analyzeMeal';
import functionsTest from 'firebase-functions-test';

const test = functionsTest();

describe('analyzeMeal Cloud Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndIncrementUsage.mockResolvedValue(true);
    // Reset Firebase Functions config mock
    (functions.config as jest.Mock).mockReturnValue({});
  });

  afterAll(() => {
    test.cleanup();
  });

  describe('Authentication', () => {
    it('should throw unauthenticated error when no auth context', async () => {
      const request = { 
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: null
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('The function must be called while authenticated.');
    });
  });

  describe('Input validation', () => {
    it('should throw invalid-argument error when imageUrl is missing', async () => {
      const request = {
        data: {},
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('The function must be called with an "imageUrl" argument.');
    });

    it('should throw invalid-argument error when imageUrl is empty', async () => {
      const request = {
        data: { imageUrl: '' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('The function must be called with an "imageUrl" argument.');
    });
  });

  describe('Environment configuration', () => {
    it('should throw internal error when OpenAI API key is not configured', async () => {
      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('OpenAI API key not configured');
    });

    it('should use OpenAI API key from Firebase Functions config when configured', async () => {
      (functions.config as jest.Mock).mockReturnValue({
        openai: { key: 'test-key' }
      });

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      // This will likely fail due to OpenAI API call, but we just want to verify it gets past the API key check
      try {
        await wrapped(request as any);
      } catch (error: any) {
        // Ensure the error is not about the API key configuration
        expect(error.message).not.toContain('OpenAI API key not configured');
      }
    });
  });

  describe('OpenAI integration', () => {
    beforeEach(() => {
      (functions.config as jest.Mock).mockReturnValue({
        openai: { key: 'test-api-key' }
      });
    });

    it('should call OpenAI with correct parameters and return parsed response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "I can see a grilled chicken breast (approximately 4 oz) with steamed broccoli and a side of brown rice. The chicken appears to be seasoned but not breaded.",
              result: {
                title: "Grilled Chicken Bowl",
                calories: 450,
                protein_g: 25,
                fat_g: 15,
                carbs_g: 35
              }
            })
          }
        }]
      };
      mockCreate.mockResolvedValue(mockResponse);

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      const result = await wrapped(request as any);

      expect(result).toEqual({
        reasoning: "I can see a grilled chicken breast (approximately 4 oz) with steamed broccoli and a side of brown rice. The chicken appears to be seasoned but not breaded.",
        result: {
          title: "Grilled Chicken Bowl",
          calories: 450,
          protein_g: 25,
          fat_g: 15,
          carbs_g: 35
        }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const calledWith = mockCreate.mock.calls[0][0];
      expect(calledWith).toMatchObject({ model: 'gpt-4o-mini' });

      // Ensure the system prompt asks for the "title" field
      const promptMessages = calledWith.messages.map((m: any) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p: any) => p.text).join(' ') : ''));
      const combinedPrompt = promptMessages.join(' ');
      expect(combinedPrompt).toContain('"title"');
    });

    it('should throw internal error when OpenAI returns empty content', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: null
          }
        }]
      };
      mockCreate.mockResolvedValue(mockResponse);

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('OpenAI returned empty content.');
    });

    it('should throw internal error when OpenAI returns invalid JSON', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'invalid json content'
          }
        }]
      };
      mockCreate.mockResolvedValue(mockResponse);

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('Failed to parse OpenAI response.');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('OpenAI API Error'));

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('OpenAI API Error');
    });
  });
}); 