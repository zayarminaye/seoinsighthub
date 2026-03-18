/**
 * Structured security event logger.
 * Logs security-relevant events with consistent format for monitoring.
 *
 * In production, pipe these to a log aggregation service
 * (e.g., Datadog, Sentry, CloudWatch).
 */

export type SecurityEventType =
  | 'RATE_LIMIT_HIT'
  | 'AUTH_FAILURE'
  | 'INVALID_INPUT'
  | 'FORBIDDEN_ACCESS'
  | 'PLAN_LIMIT_REACHED'
  | 'SUSPICIOUS_REQUEST'
  | 'EXPORT_DENIED';

interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  ip?: string;
  path?: string;
  details?: string;
}

export function logSecurityEvent(event: SecurityEvent): void {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level: 'SECURITY',
    ...event,
  };

  // Use structured JSON logging for easy parsing by log aggregators
  console.warn(`[SECURITY] ${JSON.stringify(entry)}`);
}
