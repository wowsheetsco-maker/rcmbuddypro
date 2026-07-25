/**
 * SSR-safety regression tests.
 *
 * The `/dashboard` route once went blank because `pdfjs-dist` — pulled in
 * transitively through `paymentAdviceParser` — touches `DOMMatrix` at
 * module load, which does not exist in the SSR worker runtime. That
 * eagerly-imported side effect crashed the entire server render.
 *
 * These tests run in the Node `vitest` environment (no DOM globals) and
 * verify that server-reachable modules import cleanly. If a future change
 * re-introduces a top-level DOM-dependent import, this suite fails.
 */
import { describe, it, expect } from "vitest";

describe("SSR safety: server-reachable modules must not touch DOM at import time", () => {
  it("has no DOMMatrix in the Node test env (sanity check)", () => {
    expect(typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix).toBe("undefined");
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
  });

  it("loads paymentAdviceParser without referencing DOMMatrix", async () => {
    const mod = await import("@/lib/paymentAdviceParser");
    // Module must export its public API without running pdfjs at load time.
    expect(mod).toBeTruthy();
  });

  it("loads claim status/metric helpers used by Dashboard", async () => {
    await expect(import("@/lib/claimStatusBuckets")).resolves.toBeTruthy();
    await expect(import("@/lib/claimMetrics")).resolves.toBeTruthy();
    await expect(import("@/data/mockClaims")).resolves.toBeTruthy();
  });

  it("does not eagerly import pdfjs-dist from paymentAdviceParser source", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/paymentAdviceParser.ts", "utf8");
    // Guard: only dynamic `import("pdfjs-dist")` is allowed. A static
    // `import ... from "pdfjs-dist"` would execute DOMMatrix at SSR.
    const staticImport = /^\s*import\s+[^"']*from\s+["']pdfjs-dist/m.test(src);
    expect(staticImport, "pdfjs-dist must be dynamically imported only").toBe(false);
  });
});
