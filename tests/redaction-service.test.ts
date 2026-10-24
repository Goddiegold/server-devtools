import assert from "node:assert/strict";
import { test } from "node:test";

import RedactionService from "../src/security/redaction.service";

test("disabled redaction returns the original input", () => {
  const input = { password: "secret", nested: { value: 1 } };
  const service = new RedactionService(false, ["password"]);

  assert.strictEqual(service.redactData(input), input);
});

test("redacts sensitive keys case-insensitively", () => {
  const service = new RedactionService(true, ["password", "authorization"]);

  assert.deepEqual(service.redactData({
    password: "one",
    PASSWORD: "two",
    Authorization: "Bearer token",
  }), {
    password: "[REDACTED]",
    PASSWORD: "[REDACTED]",
    Authorization: "[REDACTED]",
  });
});

test("redacts nested objects and arrays without changing other values", () => {
  const service = new RedactionService(true, ["token"]);
  const input = {
    nullValue: null,
    undefinedValue: undefined,
    falseValue: false,
    zeroValue: 0,
    emptyValue: "",
    profile: {
      token: "top-secret",
      values: [
        { TOKEN: "nested-secret", keep: "visible" },
        null,
        false,
        0,
        "",
        undefined,
      ],
    },
  };
  const before = structuredClone(input);

  const redacted = service.redactData(input);

  assert.deepEqual(redacted, {
    nullValue: null,
    undefinedValue: undefined,
    falseValue: false,
    zeroValue: 0,
    emptyValue: "",
    profile: {
      token: "[REDACTED]",
      values: [
        { TOKEN: "[REDACTED]", keep: "visible" },
        null,
        false,
        0,
        "",
        undefined,
      ],
    },
  });
  assert.deepEqual(input, before);
});
