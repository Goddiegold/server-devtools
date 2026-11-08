import SQLiteStorage from "../storage/sqlite-storage";
import { IAuthCredentialVerifier, ISession } from "../types";
import { debugLog } from "../utils/logger";
import crypto from "node:crypto";

class AuthService {
    // Session hashes are keyed by the configured credentials so that changing
    // the username or password invalidates every previously issued session.
    private readonly sessionKey: Buffer;
    private verifier!: IAuthCredentialVerifier;

    constructor(
        private readonly username: string,
        private readonly password: string,
        private readonly storage: SQLiteStorage,
    ) {
        this.username = this.username ? this.username?.toLowerCase()?.trim() : ''
        this.sessionKey = crypto
            .createHash("sha256")
            .update(JSON.stringify([
                "server-devtools-session-v1",
                this.username,
                this.password,
            ]))
            .digest();

        this.initializeSessions();
    }

    private initializeSessions(): void {
        try {
            this.reconcileCredentialVerifier();
            this.storage.deleteExpiredSessions(Date.now());
        } catch (error) {
            debugLog("Dashboard session initialization failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            throw error;
        }
    }

    private deriveCredentialHash(salt: Buffer): Buffer {
        return crypto.scryptSync(
            JSON.stringify([
                "server-devtools-credentials-v1",
                this.username,
                this.password,
            ]),
            salt,
            32,
        );
    }

    private credentialsMatch(salt: string, hash: string): boolean {
        const expected = Buffer.from(hash, "hex");
        const actual = this.deriveCredentialHash(Buffer.from(salt, "hex"));

        return expected.length === actual.length &&
            crypto.timingSafeEqual(expected, actual);
    }

    // Sessions are deleted whenever the stored verifier is missing or does not
    // match, because they may have been issued under different credentials.
    private reconcileCredentialVerifier(): void {
        this.verifier = this.storage.reconcileAuthCredentialVerifier(
            stored => this.credentialsMatch(stored.salt, stored.hash),
            () => {
                const salt = crypto.randomBytes(16);

                return {
                    salt: salt.toString("hex"),
                    hash: this.deriveCredentialHash(salt).toString("hex"),
                    updatedAt: Date.now(),
                };
            },
        );
    }

    private generateSessionToken(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    private hashSessionToken(token: string): string {
        return crypto
            .createHmac("sha256", this.sessionKey)
            .update(token)
            .digest("hex");
    }


    validateCredentials(
        username: string,
        password: string,
    ): boolean {
        if (typeof username !== "string" || typeof password !== "string") {
            return false;
        }

        const normalizedUsername = username ? username.toLowerCase().trim() : null
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

        try {
            const saved = this.storage.saveSessionForVerifier(
                {
                    sessionHash,
                    username: normalizedUsername,
                    createdAt,
                    expiresAt,
                },
                this.verifier,
                createdAt,
            );

            if (!saved) {
                throw new Error(
                    "Dashboard credentials changed since this process started",
                );
            }
        } catch (error) {
            debugLog("Session creation persistence failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            throw error;
        }

        return token;
    }

    getSession(token: string): ISession | undefined {
        const currentDate = Date.now()
        const sessionHash = this.hashSessionToken(token)
        let session: ISession | undefined;

        try {
            session = this.storage.getSessionByHash(sessionHash)
        } catch (error) {
            debugLog("Session lookup failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
            return undefined;
        }

        if (!session) return undefined
        if (session.username !== this.username) return undefined
        const hasExpired = session.expiresAt <= currentDate
        if (hasExpired) {
            try {
                this.storage.deleteSession(sessionHash)
            } catch (error) {
                debugLog("Expired session cleanup failed", {
                    errorName: error instanceof Error ? error.name : typeof error,
                });
            }
            return undefined
        }

        return session
    }

    deleteSession(token: string): void {
        const sessionHash = this.hashSessionToken(token)
        try {
            this.storage.deleteSession(sessionHash)
        } catch (error) {
            debugLog("Session deletion failed", {
                errorName: error instanceof Error ? error.name : typeof error,
            });
        }
    }
}


export default AuthService
