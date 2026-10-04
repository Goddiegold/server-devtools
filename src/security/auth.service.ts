import type { IStorage } from "../types";
import { ISession } from "../types";
import { debugLog } from "../utils/logger";
import crypto from "node:crypto";

class AuthService {
    constructor(
        private readonly username: string,
        private readonly password: string,
        private readonly storage: IStorage,
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


    async createSession(username: string): Promise<string> {
        const token = this.generateSessionToken();
        const sessionHash = this.hashSessionToken(token);

        const createdAt = Date.now();
        const expiresAt = createdAt + (24 * 60 * 60 * 1000);

        const normalizedUsername = username?.toLowerCase()?.trim()

        try {
            await this.storage.saveSession({
                sessionHash,
                username: normalizedUsername,
                createdAt,
                expiresAt,
            });
        } catch (error) {
            debugLog("Session creation persistence failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            throw error;
        }

        return token;
    }

    async getSession(token: string): Promise<ISession | undefined> {
        const currentDate = Date.now()
        const sessionHash = this.hashSessionToken(token)
        let session: ISession | undefined;

        try {
            session = await this.storage.getSessionByHash(sessionHash)
        } catch (error) {
            debugLog("Session lookup failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            return undefined;
        }

        if (!session) return undefined
        const hasExpired = session.expiresAt <= currentDate
        if (hasExpired) {
            try {
                await this.storage.deleteSession(sessionHash)
            } catch (error) {
                debugLog("Expired session cleanup failed", {
                    errorName: error instanceof Error ? error.name : typeof error,
                });
            }
            return undefined
        }

        return session
    }

    async deleteSession(token: string): Promise<void> {
        const sessionHash = this.hashSessionToken(token)
        try {
            await this.storage.deleteSession(sessionHash)
        } catch (error) {
            debugLog("Session deletion failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
        }
    }
}


export default AuthService
