declare module 'firebase-functions/v2/https' {
  export const onCall: any;
}

declare module 'firebase-admin/app' {
  export const initializeApp: any;
}

declare module 'firebase-admin/firestore' {
  export const getFirestore: any;
}

declare module 'openai' {
  const OpenAI: any;
  export default OpenAI;
}

declare module 'firebase/storage' {
  export const getStorage: any;
  export const ref: any;
  export const uploadBytes: any;
  export const getDownloadURL: any;
}

declare module 'firebase/functions' {
  export const getFunctions: any;
  export const httpsCallable: any;
}

declare module 'firebase/firestore' {
  export const collection: any;
  export const addDoc: any;
  export const serverTimestamp: any;
  export const doc: any;
  export const updateDoc: any;
  export const setDoc: any;
  export const deleteDoc: any;
  export const getDoc: any;
  export const getFirestore: any;
  export const onSnapshot: any;
  export const query: any;
  export const where: any;
  export const Timestamp: any;
  export type DocumentData = any;
  export type QueryDocumentSnapshot<T = any> = any;
}

declare module 'firebase/auth' {
  export const signInWithPopup: any;
  export const signOut: any;
  export const GoogleAuthProvider: any;
  export const getAuth: any;
  export type User = any;
  export const onAuthStateChanged: any;
}

declare module 'react-router-dom' {
  export const BrowserRouter: any;
  export const Routes: any;
  export const Route: any;
  export const Navigate: any;
  export const useLocation: any;
}

declare module 'heic2any' {
  const convert: any;
  export default convert;
}

declare module '@testing-library/react' {
  export const render: any;
  export const screen: any;
  export const fireEvent: any;
  export const waitFor: any;
}

declare module 'firebase/app' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const initializeApp: (...args: any[]) => any;
} 