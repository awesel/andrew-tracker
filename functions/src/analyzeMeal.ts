import { onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';



// Nutrition analysis callable Cloud Function.
export const analyzeMeal = onCall(
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

    const { imageUrl } = data as { imageUrl?: string };
    if (!imageUrl) {
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with an "imageUrl" argument.');
    }

    // Use the OpenAI API key from Firebase Functions config
    const apiKey = functions.config().openai?.key;
    if (!apiKey) {
      throw new functions.https.HttpsError('internal', 'OpenAI API key not configured in Firebase Functions.');
    }

    // Instantiate the OpenAI client with the universal key
    const openai = new OpenAI({ apiKey });

    // System prompt that enforces chain-of-thought reasoning **and** a descriptive, non-generic title.
    const systemPrompt = `You are a board-certified nutritionist.

When asked to analyse a meal photo you MUST:
1. List the foods you see and estimate portion size.
2. Estimate calories, protein_g, fat_g and carbs_g for each item then total them.
3. Produce a very short, descriptive title (≤ 6 words) that uses the most prominent foods *by name* (e.g. "Avocado Toast & Latte").
   • Do NOT use generic words like "meal", "food", "dish", "plate" on their own.
   • At least one concrete food word must appear.
4. Return ONLY valid JSON of the exact form:Uncaught ReferenceError: process is not defined
    at firebase.ts:8:92
   {"reasoning": "…", "result": {"title": "…", "calories": <number>, "protein_g": <number>, "fat_g": <number>, "carbs_g": <number>}}

Think step-by-step inside the reasoning field, then output the final numbers rounded realistically.`;

    // Call the multimodal GPT-4o vision model.
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here is the meal photo to analyse.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
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
      // Return the complete response (reasoning + result) for the frontend to use
      return parsedResponse;
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