import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthState } from '../hooks/useAuthState';
import { calculateSuggestedMacros } from '../utils/macroCalculator';
import { imperialToMetric, metricToImperial } from '../utils/unitConversion';
import type { 
  UserMetrics, 
  MacroSuggestion, 
  Gender, 
  ActivityLevel,
  WeightGoal,
} from '../utils/macroCalculator';
import type {
  UnitSystem,
  ImperialMetrics,
  MetricMetrics,
} from '../utils/unitConversion';

interface DailyGoals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little or no exercise)',
  light: 'Lightly Active (exercise 1-3 days/week)',
  moderate: 'Moderately Active (exercise 3-5 days/week)',
  very_active: 'Very Active (hard exercise 6-7 days/week)',
  extra_active: 'Extra Active (very hard exercise & physical job)',
};

const WEIGHT_GOAL_LABELS: Record<WeightGoal, string> = {
  lose: 'Lose weight (about 1 pound per week)',
  maintain: 'Maintain current weight',
  gain: 'Gain weight (about 1 pound per week)',
};

const PRESET_GOALS = {
  'Maintenance': { calories: 2000, protein: 150, fat: 70, carbs: 250 },
  'Weight Loss': { calories: 1600, protein: 120, fat: 55, carbs: 180 },
  'Muscle Gain': { calories: 2400, protein: 180, fat: 80, carbs: 300 },
  'Athletic': { calories: 2800, protein: 200, fat: 90, carbs: 350 },
};

export function Onboarding() {
  const { user, userData } = useAuthState();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Decide initial step based on what data already exists
  useEffect(() => {
    if (!userData) return;

    if (!userData.apiKey) {
      setStep(1);
    } else if (!userData.dailyGoals || Object.keys(userData.dailyGoals).length === 0) {
      setStep(2);
    } else {
      // If everything exists, send them away to dashboard
      window.location.href = '/';
    }
  }, [userData]);

  // Step 1 state
  const [apiKey, setApiKey] = useState('');
  
  // Step 2 state (user metrics)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [metrics, setMetrics] = useState<UserMetrics>({
    gender: 'male',
    height: 170,
    weight: 70,
    activityLevel: 'moderate',
    weightGoal: 'maintain',
  });
  const [imperialMetrics, setImperialMetrics] = useState<ImperialMetrics>({
    feet: 5,
    inches: 8,
    pounds: 154, // ~70kg
  });
  
  // Step 3 state (suggested macros)
  const [suggestedMacros, setSuggestedMacros] = useState<MacroSuggestion | null>(null);
  const [goals, setGoals] = useState({ calories: '', protein: '', fat: '', carbs: '' });
  const [saving, setSaving] = useState(false);

  // Handle unit system toggle
  const handleUnitSystemChange = (newSystem: UnitSystem) => {
    if (newSystem === unitSystem) return;
    
    setUnitSystem(newSystem);
    if (newSystem === 'imperial') {
      const imperial = metricToImperial({ height: metrics.height, weight: metrics.weight });
      setImperialMetrics(imperial);
    } else {
      const metric = imperialToMetric(imperialMetrics);
      setMetrics({ ...metrics, ...metric });
    }
  };

  // Handle metric changes based on current unit system
  const handleMetricChange = (field: keyof UserMetrics | keyof ImperialMetrics) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.value;

    if (unitSystem === 'imperial') {
      if (field === 'feet' || field === 'inches' || field === 'pounds') {
        const numValue = value === '' ? 0 : Number(value);
        const newImperial = { ...imperialMetrics, [field]: numValue };
        setImperialMetrics(newImperial);
        // Update metric values
        const metric = imperialToMetric(newImperial);
        setMetrics({ ...metrics, ...metric });
      } else {
        setMetrics({ ...metrics, [field]: value });
      }
    } else {
      if (field === 'height' || field === 'weight') {
        const numValue = value === '' ? 0 : Number(value);
        setMetrics({ ...metrics, [field]: numValue });
        // Update imperial values
        const imperial = metricToImperial({ ...metrics, [field]: numValue });
        setImperialMetrics(imperial);
      } else {
        setMetrics({ ...metrics, [field]: value });
      }
    }
  };

  const handleGoalChange = (field: keyof DailyGoals) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGoals({ ...goals, [field]: value });
  };

  const handleNextFromStep1 = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(
        userDocRef,
        {
          apiKey: apiKey.trim(),
          onboardingStep: 2,
        },
        { merge: true },
      );

      setStep(2);
    } catch (err) {
      console.error('Error saving API key during onboarding', err);
      alert('Failed to save your API key. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNextFromStep2 = () => {
    const macros = calculateSuggestedMacros(metrics);
    setSuggestedMacros(macros);
    setGoals({
      calories: macros.calories.toString(),
      protein: macros.protein.toString(),
      fat: macros.fat.toString(),
      carbs: macros.carbs.toString(),
    });
    setStep(3);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(
        userDocRef,
        {
          dailyGoals: {
            calories: Number(goals.calories),
            protein: Number(goals.protein),
            fat: Number(goals.fat),
            carbs: Number(goals.carbs),
          },
          userMetrics: metrics, // Store metrics for future reference
        },
        { merge: true },
      );

      setStep(4);

      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Error saving onboarding info', err);
    } finally {
      setSaving(false);
    }
  };

  const canProceedStep1 = apiKey.trim().length > 0;
  const canProceedStep2 = metrics.height > 0 && metrics.weight > 0;
  const canProceedStep3 = Object.values(goals).every((v) => Number(v) > 0);

  const handlePresetSelect = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = PRESET_GOALS[presetName as keyof typeof PRESET_GOALS];
    setGoals({
      calories: preset.calories.toString(),
      protein: preset.protein.toString(),
      fat: preset.fat.toString(),
      carbs: preset.carbs.toString(),
    });
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3, 4].map((stepNumber) => (
        <React.Fragment key={stepNumber}>
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            ${step >= stepNumber 
              ? 'bg-primary text-white' 
              : 'bg-gray-200 text-gray-500'
            }
          `}>
            {step > stepNumber ? '✓' : stepNumber}
          </div>
          {stepNumber < 4 && (
            <div className={`
              w-12 h-1 mx-2
              ${step > stepNumber ? 'bg-primary' : 'bg-gray-200'}
            `} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="animate-slide-up">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          👋 Welcome to Your Food Tracker
        </h2>
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-left p-4 border rounded-lg bg-blue-50">
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                📸 Snap a Photo
              </h3>
              <p className="text-gray-600">
                Simply take a photo of your meal and we'll automatically analyze it for you. Quick, easy, and accurate tracking at your fingertips.
              </p>
            </div>
            <div className="text-left p-4 border rounded-lg bg-green-50">
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                💬 Natural Language
              </h3>
              <p className="text-gray-600">
                Or just type what you ate naturally, like "bowl of oatmeal with banana and honey" - we'll handle the rest!
              </p>
            </div>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-3">
          🔑 First, Let's Setup Your API Access
        </h3>
        <p className="text-gray-600 leading-relaxed">
          We need an OpenAI API key to analyze your meal photos and provide nutrition information.
        </p>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="form-group">
            <label htmlFor="apiKey" className="form-label">
              OpenAI API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="form-input"
              autoComplete="off"
            />
            <div className="form-help">
              Your API key is stored securely and only used for meal analysis.
              <br />
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get your API key from OpenAI →
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button 
          disabled={!canProceedStep1 || saving} 
          onClick={handleNextFromStep1} 
          className="btn btn-primary w-full"
        >
          {saving ? (
            <>
              <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              Next
              <span>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="animate-slide-up">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          📊 Your Profile
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Let's calculate your recommended daily nutrition targets.
        </p>
      </div>

      <div className="card mb-6">
        <div className="card-body space-y-4">
          {/* Unit System Toggle */}
          <div className="flex justify-center gap-2 mb-4">
            <button
              onClick={() => handleUnitSystemChange('imperial')}
              className={`btn ${unitSystem === 'imperial' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Imperial
            </button>
            <button
              onClick={() => handleUnitSystemChange('metric')}
              className={`btn ${unitSystem === 'metric' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Metric
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="gender" className="form-label">Gender</label>
            <select
              id="gender"
              value={metrics.gender}
              onChange={handleMetricChange('gender')}
              className="form-select"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {unitSystem === 'imperial' ? (
            // Imperial Height Input (feet and inches)
            <div className="form-group">
              <label className="form-label">Height</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    max="9"
                    value={imperialMetrics.feet || ''}
                    onChange={handleMetricChange('feet')}
                    placeholder="5"
                    className="form-input"
                  />
                  <span className="text-sm text-gray-600">ft</span>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    max="11"
                    value={imperialMetrics.inches || ''}
                    onChange={handleMetricChange('inches')}
                    placeholder="8"
                    className="form-input"
                  />
                  <span className="text-sm text-gray-600">in</span>
                </div>
              </div>
            </div>
          ) : (
            // Metric Height Input
            <div className="form-group">
              <label htmlFor="height" className="form-label">Height (cm)</label>
              <input
                id="height"
                type="number"
                min="0"
                max="300"
                value={metrics.height || ''}
                onChange={handleMetricChange('height')}
                placeholder="170"
                className="form-input"
              />
            </div>
          )}

          {unitSystem === 'imperial' ? (
            // Imperial Weight Input
            <div className="form-group">
              <label htmlFor="weight" className="form-label">Weight (lbs)</label>
              <input
                id="weight"
                type="number"
                min="0"
                max="1000"
                value={imperialMetrics.pounds || ''}
                onChange={handleMetricChange('pounds')}
                placeholder="154"
                className="form-input"
              />
            </div>
          ) : (
            // Metric Weight Input
            <div className="form-group">
              <label htmlFor="weight" className="form-label">Weight (kg)</label>
              <input
                id="weight"
                type="number"
                min="0"
                max="500"
                value={metrics.weight || ''}
                onChange={handleMetricChange('weight')}
                placeholder="70"
                className="form-input"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="activityLevel" className="form-label">Activity Level</label>
            <select
              id="activityLevel"
              value={metrics.activityLevel}
              onChange={handleMetricChange('activityLevel')}
              className="form-select"
            >
              {(Object.entries(ACTIVITY_LEVEL_LABELS) as [ActivityLevel, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="weightGoal" className="form-label">Weight Goal</label>
            <select
              id="weightGoal"
              value={metrics.weightGoal}
              onChange={handleMetricChange('weightGoal')}
              className="form-select"
            >
              {(Object.entries(WEIGHT_GOAL_LABELS) as [WeightGoal, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button 
          disabled={!canProceedStep2} 
          onClick={handleNextFromStep2} 
          className="btn btn-primary w-full"
        >
          Calculate Suggested Macros
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="animate-slide-up">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          🎯 Suggested Macros
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Based on your profile, here are your recommended daily targets.
          Feel free to adjust them to match your specific goals.
        </p>
      </div>

      <div className="card mb-6">
        <div className="card-body space-y-4">
          <div className="form-group">
            <label htmlFor="calories" className="form-label">Daily Calories</label>
            <input
              id="calories"
              type="number"
              min="0"
              max="10000"
              value={goals.calories || ''}
              onChange={handleGoalChange('calories')}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="protein" className="form-label">Protein (g)</label>
            <input
              id="protein"
              type="number"
              min="0"
              max="1000"
              value={goals.protein || ''}
              onChange={handleGoalChange('protein')}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="fat" className="form-label">Fat (g)</label>
            <input
              id="fat"
              type="number"
              min="0"
              max="1000"
              value={goals.fat || ''}
              onChange={handleGoalChange('fat')}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="carbs" className="form-label">Carbs (g)</label>
            <input
              id="carbs"
              type="number"
              min="0"
              max="1000"
              value={goals.carbs || ''}
              onChange={handleGoalChange('carbs')}
              className="form-input"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button 
          disabled={!canProceedStep3 || saving} 
          onClick={handleSave} 
          className="btn btn-primary w-full"
        >
          {saving ? (
            <>
              <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
              <span>Saving...</span>
            </>
          ) : (
            'Save Goals'
          )}
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="animate-slide-up text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-3">
        All Set!
      </h2>
      <p className="text-gray-600">
        Redirecting you to your dashboard...
      </p>
    </div>
  );

  return (
    <div className="mobile-container">
      <div className="min-h-screen p-6 flex flex-col justify-center">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="logo mb-6 justify-center">
            <div className="logo-icon">🍔</div>
            <span>Munch Club</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Munch Club
          </h1>
          <p className="text-gray-600">
            Let's get your account set up in just a few steps
          </p>
        </div>

        {/* Step Indicator */}
        <StepIndicator />

        {/* Step Content */}
        <div className="flex-1 max-w-md mx-auto w-full">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
} 