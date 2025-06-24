import { onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

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
  },
  async (request: any) => {
    const { data, auth } = request;
    // Ensure the user is authenticated.
    if (!auth) {
      throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { description } = data as { description?: string };
    if (!description || description.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "description" argument.');
    }

    // Enforce 100 word limit on the server side as well
    const wordCount = description.trim().split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 100) {
      throw new functions.https.HttpsError('invalid-argument', 'Meal description cannot exceed 100 words.');
    }

    // Use the OpenAI API key from Firebase Functions config
    const apiKey = functions.config().openai?.key;
    if (!apiKey) {
      throw new functions.https.HttpsError('internal', 'OpenAI API key not configured in Firebase Functions.');
    }

    // Instantiate the OpenAI client with the universal key
    const openai = new OpenAI({ apiKey });

    // System prompt enforcing descriptive titles and strict JSON output.
    const systemPrompt = `You are a board-certified nutritionist.

Analyse a meal described by the user.
1. Identify foods and estimate portion size.
2. Estimate per-food macros then total calories, protein_g, fat_g, carbs_g.
3. Create a concise title (≤ 6 words) that mentions the key foods (e.g. "Chicken Burrito & Salsa") without generic words like "meal" or "food".
4. Respond with ONLY valid JSON:
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

    try {
      if (!completion.choices || completion.choices.length === 0) {
        throw new functions.https.HttpsError('internal', 'OpenAI returned no response choices.');
      }
      
      const content = completion.choices[0].message.content;
      if (!content) {
        throw new functions.https.HttpsError('internal', 'OpenAI returned empty content.');
      }
      const parsedResponse = JSON.parse(content);
      
      // Validate the response structure
      if (!parsedResponse.result || !parsedResponse.reasoning) {
        throw new functions.https.HttpsError('internal', 'Invalid response format from OpenAI.');
      }

      // Ensure required fields are present and properly typed
      const result = parsedResponse.result;
      if (typeof result.calories !== 'number' || 
          typeof result.protein_g !== 'number' || 
          typeof result.fat_g !== 'number' || 
          typeof result.carbs_g !== 'number' ||
          typeof result.title !== 'string') {
        throw new functions.https.HttpsError('internal', 'Invalid nutrition data format from OpenAI.');
      }

      // Return the complete response (reasoning + result) for the frontend to use
      return parsedResponse as NaturalLanguageMealResponse;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse OpenAI response:', e, completion.choices[0].message.content);
      // If it's already an HttpsError, re-throw it
      if (e instanceof functions.https.HttpsError) {
        throw e;
      }
      throw new functions.https.HttpsError('internal', 'Failed to parse OpenAI response.');
    }
  }
);