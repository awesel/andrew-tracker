import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the admin SDK once per execution environment.
initializeApp();

export { analyzeMeal } from './analyzeMeal';
export { analyzeNaturalLanguageMeal } from './analyzeNaturalLanguageMeal';
export { cleanupOldImages } from './cleanupOldImages';
export { getStorageUsage, cleanupUserImages, setStoragePreferences } from './storageOptimization';

const DAILY_REQUEST_LIMIT = 10;

export async function checkAndIncrementUsage(userId: string): Promise<boolean> {
  const db = getFirestore();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const usageRef = db.collection('usage_tracking')
    .doc(userId)
    .collection('daily')
    .doc(today.toISOString().split('T')[0]);

  try {
    const result = await db.runTransaction(async (transaction: any) => {
      const usageDoc = await transaction.get(usageRef);
      const currentCount = usageDoc.exists ? usageDoc.data()?.count || 0 : 0;

      if (currentCount >= DAILY_REQUEST_LIMIT) {
        return false;
      }

      transaction.set(usageRef, {
        count: currentCount + 1,
        date: today,
      }, { merge: true });

      return true;
    });

    return result;
  } catch (error) {
    console.error('Error checking usage limit:', error);
    // Return false instead of throwing to prevent 500 errors
    return false;
  }
}

// Get remaining requests for today
export const getRemainingRequests = onCall(
  {
    region: 'us-central1',
  },
  async (request: { auth?: { uid: string } }) => {
    const { auth } = request;
    if (!auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const db = getFirestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usageRef = db.collection('usage_tracking')
      .doc(auth.uid)
      .collection('daily')
      .doc(today.toISOString().split('T')[0]);

    try {
      const usageDoc = await usageRef.get();
      const currentCount = usageDoc.exists ? usageDoc.data()?.count || 0 : 0;
      return {
        remaining: Math.max(0, DAILY_REQUEST_LIMIT - currentCount),
        total: DAILY_REQUEST_LIMIT,
        used: currentCount
      };
    } catch (error) {
      console.error('Error getting remaining requests:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get remaining requests');
    }
  }
); 