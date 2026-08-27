import assert from "node:assert/strict";
import test from "node:test";

import { parseStagingUpgradeAuthorization } from
  "../adapters/config/staging-upgrade-authorization.ts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const releaseId = (version: string, value: string) => `${version}-${value.repeat(12)}`;

function authorization() {
  return {
    schemaVersion: 1,
    product: "company-os",
    environment: "STAGING",
    operation: {
      id: "upgrade-rc4-to-rc5",
      siteId: "company-os-hong-kong",
      accountableOperatorReference: "human:release-owner",
      expiresAt: "2026-08-28T00:00:00.000Z",
    },
    active: {
      releaseId: releaseId("0.1.0-rc.4", "a"),
      sourceRevision: "a".repeat(40),
      releaseManifestDigest: digest("1"),
      startupStateDigest: digest("2"),
    },
    candidate: {
      releaseId: releaseId("0.1.0-rc.5", "b"),
      sourceRevision: "b".repeat(40),
      releaseManifestDigest: digest("3"),
      siteContractDigest: digest("4"),
      runtimeContractDigest: digest("6"),
    },
    cutover: {
      planId: "cutover-0123456789abcdef01234567",
      planDigest: digest("5"),
    },
    authorization: {
      preparation: "change:upgrade-preparation-01",
      trafficCutover: "change:traffic-cutover-01",
      rollback: "change:upgrade-rollback-01",
    },
  };
}

test("upgrade authorization binds one site, two releases, one plan, and three distinct authorities", () => {
  const result = parseStagingUpgradeAuthorization(authorization());
  assert.equal(result.operation.siteId, "company-os-hong-kong");
  assert.equal(result.active.releaseId, releaseId("0.1.0-rc.4", "a"));
  assert.equal(result.candidate.releaseId, releaseId("0.1.0-rc.5", "b"));
  assert.equal(result.cutover.planId, "cutover-0123456789abcdef01234567");
  assert.notEqual(result.authorization.preparation, result.authorization.trafficCutover);
  assert.notEqual(result.authorization.preparation, result.authorization.rollback);
  assert.doesNotMatch(JSON.stringify(result), /password|token|secret|database.?url|issuer/i);
});

test("upgrade authorization rejects unknown fields, reused authority, and identical releases", () => {
  assert.throws(() => parseStagingUpgradeAuthorization({ ...authorization(), extra: true }),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
  const reused = authorization();
  reused.authorization.trafficCutover = reused.authorization.preparation;
  assert.throws(() => parseStagingUpgradeAuthorization(reused),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
  const same = authorization();
  same.candidate.releaseId = same.active.releaseId;
  assert.throws(() => parseStagingUpgradeAuthorization(same),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
});

test("upgrade authorization rejects credentials, customer coordinates, and malformed expiry", () => {
  const credential = authorization() as Record<string, unknown>;
  credential["clientSecret"] = "forbidden";
  assert.throws(() => parseStagingUpgradeAuthorization(credential),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
  const coordinate = authorization();
  coordinate.operation.accountableOperatorReference = "https://customer.example/operator";
  assert.throws(() => parseStagingUpgradeAuthorization(coordinate),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
  const invalidTime = authorization();
  invalidTime.operation.expiresAt = "tomorrow";
  assert.throws(() => parseStagingUpgradeAuthorization(invalidTime),
    /STAGING_UPGRADE_AUTHORIZATION_INVALID/);
});
