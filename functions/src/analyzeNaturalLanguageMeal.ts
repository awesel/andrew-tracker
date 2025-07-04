import { onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import OpenAI from 'openai';
import { checkAndIncrementUsage } from './index';

// Force redeploy to pick up new config
interface NutritionResult {
  title: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g?: number;
}

interface NaturalLanguageMealResponse {
  result: NutritionResult;
  reasoning: string;
}

// Natural language meal analysis callable Cloud Function.
export const analyzeNaturalLanguageMeal = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 30,
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
    } catch (error: any) {
      // If it's already a HttpsError with resource-exhausted, re-throw it
      if (error instanceof functions.https.HttpsError && error.code === 'resource-exhausted') {
        throw error;
      }
      console.error('Error checking usage limit:', error);
      throw new functions.https.HttpsError('internal', 'Error checking usage limit');
    }

    const { description } = data as { description?: string };
    if (!description || description.trim().length === 0) {
      console.error('Missing or empty description');
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "description" argument.');
    }

    // Enforce 100 word limit on the server side as well
    const wordCount = description.trim().split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 100) {
      console.error('Word count exceeded:', wordCount);
      throw new functions.https.HttpsError('invalid-argument', 'Meal description cannot exceed 100 words.');
    }

    // Use environment variables (Firebase v2 approach)
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) {
      console.error('OpenAI API key not configured in environment variables');
      throw new functions.https.HttpsError('internal', 'OpenAI API key not configured in Firebase Functions.');
    }

    try {
      // Instantiate the OpenAI client with the universal key
      const openai = new OpenAI({ apiKey });
      return await processWithOpenAI(openai, description);
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError);
      if (openaiError instanceof functions.https.HttpsError) {
        throw openaiError;
      }
      throw new functions.https.HttpsError('internal', 'OpenAI API error: ' + (openaiError.message || 'Unknown error'));
    }
  }
);

async function processWithOpenAI(openai: any, description: string): Promise<NaturalLanguageMealResponse> {
  // System prompt enforcing descriptive titles and strict JSON output.
  const systemPrompt = `You are a board-certified nutritionist.

Analyse a meal described by the user. The description may include:
- Direct meal description (e.g., "I had grilled chicken and rice")
- Photo analysis context followed by user adjustments (e.g., "Based on photo analysis: [analysis details]. I ate half of what's in the photo")
- Portion adjustments like "I ate half of what's in the photo"

Instructions:
1. If photo context is provided, use it as baseline nutrition information
2. Apply any user-specified adjustments (portion size, cooking method changes, etc.)
3. If user says "I ate half of what's in the photo" or similar, adjust all nutrition values proportionally
4. Create a concise title (≤ 6 words) that mentions the key foods and any significant adjustments
5. Respond with ONLY valid JSON:
   {"reasoning": "…", "result": {"title": "…", "calories": <number>, "protein_g": <number>, "fat_g": <number>, "carbs_g": <number>}}

Think step-by-step in the reasoning field and round calories to whole numbers and macros to 1 decimal place.`;

  // Call the GPT-4o-mini model.
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: description,
      },
    ],
    // Force the model to return strict JSON so we can parse deterministically.
    response_format: { type: 'json_object' },
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
  return parsedResponse as NaturalLanguageMealResponse;
}