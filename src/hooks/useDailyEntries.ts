import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthState } from './useAuthState';

export interface MealEntry {
  id: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  createdAt: Date;
  name?: string; // optional manual name override later
  imageUrl?: string; // optional thumbnail
  reasoning?: string; // AI reasoning for the nutritional analysis
}

interface DailyEntriesState {
  entries: MealEntry[];
  loading: boolean;
}

/**
 * Realtime listener that returns all meal entries for the specified date (defaults to today).
 */
export function useDailyEntries(date: Date = new Date()): DailyEntriesState {
  const { user } = useAuthState();
  const [state, setState] = useState<DailyEntriesState>({ entries: [], loading: true });

  useEffect(() => {
    if (!user) {
      setState({ entries: [], loading: false });
      return;
    }

    // Calculate day start and end
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const entriesCol = collection(db, 'users', user.uid, 'entries');
    const q = query(
      entriesCol,
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<', Timestamp.fromDate(end))
    );

    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const docs: MealEntry[] = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...(d.data() as Omit<MealEntry, 'id'>) }));
      setState({ entries: docs, loading: false });
    });

    return unsubscribe;
  }, [user, date]);

  return state;
} 