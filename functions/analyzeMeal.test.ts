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
const mockGetDoc = jest.fn();
const mockDocRef = jest.fn(() => ({ get: mockGetDoc }));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn()
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    doc: mockDocRef
  }))
}));

// Import the function after mocking
import { analyzeMeal } from './src/analyzeMeal';

describe('analyzeMeal Cloud Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should throw unauthenticated error when no auth context', async () => {
      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: null
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('The function must be called while authenticated.');
    });
  });

  describe('Input validation', () => {
    it('should throw invalid-argument error when imageUrl is missing', async () => {
      const call = {
        data: {},
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('The function must be called with an "imageUrl" argument.');
    });

    it('should throw invalid-argument error when imageUrl is empty', async () => {
      const call = {
        data: { imageUrl: '' },
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('The function must be called with an "imageUrl" argument.');
    });
  });

  describe('API key validation', () => {
    it('should throw failed-precondition error when user has no API key', async () => {
      mockGetDoc.mockResolvedValue({ data: () => ({}) });

      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('Missing OpenAI API key. Please add it during onboarding.');
      expect(mockDocRef).toHaveBeenCalledWith('users/test-user');
    });
  });

  describe('OpenAI integration', () => {
    beforeEach(() => {
      mockGetDoc.mockResolvedValue({ 
        data: () => ({ apiKey: 'test-api-key' }) 
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

      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const result = await analyzeMeal.run(call as any);

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

      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('OpenAI returned empty content.');
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

      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('Failed to parse OpenAI response.');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('OpenAI API Error'));

      const call = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      await expect(analyzeMeal.run(call as any)).rejects.toThrow('OpenAI API Error');
    });
  });
}); 