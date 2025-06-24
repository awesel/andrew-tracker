import '@testing-library/jest-dom';

// // Mock Firebase config for tests
// jest.mock('./firebase', () => {
//   const mockFirebaseConfig = {
//     apiKey: 'test-api-key',
//     authDomain: 'test-auth-domain',
//     projectId: 'test-project-id',
//     storageBucket: 'test-storage-bucket',
//     messagingSenderId: 'test-msg-sender',
//     appId: 'test-app-id',
//   };

//   return {
//     auth: {},
//     googleProvider: {},
//     db: {},
//     default: { /* mock app */ },
//   };
// });

// Global mocks for Firebase Firestore to avoid runtime errors in tests
jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual('firebase/firestore');
  return {
    ...actual,
    getFirestore: jest.fn(() => ({})),
    doc: jest.fn(() => ({})),
    collection: jest.fn(() => ({})),
    query: jest.fn(() => ({})),
    where: jest.fn(() => ({})),
    onSnapshot: jest.fn(() => jest.fn()), // returns unsubscribe function
    Timestamp: {
      fromDate: jest.fn(() => ({}))
    },
    addDoc: jest.fn(() => Promise.resolve()),
    serverTimestamp: jest.fn(() => ({})),
    setDoc: jest.fn(() => Promise.resolve()),
    updateDoc: jest.fn(() => Promise.resolve()),
    getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  };
});

// Global mocks for Firebase Auth
jest.mock('firebase/auth', () => {
  return {
    getAuth: jest.fn(() => ({})),
    signInWithPopup: jest.fn(() => Promise.resolve({ user: { uid: 'uid', email: 'email@example.com' } })),
    signOut: jest.fn(() => Promise.resolve()),
    GoogleAuthProvider: class GoogleAuthProvider {},
  };
});

// Polyfill TextEncoder for react-router
if (global.TextEncoder === undefined) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TextEncoder } = require('util');
  global.TextEncoder = TextEncoder;
} 