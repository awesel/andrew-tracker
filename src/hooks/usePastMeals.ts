import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthState } from './useAuthState';
import type { MealEntry } from './useDailyEntries';

interface PastMealsState {
  pastMeals: MealEntry[];
  loading: boolean;
}

/**
 * Hook to fetch past meals from user's entries collection for reuse
 */
export function usePastMeals(maxResults: number = 50): PastMealsState {
  const { user } = useAuthState();
  const [state, setState] = useState<PastMealsState>({ pastMeals: [], loading: true });

  useEffect(() => {
    if (!user) {
      setState({ pastMeals: [], loading: false });
      return;
    }

    const entriesCol = collection(db, 'users', user.uid, 'entries');
    
    // Start with a simple query to get all entries, then we'll filter and sort
    const unsubscribe = onSnapshot(entriesCol, (snapshot: any) => {
      try {
        console.log(`Total documents in entries collection: ${snapshot.docs.length}`);
        
        const docs: MealEntry[] = snapshot.docs
          .map((d: QueryDocumentSnapshot<DocumentData>) => {
            const data = d.data();
            return { 
              id: d.id, 
              ...data,
              // Convert Firestore timestamp to Date if needed
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
            } as MealEntry;
          })
          .filter((meal: MealEntry) => {
            // Filter out today's meals and ensure we have valid data
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const mealDate = new Date(meal.createdAt);
            mealDate.setHours(0, 0, 0, 0);
            
            const isNotToday = mealDate.getTime() < today.getTime();
            const hasCalories = meal.calories > 0;
            
            console.log(`Meal ${meal.id}: date=${mealDate.toDateString()}, today=${today.toDateString()}, isNotToday=${isNotToday}, hasCalories=${hasCalories}, calories=${meal.calories}`);
            
            return isNotToday && hasCalories;
          })
          .sort((a: MealEntry, b: MealEntry) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateB - dateA; // Sort by newest first
          })
          .slice(0, maxResults); // Limit results
          
        console.log(`Found ${docs.length} past meals for user ${user.uid}`);
        setState({ pastMeals: docs, loading: false });
      } catch (error) {
        console.error('Error processing past meals:', error);
        setState({ pastMeals: [], loading: false });
      }
    }, (error: any) => {
      console.error('Error fetching past meals:', error);
      setState({ pastMeals: [], loading: false });
    });

    return unsubscribe;
  }, [user, maxResults]);

  return state;
} 