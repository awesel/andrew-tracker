import { getFirestore } from 'firebase-admin/firestore';
import type { Transaction } from 'firebase-admin/firestore';

export async function trackAnalytics(type: 'photo' | 'text', userId: string) {
  const db = getFirestore();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  try {
    const analyticsRef = db.collection('analytics').doc(today);
    
    await db.runTransaction(async (transaction: Transaction) => {
      const analyticsDoc = await transaction.get(analyticsRef);
      
      const currentData = analyticsDoc.exists ? analyticsDoc.data() : {
        date: new Date(today),
        photoAnalyses: 0,
        textAnalyses: 0,
      };

      const updatedData = {
        ...currentData,
        [type === 'photo' ? 'photoAnalyses' : 'textAnalyses']: 
          ((currentData || {})[type === 'photo' ? 'photoAnalyses' : 'textAnalyses'] || 0) + 1,
      };

      transaction.set(analyticsRef, updatedData, { merge: true });
    });

    console.log(`Tracked ${type} analysis for user ${userId} on ${today}`);
  } catch (error) {
    console.error('Error tracking analytics:', error);
    // Don't throw error - analytics tracking shouldn't break the main functionality
  }
} 