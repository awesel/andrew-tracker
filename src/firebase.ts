import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Resolve environment variables in a way that works for both the browser (Vite)
// and Node/Jest without throwing ReferenceErrors or TS build errors.
// 1. Prefer `import.meta.env` (present in Vite-built code and during dev-server).
// 2. Otherwise fall back to `process.env` (tests / Node).
// 3. Fallback to an empty object.
//
// We need the `// @ts-ignore` to suppress TS1343 when compiling with a non-ESNext
// module target in certain test pipelines.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – import.meta is only allowed in ESNext modules, but runtime check keeps it safe.
const env: Record<string, string | undefined> = (typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined)
  || (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});

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