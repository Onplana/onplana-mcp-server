/**
 * Bearer-token authentication pattern for the MCP transport.
 *
 * Why a pattern (not a fixed implementation): every platform stores
 * tokens differently — bcrypt-hashed in Postgres, Redis with a TTL,
 * an external IdP, JWT verification, etc. The transport doesn't care
 * HOW the token resolves; it only cares that it gets back an
 * `AuthContext` (or null for "reject this request").
 *
 * The `BearerAuth` type below is what your platform plugs in. The
 * `requireBearerAuth(...)` middleware below is the Express glue that
 * extracts the token, calls your validator, and either populates
 * `req.mcpAuth` or rejects with a clean error code.
 *
 * Why not OAuth at MVP: OAuth device flow is the better long-term UX
 * (users click "Connect" in their MCP client, get redirected to your
 * platform for consent, return with a token), but it's two weeks of
 * work to implement properly. Bearer-token-from-paste is the pattern
 * Onplana ships at MVP and what the Anthropic-published MCP examples
 * use. If you want OAuth, swap in your OAuth library and have it
 * resolve the access token to an AuthContext the same way.
 *
 * Security: tokens are typically high-entropy random strings shown to
 * the user once at creation, hashed at rest. Don't log raw tokens; log
 * the hashed prefix or token id. The `BearerAuth` validator should
 * timing-safe-compare to prevent timing attacks on the hash lookup.
 */

import type { Request, Response, NextFunction } from 'express'
import type { AuthContext } from './dispatcher.js'

/**
 * Validator function: take a raw Bearer token string, return the
 * resolved auth context, or null if the token is invalid / revoked /
 * expired. The transport calls this on every request.
 *
 * Implementation tips:
 *
 *   - Look up by tokenPrefix (first N chars) and bcrypt-compare the
 *     full hash. Don't scan every token in the DB on every request.
 *   - Cache the result for ~1 minute (in-process Map keyed by token
 *     hash). Tokens revoked mid-cache live up to that long; for
 *     hard revocations clear the cache.
 *   - Throw only for transport-level errors (DB unreachable). Return
 *     null for "this token isn't valid" so the transport returns the
 *     standard 401 instead of 500.
 */
export type BearerAuth = (rawToken: string) => Promise<AuthContext | null>

export interface RequireBearerAuthOptions {
  /** Validator function — see BearerAuth doc. */
  auth: BearerAuth
  /**
   * Optional scope check. If set, the resolved AuthContext.scopes
   * must include this string (or 'WILDCARD' if your platform uses a
   * master-key convention). Caller-supplied so callers with multiple
   * scope conventions can pass whatever check makes sense.
   *
   * If you don't pass this, the middleware accepts any successfully-
   * resolved token regardless of scope — typical when the consuming
   * route is its own scope domain.
   */
  requiredScope?: string
}

/**
 * Express middleware that extracts a Bearer token from the
 * Authorization header, calls the supplied validator, and attaches
 * the resolved context to `(req as any).mcpAuth` for downstream
 * handlers.
 *
 * Rejection codes:
 *   401 MCP_REQUIRES_BEARER  — no Authorization header / wrong shape
 *   401 MCP_INVALID_TOKEN    — header present but validator returned null
 *   403 SCOPE_DENIED         — token valid but lacks `requiredScope`
 *
 * Usage:
 *
 *     app.use('/api/mcp/v1', requireBearerAuth({
 *       auth: async (token) => myDB.lookupToken(token),
 *       requiredScope: 'MCP_AGENT',
 *     }))
 */
export function requireBearerAuth(opts: RequireBearerAuthOptions) {
  const { auth, requiredScope } = opts
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? ''
    const m = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (!m) {
      res.status(401).json({
        error: 'Missing or malformed Authorization header. Expected "Authorization: Bearer <token>".',
        code:  'MCP_REQUIRES_BEARER',
      })
      return
    }

    const rawToken = m[1].trim()

    let ctx: AuthContext | null = null
    try {
      ctx = await auth(rawToken)
    } catch (err) {
      // Transport-level error in the auth layer. Surface 500 with a
      // generic message; let the platform decide how to log details.
      // eslint-disable-next-line no-console
      console.error('[mcp-server-template] auth validator threw:', (err as Error).message)
      res.status(500).json({
        error: 'Authentication subsystem error. Try again.',
        code:  'AUTH_BACKEND_ERROR',
      })
      return
    }

    if (!ctx) {
      res.status(401).json({
        error: 'Invalid, revoked, or expired token.',
        code:  'MCP_INVALID_TOKEN',
      })
      return
    }

    if (requiredScope) {
      const scopes = ctx.scopes ?? []
      // 'WILDCARD' is a common platform convention for master-key
      // tokens that bypass per-scope checks. We honour it here by
      // default; if your platform uses different semantics, omit
      // requiredScope and do the check yourself in your dispatcher.
      const has = scopes.includes(requiredScope) || scopes.includes('WILDCARD')
      if (!has) {
        res.status(403).json({
          error: `Token scope insufficient. Required: ${requiredScope}`,
          code:  'SCOPE_DENIED',
        })
        return
      }
    }

    // Attach the resolved context for downstream handlers.
    ;(req as Request & { mcpAuth?: AuthContext }).mcpAuth = ctx
    next()
  }
}

/**
 * Helper for downstream handlers that need the resolved auth context.
 * Throws if `requireBearerAuth` hasn't run upstream — that's a wiring
 * bug, not a runtime concern.
 */
export function getAuthContext(req: Request): AuthContext {
  const ctx = (req as Request & { mcpAuth?: AuthContext }).mcpAuth
  if (!ctx) {
    throw new Error('mcpAuth not set on request — did you forget to mount requireBearerAuth?')
  }
  return ctx
}
