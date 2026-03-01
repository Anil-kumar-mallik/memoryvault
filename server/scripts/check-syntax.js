const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..", "src");

const walkJsFiles = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolutePath);
    }
  }

  return files;
};

const files = walkJsFiles(rootDir);
let hasErrors = false;

for (const filePath of files) {
  const check = spawnSync(process.execPath, ["--check", filePath], { stdio: "inherit" });
  if (check.status !== 0) {
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} files.`);
