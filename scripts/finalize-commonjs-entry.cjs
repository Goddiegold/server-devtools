const fs = require("node:fs");
const path = require("node:path");

const entryPath = path.join(__dirname, "../dist/src/index.js");
const entry = fs.readFileSync(entryPath, "utf8");
const defaultExport = "exports.default = ServerDevTools;";

if (!entry.includes(defaultExport)) {
  throw new Error(`Expected TypeScript default export in ${entryPath}`);
}

fs.writeFileSync(
  entryPath,
  entry.replace(defaultExport, "module.exports = ServerDevTools;"),
);
