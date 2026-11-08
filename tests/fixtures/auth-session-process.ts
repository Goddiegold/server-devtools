import SQLiteStorage from "../../src/storage/sqlite-storage";
import AuthService from "../../src/security/auth.service";

const [path, username, password, startAtValue] = process.argv.slice(2);
const startAt = Number(startAtValue);
const result: Record<string, unknown> = { username, password };

while (Date.now() < startAt) {
    // Spin so every child process starts initialization at the same moment.
}

let storage: SQLiteStorage | undefined;

try {
    storage = new SQLiteStorage(path);
    const authService = new AuthService(username, password, storage);

    try {
        result.token = authService.createSession(username);
    } catch (error) {
        result.createError = error instanceof Error ? error.message : String(error);
    }
} catch (error) {
    result.initError = error instanceof Error ? error.message : String(error);
} finally {
    storage?.close();
}

process.stdout.write(JSON.stringify(result));
