export interface EntryMacros {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface Totals extends EntryMacros {}

/**
 * Aggregate an array of macro entries into cumulative totals.
 */
export function aggregateTotals(entries: EntryMacros[]): Totals {
  return entries.reduce<Totals>(
    (acc, cur) => ({
      calories: acc.calories + (cur.calories || 0),
      protein_g: acc.protein_g + (cur.protein_g || 0),
      fat_g: acc.fat_g + (cur.fat_g || 0),
      carbs_g: acc.carbs_g + (cur.carbs_g || 0),
    }),
    { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 }
  );
} 