// High-performance image optimization utilities for Nexus Trading Journal
import React from 'react';

interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'webp' | 'png';
  progressive?: boolean;
}

interface OptimizedImage {
  blob: Blob;
  dataUrl: string;
  size: number;
  width: number;
  height: number;
  compressionRatio: number;
}

// Default compression settings optimized for chart images
const DEFAULT_COMPRESSION_OPTIONS: ImageCompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  format: 'webp',
  progressive: true
};

// High-performance image compression using Canvas API with GPU acceleration
export const compressImage = async (
  file: File,
  options: ImageCompressionOptions = {}
): Promise<OptimizedImage> => {
  const opts = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {
      alpha: false, // Disable alpha channel for better performance
      willReadFrequently: false, // Optimize for single-use
      desynchronized: true // Enable GPU acceleration
    });

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      try {
        // Calculate optimal dimensions while maintaining aspect ratio
        const { width: targetWidth, height: targetHeight } = calculateOptimalDimensions(
          img.width,
          img.height,
          opts.maxWidth!,
          opts.maxHeight!
        );

        // Set canvas dimensions
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw and compress image
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Convert to blob with specified format and quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // Create data URL for preview
            const reader = new FileReader();
            reader.onload = () => {
              const compressionRatio = ((file.size - blob.size) / file.size) * 100;
              
              resolve({
                blob,
                dataUrl: reader.result as string,
                size: blob.size,
                width: targetWidth,
                height: targetHeight,
                compressionRatio
              });
            };
            reader.onerror = () => reject(new Error('Failed to create data URL'));
            reader.readAsDataURL(blob);
          },
          `image/${opts.format}`,
          opts.quality
        );
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Calculate optimal dimensions while maintaining aspect ratio
const calculateOptimalDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } => {
  const aspectRatio = originalWidth / originalHeight;

  let width = originalWidth;
  let height = originalHeight;

  // Scale down if necessary
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
};

// Batch compress multiple images with progress tracking
export const batchCompressImages = async (
  files: File[],
  options: ImageCompressionOptions = {},
  onProgress?: (progress: number, currentFile: string) => void
): Promise<OptimizedImage[]> => {
  const results: OptimizedImage[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      onProgress?.(((i + 1) / files.length) * 100, file.name);
      const compressed = await compressImage(file, options);
      results.push(compressed);
    } catch (error) {
      console.error(`Failed to compress ${file.name}:`, error);
      // Continue with other files even if one fails
    }
  }
  
  return results;
};

// Create optimized thumbnail for quick preview
export const createThumbnail = async (
  file: File,
  size: number = 150
): Promise<string> => {
  const compressed = await compressImage(file, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.7,
    format: 'webp'
  });
  
  return compressed.dataUrl;
};

// Lazy loading image component with intersection observer
export const LazyImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
}> = React.memo(({ src, alt, className = '', placeholder, onLoad, onError }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isInView, setIsInView] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Intersection observer for lazy loading
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoad = React.useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = React.useCallback(() => {
    onError?.();
  }, [onError]);

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {!isLoaded && placeholder && (
        <div className="absolute inset-0 bg-default-100 animate-pulse gpu-accelerated" />
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`optimized-image transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

// Image cache manager for better performance
class ImageCache {
  private cache = new Map<string, string>();
  private maxSize = 50; // Maximum number of cached images

  set(key: string, dataUrl: string): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, dataUrl);
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const imageCache = new ImageCache();

// Hook for managing image optimization state
export const useImageOptimization = () => {
  const [isCompressing, setIsCompressing] = React.useState(false);
  const [compressionProgress, setCompressionProgress] = React.useState(0);
  const [compressionStats, setCompressionStats] = React.useState({
    originalSize: 0,
    compressedSize: 0,
    compressionRatio: 0
  });

  const compressWithProgress = React.useCallback(async (
    files: File[],
    options?: ImageCompressionOptions
  ) => {
    setIsCompressing(true);
    setCompressionProgress(0);

    try {
      const results = await batchCompressImages(
        files,
        options,
        (progress, fileName) => {
          setCompressionProgress(progress);
        }
      );

      const totalOriginalSize = files.reduce((sum, file) => sum + file.size, 0);
      const totalCompressedSize = results.reduce((sum, result) => sum + result.size, 0);
      const avgCompressionRatio = results.reduce((sum, result) => sum + result.compressionRatio, 0) / results.length;

      setCompressionStats({
        originalSize: totalOriginalSize,
        compressedSize: totalCompressedSize,
        compressionRatio: avgCompressionRatio
      });

      return results;
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  }, []);

  return {
    isCompressing,
    compressionProgress,
    compressionStats,
    compressWithProgress
  };
};

// Utility to convert blob to base64 for storage
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Utility to convert base64 to blob
export const base64ToBlob = (base64: string): Blob => {
  const byteCharacters = atob(base64.split(',')[1]);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'image/webp' });
};
