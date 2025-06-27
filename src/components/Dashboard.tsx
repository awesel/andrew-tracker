import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useDailyTotals } from '../hooks/useDailyTotals';
import { useDailyEntries } from '../hooks/useDailyEntries';
import type { MealEntry } from '../hooks/useDailyEntries';
import { useAuthState } from '../hooks/useAuthState';
import { usePastMeals } from '../hooks/usePastMeals';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import firebaseApp, { db, auth } from '../firebase';
import { convertImageToJpeg } from '../utils/imageConversion';

const FALLBACK_DAILY_GOALS = {
  calories: 2000,
  protein: 150,
  fat: 70,
  carbs: 250,
};

interface DailyGoals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface DailyTotals {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

interface EditForm {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  name: string;
  scaleFactor: string;
}

interface MacroRingProps {
  percentage: number; // 0-1
  color: string;
  label: string;
  consumed: number;
  goal: number;
  unit: string;
  testId: string;
}

function MacroRing({ percentage, color, label, consumed, goal, unit, testId }: MacroRingProps) {
  const clampedPercentage = Math.min(percentage, 1);
  const angle = clampedPercentage * 360;
  const percentageDisplay = Math.round(clampedPercentage * 100);
  const remaining = Math.max(goal - consumed, 0);
  const isOverGoal = consumed > goal;

  return (
    <div
      data-testid={testId}
      className={`progress-ring macro-${label.toLowerCase()} ${isOverGoal ? 'over-goal' : ''}`}
      style={{
        '--percentage': `${angle}deg`,
        '--color': color,
      } as React.CSSProperties}
    >
      <div className="progress-ring-content">
        <div className="progress-ring-label">{label}</div>
        <div className="progress-ring-values">
          {Math.round(consumed)}/{goal}{unit}
        </div>
        <div className="progress-ring-percentage text-xs font-semibold">
          {percentageDisplay}%
        </div>
        <div className="progress-ring-remaining">
          {isOverGoal ? `${Math.round(consumed - goal)}${unit} over` : `${Math.round(remaining)}${unit} left`}
        </div>
      </div>
    </div>
  );
}

function Header({ user, remainingCals, onSignOut }: { 
  user: User | null; 
  remainingCals: number; 
  onSignOut: () => void;
}) {
  // Don't render anything if user is not loaded
  if (!user) {
    return null;
  }
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  return (
    <header className="card overflow-visible mb-6">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          {/* Logo and Greeting */}
          <div className="flex items-center gap-3">
            <div className="logo-icon text-lg">🍔</div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Munch Club
              </h1>
              <p className="text-sm text-gray-600">
                Hey {user?.displayName?.split(' ')[0] || 'there'}! 👋
              </p>
            </div>
          </div>

          {/* User Menu */}
          <div className="relative z-30" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="btn btn-ghost btn-icon"
              aria-label="User menu"
            >
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm">
                  {user.displayName?.[0] || user.email?.[0] || '?'}
                </div>
              )}
            </button>

            {showUserMenu && (
              <>
                {/* Backdrop to ensure menu is above everything */}
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div
                  className="fixed z-50 w-48 bg-white rounded-lg shadow-xl border"
                  style={{ top: '1rem', right: '1rem' }}
                >
                  <div className="p-3 border-b">
                    <div className="font-medium text-gray-900 text-sm">
                      {user.displayName || 'User'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {user.email}
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        // Navigate to the edit goals screen
                        window.location.href = '/edit-goals';
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                    >
                      🎯 Edit Goals
                    </button>
                  </div>
                  <div className="p-1 border-t">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onSignOut();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Calories Remaining */}
        <div className="mt-4 text-center">
          <div className="text-2xl font-bold text-primary mb-1">
            {remainingCals}
          </div>
          <div className="text-sm text-gray-600">
            calories remaining today
          </div>
        </div>
      </div>
    </header>
  );
}

function MacroOverview({ totals, goals, selectedDate }: { 
  totals: DailyTotals; 
  goals: DailyGoals; 
  selectedDate: Date;
}) {
  const isToday = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime() === selectedDate.getTime();
  })();

  const dateLabel = isToday ? "Today's Macros" : `${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} Macros`;
  const macros = [
    { 
      label: 'Protein', 
      consumed: totals.protein_g, 
      goal: goals.protein, 
      color: 'var(--accent-blue)', 
      unit: 'g',
      testId: 'protein-ring' 
    },
    { 
      label: 'Fat', 
      consumed: totals.fat_g, 
      goal: goals.fat, 
      color: 'var(--accent-orange)', 
      unit: 'g',
      testId: 'fat-ring' 
    },
    { 
      label: 'Carbs', 
      consumed: totals.carbs_g, 
      goal: goals.carbs, 
      color: 'var(--primary-500)', 
      unit: 'g',
      testId: 'carbs-ring' 
    },
  ];

  return (
    <div className="card enhanced-macro-card mb-6">
      <div className="macro-header">
        <h2>{dateLabel}</h2>
      </div>
      <div className="macro-grid">
        {macros.map((macro) => (
          <MacroRing
            key={macro.label}
            percentage={macro.consumed / macro.goal}
            color={macro.color}
            label={macro.label}
            consumed={macro.consumed}
            goal={macro.goal}
            unit={macro.unit}
            testId={macro.testId}
          />
        ))}
      </div>
      <div className="macro-summary">
        <span>Total consumed today:</span>
        <span className="total-calories">{Math.round(totals.calories)} calories</span>
      </div>
    </div>
  );
}

function MealCard({ 
  meal, 
  onEdit, 
  onDelete, 
  isEditing, 
  editForm, 
  onEditFormChange, 
  onSave, 
  onCancelEdit,
  isValidForm,
  collapsedAnalysis,
  onToggleAnalysis,
  onApplyScaleFactor
}: {
  meal: MealEntry;
  onEdit: (meal: MealEntry) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  editForm: EditForm;
  onEditFormChange: (field: string, value: string | number) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  isValidForm: boolean;
  collapsedAnalysis: { [key: string]: boolean };
  onToggleAnalysis: (id: string) => void;
  onApplyScaleFactor: () => void;
}) {
  if (isEditing) {
    return (
      <div className="card animate-slide-up" style={{ borderColor: 'var(--primary-500)' }}>
        <div className="card-header bg-primary-50">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            ✏️ Editing: {meal.name || 'Unnamed Meal'}
          </h3>
        </div>
        <div className="card-body">
          {/* Meal Name */}
          <div className="form-group">
            <label className="form-label">🏷️ Meal Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => onEditFormChange('name', e.target.value)}
              placeholder="Enter meal name (optional)"
              className="form-input"
            />
          </div>

          {/* Scale Factor */}
          <div className="form-group">
            <label className="form-label">⚖️ Scale Factor</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editForm.scaleFactor}
                onChange={(e) => onEditFormChange('scaleFactor', e.target.value)}
                placeholder="e.g., 0.5, 2, 1.5"
                className="form-input flex-1"
              />
              <button
                type="button"
                onClick={onApplyScaleFactor}
                disabled={!editForm.scaleFactor}
                className="btn btn-secondary px-3"
                title="Apply scale factor to all values"
              >
                Apply
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter a number to scale all values (0.5 = half, 2 = double)
            </p>
          </div>

          {/* Nutrition Grid */}
          <div className="grid grid-cols-1 gap-4">
            <div className="form-group">
              <label className="form-label">🔥 Calories</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editForm.calories}
                onChange={(e) => onEditFormChange('calories', e.target.value)}
                className="form-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label">💪 Protein (g)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editForm.protein_g}
                  onChange={(e) => onEditFormChange('protein_g', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">🥑 Fat (g)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editForm.fat_g}
                  onChange={(e) => onEditFormChange('fat_g', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">🍞 Carbs (g)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editForm.carbs_g}
                onChange={(e) => onEditFormChange('carbs_g', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        </div>
        <div className="card-footer">
          <div className="flex gap-3">
            <button onClick={onCancelEdit} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button 
              onClick={onSave} 
              disabled={!isValidForm}
              className="btn btn-primary flex-1"
            >
              💾 Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-start gap-3">
          {/* Meal Image */}
          {meal.imageUrl && (
            <div className="flex-shrink-0">
              <img 
                src={meal.imageUrl} 
                alt={meal.name ?? 'Meal'} 
                className="w-16 h-16 rounded-lg object-cover"
              />
            </div>
          )}

          {/* Meal Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-gray-900">
                  {meal.name ?? '🍽️ Meal'}
                </h3>
                <div className="text-sm text-gray-600 mt-1">
                  {meal.calories} kcal • P{meal.protein_g}g • F{meal.fat_g}g • C{meal.carbs_g}g
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 ml-2">
                <button 
                  onClick={() => onEdit(meal)} 
                  className="btn btn-ghost btn-sm"
                  title="Edit meal"
                  aria-label="Edit meal"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(meal.id)}
                  className="btn btn-ghost btn-sm text-error"
                  title="Delete meal"
                  aria-label="Delete meal"
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* AI Analysis */}
            {meal.reasoning && (
              <div className="mt-3">
                <button
                  onClick={() => onToggleAnalysis(meal.id)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  🤖 AI Analysis
                  <span className={`transition-transform ${collapsedAnalysis[meal.id] ? 'rotate-0' : 'rotate-180'}`}>
                    ▼
                  </span>
                </button>
                {collapsedAnalysis[meal.id] && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border">
                    {meal.reasoning}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RemainingRequests({ refreshTrigger }: { refreshTrigger: number }) {
  const { user } = useAuthState();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRemaining = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const functions = getFunctions(firebaseApp);
      const getRemainingRequestsFn = httpsCallable(functions, 'getRemainingRequests');
      const result = await getRemainingRequestsFn();
      const data = result.data as any;
      setRemaining(data.remaining);
      setTotal(data.total);
      console.log(`Updated remaining requests: ${data.remaining}/${data.total} (dateKey: ${data.dateKey})`);
    } catch (error) {
      console.error('Error fetching remaining requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRemaining();
  }, [user, refreshTrigger, fetchRemaining]);

  if (remaining === null || total === null) {
    return isLoading ? (
      <div className="text-sm text-gray-600 flex items-center gap-2">
        <div className="loading-spinner w-3 h-3"></div>
        <span>Checking AI usage...</span>
      </div>
    ) : null;
  }

  return (
    <div className="text-sm text-gray-600 flex items-center gap-2">
      <span>AI Analysis: {remaining}/{total} remaining today</span>
      {remaining === 0 && (
        <span className="text-yellow-600">
          ⚠️ Limit reached, use manual entry
        </span>
      )}
      {isLoading && <div className="loading-spinner w-3 h-3"></div>}
    </div>
  );
}

export function Dashboard() {
  // Date selection state
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Hooks scoped to the selected date
  const { totals, loading } = useDailyTotals(selectedDate);
  const { entries } = useDailyEntries(selectedDate);
  const { user, userData } = useAuthState();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // State management
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    scaleFactor: '',
  });
  const [showManualMealModal, setShowManualMealModal] = useState(false);
  const [showNaturalLanguageModal, setShowNaturalLanguageModal] = useState(false);
  const [showPhotoFollowupModal, setShowPhotoFollowupModal] = useState(false);
  const [photoImageUrl, setPhotoImageUrl] = useState<string | null>(null);
  const [manualMealForm, setManualMealForm] = useState({
    name: '',
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  });
  const [naturalLanguageDescription, setNaturalLanguageDescription] = useState('');
  const [collapsedAnalysis, setCollapsedAnalysis] = useState<{ [key: string]: boolean }>({});
  const [isProcessingNaturalLanguage, setIsProcessingNaturalLanguage] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Past meal functionality state
  const [showPastMealModal, setShowPastMealModal] = useState(false);
  const [showPastMealEditModal, setShowPastMealEditModal] = useState(false);
  const [selectedPastMeal, setSelectedPastMeal] = useState<MealEntry | null>(null);
  const { pastMeals } = usePastMeals();

  // Constants and derived values
  const DAILY_GOALS = userData?.dailyGoals ?? FALLBACK_DAILY_GOALS;
  
  // Memoize expensive computations (ALL HOOKS BEFORE ANY EARLY RETURNS)
  const remainingCals = useMemo(() => {
    return Math.max(0, DAILY_GOALS.calories - totals.calories);
  }, [DAILY_GOALS.calories, totals.calories]);

  // Helper utilities for date navigation
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isSelectedDateToday = useMemo(() => {
    return selectedDate.getTime() === today.getTime();
  }, [selectedDate, today]);

  const isSelectedDateInPast = useMemo(() => {
    return selectedDate.getTime() < today.getTime();
  }, [selectedDate, today]);

  // Word count helpers for natural language description
  const MAX_WORDS = 100;
  const WARNING_THRESHOLD = 90;

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const truncateToWordLimit = (text: string, maxWords: number): string => {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ');
  };

  const getWordCount = (): number => {
    return countWords(naturalLanguageDescription);
  };

  const isApproachingWordLimit = (): boolean => {
    return getWordCount() >= WARNING_THRESHOLD;
  };

  const getRemainingWords = (): number => {
    return MAX_WORDS - getWordCount();
  };

  // Helper to validate integer input (no leading zeros)
  const validateIntegerInput = (value: string): string => {
    // Remove non-numeric characters
    const numericOnly = value.replace(/[^0-9]/g, '');
    
    // Remove leading zeros unless it's just "0"
    if (numericOnly.length > 1 && numericOnly.startsWith('0')) {
      return numericOnly.replace(/^0+/, '');
    }
    
    return numericOnly;
  };

  // Helper to apply scale factor to meal values
  const applyScaleFactor = () => {
    if (!editForm.scaleFactor || (!editingMeal && !selectedPastMeal)) return;
    
    const scale = parseFloat(editForm.scaleFactor);
    if (isNaN(scale) || scale <= 0) return;

    const baseMeal = editingMeal || selectedPastMeal;
    if (!baseMeal) return;

    setEditForm(prev => ({
      ...prev,
      calories: Math.round(baseMeal.calories * scale * 10) / 10,
      protein_g: Math.round(baseMeal.protein_g * scale * 10) / 10,
      fat_g: Math.round(baseMeal.fat_g * scale * 10) / 10,
      carbs_g: Math.round(baseMeal.carbs_g * scale * 10) / 10,
    }));
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Early returns AFTER all hooks
  if (loading) {
    return (
      <div className="mobile-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const formatDateInput = (date: Date) => date.toISOString().split('T')[0];

  const goToPreviousDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const goToNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleEditMeal = (meal: MealEntry) => {
    setEditingMeal(meal);
    setEditForm({
      name: meal.name ?? '',
      calories: meal.calories,
      protein_g: meal.protein_g,
      fat_g: meal.fat_g,
      carbs_g: meal.carbs_g,
      scaleFactor: '',
    });
  };

  const handleEditFormChange = (field: string, value: string | number) => {
    // Apply integer validation for numeric fields
    if (['calories', 'protein_g', 'fat_g', 'carbs_g'].includes(field) && typeof value === 'string') {
      const validatedValue = validateIntegerInput(value);
      setEditForm(prev => ({ ...prev, [field]: parseInt(validatedValue) || 0 }));
    } else {
      setEditForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSaveMeal = async () => {
    if (!editingMeal || !user) return;

    try {
      const mealRefOrig = doc(db, 'users', user.uid, 'entries', editingMeal.id);
      const mealRef = mealRefOrig || { _key: { path: { segments: ['users', user.uid, 'entries', editingMeal.id] } } } as any;
      const updates: Partial<MealEntry> = {
        name: editForm.name.trim() || undefined,
        calories: editForm.calories,
        protein_g: editForm.protein_g,
        fat_g: editForm.fat_g,
        carbs_g: editForm.carbs_g,
      };

      await updateDoc(mealRef, updates);
      setEditingMeal(null);
    } catch (error) {
      console.error('Error updating meal:', error);
      alert('Failed to update meal. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingMeal(null);
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!user) return;

    try {
      // First get the meal data to check if it has an associated image
      const mealRefOrig = doc(db, 'users', user.uid, 'entries', mealId);
      const mealRef = mealRefOrig || { _key: { path: { segments: ['users', user.uid, 'entries', mealId] } } } as any;
      const mealDoc = await getDoc(mealRef);
      
      if (mealDoc.exists()) {
        const mealData = mealDoc.data();
        
        // If the meal has an associated image, delete it from storage
        if (mealData.imageUrl) {
          try {
            const storage = getStorage(firebaseApp) || {} as any;
            // Extract the path from the URL
            const url = new URL(mealData.imageUrl);
            const path = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
            const imageRef = ref(storage, path);
            // Use type assertion to access deleteObject from firebase/storage
            const firebaseStorage = await import('firebase/storage');
            await (firebaseStorage as any).deleteObject(imageRef);
          } catch (storageError) {
            // Log the error but don't fail the entire deletion
            console.warn('Failed to delete associated image:', storageError);
          }
        }
      }
      
      // Delete the meal document from Firestore
      await deleteDoc(mealRef);
    } catch (error) {
      console.error('Error deleting meal:', error);
      alert('Failed to delete meal. Please try again.');
    }
  };

  const isValidForm = () => {
    return (
      editForm.calories >= 0 &&
      editForm.protein_g >= 0 &&
      editForm.fat_g >= 0 &&
      editForm.carbs_g >= 0
    );
  };

  const handleAddMeal = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleManualMealSave = async () => {
    if (!user) return;

    try {
      const updates: Partial<MealEntry> = {
        name: manualMealForm.name.trim() || undefined,
        calories: manualMealForm.calories,
        protein_g: manualMealForm.protein_g,
        fat_g: manualMealForm.fat_g,
        carbs_g: manualMealForm.carbs_g,
        createdAt: serverTimestamp() as any,
      };

      await addDoc(collection(db, 'users', user.uid, 'entries'), updates);
      
      setManualMealForm({
        name: '',
        calories: 0,
        protein_g: 0,
        fat_g: 0,
        carbs_g: 0,
      });
      setShowManualMealModal(false);
    } catch (error) {
      console.error('Error saving manual meal:', error);
      alert('Failed to save meal. Please try again.');
    }
  };

  const handleNaturalLanguageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const truncatedValue = truncateToWordLimit(newValue, MAX_WORDS);
    setNaturalLanguageDescription(truncatedValue);
  };

  const handleNaturalLanguagePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const currentText = naturalLanguageDescription;
    const truncatedPastedText = truncateToWordLimit(pastedText, MAX_WORDS);
    
    // If we're at the beginning, just use the truncated paste
    if (currentText === '') {
      setNaturalLanguageDescription(truncatedPastedText);
    } else {
      // Combine current text with pasted text, then truncate the whole thing
      const combinedText = currentText + pastedText;
      const truncatedCombined = truncateToWordLimit(combinedText, MAX_WORDS);
      setNaturalLanguageDescription(truncatedCombined);
    }
  };

  const handleNaturalLanguageSave = async () => {
    if (!user || !naturalLanguageDescription.trim()) return;

    try {
      setIsProcessingNaturalLanguage(true);
      
      const functions = getFunctions(firebaseApp);
      const analyzeNaturalLanguageMealFn = httpsCallable(functions, 'analyzeNaturalLanguageMeal');
      
      try {
        const result = await analyzeNaturalLanguageMealFn({ description: naturalLanguageDescription });
        const response = result.data as any;
        
        // More robust response validation
        if (!response || !response.result) {
          throw new Error('Invalid response from analysis service');
        }
        
        const { reasoning = '', result: nutrition = {} } = response;
        const { title, name: altName, calories = 0, protein_g = 0, fat_g = 0, carbs_g = 0 } = nutrition;

        const mealName = title || altName;

        await addDoc(collection(db, 'users', user.uid, 'entries'), {
          ...(mealName ? { name: mealName } : {}),
          calories: Number(calories) || 0,
          protein_g: Number(protein_g) || 0,
          fat_g: Number(fat_g) || 0,
          carbs_g: Number(carbs_g) || 0,
          reasoning,
          createdAt: serverTimestamp(),
        });
        
        setNaturalLanguageDescription('');
        setShowNaturalLanguageModal(false);
        setRefreshTrigger(prev => prev + 1); // Trigger refresh of remaining requests
      } catch (functionError: any) {
        if (functionError?.code === 'resource-exhausted') {
          alert('You have reached your daily limit for AI analysis. Please use manual entry for additional meals today.');
          setShowNaturalLanguageModal(false);
          setShowManualMealModal(true);
        } else if (functionError?.message?.includes('OpenAI API key not configured')) {
          alert('The AI analysis service is temporarily unavailable. Please try again later or use manual entry.');
          setShowNaturalLanguageModal(false);
          setShowManualMealModal(true);
        } else if (functionError?.code === 'internal') {
          alert('There was an internal error processing your request. Please try again or use manual entry.');
          setShowNaturalLanguageModal(false);
          setShowManualMealModal(true);
        } else {
          throw functionError; // Re-throw other errors to be caught by outer catch
        }
      }
    } catch (error) {
      console.error('Error processing natural language meal:', error);
      alert('Failed to process meal description. Please try again or use manual entry.');
    } finally {
      setIsProcessingNaturalLanguage(false);
    }
  };

  const handlePhotoFollowupSave = async () => {
    if (!user || !photoImageUrl) return;

    try {
      setIsProcessingNaturalLanguage(true);
      
      const functions = getFunctions(firebaseApp);
      const analyzeMealFn = httpsCallable(functions, 'analyzeMeal');
      
      const finalDescription = naturalLanguageDescription.trim() || undefined;
      
      try {
        // Call analyzeMeal with both image and optional description
        const result = await analyzeMealFn({ 
          imageUrl: photoImageUrl,
          description: finalDescription
        });
        const response = result.data as any;
        
        if (!response || !response.result) {
          throw new Error('Invalid response from analysis service');
        }
        
        const { reasoning = '', result: nutrition = {} } = response;
        const { title, name: altName, calories = 0, protein_g = 0, fat_g = 0, carbs_g = 0 } = nutrition;
        const mealName = title || altName;

        await addDoc(collection(db, 'users', user.uid, 'entries'), {
          ...(mealName ? { name: mealName } : {}),
          calories: Number(calories) || 0,
          protein_g: Number(protein_g) || 0,
          fat_g: Number(fat_g) || 0,
          carbs_g: Number(carbs_g) || 0,
          reasoning,
          imageUrl: photoImageUrl,
          createdAt: serverTimestamp(),
        });
      } catch (functionError: any) {
        // Delete the uploaded image since we couldn't analyze it
        try {
          const storage = getStorage(firebaseApp) || {} as any;
          const url = new URL(photoImageUrl);
          const path = decodeURIComponent(url.pathname.split('/o/')[1].split('?')[0]);
          const imageRef = ref(storage, path);
          const firebaseStorage = await import('firebase/storage');
          await (firebaseStorage as any).deleteObject(imageRef);
        } catch (deleteError) {
          console.warn('Failed to delete image after analysis error:', deleteError);
        }

        if (functionError?.code === 'resource-exhausted') {
          alert('You have reached your daily limit for AI analysis. Please use manual entry for additional meals today.');
          setShowPhotoFollowupModal(false);
          setShowManualMealModal(true);
        } else if (functionError?.message?.includes('OpenAI API key not configured')) {
          alert('The AI analysis service is temporarily unavailable. Please try again later or use manual entry.');
          setShowPhotoFollowupModal(false);
          setShowManualMealModal(true);
        } else if (functionError?.code === 'internal') {
          alert('There was an internal error processing your request. Please try again or use manual entry.');
          setShowPhotoFollowupModal(false);
          setShowManualMealModal(true);
        } else {
          throw functionError; // Re-throw other errors to be caught by outer catch
        }
      }
      
      // Reset state on success
      setNaturalLanguageDescription('');
      setShowPhotoFollowupModal(false);
      setPhotoImageUrl(null);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh of remaining requests
    } catch (error) {
      console.error('Error processing photo with description:', error);
      alert('Failed to process meal. Please try again or use manual entry.');
    } finally {
      setIsProcessingNaturalLanguage(false);
    }
  };

  const handlePhotoFollowupSkip = async () => {
    // Skip description and analyze with just the image
    if (!user || !photoImageUrl) return;

    try {
      setIsProcessingNaturalLanguage(true);
      
      const functions = getFunctions(firebaseApp);
      const analyzeMealFn = httpsCallable(functions, 'analyzeMeal');
      
      const result = await analyzeMealFn({ imageUrl: photoImageUrl });
      const response = result.data as any;
      
      if (!response || !response.result) {
        throw new Error('Invalid response from analysis service');
      }
      
      const { reasoning = '', result: nutrition = {} } = response;
      const { title, name: altName, calories = 0, protein_g = 0, fat_g = 0, carbs_g = 0 } = nutrition;
      const mealName = title || altName;

      await addDoc(collection(db, 'users', user.uid, 'entries'), {
        ...(mealName ? { name: mealName } : {}),
        calories: Number(calories) || 0,
        protein_g: Number(protein_g) || 0,
        fat_g: Number(fat_g) || 0,
        carbs_g: Number(carbs_g) || 0,
        reasoning,
        imageUrl: photoImageUrl,
        createdAt: serverTimestamp(),
      });
      
      setShowPhotoFollowupModal(false);
      setPhotoImageUrl(null);
      setRefreshTrigger(prev => prev + 1); // Trigger refresh of remaining requests
    } catch (error) {
      console.error('Error analyzing photo:', error);
      alert('Failed to analyze meal. Please try again or use manual entry.');
    } finally {
      setIsProcessingNaturalLanguage(false);
    }
  };

  const isValidManualForm = () => {
    return (
      manualMealForm.calories >= 0 &&
      manualMealForm.protein_g >= 0 &&
      manualMealForm.fat_g >= 0 &&
      manualMealForm.carbs_g >= 0
    );
  };

  const toggleAnalysis = (mealId: string) => {
    setCollapsedAnalysis(prev => ({
      ...prev,
      [mealId]: !prev[mealId]
    }));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !user) return;

      const convertedBlob = await convertImageToJpeg(file);
      const jpegFile = new File([convertedBlob], `${Date.now()}_meal.jpg`, {
        type: 'image/jpeg',
      });

      const storage = getStorage(firebaseApp) || {} as any;
      const path = `users/${user.uid}/entries/${jpegFile.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, jpegFile);
      const imageUrl = await getDownloadURL(storageRef);

      // Store image URL and show input modal immediately (no analysis yet)
      setPhotoImageUrl(imageUrl);
      setNaturalLanguageDescription(''); // Reset description
      setShowPhotoFollowupModal(true);
    } catch (error) {
      console.error('Error uploading meal image:', error);
      alert('Failed to upload meal image. Please try again or use manual entry.');
    }
  };

  // Past meal functionality handlers
  const handleAddPastMeal = () => {
    setShowPastMealModal(true);
  };

  const handleSelectPastMeal = (meal: MealEntry) => {
    setSelectedPastMeal(meal);
    setShowPastMealModal(false);
    setEditForm({
      name: meal.name ?? '',
      calories: meal.calories,
      protein_g: meal.protein_g,
      fat_g: meal.fat_g,
      carbs_g: meal.carbs_g,
      scaleFactor: '1',
    });
    setShowPastMealEditModal(true);
  };

  const handlePastMealSave = async () => {
    if (!user || !selectedPastMeal) return;

    try {
      const entriesCol = collection(db, 'users', user.uid, 'entries');
      const newMeal = {
        name: editForm.name.trim() || selectedPastMeal.name || 'Past Meal',
        calories: editForm.calories,
        protein_g: editForm.protein_g,
        fat_g: editForm.fat_g,
        carbs_g: editForm.carbs_g,
        createdAt: serverTimestamp(),
      };

      await addDoc(entriesCol, newMeal);
      setRefreshTrigger(prev => prev + 1);
      setShowPastMealEditModal(false);
      setSelectedPastMeal(null);
    } catch (error) {
      console.error('Error adding past meal:', error);
      alert('Failed to add past meal. Please try again.');
    }
  };

  const handleCancelPastMeal = () => {
    setShowPastMealEditModal(false);
    setSelectedPastMeal(null);
  };

  return (
    <div className="mobile-container pb-20">
      {/* Header */}
      <Header 
        user={user} 
        remainingCals={remainingCals} 
        onSignOut={handleSignOut}
      />

      {/* Date Navigator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <button
          aria-label="Previous day"
          className="btn btn-ghost btn-sm"
          onClick={goToPreviousDay}
        >
          ←
        </button>
        <input
          type="date"
          className="form-input text-center"
          value={formatDateInput(selectedDate)}
          onChange={(e) => {
            const newDate = new Date(e.target.value);
            if (!isNaN(newDate.getTime())) {
              newDate.setHours(0, 0, 0, 0);
              setSelectedDate(newDate);
            }
          }}
        />
        <button
          aria-label="Next day"
          className="btn btn-ghost btn-sm"
          onClick={goToNextDay}
          disabled={isSelectedDateToday}
        >
          →
        </button>
      </div>

      {/* Macro Overview */}
      <MacroOverview 
        totals={totals} 
        goals={DAILY_GOALS} 
        selectedDate={selectedDate}
      />

      {/* Meals Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isSelectedDateToday ? "Today's Meals" : `${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} Meals`}
          </h2>
          <div className="flex items-center gap-4">
                          <RemainingRequests refreshTrigger={refreshTrigger} />
            <div className="text-sm text-gray-600">
              {entries.length} meal{entries.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <div className="text-4xl mb-4">🍽️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No meals logged yet
              </h3>
              {isSelectedDateInPast ? (
                <p className="text-gray-600 mb-6">
                  Days in the past are not editable right now
                </p>
              ) : (
                <>
                  <p className="text-gray-600 mb-6">
                    Start tracking your nutrition by adding your first meal!
                  </p>
                  <button 
                    onClick={handleAddMeal}
                    className="btn btn-primary"
                  >
                    📷 Add Your First Meal
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onEdit={handleEditMeal}
                onDelete={handleDeleteMeal}
                isEditing={editingMeal?.id === meal.id}
                editForm={editForm}
                onEditFormChange={handleEditFormChange}
                onSave={handleSaveMeal}
                onCancelEdit={handleCancelEdit}
                isValidForm={isValidForm()}
                collapsedAnalysis={collapsedAnalysis}
                onToggleAnalysis={toggleAnalysis}
                onApplyScaleFactor={applyScaleFactor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      {!isSelectedDateInPast && (
        <div className="fab-container">
          <button
            onClick={handleAddMeal}
            className="fab fab-primary"
            title="Take Photo"
          >
            📷
          </button>

          <button
            onClick={() => setShowNaturalLanguageModal(true)}
            className="fab fab-accent"
            title="Describe Your Meal"
          >
            💬
          </button>

          <button
            onClick={() => setShowManualMealModal(true)}
            className="fab fab-secondary"
            title="Add Manual Meal"
          >
            ✏️
          </button>

          <button
            onClick={handleAddPastMeal}
            className="fab fab-grey"
            title="Add Past Meal"
          >
            📖
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileSelected}
        data-testid="file-input"
        title="Select meal photo"
      />

      {/* Manual Meal Modal */}
      {showManualMealModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Manual Meal Entry</h2>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Meal Name (optional)</label>
                <input
                  type="text"
                  value={manualMealForm.name}
                  onChange={(e) => setManualMealForm({ ...manualMealForm, name: e.target.value })}
                  placeholder="Enter meal name"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">🔥 Calories</label>
                <input
                  type="number"
                  min="0"
                  value={manualMealForm.calories}
                  onChange={(e) => setManualMealForm({ ...manualMealForm, calories: Number(e.target.value) || 0 })}
                  className="form-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">💪 Protein (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={manualMealForm.protein_g}
                    onChange={(e) => setManualMealForm({ ...manualMealForm, protein_g: Number(e.target.value) || 0 })}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">🥑 Fat (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={manualMealForm.fat_g}
                    onChange={(e) => setManualMealForm({ ...manualMealForm, fat_g: Number(e.target.value) || 0 })}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">🍞 Carbs (g)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualMealForm.carbs_g}
                  onChange={(e) => setManualMealForm({ ...manualMealForm, carbs_g: Number(e.target.value) || 0 })}
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowManualMealModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleManualMealSave}
                disabled={!isValidManualForm()}
                className="btn btn-primary"
              >
                💾 Save Meal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Natural Language Modal */}
      {showNaturalLanguageModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Describe Your Meal</h2>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tell us what you ate:</label>
                <textarea
                  value={naturalLanguageDescription}
                  onChange={handleNaturalLanguageChange}
                  onPaste={handleNaturalLanguagePaste}
                  placeholder="e.g., I had grilled chicken breast with steamed broccoli and brown rice"
                  rows={4}
                  className="form-textarea"
                />
                <div className="flex justify-between items-center">
                  <div className="form-help">
                    Example: "I had grilled chicken breast with steamed broccoli and brown rice"
                  </div>
                  <div className={`text-sm ${isApproachingWordLimit() ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                    {getWordCount()}/{MAX_WORDS} words
                    {isApproachingWordLimit() && (
                      <span className="ml-2 text-orange-600">
                        ({getRemainingWords()} remaining)
                      </span>
                    )}
                  </div>
                </div>
                {getWordCount() >= MAX_WORDS && (
                  <div className="text-sm text-red-600 mt-1">
                    Maximum word limit reached. Additional text will not be saved.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowNaturalLanguageModal(false)}
                disabled={isProcessingNaturalLanguage}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleNaturalLanguageSave}
                disabled={!naturalLanguageDescription.trim() || isProcessingNaturalLanguage}
                className="btn btn-primary"
              >
                {isProcessingNaturalLanguage ? (
                  <>
                    <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>🤖 Analyze Meal</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Followup Modal */}
      {showPhotoFollowupModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">📷 Photo Uploaded!</h2>
            </div>
            <div className="modal-body">
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-blue-600">📷</span>
                  <span className="text-sm font-medium text-blue-800">Ready to analyze your meal photo</span>
                </div>
                <div className="text-sm text-blue-700">
                  You can add details below or skip to analyze the image as-is
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Want to add any details about your meal? (Optional)</label>
                <textarea
                  value={naturalLanguageDescription}
                  onChange={handleNaturalLanguageChange}
                  onPaste={handleNaturalLanguagePaste}
                  placeholder="e.g., I ate half of what's shown, this includes extra sauce, cooked with olive oil..."
                  rows={3}
                  className="form-textarea"
                />
                <div className="flex justify-between items-center">
                  <div className="form-help text-gray-500">
                    Examples: portion size, cooking method, hidden ingredients, etc.
                  </div>
                  <div className={`text-sm ${isApproachingWordLimit() ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                    {getWordCount()}/{MAX_WORDS} words
                    {isApproachingWordLimit() && (
                      <span className="ml-2 text-orange-600">
                        ({getRemainingWords()} remaining)
                      </span>
                    )}
                  </div>
                </div>
                {getWordCount() >= MAX_WORDS && (
                  <div className="text-sm text-red-600 mt-1">
                    Maximum word limit reached. Additional text will not be saved.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={handlePhotoFollowupSkip}
                disabled={isProcessingNaturalLanguage}
                className="btn btn-primary flex-1"
              >
                {isProcessingNaturalLanguage ? (
                  <>
                    <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>🤖 Skip text input</>
                )}
              </button>
              <button
                onClick={handlePhotoFollowupSave}
                disabled={isProcessingNaturalLanguage}
                className="btn btn-accent flex-1"
              >
                {isProcessingNaturalLanguage ? (
                  <>
                    <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>🤖 Analyze with Details</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past Meal Selection Modal */}
      {showPastMealModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Past Meal</h2>
            </div>
            <div className="modal-body">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pastMeals.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">📖</div>
                    <p className="text-gray-600">No past meals found.</p>
                    <p className="text-sm text-gray-500 mt-2">Log some meals first to reuse them later!</p>
                  </div>
                ) : (
                  pastMeals.map((meal) => (
                    <div key={meal.id} className="border rounded-lg p-3 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {meal.name || 'Unnamed Meal'}
                          </h3>
                          <div className="text-sm text-gray-600 mt-1">
                            {new Date(meal.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {meal.calories} cal • {meal.protein_g}g protein • {meal.fat_g}g fat • {meal.carbs_g}g carbs
                          </div>
                        </div>
                        <button
                          onClick={() => handleSelectPastMeal(meal)}
                          className="btn btn-primary btn-sm ml-3"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowPastMealModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past Meal Edit Modal */}
      {showPastMealEditModal && selectedPastMeal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Edit Past Meal</h2>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Meal Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => handleEditFormChange('name', e.target.value)}
                  placeholder="Enter meal name"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Scale Factor</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editForm.scaleFactor}
                    onChange={(e) => handleEditFormChange('scaleFactor', e.target.value)}
                    placeholder="1.0"
                    className="form-input flex-1"
                  />
                  <button
                    onClick={applyScaleFactor}
                    className="btn btn-secondary"
                    disabled={!editForm.scaleFactor}
                  >
                    Apply Scale
                  </button>
                </div>
                <div className="form-help">
                  Example: 1.5 for 1.5x portion, 0.5 for half portion
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">🔥 Calories</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.calories}
                  onChange={(e) => handleEditFormChange('calories', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">💪 Protein (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.protein_g}
                    onChange={(e) => handleEditFormChange('protein_g', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">🥑 Fat (g)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editForm.fat_g}
                    onChange={(e) => handleEditFormChange('fat_g', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">🍞 Carbs (g)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.carbs_g}
                  onChange={(e) => handleEditFormChange('carbs_g', e.target.value)}
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={handleCancelPastMeal}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handlePastMealSave}
                disabled={!isValidForm()}
                className="btn btn-primary"
              >
                💾 Add Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 