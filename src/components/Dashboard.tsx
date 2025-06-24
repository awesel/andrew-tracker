import React, { useRef, useState } from 'react';
import { useDailyTotals } from '../hooks/useDailyTotals';
import { useDailyEntries } from '../hooks/useDailyEntries';
import type { MealEntry } from '../hooks/useDailyEntries';
import { useAuthState } from '../hooks/useAuthState';
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
  name?: string;
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
  onToggleAnalysis 
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

          {/* Nutrition Grid */}
          <div className="grid grid-cols-1 gap-4">
            <div className="form-group">
              <label className="form-label">🔥 Calories</label>
              <input
                type="number"
                min="0"
                value={editForm.calories}
                onChange={(e) => onEditFormChange('calories', Number(e.target.value) || 0)}
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
                  onChange={(e) => onEditFormChange('protein_g', Number(e.target.value) || 0)}
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
                  onChange={(e) => onEditFormChange('fat_g', Number(e.target.value) || 0)}
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
                onChange={(e) => onEditFormChange('carbs_g', Number(e.target.value) || 0)}
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
  const [editForm, setEditForm] = useState({
    name: '',
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  });
  const [showManualMealModal, setShowManualMealModal] = useState(false);
  const [showNaturalLanguageModal, setShowNaturalLanguageModal] = useState(false);
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

  const DAILY_GOALS = userData?.dailyGoals ?? FALLBACK_DAILY_GOALS;

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

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

  const remainingCals = Math.max(DAILY_GOALS.calories - totals.calories, 0);

  // Helper utilities for date navigation
  const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();

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

  const isSelectedDateToday = selectedDate.getTime() === today.getTime();

  const handleEditMeal = (meal: MealEntry) => {
    setEditingMeal(meal);
    setEditForm({
      name: meal.name ?? '',
      calories: meal.calories,
      protein_g: meal.protein_g,
      fat_g: meal.fat_g,
      carbs_g: meal.carbs_g,
    });
  };

  const handleEditFormChange = (field: string, value: string | number) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
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
            await imageRef.delete();
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

  const handleNaturalLanguageSave = async () => {
    if (!user || !naturalLanguageDescription.trim()) return;

    try {
      setIsProcessingNaturalLanguage(true);
      
      const functions = getFunctions(firebaseApp);
      const analyzeNaturalLanguageMealFn = httpsCallable(functions, 'analyzeNaturalLanguageMeal');
      const result = await analyzeNaturalLanguageMealFn({ description: naturalLanguageDescription });

      const response = result.data as any;
      const { reasoning = '', result: nutrition = {} } = response;
      const { title, name: altName, calories = 0, protein_g = 0, fat_g = 0, carbs_g = 0 } = nutrition;

      const mealName = title || altName;

      await addDoc(collection(db, 'users', user.uid, 'entries'), {
        ...(mealName ? { name: mealName } : {}),
        calories,
        protein_g,
        fat_g,
        carbs_g,
        reasoning,
        createdAt: serverTimestamp(),
      });
      
      setNaturalLanguageDescription('');
      setShowNaturalLanguageModal(false);
    } catch (error) {
      console.error('Error processing natural language meal:', error);
      alert('Failed to process meal description. Please try again.');
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

      const functions = getFunctions(firebaseApp);
      const analyzeMealFn = httpsCallable(functions, 'analyzeMeal');
      const result = await analyzeMealFn({ imageUrl });

      const response = result.data as any;
      const { reasoning = '', result: nutrition = {} } = response;
      const { title, name: altName, calories = 0, protein_g = 0, fat_g = 0, carbs_g = 0 } = nutrition;

      const mealName = title || altName;

      await addDoc(collection(db, 'users', user.uid, 'entries'), {
        ...(mealName ? { name: mealName } : {}),
        calories,
        protein_g,
        fat_g,
        carbs_g,
        reasoning,
        imageUrl,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error adding meal', err instanceof Error ? err.message : 'Unknown error');
      
      const error = err as any; // Type assertion for error handling
      if (error?.code === 'storage/unauthorized' || error?.code === 'storage/unauthenticated') {
        window.alert('Authentication error. Please sign in again.');
      } else if (error?.message?.includes('404') || error?.message?.includes('preflight')) {
        window.alert('Firebase Storage is not enabled. Please enable it in the Firebase Console.');
      } else if (error?.message?.includes('Failed to get canvas context') || error?.message?.includes('Failed to convert image')) {
        window.alert('Failed to process image. Please try selecting a different image.');
      } else if (error?.message?.includes('Failed to convert HEIC file')) {
        window.alert('Failed to convert HEIC image. Please try converting the image to JPEG on your device first.');
      } else {
        window.alert('Failed to analyze meal. Please try again.');
      }
    }
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
          <div className="text-sm text-gray-600">
            {entries.length} meal{entries.length !== 1 ? 's' : ''}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <div className="text-4xl mb-4">🍽️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No meals logged yet
              </h3>
              <p className="text-gray-600 mb-6">
                Start tracking your nutrition by adding your first meal!
              </p>
              <button 
                onClick={handleAddMeal}
                className="btn btn-primary"
              >
                📷 Add Your First Meal
              </button>
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="fab-container">
        <button
          onClick={() => setShowManualMealModal(true)}
          className="fab fab-secondary"
          title="Add Manual Meal"
        >
          ✏️
        </button>

        <button
          onClick={() => setShowNaturalLanguageModal(true)}
          className="fab fab-accent"
          title="Describe Your Meal"
        >
          💬
        </button>

        <button
          onClick={handleAddMeal}
          className="fab fab-primary"
          title="Take Photo"
        >
          📷
        </button>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
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
                  onChange={(e) => setNaturalLanguageDescription(e.target.value)}
                  placeholder="e.g., I had grilled chicken breast with steamed broccoli and brown rice"
                  rows={4}
                  className="form-textarea"
                />
                <div className="form-help">
                  Example: "I had grilled chicken breast with steamed broccoli and brown rice"
                </div>
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
    </div>
  );
} 