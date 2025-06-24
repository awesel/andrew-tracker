import React, { useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import { useAuthState } from './hooks/useAuthState';

// Explicitly reference React so it is not considered an unused import when building with `noUnusedLocals`.
// Jest (which still uses the classic JSX runtime) also relies on the default React export being present.
void React;

export function Auth() {
  const { user, loading } = useAuthState();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user document already exists
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      // Create user document if it doesn't exist
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: new Date()
        });
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      setError('Failed to sign in. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      setError('Failed to sign out. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="app">
        <div className="mobile-container">
          <div className="flex flex-col items-center justify-center min-h-screen p-6">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="logo mb-6 justify-center">
                <div className="logo-icon">🍔</div>
                <span>Munch Club</span>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Welcome back!
              </h1>
              <p className="text-gray-600">
                You're successfully signed in
              </p>
            </div>

            {/* User Profile Card */}
            <div className="card w-full mb-6">
              <div className="card-body text-center">
                {user.photoURL && (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'Profile'} 
                    className="w-16 h-16 rounded-full mx-auto mb-4 shadow-md"
                  />
                )}
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {user.displayName || 'User'}
                </h2>
                <p className="text-gray-600 text-sm mb-4">
                  {user.email}
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Signed in with Google</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full space-y-3">
              <button
                onClick={handleSignOut}
                className="btn btn-secondary w-full"
                disabled={isSigningIn}
              >
                <span>🚪</span>
                Sign Out
              </button>
              
              {error && (
                <div className="text-center text-error text-sm p-3 bg-red-50 rounded-lg border border-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="mobile-container">
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="logo mb-8 justify-center">
              <div className="logo-icon">🍔</div>
              <span>Munch Club</span>
            </div>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Track Your Nutrition
              <br />
              <span className="text-primary">Effortlessly</span>
            </h1>
            
        
            
            <p className="text-gray-600 text-lg mb-8 leading-relaxed">
              Take photos or describe your meal, and the AI will handle the actual logging. 
              Get instant nutrition analysis, set goals, and build healthier habits.
            </p>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 gap-4 mb-8">
              <div className="card card-compact">
                <div className="card-body flex flex-row items-center gap-3">
                  <div className="text-2xl">🤖</div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">AI Does the Work</h3>
                    <p className="text-sm text-gray-600">Just snap or describe - AI handles all logging</p>
                  </div>
                </div>
              </div>
              
              <div className="card card-compact">
                <div className="card-body flex flex-row items-center gap-3">
                  <div className="text-2xl">📷</div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">Photo & Text Input</h3>
                    <p className="text-sm text-gray-600">Take photos or describe meals naturally</p>
                  </div>
                </div>
              </div>
              
              <div className="card card-compact">
                <div className="card-body flex flex-row items-center gap-3">
                  <div className="text-2xl">🔓</div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">Free & Open Source</h3>
                    <p className="text-sm text-gray-600">No hidden costs, fully transparent code</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sign In Section */}
          <div className="w-full">
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="btn btn-primary btn-lg w-full mb-4"
            >
              {isSigningIn ? (
                <>
                  <div className="loading-spinner w-4 h-4 border border-white border-t-transparent"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>
                    Sign in with Google
                  </span>
                </>
              )}
            </button>

            {error && (
              <div className="text-center text-error text-sm p-3 bg-red-50 rounded-lg border border-red-200 mb-4">
                {error}
              </div>
            )}

            <div className="text-center">
              <p className="text-xs text-gray-500 leading-relaxed">
                By signing in, you agree to our Terms of Service and Privacy Policy.
                <br />
                Your data is secure and never shared with third parties.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 