import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { aggregateTotals } from '../utils/aggregation';
import type { EntryMacros, Totals } from '../utils/aggregation';
import { useAuthState } from './useAuthState';

interface DailyTotalsState {
  totals: Totals;
  loading: boolean;
}

export function useDailyTotals(date: Date = new Date()): DailyTotalsState {
  const { user } = useAuthState();
  const [state, setState] = useState<DailyTotalsState>({
    totals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setState({ totals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 }, loading: false });
      return;
    }

    // Calculate start and end of the given day using JS Date, then convert to Firestore timestamps.
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
      const entries: EntryMacros[] = snapshot.docs.map((d: any) => d.data() as EntryMacros);
      setState({ totals: aggregateTotals(entries), loading: false });
    });

    return unsubscribe;
  }, [user, date]);

  return state;
} 