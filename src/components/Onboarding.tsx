import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthState } from '../hooks/useAuthState';

interface DailyGoals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const PRESET_GOALS = {
  'Maintenance': { calories: 2000, protein: 150, fat: 70, carbs: 250 },
  'Weight Loss': { calories: 1600, protein: 120, fat: 55, carbs: 180 },
  'Muscle Gain': { calories: 2400, protein: 180, fat: 80, carbs: 300 },
  'Athletic': { calories: 2800, protein: 200, fat: 90, carbs: 350 },
};

export function Onboarding() {
  const { user, userData } = useAuthState();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  // Step 2 state
  const [goals, setGoals] = useState({ calories: '', protein: '', fat: '', carbs: '' });
  const [saving, setSaving] = useState(false);

  // --- Step navigation helpers --------------------------------------------------

  /**
   * User finished entering their API key and wants to move to goal-setting. Persist the key immediately so
   * that if the user refreshes/comes back later we can resume from step 2 instead of forcing them to re-enter.
   */
  const handleNextFromStep1 = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(
        userDocRef,
        {
          apiKey: apiKey.trim(),
          // Optional marker that can be helpful for analytics/debugging
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

  const canProceedStep1 = apiKey.trim().length > 0;
  const canProceedStep2 = Object.values(goals).every((v) => Number(v) > 0);

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

  const handleGoalChange = (field: keyof DailyGoals) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string to let users clear the field
    if (/^\d*$/.test(value)) {
      setGoals({ ...goals, [field]: value });
      setSelectedPreset(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Save API key & goals on the root user document so that useAuthState picks them up
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(
        userDocRef,
        {
          apiKey: apiKey.trim(),
          dailyGoals: {
            calories: Number(goals.calories),
            protein: Number(goals.protein),
            fat: Number(goals.fat),
            carbs: Number(goals.carbs),
          },
        },
        { merge: true },
      );

      // Show completion UI (keeps existing tests happy) then redirect to dashboard
      setStep(3);

      // Small delay so users can briefly see the completion message
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      console.error('Error saving onboarding info', err);
    } finally {
      setSaving(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((stepNumber) => (
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
          {stepNumber < 3 && (
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
          🔑 Setup API Access
        </h2>
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

  const renderStep2 = () => {
    return (
      <div className="animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            🎯 Set Your Goals
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Choose a preset or customize your daily nutrition targets.
          </p>
        </div>

        {/* Preset Options */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Presets</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(PRESET_GOALS).map(([name, preset]) => (
              <button
                key={name}
                onClick={() => handlePresetSelect(name)}
                className={`
                  card card-compact text-left transition-all cursor-pointer
                  ${selectedPreset === name 
                    ? 'ring-2 ring-primary bg-primary-50' 
                    : 'hover:shadow-md'
                  }
                `}
              >
                <div className="card-body">
                  <div className="font-medium text-gray-900 mb-1">{name}</div>
                  <div className="text-xs text-gray-600">
                    {preset.calories} cal • {preset.protein}g protein
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Goals */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="font-medium text-gray-900">Custom Goals</h3>
          </div>
          <div className="card-body">
            {/* Calories - Full Width */}
            <div className="form-group">
              <label htmlFor="calories" className="form-label">
                🔥 Daily Calories
              </label>
              <input
                id="calories"
                type="number"
                min="0"
                value={goals.calories}
                onChange={handleGoalChange('calories')}
                className="form-input"
                placeholder="2000"
              />
            </div>

            {/* Macros Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="form-group">
                <label htmlFor="protein" className="form-label">
                  💪 Protein (g)
                </label>
                <input
                  id="protein"
                  type="number"
                  min="0"
                  value={goals.protein}
                  onChange={handleGoalChange('protein')}
                  className="form-input"
                  placeholder="150"
                />
              </div>

              <div className="form-group">
                <label htmlFor="fat" className="form-label">
                  🥑 Fat (g)
                </label>
                <input
                  id="fat"
                  type="number"
                  min="0"
                  value={goals.fat}
                  onChange={handleGoalChange('fat')}
                  className="form-input"
                  placeholder="70"
                />
              </div>

              <div className="form-group">
                <label htmlFor="carbs" className="form-label">
                  🍞 Carbs (g)
                </label>
                <input
                  id="carbs"
                  type="number"
                  min="0"
                  value={goals.carbs}
                  onChange={handleGoalChange('carbs')}
                  className="form-input"
                  placeholder="250"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => setStep(1)} 
            className="btn btn-secondary"
          >
            <span>←</span>
            Back
          </button>
          <button 
            disabled={!canProceedStep2 || saving} 
            onClick={handleSave} 
            className="btn btn-primary flex-1"
          >
            {saving ? (
              <>
                <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>Save</span>
                <span>💾</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="animate-slide-up text-center">
      <div className="mb-8">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          All Set!
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Your Munch Club account is ready. You can now start tracking your nutrition!
        </p>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <h3 className="font-medium text-gray-900 mb-3">What's Next?</h3>
          <div className="space-y-3 text-left">
            <div className="flex items-center gap-3">
              <div className="text-xl">📷</div>
              <span className="text-gray-700">Take photos of your meals</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xl">🤖</div>
              <span className="text-gray-700">Get AI-powered nutrition analysis</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xl">📊</div>
              <span className="text-gray-700">Track your progress toward goals</span>
            </div>
          </div>
        </div>
      </div>

      <div className="loading">
        <div className="loading-spinner mb-2"></div>
        <p className="text-gray-500 text-sm">Taking you to your dashboard...</p>
      </div>
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
        </div>
      </div>
    </div>
  );
} 