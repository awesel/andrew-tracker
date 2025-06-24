import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Safely resolve environment variables in a way that works both in the browser (Vite) and in Node/Jest.
// We *cannot* reference `import.meta` directly because Jest runs the code through CommonJS which will
// throw a SyntaxError at parse-time. The `Function` constructor lets us access it dynamically only when
// the current runtime actually supports it.

const getViteEnv = (): Record<string, string | undefined> | undefined => {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return typeof import !== "undefined" ? import.meta.env : undefined')();
  } catch {
    return undefined;
  }
};

const env: Record<string, string | undefined> =
  getViteEnv() ?? (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-auth-domain',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-project-id',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-storage-bucket',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'demo-msg-sender',
  appId: env.VITE_FIREBASE_APP_ID || 'demo-app-id',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app; 