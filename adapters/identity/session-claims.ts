export interface SessionIdentityClaims {
  readonly subject?: unknown;
  readonly organization?: unknown;
  readonly displayName?: unknown;
  readonly issuer?: unknown;
  readonly audience?: unknown;
  readonly expiresAt?: unknown;
}

export interface SessionValidationPolicy {
  readonly issuer: string;
  readonly audience: string;
  readonly now: () => string;
}

export interface ValidatedSessionClaims {
  readonly subject: string;
  readonly organization: string;
  readonly displayName: string;
}

export function validateSessionClaims(
  claims: SessionIdentityClaims,
  policy: SessionValidationPolicy,
): ValidatedSessionClaims {
  if (typeof claims.issuer !== "string" || claims.issuer !== policy.issuer) {
    throw new Error("Identity issuer mismatch.");
  }
  if (typeof claims.audience !== "string" || claims.audience !== policy.audience) {
    throw new Error("Identity audience mismatch.");
  }
  if (
    typeof claims.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(claims.expiresAt)) ||
    Date.parse(claims.expiresAt) <= Date.parse(policy.now())
  ) {
    throw new Error("Identity assertion is expired.");
  }
  if (
    typeof claims.subject !== "string" || !claims.subject ||
    typeof claims.organization !== "string" || !claims.organization ||
    typeof claims.displayName !== "string" || !claims.displayName
  ) {
    throw new Error("Identity subject, organization, and display name are required.");
  }
  return {
    subject: claims.subject,
    organization: claims.organization,
    displayName: claims.displayName,
  };
}
