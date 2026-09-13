import SQLiteStorage from "../storage/sqlite-storage";
import { ISession } from "../types";
import crypto from "node:crypto";

class AuthService {
    constructor(
        private readonly username: string,
        private readonly password: string,
        private readonly storage: SQLiteStorage,
    ) {
        this.username = this.username ? this.username?.toLowerCase()?.trim() : ''
    }

    private generateSessionToken(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    private hashSessionToken(token: string): string {
        return crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");
    }


    validateCredentials(
        username: string,
        password: string,
    ): boolean {
        const normalizedUsername = username ? username?.toLowerCase()?.trim() : null
        return (
            normalizedUsername === this.username &&
            password === this.password
        );
    }


    createSession(username: string): string {
        const token = this.generateSessionToken();
        const sessionHash = this.hashSessionToken(token);

        const createdAt = Date.now();
        const expiresAt = createdAt + (24 * 60 * 60 * 1000);

        const normalizedUsername = username?.toLowerCase()?.trim()

        this.storage.saveSession({
            sessionHash,
            username: normalizedUsername,
            createdAt,
            expiresAt,
        });

        return token;
    }

    getSession(token: string): ISession | undefined {
        const currentDate = Date.now()
        const sessionHash = this.hashSessionToken(token)
        const session = this.storage.getSessionByHash(sessionHash)

        if (!session) return undefined
        const hasExpired = session.expiresAt <= currentDate
        if (hasExpired) {
            this.storage.deleteSession(sessionHash)
            return undefined
        }

        return session
    }

    deleteSession(token: string): void {
        const sessionHash = this.hashSessionToken(token)
        this.storage.deleteSession(sessionHash)
    }
}


export default AuthService