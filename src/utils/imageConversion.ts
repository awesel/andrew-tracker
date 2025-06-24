/**
 * Creates an HTMLImageElement from a File object
 */
export function createImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
    };

    const onLoad = () => {
      cleanup();
      resolve(img);
    };

    const onError = (error: Event | string) => {
      cleanup();
      reject(error);
    };

    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    img.src = objectUrl;
  });
}

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Converts any image file to JPEG format with optional resizing
 * This handles HEIC, PNG, WebP, and other formats that might not be supported
 * by Firebase Storage or the OpenAI Vision API
 */
export async function convertImageToJpeg(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.9
): Promise<Blob> {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Check if this is a HEIC file and handle it specially
  if (isHeicFile(file)) {
    return convertHeicToJpeg(file, maxWidth, quality);
  }

  // For non-HEIC files, use the standard approach
  const img = await createImageFromFile(file);

  // Calculate dimensions while maintaining aspect ratio
  let { width, height } = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxWidth
  );

  // Create canvas and draw image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = width;
  canvas.height = height;

  // Draw image to canvas with the calculated dimensions
  ctx.drawImage(img, 0, 0, width, height);

  // Convert canvas to JPEG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert image to JPEG'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Checks if a file is a HEIC/HEIF file
 */
function isHeicFile(file: File): boolean {
  const heicTypes = ['image/heic', 'image/heif'];
  const heicExtensions = ['.heic', '.heif'];
  
  // Check MIME type
  if (heicTypes.includes(file.type.toLowerCase())) {
    return true;
  }
  
  // Check file extension
  const fileName = file.name.toLowerCase();
  return heicExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * Converts HEIC files to JPEG using the heic2any library
 */
async function convertHeicToJpeg(
  file: File,
  maxWidth: number,
  quality: number
): Promise<Blob> {
  try {
    // Dynamically import heic2any to avoid bundling it if not needed
    const heic2any = (await import('heic2any')).default;
    
    // Convert HEIC to JPEG
    const jpegBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: quality,
    }) as Blob;
    
    // Now resize the converted JPEG if necessary
    if (maxWidth < 1920) { // Only resize if we need to
      const img = await createImageFromFile(new File([jpegBlob], 'converted.jpg', { type: 'image/jpeg' }));
      
      const { width, height } = calculateDimensions(
        img.naturalWidth,
        img.naturalHeight,
        maxWidth
      );
      
      // If no resizing needed, return the original converted blob
      if (width === img.naturalWidth && height === img.naturalHeight) {
        return jpegBlob;
      }
      
      // Resize the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to resize converted HEIC image'));
            }
          },
          'image/jpeg',
          quality
        );
      });
    }
    
    return jpegBlob;
  } catch (error) {
    throw new Error(`Failed to convert HEIC file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculates new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number
): { width: number; height: number } {
  // Don't upscale images
  if (originalWidth <= maxWidth) {
    return { width: originalWidth, height: originalHeight };
  }

  // Calculate new dimensions maintaining aspect ratio
  const aspectRatio = originalHeight / originalWidth;
  const width = maxWidth;
  const height = Math.round(width * aspectRatio);

  return { width, height };
} 