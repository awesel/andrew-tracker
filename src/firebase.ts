import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Safely resolve environment variables in a way that works both in the browser (Vite) and in Node/Jest.
// We *cannot* reference `import.meta` directly because Jest runs the code through CommonJS which will
// throw a SyntaxError at parse-time. The `Function` constructor lets us access it dynamically only when
// the current runtime actually supports it.

const getViteEnv = (): Record<string, string | undefined> | undefined => {
  try {
    // In a Vite environment, import.meta.env should be available
    // In Jest/Node environments, this will throw and fall back to process.env
    // eslint-disable-next-line no-new-func
    const result = new Function('return import.meta.env')();
    return result as Record<string, string | undefined>;
  } catch {
    return undefined;
  }
};

const env: Record<string, string | undefined> =
  getViteEnv() ?? (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});

// Temporary debug version - remove after fixing
console.log('Raw import.meta.env:', import.meta.env);
console.log('Specific env vars:', {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});

// Debug comparison between approaches
console.log('Resolved env via getViteEnv():', {
  VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID,
});

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-auth-domain',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project-id',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-storage-bucket',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'demo-msg-sender',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'demo-app-id',
};

console.log('Final firebaseConfig:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '***' : 'MISSING'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app; 