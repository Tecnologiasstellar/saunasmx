/**
 * Domain errors carry a stable machine code and a message that is safe to show
 * a user: no secrets, no PII, no internal identifiers (docs/05-api-contracts.md).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const ERROR_CODES = {
  LEAD_NOT_FOUND: 'LEAD_NOT_FOUND',
  LEAD_NOT_ROUTABLE: 'LEAD_NOT_ROUTABLE',
  CONSENT_MISSING: 'CONSENT_MISSING',
  PROVIDER_NOT_ELIGIBLE: 'PROVIDER_NOT_ELIGIBLE',
  DISTRIBUTION_LIMIT_EXCEEDED: 'DISTRIBUTION_LIMIT_EXCEEDED',
  LEAD_GRADE_NOT_ASSIGNABLE: 'LEAD_GRADE_NOT_ASSIGNABLE',
  ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
  ASSIGNMENT_ALREADY_RESOLVED: 'ASSIGNMENT_ALREADY_RESOLVED',
  ASSIGNMENT_EXPIRED: 'ASSIGNMENT_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
} as const;
