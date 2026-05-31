import { describe, it, expect } from "vitest";
import { allowedRolesForPath } from "./routeAccess";

/**
 * The role matrix the UI sidebar and ProtectedRoute share. If the rules in
 * routeAccess.ts change, these assertions are the canonical source of truth
 * for who can deep-link into each /claims surface.
 */
describe("allowedRolesForPath — /claims gates", () => {
  it("allows all org members on the main claims worklist", () => {
    expect(allowedRolesForPath("/claims")).toEqual(["owner", "admin", "member"]);
    // Trailing-path match (e.g. /claims/CLM-123) should fall through to the
    // generic /claims prefix when no more-specific rule matches.
    expect(allowedRolesForPath("/claims/CLM-123")).toEqual(["owner", "admin", "member"]);
  });

  it("allows owner/admin/member on the priority worklist", () => {
    expect(allowedRolesForPath("/claims/priority")).toEqual(["owner", "admin", "member"]);
    expect(allowedRolesForPath("/claims/priority/anything")).toEqual([
      "owner",
      "admin",
      "member",
    ]);
  });

  it("allows owner/admin/member on denials & appeals", () => {
    expect(allowedRolesForPath("/claims/denials")).toEqual(["owner", "admin", "member"]);
  });

  it("allows owner/admin/member on the discrepancy tracker", () => {
    expect(allowedRolesForPath("/claims/discrepancy")).toEqual([
      "owner",
      "admin",
      "member",
    ]);
  });

  it("restricts data quality to owner/admin", () => {
    expect(allowedRolesForPath("/claims/data-quality")).toEqual(["owner", "admin"]);
  });

  it("restricts claim import to owner/admin", () => {
    expect(allowedRolesForPath("/claims/import")).toEqual(["owner", "admin"]);
  });

  it("restricts the TDS report to owner/admin", () => {
    expect(allowedRolesForPath("/claims/tds")).toEqual(["owner", "admin"]);
  });

  it("does not leak the /claims prefix to lookalike paths", () => {
    // /claimsX must not match the /claims prefix — must return undefined
    // so unrelated routes don't inherit /claims role gating.
    expect(allowedRolesForPath("/claimsExport")).toBeUndefined();
    expect(allowedRolesForPath("/dashboard")).toBeUndefined();
  });

  it("returns undefined for paths without a configured rule", () => {
    expect(allowedRolesForPath("/")).toBeUndefined();
    expect(allowedRolesForPath("/ai-center")).toBeUndefined();
  });
});
