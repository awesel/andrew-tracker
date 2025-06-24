import { onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import OpenAI from 'openai';
import { checkAndIncrementUsage } from './index';

// Nutrition analysis callable Cloud Function.
export const analyzeMeal = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: ['OPENAI_KEY'],
  },
  async (request: any) => {
    const { data, auth } = request;
    // Ensure the user is authenticated.
    if (!auth) {
      console.error('Unauthenticated request');
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Check usage limit
    try {
      const hasRemainingUsage = await checkAndIncrementUsage(auth.uid);
      if (!hasRemainingUsage) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Daily API limit reached. Please use manual entry for additional meals today.'
        );
      }
    } catch (error) {
      console.error('Error checking usage limit:', error);
      throw new functions.https.HttpsError('internal', 'Error checking usage limit');
    }

    const { imageUrl, description } = data as { imageUrl?: string; description?: string };
    
    if (!imageUrl) {
      console.error('Missing or empty imageUrl');
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with an "imageUrl" argument.');
    }

    // Use environment variables (Firebase v2 approach)
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) {
      console.error('OpenAI API key not configured in environment variables');
      throw new functions.https.HttpsError('internal', 'OpenAI API key not configured in Firebase Functions.');
    }

    try {
      // Instantiate the OpenAI client with the secret key and timeout configuration
      const openai = new OpenAI({ 
        apiKey,
        timeout: 45000 // 45 second timeout
      });
      return await processImageWithOpenAI(openai, imageUrl, description);
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError);
      if (openaiError instanceof functions.https.HttpsError) {
        throw openaiError;
      }
      
      // Check if it's a network timeout/premature close error and provide better error message
      if (openaiError.message && (
        openaiError.message.includes('Premature close') ||
        openaiError.message.includes('timeout') ||
        openaiError.message.includes('ECONNRESET') ||
        openaiError.message.includes('socket hang up')
      )) {
        console.error('Network timeout/connection error with OpenAI API:', openaiError.message);
        throw new functions.https.HttpsError('deadline-exceeded', 'Request timed out. The image might be too large or the OpenAI service is temporarily unavailable. Please try again with a smaller image.');
      }
      
      throw new functions.https.HttpsError('internal', 'OpenAI API error: ' + (openaiError.message || 'Unknown error'));
    }
  }
);

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on authentication or validation errors
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      // Check if it's a retryable error
      const isRetryable = error.message && (
        error.message.includes('Premature close') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('socket hang up') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')
      );
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      // Wait with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

async function processImageWithOpenAI(openai: any, imageUrl: string, description?: string) {
  // System prompt that enforces chain-of-thought reasoning **and** a descriptive, non-generic title.
  const systemPrompt = `You are a board-certified nutritionist.

When asked to analyse a meal photo you MUST:
1. First, identify all foods visible in the image.
2. CRITICAL: If the user provides instructions about what to include/exclude, you MUST follow their instructions even if it means ignoring visible foods or adjusting portions. User instructions always override what you see.
3. Calculate calories, protein_g, fat_g and carbs_g for only the foods the user wants analyzed.
4. Produce a very short, descriptive title (≤ 6 words) that uses the most prominent foods *by name* that you actually analyzed (e.g. "Avocado Toast & Latte").
   • Do NOT use generic words like "meal", "food", "dish", "plate" on their own.
   • At least one concrete food word must appear.
5. Return ONLY valid JSON of the exact form:
   {"reasoning": "…", "result": {"title": "…", "calories": <number>, "protein_g": <number>, "fat_g": <number>, "carbs_g": <number>}}

Think step-by-step inside the reasoning field, acknowledging any user instructions you're following, then output the final numbers rounded realistically.`;

  // Build the user message with optional description
  const trimmedDescription = description?.trim() || '';
  const hasDescription = trimmedDescription.length > 0;
  const textContent = hasDescription 
    ? `Here is the meal photo to analyze. IMPORTANT USER INSTRUCTIONS: ${trimmedDescription}`
    : 'Here is the meal photo to analyze.';

  // Call the multimodal GPT-4o vision model.
  const completion = await retryWithBackoff(async () => {
    return await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      // Force the model to return strict JSON so we can parse deterministically.
      response_format: { type: 'json_object' },
    });
  });

  if (!completion.choices || completion.choices.length === 0) {
    console.error('OpenAI returned no response choices');
    throw new functions.https.HttpsError('internal', 'OpenAI returned no response choices.');
  }
  
  const content = completion.choices[0].message.content;
  if (!content) {
    console.error('OpenAI returned empty content');
    throw new functions.https.HttpsError('internal', 'OpenAI returned empty content.');
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(content);
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', parseError, 'Content:', content);
    throw new functions.https.HttpsError('internal', 'Failed to parse OpenAI response.');
  }
  
  // Validate the response structure
  if (!parsedResponse.result || !parsedResponse.reasoning) {
    console.error('Invalid response format from OpenAI:', parsedResponse);
    throw new functions.https.HttpsError('internal', 'Invalid response format from OpenAI.');
  }

  // Ensure required fields are present and properly typed
  const result = parsedResponse.result;
  if (typeof result.calories !== 'number' || 
      typeof result.protein_g !== 'number' || 
      typeof result.fat_g !== 'number' || 
      typeof result.carbs_g !== 'number' ||
      typeof result.title !== 'string') {
    console.error('Invalid nutrition data format from OpenAI:', result);
    throw new functions.https.HttpsError('internal', 'Invalid nutrition data format from OpenAI.');
  }

  // Return the complete response (reasoning + result) for the frontend to use
  return parsedResponse;
} 