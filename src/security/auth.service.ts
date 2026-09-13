import SQLiteStorage from "../storage/sqlite-storage";
import { ISession } from "../types";
import crypto from "node:crypto";

class AuthService {
    constructor(
        private readonly username: string,
        private readonly password: string,
        private readonly storage: SQLiteStorage,
    ) { }

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
        return (
            username === this.username &&
            password === this.password
        );
    }


    createSession(username: string): string {
        const token = this.generateSessionToken();
        const sessionHash = this.hashSessionToken(token);

        const createdAt = Date.now();
        const expiresAt = createdAt + (24 * 60 * 60 * 1000);

        this.storage.saveSession({
            sessionHash,
            username,
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