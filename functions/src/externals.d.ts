declare module 'firebase-functions' {
  export const https: {
    HttpsError: any;
  };
  export const logger: any;
  export const onRequest: any;
  export const config: any;
}

declare module '@jest/globals' {
  export const describe: any;
  export const it: any;
  export const test: any;
  export const expect: any;
  export const beforeAll: any;
  export const beforeEach: any;
  export const afterAll: any;
  export const afterEach: any;
  export const jest: any;
} 