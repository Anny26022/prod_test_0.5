import { ChartImage, ChartImageBlob, TradeChartAttachments } from '../types/trade';
import { DatabaseService } from '../db/database';
import { SupabaseService } from './supabaseService';
import { AuthService } from './authService';
import { createChartImage, CHART_IMAGE_CONFIG, getImageDataUrl } from '../utils/chartImageUtils';
import { generateId } from '../utils/helpers';
import { v4 as uuidv4 } from 'uuid';

export class ChartImageService {

  /**
   * Helper function to ensure blob ID is a valid UUID for Supabase
   */
  private static ensureValidBlobId(blobId: string): string {
    // Check if it's already a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(blobId)) {
      return blobId;
    }

    // If not a UUID, generate a new one
    console.log(`🔄 Converting non-UUID blob ID to UUID: ${blobId} -> generating new UUID`);
    return uuidv4();
  }

  /**
   * Test blob functionality - for debugging
   */
  static async testBlobFunctionality(file: File): Promise<void> {
    console.log('🧪 Testing blob functionality...');

    // Test 1: Create blob from file
    const testBlob = new Blob([file], { type: file.type });
    console.log(`✅ Test 1 - Blob created: size=${testBlob.size}, type=${testBlob.type}`);

    // Test 2: Create object URL
    const objectUrl = URL.createObjectURL(testBlob);
    console.log(`✅ Test 2 - Object URL created: ${objectUrl}`);

    // Test 3: Test if URL works
    const testImg = new Image();
    testImg.onload = () => {
      console.log(`✅ Test 3 - Image loads successfully from blob URL`);
      URL.revokeObjectURL(objectUrl);
    };
    testImg.onerror = (error) => {
      console.error(`❌ Test 3 - Image failed to load from blob URL:`, error);
      URL.revokeObjectURL(objectUrl);
    };
    testImg.src = objectUrl;
  }

  /**
   * Debug method to check IndexedDB contents
   */
  static async debugIndexedDBContents(): Promise<void> {
    try {
      console.log('🔍 Debugging IndexedDB contents...');

      // Get all chart image blobs
      const allBlobs = await DatabaseService.getAllChartImageBlobs();
      console.log(`📦 Found ${allBlobs.length} chart image blobs in IndexedDB`);

      for (const blob of allBlobs) {
        console.log(`🔍 Blob: ${blob.filename}`);
        console.log(`  - ID: ${blob.id}`);
        console.log(`  - Trade ID: ${blob.tradeId}`);
        console.log(`  - Type: ${blob.imageType}`);
        console.log(`  - Size: ${blob.size} bytes`);
        console.log(`  - MIME: ${blob.mimeType}`);
        console.log(`  - Data type: ${blob.data?.constructor.name}`);
        console.log(`  - Data size: ${blob.data?.size} bytes`);
        console.log(`  - Compressed: ${blob.compressed}`);

        // Try to create object URL
        if (blob.data && blob.data instanceof Blob) {
          try {
            const url = URL.createObjectURL(blob.data);
            console.log(`  - Object URL: ${url.substring(0, 50)}...`);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(`  - Failed to create object URL:`, error);
          }
        } else {
          console.error(`  - Invalid blob data!`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to debug IndexedDB contents:', error);
    }
  }

  /**
   * Attach a chart image to a trade
   */
  static async attachChartImage(
    tradeId: string,
    imageType: 'beforeEntry' | 'afterExit',
    file: File,
    shouldCompress: boolean = true
  ): Promise<{ success: boolean; chartImage?: ChartImage; error?: string }> {
    try {
      console.log(`📸 [${imageType.toUpperCase()}] Attaching chart image to trade ${tradeId}: ${file.name} (${file.size} bytes)`);

      // Test blob functionality first (remove this in production)
      // await ChartImageService.testBlobFunctionality(file);

      // Create chart image record (this handles compression)
      const { chartImage, processedFile } = await createChartImage(file, shouldCompress);

      // CRITICAL FIX: Convert processed file to base64 for storage
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            // Remove data URL prefix to get just the base64 data
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to convert file to base64'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(processedFile);
      });

      // PURE SUPABASE: Always save to Supabase, no local storage

      // Check if user is authenticated for Supabase storage
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        return { success: false, error: 'User must be authenticated to upload chart images' };
      }

      // CRITICAL: Ensure the trade exists in Supabase before saving chart image
      // This is required due to foreign key constraint
      const trade = await SupabaseService.getTrade(tradeId);
      if (!trade) {
        return { success: false, error: 'Trade not found in cloud storage' };
      }

      // Save the trade to Supabase to satisfy foreign key constraint
      try {
        const tradeSaved = await SupabaseService.saveTrade(trade);
        if (!tradeSaved) {
          return { success: false, error: 'Failed to save trade to cloud storage' };
        }
      } catch (tradeError) {
        return { success: false, error: 'Failed to save trade to cloud storage' };
      }

      // We already have base64Data from above, no need to convert again

      // CRITICAL: Use the SAME UUID conversion logic as SupabaseService
      // We need to ensure we're using the exact same UUID that was used when saving the trade

      // Check if this is already a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId);

      let convertedTradeId: string;
      if (isUUID) {
        convertedTradeId = tradeId;
      } else {
        // Use the EXACT same conversion logic as SupabaseService.convertToUUID
        // This is critical for foreign key consistency
        const hash = tradeId.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);

        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        convertedTradeId = `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
      }

      console.log(`🔍 [${imageType.toUpperCase()}] Converted trade ID: ${convertedTradeId}`);

      // Verify the trade exists in Supabase with this exact UUID
      console.log(`🔍 [${imageType.toUpperCase()}] Verifying trade exists in Supabase with UUID: ${convertedTradeId}`);
      const verifyTrade = await SupabaseService.getTrade(tradeId); // This should use the same conversion logic
      if (!verifyTrade) {
        console.error(`❌ [${imageType.toUpperCase()}] Trade verification failed - trade not found in Supabase with converted UUID`);
        return { success: false, error: 'Trade not found in cloud storage after conversion' };
      }
      console.log(`✅ [${imageType.toUpperCase()}] Trade verified in Supabase: ${verifyTrade.name}`);

      const supabaseImageBlob = {
        id: chartImage.blobId, // This is already a UUID from uuidv4()
        trade_id: convertedTradeId, // Use the verified converted UUID
        image_type: imageType,
        filename: chartImage.filename,
        mime_type: chartImage.mimeType,
        size_bytes: chartImage.size,
        data: base64Data, // Use the actual file data we just converted
        uploaded_at: chartImage.uploadedAt.toISOString(),
        compressed: chartImage.compressed || false,
        original_size: chartImage.originalSize
      };

      console.log(`🔍 [${imageType.toUpperCase()}] Supabase blob data:`, {
        id: supabaseImageBlob.id,
        trade_id: supabaseImageBlob.trade_id,
        image_type: supabaseImageBlob.image_type,
        filename: supabaseImageBlob.filename,
        size_bytes: supabaseImageBlob.size_bytes,
        dataLength: base64Data.length
      });

      console.log(`☁️ [${imageType.toUpperCase()}] Saving chart image to Supabase: ${chartImage.filename} (${chartImage.size} bytes)`);
      console.log(`🔍 [${imageType.toUpperCase()}] Blob ID being saved: ${supabaseImageBlob.id}`);
      console.log(`🔍 [${imageType.toUpperCase()}] Trade ID being used: ${supabaseImageBlob.trade_id}`);
      console.log(`🔍 [${imageType.toUpperCase()}] Full Supabase blob object:`, {
        id: supabaseImageBlob.id,
        trade_id: supabaseImageBlob.trade_id,
        image_type: supabaseImageBlob.image_type,
        filename: supabaseImageBlob.filename,
        mime_type: supabaseImageBlob.mime_type,
        size_bytes: supabaseImageBlob.size_bytes,
        dataLength: supabaseImageBlob.data.length,
        uploaded_at: supabaseImageBlob.uploaded_at,
        compressed: supabaseImageBlob.compressed,
        original_size: supabaseImageBlob.original_size
      });

      const supabaseSaved = await SupabaseService.saveChartImageBlob(supabaseImageBlob);
      if (!supabaseSaved) {
        console.error(`❌ [${imageType.toUpperCase()}] Failed to save chart image to Supabase`);
        return { success: false, error: 'Failed to save image to cloud storage' };
      }
      console.log(`✅ [${imageType.toUpperCase()}] Chart image saved to Supabase successfully with blob ID: ${supabaseImageBlob.id}`);

      // CRITICAL DEBUG: Check if the data actually exists in Supabase immediately after save
      console.log(`🔍 [${imageType.toUpperCase()}] Verifying data exists in Supabase immediately after save...`);
      try {
        const verifyBlob = await SupabaseService.getChartImageBlob(supabaseImageBlob.id);
        if (verifyBlob) {
          console.log(`✅ [${imageType.toUpperCase()}] VERIFICATION SUCCESSFUL: Data exists in Supabase: ${verifyBlob.filename}`);
        } else {
          console.error(`❌ [${imageType.toUpperCase()}] VERIFICATION FAILED: Data NOT found in Supabase immediately after save!`);
          console.error(`❌ [${imageType.toUpperCase()}] This indicates a Supabase RLS policy or database issue!`);
        }
      } catch (verifyError) {
        console.error(`❌ [${imageType.toUpperCase()}] VERIFICATION ERROR:`, verifyError);
      }


      // No additional processing needed - everything is handled above
      
      console.log(`✅ [${imageType.toUpperCase()}] Chart image attached successfully: ${chartImage.storage} storage, ${chartImage.size} bytes`);

      // Test retrieval immediately after saving
      console.log(`🧪 [${imageType.toUpperCase()}] Testing immediate retrieval...`);
      console.log(`🔍 [${imageType.toUpperCase()}] Chart image blob ID for retrieval: ${chartImage.blobId}`);
      console.log(`🔍 [${imageType.toUpperCase()}] Chart image storage type: ${chartImage.storage}`);

      // Wait a moment for Supabase to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test direct Supabase retrieval
      console.log(`🧪 [${imageType.toUpperCase()}] Testing direct Supabase retrieval...`);
      const directBlob = await SupabaseService.getChartImageBlob(chartImage.blobId);
      if (directBlob) {
        console.log(`✅ [${imageType.toUpperCase()}] Direct Supabase retrieval successful: ${directBlob.filename}`);
      } else {
        console.error(`❌ [${imageType.toUpperCase()}] Direct Supabase retrieval failed!`);
      }

      // Test through service
      const testDataUrl = await ChartImageService.getChartImageDataUrl(chartImage);
      if (testDataUrl) {
        console.log(`✅ [${imageType.toUpperCase()}] Service retrieval successful: ${testDataUrl.substring(0, 50)}...`);
      } else {
        console.error(`❌ [${imageType.toUpperCase()}] Service retrieval failed!`);
        console.error(`❌ [${imageType.toUpperCase()}] Blob ID mismatch? Saved: ${supabaseImageBlob.id}, Retrieving: ${chartImage.blobId}`);
      }

      // Check if any cleanup processes are running
      console.log(`🔍 [${imageType.toUpperCase()}] Checking for cleanup processes...`);
      setTimeout(async () => {
        const stillExists = await SupabaseService.getChartImageBlob(chartImage.blobId);
        if (stillExists) {
          console.log(`✅ [${imageType.toUpperCase()}] Image still exists after 5 seconds: ${stillExists.filename}`);
        } else {
          console.error(`❌ [${imageType.toUpperCase()}] Image was deleted within 5 seconds! Cleanup process detected.`);
        }
      }, 5000);

      return { success: true, chartImage };
      
    } catch (error) {
      console.error('❌ Failed to attach chart image:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  /**
   * Get chart image data URL for display
   */
  static async getChartImageDataUrl(chartImage: ChartImage): Promise<string | null> {
    try {
      // PURE SUPABASE: Handle legacy inline storage but prefer Supabase
      if (chartImage.storage === 'inline' && chartImage.data) {
        return getImageDataUrl(chartImage);
      }

      // PURE SUPABASE: Always retrieve from Supabase
      if (chartImage.blobId) {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (!isAuthenticated) {
          return null;
        }

        try {
          const supabaseBlob = await SupabaseService.getChartImageBlob(chartImage.blobId);

          if (supabaseBlob) {

            // Convert Supabase binary data back to blob
            try {
              let bytes: Uint8Array;

              console.log(`🔍 [RETRIEVAL] Supabase data type:`, typeof supabaseBlob.data);
              console.log(`🔍 [RETRIEVAL] Supabase data constructor:`, supabaseBlob.data?.constructor?.name);
              console.log(`🔍 [RETRIEVAL] Is Array:`, Array.isArray(supabaseBlob.data));
              console.log(`🔍 [RETRIEVAL] Data length:`, supabaseBlob.data?.length);
              console.log(`🔍 [RETRIEVAL] First 10 bytes:`, Array.isArray(supabaseBlob.data) ? supabaseBlob.data.slice(0, 10) : 'N/A');

              if (typeof supabaseBlob.data === 'string') {
                console.log(`🔍 [RETRIEVAL] String data sample:`, supabaseBlob.data.substring(0, 100));
              }

              if (supabaseBlob.data instanceof Uint8Array) {
                // Already a Uint8Array - use directly
                console.log(`✅ [RETRIEVAL] Using Uint8Array directly`);
                bytes = supabaseBlob.data;
              } else if (Array.isArray(supabaseBlob.data)) {
                // Array of bytes from Supabase - convert to Uint8Array
                console.log(`✅ [RETRIEVAL] Converting array to Uint8Array`);
                bytes = new Uint8Array(supabaseBlob.data);
              } else if (typeof supabaseBlob.data === 'string') {
                // Supabase bytea can return as hex string (starting with \x) or base64
                console.log(`⚠️ [RETRIEVAL] String data detected, length: ${supabaseBlob.data.length}`);
                console.log(`🔍 [RETRIEVAL] First 50 chars: ${supabaseBlob.data.substring(0, 50)}`);

                if (supabaseBlob.data.startsWith('\\x')) {
                  // Hex string format from PostgreSQL bytea - but it might be hex-encoded JSON
                  console.log(`✅ [RETRIEVAL] Converting hex string to bytes`);
                  const hexString = supabaseBlob.data.substring(2); // Remove \x prefix

                  // First decode the hex to get the actual string
                  let decodedString = '';
                  for (let i = 0; i < hexString.length; i += 2) {
                    const hexByte = hexString.substr(i, 2);
                    decodedString += String.fromCharCode(parseInt(hexByte, 16));
                  }

                  console.log(`🔍 [RETRIEVAL] Decoded hex string sample: ${decodedString.substring(0, 100)}`);

                  // Now check if the decoded string is JSON
                  if (decodedString.startsWith('{') || decodedString.startsWith('[')) {
                    console.log(`✅ [RETRIEVAL] Decoded hex is JSON, parsing...`);
                    try {
                      const parsedData = JSON.parse(decodedString);
                      if (Array.isArray(parsedData) || (typeof parsedData === 'object' && parsedData !== null)) {
                        const arrayData = Array.isArray(parsedData) ? parsedData : Object.values(parsedData);
                        bytes = new Uint8Array(arrayData);
                        console.log(`✅ [RETRIEVAL] Successfully parsed hex-encoded JSON to Uint8Array: ${bytes.length} bytes`);
                      } else {
                        throw new Error('Parsed data is not an array or object');
                      }
                    } catch (jsonError) {
                      console.error(`❌ [RETRIEVAL] Failed to parse hex-decoded JSON:`, jsonError);
                      // Fallback: treat decoded string as raw binary
                      bytes = new Uint8Array(decodedString.length);
                      for (let i = 0; i < decodedString.length; i++) {
                        bytes[i] = decodedString.charCodeAt(i);
                      }
                    }
                  } else {
                    // Decoded hex is raw binary data
                    console.log(`✅ [RETRIEVAL] Decoded hex is raw binary data`);
                    bytes = new Uint8Array(decodedString.length);
                    for (let i = 0; i < decodedString.length; i++) {
                      bytes[i] = decodedString.charCodeAt(i);
                    }
                  }
                } else {
                  // The data might be a JSON string representation of an array
                  console.log(`✅ [RETRIEVAL] Attempting to parse as JSON array`);
                  try {
                    const parsedData = JSON.parse(supabaseBlob.data);
                    if (Array.isArray(parsedData) || (typeof parsedData === 'object' && parsedData !== null)) {
                      // Convert object with numeric keys to array
                      const arrayData = Array.isArray(parsedData) ? parsedData : Object.values(parsedData);
                      bytes = new Uint8Array(arrayData);
                      console.log(`✅ [RETRIEVAL] Successfully parsed JSON data to Uint8Array: ${bytes.length} bytes`);
                    } else {
                      throw new Error('Parsed data is not an array or object');
                    }
                  } catch (jsonError) {
                    console.log(`⚠️ [RETRIEVAL] JSON parse failed, trying base64 decode`);
                    try {
                      const binaryString = atob(supabaseBlob.data);
                      bytes = new Uint8Array(binaryString.length);
                      for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                      }
                      console.log(`✅ [RETRIEVAL] Base64 decode successful: ${bytes.length} bytes`);
                    } catch (base64Error) {
                      console.error(`❌ [RETRIEVAL] Both JSON and base64 decode failed, trying direct string conversion`);
                      // Last resort: treat as raw string
                      bytes = new Uint8Array(supabaseBlob.data.length);
                      for (let i = 0; i < supabaseBlob.data.length; i++) {
                        bytes[i] = supabaseBlob.data.charCodeAt(i);
                      }
                    }
                  }
                }
              } else {
                console.error(`❌ [RETRIEVAL] Unsupported data format:`, typeof supabaseBlob.data);
                throw new Error(`Unsupported data format from Supabase: ${typeof supabaseBlob.data}`);
              }

              const blobData = new Blob([bytes], { type: supabaseBlob.mime_type });

              // Validate blob data
              if (!blobData || blobData.size === 0) {
                console.error(`❌ Invalid blob data: size is ${blobData?.size || 0}`);
                return null;
              }

              // Convert Uint8Array directly to base64 data URL
              console.log(`🔄 Converting Uint8Array to base64 data URL for stable reference`);

              // Convert Uint8Array to base64 string
              let base64String = '';
              const chunkSize = 8192; // Process in chunks to avoid call stack overflow
              for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                base64String += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const base64Data = btoa(base64String);

              const dataUrl = `data:${supabaseBlob.mime_type};base64,${base64Data}`;

              console.log(`✅ Data URL created successfully from Supabase data: ${dataUrl.substring(0, 50)}...`);
              console.log(`🔍 Original bytes length: ${bytes.length}, base64 length: ${base64Data.length}`);

              return dataUrl;
            } catch (decodeError) {
              console.error(`❌ Failed to decode data for ${supabaseBlob.filename}:`, decodeError);
              return null;
            }
          } else {
            console.log(`📭 Chart image not found in Supabase: ${chartImage.blobId}`);
            return null;
          }
        } catch (error) {
          console.error(`❌ Failed to retrieve chart image from Supabase:`, error);
          return null;
        }
      }

      console.warn(`⚠️ No blob ID found for chart image: ${chartImage.filename}`);
      return null;
    } catch (error) {
      console.error('❌ Failed to get chart image data URL:', error);
      return null;
    }
  }
  
  /**
   * Delete a chart image
   */
  static async deleteChartImage(
    tradeId: string,
    imageType: 'beforeEntry' | 'afterExit',
    chartImage: ChartImage
  ): Promise<boolean> {
    try {
      console.log(`🗑️ Deleting ${imageType} chart image for trade ${tradeId}: ${chartImage.filename}`);

      // PURE SUPABASE: Delete from Supabase if user is authenticated
      if (chartImage.storage === 'blob' && chartImage.blobId) {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (isAuthenticated) {
          const supabaseDeleted = await SupabaseService.deleteChartImageBlob(chartImage.blobId);
          if (!supabaseDeleted) {
            console.warn('⚠️ Failed to delete chart image from Supabase, but continuing...');
          } else {
            console.log(`✅ Chart image deleted from Supabase: ${chartImage.filename}`);
          }
        }
      }

      console.log(`✅ Chart image deleted successfully`);
      return true;

    } catch (error) {
      console.error('❌ Failed to delete chart image:', error);
      return false;
    }
  }
  
  /**
   * Delete all chart images for a trade
   */
  static async deleteTradeChartImages(tradeId: string): Promise<boolean> {
    try {
      console.log(`🗑️ Deleting all chart images for trade ${tradeId}`);
      
      // Delete all blob storage for this trade
      const blobsDeleted = await DatabaseService.deleteTradeChartImageBlobs(tradeId);
      if (!blobsDeleted) {
        console.warn('⚠️ Failed to delete some chart image blobs');
      }
      
      console.log(`✅ All chart images deleted for trade ${tradeId}`);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to delete trade chart images:', error);
      return false;
    }
  }
  
  /**
   * Get storage statistics for chart images
   */
  static async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    inlineImages: number;
    inlineSize: number;
    blobImages: number;
    blobSize: number;
  }> {
    try {
      const allBlobs = await DatabaseService.getAllChartImageBlobs();
      const blobSize = allBlobs.reduce((total, blob) => total + blob.size, 0);
      
      // Note: We can't easily calculate inline image sizes without loading all trades
      // This would be a performance concern, so we'll estimate based on blob data
      
      return {
        totalImages: allBlobs.length,
        totalSize: blobSize,
        inlineImages: 0, // Would need to scan all trades to calculate
        inlineSize: 0,   // Would need to scan all trades to calculate
        blobImages: allBlobs.length,
        blobSize: blobSize,
      };
    } catch (error) {
      console.error('❌ Failed to get storage stats:', error);
      return {
        totalImages: 0,
        totalSize: 0,
        inlineImages: 0,
        inlineSize: 0,
        blobImages: 0,
        blobSize: 0,
      };
    }
  }
  
  /**
   * Cleanup orphaned chart image blobs (blobs without corresponding trades)
   * PURE SUPABASE: Updated to work with Supabase data
   */
  static async cleanupOrphanedBlobs(): Promise<{ cleaned: number; errors: number }> {
    try {
      console.log('🧹 [CLEANUP] Starting orphaned blobs cleanup (Pure Supabase mode)...');

      // Check if user is authenticated for Supabase operations
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        console.log('⚠️ [CLEANUP] User not authenticated, skipping Supabase cleanup');
        return { cleaned: 0, errors: 0 };
      }

      // PURE SUPABASE: Get data from Supabase, not IndexedDB
      const [allBlobs, allTrades] = await Promise.all([
        SupabaseService.getAllChartImageBlobs(),
        SupabaseService.getAllTrades()
      ]);

      console.log(`🔍 [CLEANUP] Found ${allBlobs.length} chart image blobs and ${allTrades.length} trades in Supabase`);

      // Convert trade IDs to the same format used in chart images (UUID conversion)
      const tradeIds = new Set();
      console.log(`🔍 [CLEANUP] Processing ${allTrades.length} trades for ID matching...`);

      for (const trade of allTrades) {
        // Add both original ID and converted UUID to handle both formats
        tradeIds.add(trade.id);
        console.log(`🔍 [CLEANUP] Added original trade ID: ${trade.id}`);

        // Also add the UUID conversion if it's different
        const convertedId = this.convertTradeIdToUUID(trade.id);
        if (convertedId !== trade.id) {
          tradeIds.add(convertedId);
          console.log(`🔍 [CLEANUP] Added converted trade ID: ${convertedId}`);
        }
      }

      console.log(`🔍 [CLEANUP] Total trade IDs in set: ${tradeIds.size}`);
      console.log(`🔍 [CLEANUP] Trade IDs:`, Array.from(tradeIds));

      let cleaned = 0;
      let errors = 0;

      for (const blob of allBlobs) {
        console.log(`🔍 [CLEANUP] Checking blob: ${blob.filename} with trade_id: ${blob.trade_id}`);
        console.log(`🔍 [CLEANUP] Trade ID exists in set: ${tradeIds.has(blob.trade_id)}`);

        if (!tradeIds.has(blob.trade_id)) {
          console.log(`🗑️ [CLEANUP] WOULD DELETE orphaned blob: ${blob.filename} (trade_id: ${blob.trade_id})`);
          console.log(`🗑️ [CLEANUP] Available trade IDs:`, Array.from(tradeIds));

          // TEMPORARILY DISABLE actual deletion for debugging
          console.log(`⚠️ [CLEANUP] Deletion temporarily disabled for debugging`);
          // const deleted = await SupabaseService.deleteChartImageBlob(blob.id);
          // if (deleted) {
          //   cleaned++;
          // } else {
          //   errors++;
          // }
        } else {
          console.log(`✅ [CLEANUP] Blob is valid, keeping: ${blob.filename}`);
        }
      }

      console.log(`✅ [CLEANUP] Cleanup completed: ${cleaned} blobs cleaned, ${errors} errors`);
      return { cleaned, errors };

    } catch (error) {
      console.error('❌ [CLEANUP] Failed to cleanup orphaned blobs:', error);
      return { cleaned: 0, errors: 1 };
    }
  }

  /**
   * Helper method to convert trade ID to UUID (same logic as used in chart image service)
   */
  private static convertTradeIdToUUID(tradeId: string): string {
    // If it's already a UUID format, return as is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId)) {
      return tradeId;
    }

    // Create a deterministic UUID from the string ID
    const hash = tradeId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    // Convert hash to UUID format
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
  }

  /**
   * Cleanup orphaned chart attachments in trade records (references without corresponding blobs)
   * PURE SUPABASE: Updated to work with Supabase data
   */
  static async cleanupOrphanedAttachments(): Promise<{ cleaned: number; errors: number }> {
    try {
      console.log('🧹 [CLEANUP] Starting cleanup of orphaned chart attachments in trade records (Pure Supabase mode)...');

      // Check if user is authenticated for Supabase operations
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        console.log('⚠️ [CLEANUP] User not authenticated, skipping attachment cleanup');
        return { cleaned: 0, errors: 0 };
      }

      // PURE SUPABASE: Get data from Supabase, not IndexedDB
      const [allTrades, allBlobs] = await Promise.all([
        SupabaseService.getAllTrades(),
        SupabaseService.getAllChartImageBlobs()
      ]);

      console.log(`🔍 [CLEANUP] Found ${allTrades.length} trades and ${allBlobs.length} chart image blobs in Supabase`);

      const blobIds = new Set(allBlobs.map(blob => blob.id));

      let cleaned = 0;
      let errors = 0;

      for (const trade of allTrades) {
        if (!trade.chartAttachments) continue;

        let needsUpdate = false;
        const updatedAttachments = { ...trade.chartAttachments };

        // Check beforeEntry attachment
        if (updatedAttachments.beforeEntry) {
          const attachment = updatedAttachments.beforeEntry;
          if (attachment.storage === 'blob' && attachment.blobId && !blobIds.has(attachment.blobId)) {
            console.log(`🗑️ Removing orphaned beforeEntry attachment from trade ${trade.id}: ${attachment.filename}`);
            delete updatedAttachments.beforeEntry;
            needsUpdate = true;
          }
        }

        // Check afterExit attachment
        if (updatedAttachments.afterExit) {
          const attachment = updatedAttachments.afterExit;
          if (attachment.storage === 'blob' && attachment.blobId && !blobIds.has(attachment.blobId)) {
            console.log(`🗑️ Removing orphaned afterExit attachment from trade ${trade.id}: ${attachment.filename}`);
            delete updatedAttachments.afterExit;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          // Check if any attachments remain
          const hasRemainingAttachments = updatedAttachments.beforeEntry || updatedAttachments.afterExit;

          const updatedTrade = {
            ...trade,
            chartAttachments: hasRemainingAttachments ? {
              ...updatedAttachments,
              metadata: {
                ...updatedAttachments.metadata,
                updatedAt: new Date(),
                totalSize: (updatedAttachments.beforeEntry?.size || 0) + (updatedAttachments.afterExit?.size || 0)
              }
            } : undefined
          };

          // PURE SUPABASE: Save to Supabase, not IndexedDB
          const saved = await SupabaseService.saveTrade(updatedTrade);
          if (saved) {
            cleaned++;
          } else {
            errors++;
          }
        }
      }

      console.log(`✅ Attachment cleanup completed: ${cleaned} trades cleaned, ${errors} errors`);
      return { cleaned, errors };

    } catch (error) {
      console.error('❌ Failed to cleanup orphaned attachments:', error);
      return { cleaned: 0, errors: 1 };
    }
  }
  
  /**
   * Comprehensive cleanup of all orphaned chart data
   */
  static async cleanupAllOrphanedData(): Promise<{
    blobsCleaned: number;
    attachmentsCleaned: number;
    errors: number
  }> {
    try {
      console.log('🧹 Starting comprehensive cleanup of all orphaned chart data...');

      // First cleanup orphaned blobs
      const blobCleanup = await this.cleanupOrphanedBlobs();

      // Then cleanup orphaned attachments in trade records
      const attachmentCleanup = await this.cleanupOrphanedAttachments();

      const totalErrors = blobCleanup.errors + attachmentCleanup.errors;

      console.log(`✅ Comprehensive cleanup completed: ${blobCleanup.cleaned} blobs, ${attachmentCleanup.cleaned} attachments, ${totalErrors} errors`);

      return {
        blobsCleaned: blobCleanup.cleaned,
        attachmentsCleaned: attachmentCleanup.cleaned,
        errors: totalErrors
      };

    } catch (error) {
      console.error('❌ Failed to perform comprehensive cleanup:', error);
      return { blobsCleaned: 0, attachmentsCleaned: 0, errors: 1 };
    }
  }

  /**
   * Validate chart attachments data structure
   */
  static validateChartAttachments(chartAttachments: any): chartAttachments is TradeChartAttachments {
    if (!chartAttachments || typeof chartAttachments !== 'object') {
      return false;
    }

    // Check beforeEntry if present
    if (chartAttachments.beforeEntry && !this.validateChartImage(chartAttachments.beforeEntry)) {
      return false;
    }

    // Check afterExit if present
    if (chartAttachments.afterExit && !this.validateChartImage(chartAttachments.afterExit)) {
      return false;
    }

    return true;
  }
  
  /**
   * Validate chart image data structure
   */
  private static validateChartImage(chartImage: any): chartImage is ChartImage {
    return (
      chartImage &&
      typeof chartImage === 'object' &&
      typeof chartImage.id === 'string' &&
      typeof chartImage.filename === 'string' &&
      typeof chartImage.mimeType === 'string' &&
      typeof chartImage.size === 'number' &&
      chartImage.uploadedAt instanceof Date &&
      (chartImage.storage === 'inline' || chartImage.storage === 'blob') &&
      CHART_IMAGE_CONFIG.ALLOWED_TYPES.includes(chartImage.mimeType)
    );
  }
}
