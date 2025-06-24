import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions';
import { getStorageConfig } from './config/storageConfig';

interface StorageUsageStats {
  totalFiles: number;
  totalSizeBytes: number;
  oldestFileDate: Date | null;
  newestFileDate: Date | null;
  filesByAge: {
    last30Days: number;
    last90Days: number;
    last365Days: number;
    older: number;
  };
}

// Get storage usage statistics for a user
export const getStorageUsage = onCall(
  {
    region: 'us-central1',
  },
  async ({ auth }: { auth?: { uid: string } }) => {
    if (!auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const db = getFirestore();
    const userId = auth.uid;

    try {
      const entriesSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('entries')
        .where('imageUrl', '!=', null)
        .get();

      const stats: StorageUsageStats = {
        totalFiles: 0,
        totalSizeBytes: 0,
        oldestFileDate: null,
        newestFileDate: null,
        filesByAge: {
          last30Days: 0,
          last90Days: 0,
          last365Days: 0,
          older: 0,
        },
      };

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      for (const doc of entriesSnapshot.docs) {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate();

        if (createdAt) {
          stats.totalFiles++;

          // Update oldest and newest dates
          if (!stats.oldestFileDate || createdAt < stats.oldestFileDate) {
            stats.oldestFileDate = createdAt;
          }
          if (!stats.newestFileDate || createdAt > stats.newestFileDate) {
            stats.newestFileDate = createdAt;
          }

          // Categorize by age
          if (createdAt >= thirtyDaysAgo) {
            stats.filesByAge.last30Days++;
          } else if (createdAt >= ninetyDaysAgo) {
            stats.filesByAge.last90Days++;
          } else if (createdAt >= oneYearAgo) {
            stats.filesByAge.last365Days++;
          } else {
            stats.filesByAge.older++;
          }
        }
      }

      // Estimate storage size (since Firebase Storage doesn't provide easy size queries)
      // Using average of 500KB per image
      stats.totalSizeBytes = stats.totalFiles * 500 * 1024;

      return {
        usage: stats,
        recommendations: generateStorageRecommendations(stats),
      };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get storage usage');
    }
  }
);

// Clean up old images for a specific user
export const cleanupUserImages = onCall(
  {
    region: 'us-central1',
  },
  async ({ data, auth }: { data: any; auth?: { uid: string } }) => {
    if (!auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { retentionDays = 90, dryRun = true } = data as { 
      retentionDays?: number; 
      dryRun?: boolean; 
    };

    const db = getFirestore();
    const storage = getStorage();
    const userId = auth.uid;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const entriesQuery = db
        .collection('users')
        .doc(userId)
        .collection('entries')
        .where('createdAt', '<', cutoffDate)
        .where('imageUrl', '!=', null);

      const entriesSnapshot = await entriesQuery.get();
      
      const filesToDelete = [];
      for (const doc of entriesSnapshot.docs) {
        const data = doc.data();
        const imageUrl = data.imageUrl;
        
        if (imageUrl) {
          filesToDelete.push({
            docId: doc.id,
            imageUrl,
            createdAt: data.createdAt?.toDate(),
          });
        }
      }

      if (dryRun) {
        return {
          action: 'dry-run',
          filesFound: filesToDelete.length,
          estimatedSpaceSaved: filesToDelete.length * 500 * 1024, // 500KB average
          cutoffDate: cutoffDate.toISOString(),
        };
      }

      // Actually delete files
      let deletedCount = 0;
      let errorCount = 0;

      for (const file of filesToDelete) {
        try {
          // Extract file path from URL
          const urlParts = file.imageUrl.split('/');
          const pathStart = urlParts.findIndex((part: string) => part === 'o') + 1;
          
          if (pathStart > 0 && pathStart < urlParts.length) {
            const encodedPath = urlParts[pathStart].split('?')[0];
            const filePath = decodeURIComponent(encodedPath);
            
            // Delete from storage
            await storage.bucket().file(filePath).delete();
            
            // Update Firestore document
            await db
              .collection('users')
              .doc(userId)
              .collection('entries')
              .doc(file.docId)
              .update({
                imageUrl: null,
                imageDeletedAt: new Date(),
              });
            
            deletedCount++;
          }
        } catch (error) {
          console.error(`Error deleting file ${file.imageUrl}:`, error);
          errorCount++;
        }
      }

      return {
        action: 'cleanup-completed',
        deletedCount,
        errorCount,
        estimatedSpaceSaved: deletedCount * 500 * 1024,
      };
    } catch (error) {
      console.error('Error cleaning up user images:', error);
      throw new functions.https.HttpsError('internal', 'Failed to cleanup images');
    }
  }
);

function generateStorageRecommendations(stats: StorageUsageStats): string[] {
  const recommendations: string[] = [];
  
  if (stats.filesByAge.older > 0) {
    recommendations.push(
      `You have ${stats.filesByAge.older} images older than 1 year. Consider deleting them to save storage costs.`
    );
  }
  
  if (stats.filesByAge.last365Days > 100) {
    recommendations.push(
      'You have many images from the past year. Consider setting up automatic cleanup to manage costs.'
    );
  }
  
  const estimatedMonthlyCost = (stats.totalSizeBytes / (1024 * 1024 * 1024)) * 0.026; // $0.026/GB/month
  if (estimatedMonthlyCost > 5) {
    recommendations.push(
      `Your estimated storage cost is $${estimatedMonthlyCost.toFixed(2)}/month. Consider implementing automatic cleanup.`
    );
  }
  
  if (stats.totalFiles > 1000) {
    recommendations.push(
      'Consider reducing image quality or size to minimize storage costs while maintaining usability.'
    );
  }
  
  return recommendations;
}

// Set user-specific storage preferences
export const setStoragePreferences = onCall(
  {
    region: 'us-central1',
  },
  async ({ data, auth }: { data: any; auth?: { uid: string } }) => {
    if (!auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { tier, customRetentionDays } = data as {
      tier?: 'default' | 'cost_optimized' | 'premium';
      customRetentionDays?: number;
    };

    const db = getFirestore();
    const userId = auth.uid;

    try {
      const config = getStorageConfig(tier);
      
      const preferences = {
        storageTier: tier || 'default',
        retentionDays: customRetentionDays || config.retentionDays,
        imageQuality: config.imageQuality,
        maxImageWidth: config.maxImageWidth,
        updatedAt: new Date(),
      };

      await db
        .collection('users')
        .doc(userId)
        .update({
          storagePreferences: preferences,
        });

      return {
        success: true,
        preferences,
        estimatedMonthlyCost: calculateEstimatedCost(preferences.retentionDays),
      };
    } catch (error) {
      console.error('Error setting storage preferences:', error);
      throw new functions.https.HttpsError('internal', 'Failed to set preferences');
    }
  }
);

function calculateEstimatedCost(retentionDays: number): number {
  // Assuming 5 images per day, 500KB average size
  const imagesPerDay = 5;
  const averageImageSize = 500 * 1024; // 500KB in bytes
  const totalImages = imagesPerDay * retentionDays;
  const totalSizeGB = (totalImages * averageImageSize) / (1024 * 1024 * 1024);
  
  // Firebase Storage pricing: $0.026/GB/month
  return totalSizeGB * 0.026;
} 