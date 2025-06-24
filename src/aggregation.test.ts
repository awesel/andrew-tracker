import { aggregateTotals } from './utils/aggregation';

describe('aggregateTotals', () => {
  it('returns zeros for empty list', () => {
    expect(aggregateTotals([])).toEqual({
      calories: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
    });
  });

  it('sums macros across entries', () => {
    const entries = [
      { calories: 200, protein_g: 15, fat_g: 5, carbs_g: 30 },
      { calories: 500, protein_g: 40, fat_g: 20, carbs_g: 60 },
    ];

    expect(aggregateTotals(entries)).toEqual({
      calories: 700,
      protein_g: 55,
      fat_g: 25,
      carbs_g: 90,
    });
  });
}); 