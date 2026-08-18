import assert from "node:assert/strict";
import test from "node:test";
import { normalizePaperclipError } from "../adapters/paperclip/error-contract.ts";

test("Paperclip bridge uses a stable upstream code when present", () => {
  assert.deepEqual(
    normalizePaperclipError(403, {
      code: "subject_not_permitted",
      error: "English text may change",
    }),
    {
      code: "subject_not_permitted",
      category: "FORBIDDEN",
      retryable: false,
      details: { upstreamCode: "subject_not_permitted" },
    },
  );
});

test("Paperclip bridge never promotes an English error string into a code", () => {
  assert.deepEqual(
    normalizePaperclipError(409, { error: "Document is locked" }),
    {
      code: "UPSTREAM_HTTP_409",
      category: "CONFLICT",
      retryable: false,
    },
  );
});

test("Paperclip transport failures are explicitly retryable", () => {
  assert.equal(normalizePaperclipError(503, null).retryable, true);
  assert.equal(normalizePaperclipError(429, null).category, "RATE_LIMITED");
});
