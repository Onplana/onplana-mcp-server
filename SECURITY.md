# Security policy

## Reporting a vulnerability

If you've found a security issue in `onplana-mcp-server`,
`onplana-mcp-client`, or the publicly hosted Onplana MCP endpoint
(`https://api.onplana.com/api/mcp/v1`), **do not open a public
GitHub issue.**

Email **security@onplana.com** with:

- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept code or curl commands are
  ideal)
- The package name + version (or commit hash) you tested against
- Whether the issue affects the open-source packages, the public
  Onplana endpoint, or both
- Your name + affiliation if you'd like credit

We commit to:

- **Acknowledging** your report within 2 business days
- **Triaging** within 5 business days, with our preliminary
  assessment of severity
- **Resolving** critical issues within 14 days; high-severity
  within 30 days; medium / low on a published cadence
- **Crediting** you in the resulting CVE or release notes if
  you'd like (we can keep your report anonymous if preferred)

We follow a **coordinated disclosure** model. Please give us a
reasonable window to ship a fix before public disclosure. Our
default request is 90 days from acknowledgement; we'll work with
you on faster timelines for actively-exploited issues.

## Scope

In scope for these packages:

- Vulnerabilities in `packages/server-template/` (the Streamable
  HTTP transport, Bearer auth middleware, prompt-injection
  containment helpers, dispatcher contract)
- Vulnerabilities in `packages/client/` (the typed Onplana MCP
  client SDK)
- Build / supply-chain issues in our published npm packages
- Examples (`examples/in-memory/`) — exploitation that an end
  user could realistically encounter when following our
  documentation

Out of scope here (report directly to security@onplana.com,
they'll route appropriately):

- Vulnerabilities in the **closed-source Onplana platform** that
  hosts `https://api.onplana.com` — different threat surface,
  different response ownership
- Vulnerabilities in **upstream dependencies**
  (`@modelcontextprotocol/sdk`, `express`, etc.) — please report
  to those projects directly; we'll bump our pinned versions
  promptly once their fixes ship
- Theoretical risks without a working PoC
- Social engineering against Onplana staff or community members

## What counts as a vulnerability

High-priority for these packages specifically:

- **Prompt-injection escapes** — strings that pass through
  `wrapUserContent()` but escape the `<onplana_user_content>`
  airlock when an LLM reads the result. New encoding tricks,
  Unicode bypasses, and tag-injection variants we haven't covered
  are exactly the kind of report we want.
- **Auth-bypass paths** — ways to invoke `tools/call` without a
  valid Bearer token, or to escape `requireScope` checks with a
  PAT lacking the configured scope.
- **Stateless-mode session leaks** — any way for one MCP request
  to read or influence another's context.
- **DoS via the transport** — payload shapes that cause
  unbounded memory or CPU use in the transport layer.
- **Supply-chain integrity** — issues with our npm-publish
  workflow (NPM_TOKEN scope, provenance signing, etc.).

Lower-priority but still in scope:

- Information disclosure in error responses
- Timing attacks on the auth path
- Documentation that suggests insecure usage patterns

## Hall of fame

We publish a list of researchers who've reported valid issues
(with permission) in our release notes. We don't currently run
a paid bounty program for the open-source packages; the closed
Onplana platform has a separate disclosure path you can ask
about when reporting.

## PGP

If you'd like to encrypt your report, request our current PGP
public key by email; we'll respond with the key fingerprint
out-of-band so you can verify it independently.

---

Thanks for taking the time to report responsibly. The MCP
ecosystem is young; security work here helps every consumer of
the protocol, not just Onplana.
