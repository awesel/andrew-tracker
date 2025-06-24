export type Gender = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
export type WeightGoal = 'lose' | 'maintain' | 'gain';

export interface UserMetrics {
  gender: Gender;
  height: number; // cm
  weight: number; // kg
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, // Little or no exercise
  light: 1.375, // Light exercise/sports 1-3 days/week
  moderate: 1.55, // Moderate exercise/sports 3-5 days/week
  very_active: 1.725, // Hard exercise/sports 6-7 days/week
  extra_active: 1.9, // Very hard exercise/sports & physical job or training twice per day
};

const GOAL_CALORIE_ADJUSTMENTS = {
  lose: -500, // 500 calorie deficit for weight loss (about 1lb/week)
  maintain: 0,
  gain: 500, // 500 calorie surplus for weight gain (about 1lb/week)
};

/**
 * Calculate Basal Metabolic Rate using the Mifflin-St Jeor Equation
 */
function calculateBMR(metrics: UserMetrics): number {
  const { gender, height, weight } = metrics;
  
  // Mifflin-St Jeor Equation
  let bmr = (10 * weight) + (6.25 * height) - (5 * 25); // Assuming age 25 for now
  bmr = gender === 'male' ? bmr + 5 : bmr - 161;
  
  return Math.round(bmr);
}

/**
 * Calculate Total Daily Energy Expenditure with goal adjustment
 */
function calculateTDEE(metrics: UserMetrics): number {
  const bmr = calculateBMR(metrics);
  const activityMultiplier = ACTIVITY_MULTIPLIERS[metrics.activityLevel];
  const maintenanceTDEE = Math.round(bmr * activityMultiplier);
  return maintenanceTDEE + GOAL_CALORIE_ADJUSTMENTS[metrics.weightGoal];
}

export interface MacroSuggestion {
  calories: number;
  protein: number; // in grams
  fat: number; // in grams
  carbs: number; // in grams
}

/**
 * Calculate suggested macros based on user metrics and goals
 * Macro ratios adjusted based on goal:
 * - Lose: Higher protein (2.2g/kg), moderate fat (25%), lower carbs
 * - Maintain: Moderate protein (2g/kg), moderate fat (25%), moderate carbs
 * - Gain: High protein (2.2g/kg), moderate fat (25%), high carbs
 */
export function calculateSuggestedMacros(metrics: UserMetrics): MacroSuggestion {
  const tdee = calculateTDEE(metrics);
  
  // Calculate protein based on goal
  const proteinPerKg = metrics.weightGoal === 'maintain' ? 2.0 : 2.2;
  const protein = Math.round(metrics.weight * proteinPerKg);
  
  // Calculate fat (25% of calories)
  const fatCalories = tdee * 0.25;
  const fat = Math.round(fatCalories / 9); // 9 calories per gram of fat
  
  // Calculate remaining calories for carbs
  const proteinCalories = protein * 4; // 4 calories per gram of protein
  const remainingCalories = tdee - proteinCalories - fatCalories;
  const carbs = Math.round(remainingCalories / 4); // 4 calories per gram of carbs
  
  return {
    calories: tdee,
    protein,
    fat,
    carbs,
  };
} 