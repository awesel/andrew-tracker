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

function getDateKeyForUser(): string {
  // Use UTC for consistency across all users
  // This ensures that all users have the same daily reset time
  const now = new Date();
  const utcDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
  utcDate.setUTCHours(0, 0, 0, 0);
  
  // Always use UTC date for consistency
  const dateKey = utcDate.toISOString().split('T')[0];
  console.log(`Usage tracking date key: ${dateKey} (UTC: ${utcDate.toISOString()}, Local: ${now.toISOString()})`);
  return dateKey;
}

export async function checkAndIncrementUsage(userId: string): Promise<boolean> {
  const db = getFirestore();
  const dateKey = getDateKeyForUser();

  const usageRef = db.collection('usage_tracking')
    .doc(userId)
    .collection('daily')
    .doc(dateKey);

  console.log(`Checking usage for user ${userId} on date ${dateKey}`);

  try {
    const result = await db.runTransaction(async (transaction: any) => {
      const usageDoc = await transaction.get(usageRef);
      const currentCount = usageDoc.exists ? usageDoc.data()?.count || 0 : 0;

      console.log(`Current usage count for user ${userId}: ${currentCount}/${DAILY_REQUEST_LIMIT}`);

      if (currentCount >= DAILY_REQUEST_LIMIT) {
        console.log(`Usage limit reached for user ${userId}`);
        return false;
      }

      const newCount = currentCount + 1;
      transaction.set(usageRef, {
        count: newCount,
        date: new Date(),
        lastUpdated: new Date(),
        userId: userId,
        dateKey: dateKey
      }, { merge: true });

      console.log(`Incremented usage count for user ${userId}: ${newCount}/${DAILY_REQUEST_LIMIT}`);
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
    const dateKey = getDateKeyForUser();

    const usageRef = db.collection('usage_tracking')
      .doc(auth.uid)
      .collection('daily')
      .doc(dateKey);

    console.log(`Getting remaining requests for user ${auth.uid} on date ${dateKey}`);

    try {
      const usageDoc = await usageRef.get();
      const currentCount = usageDoc.exists ? usageDoc.data()?.count || 0 : 0;
      
      console.log(`User ${auth.uid} has used ${currentCount}/${DAILY_REQUEST_LIMIT} requests`);
      
      return {
        remaining: Math.max(0, DAILY_REQUEST_LIMIT - currentCount),
        total: DAILY_REQUEST_LIMIT,
        used: currentCount,
        dateKey: dateKey
      };
    } catch (error) {
      console.error('Error getting remaining requests:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get remaining requests');
    }
  }
); 