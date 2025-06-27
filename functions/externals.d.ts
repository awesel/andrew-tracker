declare module 'firebase-functions/v2/https' {
  export const onCall: any;
}

declare module 'firebase-admin/app' {
  export const initializeApp: any;
}

declare module 'firebase-admin/firestore' {
  export const getFirestore: any;
  export type Transaction = any;
}

declare module 'openai' {
  const OpenAI: any;
  export default OpenAI;
}

declare module 'firebase-functions' {
  export const https: any;
  export const logger: any;
  export const onRequest: any;
  export const config: any;
}

declare module '@jest/globals' {
  export const describe: any;
  export const it: any;
  export const expect: any;
} 