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

const PRESET_GOALS: Record<string, DailyGoals> = {
  Maintenance: { calories: 2000, protein: 150, fat: 70, carbs: 250 },
  "Weight Loss": { calories: 1600, protein: 120, fat: 55, carbs: 180 },
  "Muscle Gain": { calories: 2400, protein: 180, fat: 80, carbs: 300 },
  Athletic: { calories: 2800, protein: 200, fat: 90, carbs: 350 },
};

export function EditGoals() {
  const { user, userData } = useAuthState();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState({
    calories: '',
    protein: '',
    fat: '',
    carbs: '',
  });

  // Initialize form with existing goals only once to avoid infinite update loops
  useEffect(() => {
    if (userData?.dailyGoals && goals.calories === '') {
      setGoals({
        calories: userData.dailyGoals.calories.toString(),
        protein: userData.dailyGoals.protein.toString(),
        fat: userData.dailyGoals.fat.toString(),
        carbs: userData.dailyGoals.carbs.toString(),
      });
    }
    // We deliberately exclude `goals` from dependency list to ensure this runs
    // only when `userData` first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  const handlePresetSelect = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = PRESET_GOALS[presetName];
    setGoals({
      calories: preset.calories.toString(),
      protein: preset.protein.toString(),
      fat: preset.fat.toString(),
      carbs: preset.carbs.toString(),
    });
  };

  const handleGoalChange = (field: keyof DailyGoals) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setGoals({ ...goals, [field]: value });
      setSelectedPreset(null);
    }
  };

  const canSave = Object.values(goals).every((v) => Number(v) > 0);

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
        },
        { merge: true },
      );

      // Navigate back to dashboard
      window.location.href = '/';
    } catch (err) {
      console.error('Error updating goals', err);
      alert('Failed to save your goals. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-container">
      <div className="min-h-screen p-6 flex flex-col justify-center">
        <div className="text-center mb-8">
          <div className="logo mb-6 justify-center">
            <div className="logo-icon">🍔</div>
            <span>Munch Club</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Daily Goals</h1>
          <p className="text-gray-600">Update your calorie and macro targets anytime</p>
        </div>

        <div className="flex-1 max-w-md mx-auto w-full animate-slide-up">
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
                    ${selectedPreset === name ? 'ring-2 ring-primary bg-primary-50' : 'hover:shadow-md'}
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
              onClick={() => (window.location.href = '/')}
              className="btn btn-secondary"
            >
              <span>←</span>
              Back
            </button>
            <button
              disabled={!canSave || saving}
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
      </div>
    </div>
  );
} 