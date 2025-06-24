export interface StorageConfig {
  // How long to keep images before deletion (in days)
  retentionDays: number;
  
  // Maximum file size for uploaded images (in bytes)
  maxFileSize: number;
  
  // Image quality settings
  imageQuality: number;
  maxImageWidth: number;
  
  // Cleanup schedule (cron format)
  cleanupSchedule: string;
  
  // Enable/disable automatic cleanup
  enableAutomaticCleanup: boolean;
  
  // Batch size for cleanup operations
  cleanupBatchSize: number;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  retentionDays: 90, // Keep images for 3 months
  maxFileSize: 10 * 1024 * 1024, // 10MB
  imageQuality: 0.9,
  maxImageWidth: 1920,
  cleanupSchedule: '0 2 * * *', // Run daily at 2 AM UTC
  enableAutomaticCleanup: true,
  cleanupBatchSize: 100, // Process 100 files at a time
};

// Different configurations for different use cases
export const STORAGE_CONFIGS = {
  // More aggressive cleanup for cost optimization
  COST_OPTIMIZED: {
    ...DEFAULT_STORAGE_CONFIG,
    retentionDays: 30, // Keep only 1 month
    imageQuality: 0.8, // Lower quality = smaller files
    maxImageWidth: 1280, // Smaller max width
  },
  
  // More storage for premium users
  PREMIUM: {
    ...DEFAULT_STORAGE_CONFIG,
    retentionDays: 365, // Keep for 1 year
    maxFileSize: 20 * 1024 * 1024, // 20MB
    imageQuality: 0.95, // Higher quality
  },
  
  // Development/testing
  DEVELOPMENT: {
    ...DEFAULT_STORAGE_CONFIG,
    retentionDays: 7, // Clean up quickly in dev
    enableAutomaticCleanup: false, // Manual cleanup in dev
  },
} as const;

export function getStorageConfig(tier: 'default' | 'cost_optimized' | 'premium' | 'development' = 'default'): StorageConfig {
  switch (tier) {
    case 'cost_optimized':
      return STORAGE_CONFIGS.COST_OPTIMIZED;
    case 'premium':
      return STORAGE_CONFIGS.PREMIUM;
    case 'development':
      return STORAGE_CONFIGS.DEVELOPMENT;
    default:
      return DEFAULT_STORAGE_CONFIG;
  }
} 