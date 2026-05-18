// Quick script to verify all syntax is correct before committing
const fs = require("fs");
const path = require("path");

const filesToCheck = [
  "src/index.js",
  "src/routes/listings.js",
  "src/middleware/csrf.js",
  "src/middleware/errorHandler.js",
];

console.log("🔍 Verifying syntax for security fixes...\n");

let hasErrors = false;

filesToCheck.forEach(file => {
  const fullPath = path.join(__dirname, file);
  try {
    require("child_process").execSync(`node -c "${fullPath}"`, { stdio: "pipe" });
    console.log(`✅ ${file} - Syntax OK`);
  } catch (err) {
    hasErrors = true;
    console.error(`❌ ${file} - Syntax Error:`);
    console.error(err.stderr.toString());
  }
});

if (hasErrors) {
  console.error("\n⚠️  Syntax errors found. Please fix before committing.");
  process.exit(1);
} else {
  console.log("\n✅ All files pass syntax check!");
}
