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
    // Set a default OpenAI API key for tests
    process.env.OPENAI_KEY = 'test-api-key';
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
      // Remove the environment variable to simulate missing key
      delete process.env.OPENAI_KEY;
      
      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('OpenAI API key not configured in Firebase Functions.');
    });


  });

  describe('OpenAI integration', () => {

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

    it('should accept optional text description along with image', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "I can see a grilled chicken breast with steamed broccoli and brown rice. The user mentioned they ate half of the portion shown.",
              result: {
                title: "Half Grilled Chicken Bowl",
                calories: 225,
                protein_g: 12.5,
                fat_g: 7.5,
                carbs_g: 17.5
              }
            })
          }
        }]
      };
      mockCreate.mockResolvedValue(mockResponse);

      const request = {
        data: { 
          imageUrl: 'https://example.com/image.jpg',
          description: 'I ate half of what is shown in the photo'
        },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      const result = await wrapped(request as any);

      expect(result).toEqual({
        reasoning: "I can see a grilled chicken breast with steamed broccoli and brown rice. The user mentioned they ate half of the portion shown.",
        result: {
          title: "Half Grilled Chicken Bowl",
          calories: 225,
          protein_g: 12.5,
          fat_g: 7.5,
          carbs_g: 17.5
        }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const calledWith = mockCreate.mock.calls[0][0];
      
      // Check that both image and text are included in the user message
      const userMessage = calledWith.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toEqual([
        { type: 'text', text: 'Here is the meal photo to analyze. IMPORTANT USER INSTRUCTIONS: I ate half of what is shown in the photo' },
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
      ]);
    });

    it('should work with image only when no description provided', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "I can see a grilled chicken breast with steamed broccoli and brown rice.",
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
        data: { 
          imageUrl: 'https://example.com/image.jpg'
          // No description provided
        },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await wrapped(request as any);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const calledWith = mockCreate.mock.calls[0][0];
      
      // Check that only the basic text is included in the user message
      const userMessage = calledWith.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toEqual([
        { type: 'text', text: 'Here is the meal photo to analyze.' },
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
      ]);
    });

    it('should work with empty description', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "I can see a grilled chicken breast with steamed broccoli and brown rice.",
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
        data: { 
          imageUrl: 'https://example.com/image.jpg',
          description: ''
        },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await wrapped(request as any);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const calledWith = mockCreate.mock.calls[0][0];
      
      // Check that only the basic text is included in the user message
      const userMessage = calledWith.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toEqual([
        { type: 'text', text: 'Here is the meal photo to analyze.' },
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
      ]);
    });

    it('should follow user instructions to exclude certain foods', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "I can see toast with avocado and eggs in the photo. However, the user explicitly asked me not to count the toast, so I will only analyze the avocado and eggs.",
              result: {
                title: "Avocado & Eggs",
                calories: 280,
                protein_g: 12,
                fat_g: 22,
                carbs_g: 8
              }
            })
          }
        }]
      };
      mockCreate.mockResolvedValue(mockResponse);

      const request = {
        data: { 
          imageUrl: 'https://example.com/avocado-toast.jpg',
          description: "Don't count the toast"
        },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      const result = await wrapped(request as any);

      expect(result).toEqual({
        reasoning: "I can see toast with avocado and eggs in the photo. However, the user explicitly asked me not to count the toast, so I will only analyze the avocado and eggs.",
        result: {
          title: "Avocado & Eggs",
          calories: 280,
          protein_g: 12,
          fat_g: 22,
          carbs_g: 8
        }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const calledWith = mockCreate.mock.calls[0][0];
      
      // Verify the system prompt includes instructions about following user guidance
      const systemMessage = calledWith.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('user instructions');
      
      // Check that the user message includes clear instructions
      const userMessage = calledWith.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content[0].text).toContain("Don't count the toast");
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

  describe('OpenAI API key configuration', () => {
    it('should throw internal error when OpenAI API key is not configured anywhere', async () => {
      // Mock environment variable as undefined
      delete process.env.OPENAI_KEY;
      
      // Mock Firebase Functions config to return empty object
      (functions.config as jest.Mock).mockReturnValue({});

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      await expect(wrapped(request as any)).rejects.toThrow('OpenAI API key not configured in Firebase Functions.');
    });

    it('should work with environment variable', async () => {
      // Set environment variable
      process.env.OPENAI_KEY = 'test-env-key';
      
      // Mock successful OpenAI response
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              reasoning: "Test reasoning",
              result: {
                title: "Test Meal",
                calories: 500,
                protein_g: 30,
                fat_g: 20,
                carbs_g: 40
              }
            })
          }
        }]
      });

      const request = {
        data: { imageUrl: 'https://example.com/image.jpg' },
        auth: { uid: 'test-user' }
      };

      const wrapped = test.wrap(analyzeMeal);
      const result = await wrapped(request as any);
      
      expect(result).toEqual({
        reasoning: "Test reasoning",
        result: {
          title: "Test Meal",
          calories: 500,
          protein_g: 30,
          fat_g: 20,
          carbs_g: 40
        }
      });
    });
  });
}); 