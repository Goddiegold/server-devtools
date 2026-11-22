"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const linkDir = path.join(repoRoot, "examples", "nestjs", "node_modules");
const linkPath = path.join(linkDir, "server-devtools");
const target = repoRoot;

fs.mkdirSync(linkDir, { recursive: true });

try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(linkPath);
        if (resolved === fs.realpathSync(target)) {
            process.exit(0);
        }
        fs.unlinkSync(linkPath);
    } else {
        fs.rmSync(linkPath, { recursive: true, force: true });
    }
} catch (error) {
    if (error && typeof error === "object" && error.code !== "ENOENT") {
        throw error;
    }
}

const linkType = process.platform === "win32" ? "junction" : "dir";
fs.symlinkSync(target, linkPath, linkType);