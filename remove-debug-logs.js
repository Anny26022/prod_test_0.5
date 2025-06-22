const fs = require('fs');
const path = require('path');

// Files to clean up debug logs from
const filesToClean = [
  'src/services/chartImageService.ts',
  'src/components/UniversalChartViewer.tsx',
  'src/components/trade-modal.tsx',
  'src/services/supabaseService.ts',
  'src/services/migrationService.ts',
  'src/utils/chartAttachmentsMigration.ts',
  'src/db/database.ts',
  'src/components/migration/MigrationModal.tsx'
];

// Patterns to remove (debug logs with emojis and specific debug messages)
const debugPatterns = [
  // Single line console logs with emojis
  /^\s*console\.(log|warn|error)\(`[🔍📸📥📦☁️🔄✅❌⚠️🧪🗑️💾📖🧹📊🎉🚀].*?\`\);?\s*$/gm,
  // Multi-line console logs with emojis (starting with emoji)
  /^\s*console\.(log|warn|error)\(`[🔍📸📥📦☁️🔄✅❌⚠️🧪🗑️💾📖🧹📊🎉🚀][\s\S]*?\);?\s*$/gm,
  // Console logs with bracket patterns like [CLEANUP], [RETRIEVAL], etc.
  /^\s*console\.(log|warn|error)\(`.*?\[.*?\].*?\`.*?\);?\s*$/gm,
  // Console logs with specific debug text
  /^\s*console\.(log|warn|error)\(`.*?(VERIFICATION|CLEANUP|RETRIEVAL|DEBUG).*?\`.*?\);?\s*$/gm,
  // Debug comments
  /^\s*\/\/ Debug:.*$/gm,
  /^\s*\/\/ CRITICAL DEBUG:.*$/gm,
  /^\s*\/\/ TEMPORARILY DISABLE.*$/gm,
  // Empty lines left after removing logs (more than 2 consecutive)
  /\n\n\n+/g
];

function cleanFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalLength = content.length;

    // Apply all patterns
    debugPatterns.forEach(pattern => {
      content = content.replace(pattern, '');
    });

    // Clean up excessive empty lines
    content = content.replace(/\n\n\n+/g, '\n\n');

    // Write back if changed
    if (content.length !== originalLength) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Cleaned ${filePath} (${originalLength - content.length} characters removed)`);
    } else {
      console.log(`⚪ No changes needed for ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error cleaning ${filePath}:`, error.message);
  }
}

// Clean all files
console.log('🧹 Starting debug log cleanup...');
filesToClean.forEach(cleanFile);
console.log('✅ Debug log cleanup completed!');
