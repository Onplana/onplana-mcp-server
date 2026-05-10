import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { requireBearerAuth, getAuthContext } from '../src/auth.js'
import type { AuthContext, BearerAuth } from '../src/index.js'

function buildApp(opts: { auth: BearerAuth; requiredScope?: string }) {
  const app = express()
  app.use(express.json())
  app.use('/mcp', requireBearerAuth(opts))
  app.post('/mcp', (req, res) => {
    const ctx = getAuthContext(req)
    res.json({ ok: true, ctx })
  })
  return app
}

describe('requireBearerAuth — header parsing', () => {
  const auth: BearerAuth = async () => ({ userId: 'u_1', scopes: ['MCP_AGENT'] })

  it('accepts Authorization: Bearer <token>', async () => {
    const app = buildApp({ auth })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer abcdef').send({})
    expect(res.status).toBe(200)
    expect(res.body.ctx.userId).toBe('u_1')
  })

  it('accepts case-insensitive scheme', async () => {
    const app = buildApp({ auth })
    const res = await request(app).post('/mcp').set('Authorization', 'bearer abc').send({})
    expect(res.status).toBe(200)
  })

  it('rejects missing header with MCP_REQUIRES_BEARER', async () => {
    const app = buildApp({ auth })
    const res = await request(app).post('/mcp').send({})
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MCP_REQUIRES_BEARER')
  })

  it('rejects malformed scheme with MCP_REQUIRES_BEARER', async () => {
    const app = buildApp({ auth })
    const res = await request(app).post('/mcp').set('Authorization', 'Basic xxx').send({})
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MCP_REQUIRES_BEARER')
  })
})

describe('requireBearerAuth — validator behaviour', () => {
  it('rejects with MCP_INVALID_TOKEN when validator returns null', async () => {
    const app = buildApp({ auth: async () => null })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer xxx').send({})
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MCP_INVALID_TOKEN')
  })

  it('returns AUTH_BACKEND_ERROR when validator throws', async () => {
    const app = buildApp({ auth: async () => { throw new Error('db down') } })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer xxx').send({})
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('AUTH_BACKEND_ERROR')
  })
})

describe('requireBearerAuth — scope check', () => {
  const auth: BearerAuth = async (token) => {
    const scopes = token === 'wild' ? ['WILDCARD']
                 : token === 'mcp'  ? ['MCP_AGENT']
                 :                    ['OTHER_SCOPE']
    return { userId: 'u_1', scopes }
  }

  it('passes when token has the required scope', async () => {
    const app = buildApp({ auth, requiredScope: 'MCP_AGENT' })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer mcp').send({})
    expect(res.status).toBe(200)
  })

  it('passes when token has WILDCARD', async () => {
    const app = buildApp({ auth, requiredScope: 'MCP_AGENT' })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer wild').send({})
    expect(res.status).toBe(200)
  })

  it('rejects with SCOPE_DENIED when token lacks required scope', async () => {
    const app = buildApp({ auth, requiredScope: 'MCP_AGENT' })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer other').send({})
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('SCOPE_DENIED')
  })

  it('skips scope check when no requiredScope provided', async () => {
    const app = buildApp({ auth })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer other').send({})
    expect(res.status).toBe(200)
  })
})

describe('getAuthContext', () => {
  it('throws if mcpAuth was never set', () => {
    const fakeReq = {} as Parameters<typeof getAuthContext>[0]
    expect(() => getAuthContext(fakeReq)).toThrow(/mcpAuth not set/)
  })

  it('returns the attached AuthContext', async () => {
    const ctx: AuthContext = { userId: 'u_test', scopes: ['MCP_AGENT'], orgId: 'o_42' }
    const app = buildApp({ auth: async () => ctx })
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer x').send({})
    expect(res.body.ctx).toEqual(ctx)
  })
})
