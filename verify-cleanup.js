// Script untuk memverifikasi hasil cleanup
const fs = require("fs");
const path = require("path");

function listFiles(directory) {
  try {
    const files = fs.readdirSync(directory);
    return files.map((file) => {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        age: Date.now() - stats.mtime.getTime(),
      };
    });
  } catch (error) {
    return [];
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatAge(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} days`;
  if (hours > 0) return `${hours} hours`;
  if (minutes > 0) return `${minutes} minutes`;
  return `${seconds} seconds`;
}

console.log("📁 Current files in uploads directory:");
console.log("=====================================");

const uploadFiles = listFiles("./uploads");

if (uploadFiles.length === 0) {
  console.log("✅ No files found - cleanup successful!");
} else {
  console.log(`📊 Found ${uploadFiles.length} files:`);

  uploadFiles.forEach((file) => {
    const shouldBeDeleted = file.age > 24 * 60 * 60 * 1000; // 24 hours
    const status = shouldBeDeleted ? "🔴 Should be deleted" : "🟢 Recent file";

    console.log(`   ${file.name}`);
    console.log(`      Size: ${formatBytes(file.size)}`);
    console.log(`      Age: ${formatAge(file.age)}`);
    console.log(`      Status: ${status}`);
    console.log("");
  });

  const oldFiles = uploadFiles.filter((f) => f.age > 24 * 60 * 60 * 1000);
  if (oldFiles.length > 0) {
    console.log(
      `⚠️  ${oldFiles.length} files should have been deleted by cleanup`
    );
    console.log("   This might indicate dry run mode is still active");
  }
}

console.log("\\n🔧 To actually delete files:");
console.log("1. Set CLEANUP_DRY_RUN=false in .env file");
console.log("2. Restart the application");
console.log("3. Or run: node test-cleanup.js");
