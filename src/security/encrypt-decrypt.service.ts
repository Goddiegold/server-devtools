
import crypto from "node:crypto";


export default class EncryptDecryptService {
    private readonly encryptFields: Set<string>;
    private readonly encryptionKey: Buffer;

    constructor(
        encryptionKey: string,
        encryptFields: string[],
    ) {
        this.encryptFields = new Set(
            encryptFields.map(field => field?.toLowerCase())
        );

        const key = Buffer.from(encryptionKey, "base64");

        if (key.length !== 32) {
            throw new Error(
                "ServerDevTools encryption key must be a 32-byte base64 encoded key"
            );
        }

        this.encryptionKey = key;
    }

    encryptData(data: unknown): unknown {
        if (Array.isArray(data)) {
            return data.map(item => this.encryptData(item));
        }

        if (data !== null && typeof data === "object") {
            return Object.fromEntries(
                Object.entries(data).map(([key, value]) => {
                    if (
                        this.encryptFields.has(key.toLowerCase()) &&
                        value !== undefined
                    ) {
                        return [key, this.encryptValue(value)];
                    }

                    return [key, this.encryptData(value)];
                })
            );
        }

        return data;
    }

    private encryptValue(value: unknown): string {
        const key = this.encryptionKey
        
        // Fresh IV for every encrypted value
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv(
            "aes-256-gcm",
            key,
            iv,
        );

        // JSON.stringify lets us preserve strings, objects,
        // arrays, numbers, booleans and null.
        const serializedValue = JSON.stringify(value);

        const encrypted = Buffer.concat([
            cipher.update(serializedValue, "utf8"),
            cipher.final(),
        ]);

        const authTag = cipher.getAuthTag();

        return [
            "sdt",
            "v1",
            iv.toString("base64"),
            authTag.toString("base64"),
            encrypted.toString("base64"),
        ].join(":");
    }

    decryptData(data: unknown): unknown {
        if (Array.isArray(data)) {
            return data.map(item => this.decryptData(item));
        }

        if (data !== null && typeof data === "object") {
            return Object.fromEntries(
                Object.entries(data).map(([key, value]) => [
                    key,
                    this.decryptData(value),
                ])
            );
        }

        if (
            typeof data === "string" &&
            data.startsWith("sdt:v1:")
        ) {
            return this.decryptValue(data);
        }

        return data;
    }

    private decryptValue(value: string): unknown {
        const parts = value.split(":");

        if (
            parts.length !== 5 ||
            parts[0] !== "sdt" ||
            parts[1] !== "v1"
        ) {
            throw new Error("Invalid ServerDevTools encrypted value");
        }

        const [, , ivBase64, authTagBase64, encryptedBase64] = parts;

        // const key = Buffer.from(this.encryptionKey, "base64");
        const key = this.encryptionKey

        const iv = Buffer.from(ivBase64, "base64");
        const authTag = Buffer.from(authTagBase64, "base64");
        const encrypted = Buffer.from(encryptedBase64, "base64");

        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            key,
            iv,
        );

        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);

        return JSON.parse(decrypted.toString("utf8"));
    }
}