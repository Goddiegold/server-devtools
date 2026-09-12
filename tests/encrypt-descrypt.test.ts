import assert from "node:assert/strict";
import crypto from "node:crypto";
import EncryptDecryptService from "../src/security/encrypt-decrypt.service";

const encryptionKey = crypto.randomBytes(32).toString("base64");

const service = new EncryptDecryptService(
    encryptionKey,
    [
        "password",
        "accessToken",
        "apiKey",
    ],
);

// Encrypt configured field
const encrypted = service.encryptData({
    email: "john@example.com",
    password: "secret123",
}) as any;

assert.equal(
    encrypted.email,
    "john@example.com",
);

assert.notEqual(
    encrypted.password,
    "secret123",
);

assert.ok(
    encrypted.password.startsWith("sdt:v1:"),
);

// Nested fields
const nested = service.encryptData({
    profile: {
        name: "John",
        accessToken: "token-123",
    },
}) as any;

assert.equal(
    nested.profile.name,
    "John",
);

assert.ok(
    nested.profile.accessToken.startsWith("sdt:v1:"),
);

// Fields inside arrays
const arrayResult = service.encryptData({
    users: [
        {
            name: "John",
            password: "password-1",
        },
        {
            name: "Jane",
            password: "password-2",
        },
    ],
}) as any;

assert.equal(
    arrayResult.users[0].name,
    "John",
);

assert.ok(
    arrayResult.users[0].password.startsWith("sdt:v1:"),
);

assert.ok(
    arrayResult.users[1].password.startsWith("sdt:v1:"),
);

// Case-insensitive field matching
const caseResult = service.encryptData({
    Password: "one",
    PASSWORD: "two",
    password: "three",
}) as any;

assert.ok(caseResult.Password.startsWith("sdt:v1:"));
assert.ok(caseResult.PASSWORD.startsWith("sdt:v1:"));
assert.ok(caseResult.password.startsWith("sdt:v1:"));

// Fields not configured for encryption stay untouched
const untouched = {
    email: "john@example.com",
    age: 25,
    active: true,
    profile: {
        name: "John",
    },
};

assert.deepEqual(
    service.encryptData(untouched),
    untouched,
);

// Full encrypt → decrypt round trip
const original = {
    email: "john@example.com",
    password: "secret123",

    profile: {
        accessToken: "token-123",
        age: 25,
        active: true,
    },

    users: [
        {
            username: "user1",
            password: "password1",
        },
        {
            username: "user2",
            password: "password2",
        },
    ],

    credentials: {
        apiKey: "abc123",
    },
};

const encryptedOriginal =
    service.encryptData(original);

const decrypted =
    service.decryptData(encryptedOriginal);

assert.deepEqual(
    decrypted,
    original,
);

// Preserve encrypted value types
const typeService = new EncryptDecryptService(
    encryptionKey,
    [
        "stringValue",
        "numberValue",
        "booleanValue",
        "nullValue",
        "objectValue",
        "arrayValue",
    ],
);

const typedOriginal = {
    stringValue: "hello",
    numberValue: 123,
    booleanValue: true,
    nullValue: null,
    objectValue: {
        hello: "world",
    },
    arrayValue: [1, 2, 3],
};

const typedEncrypted =
    typeService.encryptData(typedOriginal);

const typedDecrypted =
    typeService.decryptData(typedEncrypted);

assert.deepEqual(
    typedDecrypted,
    typedOriginal,
);

// Same plaintext should produce different ciphertext
// because every encryption gets a fresh random IV.
const first = service.encryptData({
    password: "secret123",
}) as any;

const second = service.encryptData({
    password: "secret123",
}) as any;

assert.notEqual(
    first.password,
    second.password,
);

// Different encryption key cannot decrypt existing data
const differentKey = crypto
    .randomBytes(32)
    .toString("base64");

const differentService =
    new EncryptDecryptService(
        differentKey,
        ["password"],
    );

assert.throws(() => {
    differentService.decryptData(first);
});

// Invalid key should fail immediately
const invalidKey = Buffer
    .from("too-short")
    .toString("base64");

assert.throws(
    () => {
        new EncryptDecryptService(
            invalidKey,
            ["password"],
        );
    },
    /32-byte base64 encoded key/,
);

console.log(
    "encrypt-decrypt-service tests passed"
);