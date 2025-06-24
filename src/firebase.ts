import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Safely resolve environment variables in both browser (Vite) and Node/Jest.
// In the browser (when running under Vite) `src/main.tsx` copies `import.meta.env` onto
// `globalThis.importMeta.env` so that we don't need to reference `import.meta` directly here
// (which upsets Jest/ts-node when compiling to CommonJS).
const viteEnv =
  typeof globalThis !== 'undefined' &&
  (globalThis as any).importMeta &&
  (globalThis as any).importMeta.env
    ? ((globalThis as any).importMeta.env as Record<string, string | undefined>)
    : undefined;

const env: Record<string, string | undefined> =
  viteEnv ?? (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {});

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