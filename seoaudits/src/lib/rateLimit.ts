/**
 * Redis-backed sliding-window rate limiter.
 * Uses sorted sets (ZRANGEBYSCORE) for O(log N) window checks.
 * Works across multiple server instances.
 */

import { redis } from './redis';

interface RateLimitConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

const KEY_PREFIX = 'rl:';

/**
 * Check if a request should be rate-limited using Redis sorted sets.
 * Each request is stored as a member with its timestamp as the score.
 * Returns { success: true } if allowed, { success: false } if blocked.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `${KEY_PREFIX}${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Atomic pipeline: remove old entries, count current, add new if allowed
    const pipeline = redis.pipeline();

    // Remove entries outside the current window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count entries in current window
    pipeline.zcard(key);

    const results = await pipeline.exec();

    // results[1] = [err, count] from ZCARD
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= config.maxRequests) {
      // Get the oldest timestamp in the window to calculate reset time
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldest.length >= 2 ? Number(oldest[1]) : now;
      return {
        success: false,
        remaining: 0,
        resetMs: Math.max(0, oldestTimestamp + config.windowMs - now),
      };
    }

    // Add the current request with a unique member (timestamp + random suffix)
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    await redis
      .pipeline()
      .zadd(key, now, member)
      .pexpire(key, config.windowMs)
      .exec();

    return {
      success: true,
      remaining: config.maxRequests - currentCount - 1,
      resetMs: config.windowMs,
    };
  } catch (err) {
    // If Redis is down, fail open (allow the request) but log the error
    console.error('Rate limiter Redis error:', err);
    return {
      success: true,
      remaining: config.maxRequests,
      resetMs: config.windowMs,
    };
  }
}

// ─── Pre-configured rate limiters ────────────────────────────────

/** API: 60 requests per minute per user */
export const API_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 };

/** Audit creation: 10 per hour per user */
export const AUDIT_CREATE_RATE_LIMIT: RateLimitConfig = { maxRequests: 10, windowMs: 60 * 60_000 };

/** Export: 20 per hour per user */
export const EXPORT_RATE_LIMIT: RateLimitConfig = { maxRequests: 20, windowMs: 60 * 60_000 };

/** Auth: 20 per minute per IP (brute-force protection) */
export const AUTH_RATE_LIMIT: RateLimitConfig = { maxRequests: 20, windowMs: 60_000 };
