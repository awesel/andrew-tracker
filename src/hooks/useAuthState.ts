import { useState, useEffect } from 'react';
import { type User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface UserData {
  email: string;
  createdAt: Date;
  apiKey?: string;
  dailyGoals?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}

interface AuthState {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  needsOnboarding: boolean;
}

export function useAuthState(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    userData: null,
    loading: true,
    needsOnboarding: false,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        // Fetch user data from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          
          // Check if user needs onboarding (only check for dailyGoals now)
          const needsOnboarding = !data.dailyGoals;
          
          // Batch all state updates together to prevent race conditions
          setAuthState({
            user,
            userData: data,
            loading: false,
            needsOnboarding,
          });
        } else {
          setAuthState({
            user,
            userData: null,
            loading: false,
            needsOnboarding: true,
          });
        }
      } else {
        setAuthState({
          user: null,
          userData: null,
          loading: false,
          needsOnboarding: false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return authState;
} 