import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions';

const RETENTION_DAYS = 90; // Keep images for 90 days

// Run daily at 2 AM UTC to clean up old images
export const cleanupOldImages = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'UTC',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore();
    const storage = getStorage();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    console.log(`Starting cleanup of images older than ${cutoffDate.toISOString()}`);
    
    try {
      // Get all entries older than cutoff date
      const usersSnapshot = await db.collection('users').get();
      
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        
        try {
          const entriesQuery = db
            .collection('users')
            .doc(userId)
            .collection('entries')
            .where('createdAt', '<', cutoffDate)
            .where('imageUrl', '!=', null);
          
          const entriesSnapshot = await entriesQuery.get();
          
          for (const entryDoc of entriesSnapshot.docs) {
            const entryData = entryDoc.data();
            const imageUrl = entryData.imageUrl;
            
            if (imageUrl) {
              try {
                // Extract file path from URL
                const urlParts = imageUrl.split('/');
                                  const pathStart = urlParts.findIndex((part: string) => part === 'o') + 1;
                if (pathStart > 0 && pathStart < urlParts.length) {
                  const encodedPath = urlParts[pathStart].split('?')[0];
                  const filePath = decodeURIComponent(encodedPath);
                  
                  // Delete from storage
                  await storage.bucket().file(filePath).delete();
                  
                  // Remove imageUrl from Firestore document
                  await entryDoc.ref.update({
                    imageUrl: null,
                    imageDeletedAt: new Date(),
                  });
                  
                  deletedCount++;
                  console.log(`Deleted image: ${filePath}`);
                }
              } catch (error) {
                console.error(`Error deleting image for entry ${entryDoc.id}:`, error);
                errorCount++;
              }
            }
          }
        } catch (error) {
          console.error(`Error processing user ${userId}:`, error);
          errorCount++;
        }
      }
      
      console.log(`Cleanup completed. Deleted: ${deletedCount} images, Errors: ${errorCount}`);
      
    } catch (error) {
      console.error('Failed to cleanup old images:', error);
      throw new functions.https.HttpsError('internal', 'Cleanup failed');
    }
  }
); 