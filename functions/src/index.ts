import { initializeApp } from 'firebase-admin/app';

// Initialize the admin SDK once per execution environment.
initializeApp();

export { analyzeMeal } from './analyzeMeal';
export { analyzeNaturalLanguageMeal } from './analyzeNaturalLanguageMeal';
export { cleanupOldImages } from './cleanupOldImages';
export { getStorageUsage, cleanupUserImages, setStoragePreferences } from './storageOptimization'; 