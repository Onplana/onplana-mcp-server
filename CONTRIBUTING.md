# Contributing

Thanks for your interest. This repo ships two npm packages
(`onplana-mcp-server` and `onplana-mcp-client`) plus a runnable
in-memory example. Contributions welcome.

## Before you open an issue

Search the existing issues first — if you find a match, drop a 👍
on the original instead of opening a duplicate. Adds signal without
fragmenting discussion.

For **security issues**, do NOT open a public issue. See
[SECURITY.md](./SECURITY.md) for the disclosure path.

## Before you open a PR

Three rules. They keep the maintenance burden low and the project
useful for downstream consumers:

### 1. Keep the transport platform-agnostic

`packages/server-template/` is meant to be the generic transport
layer for ANY MCP server, not Onplana-specific. If your change adds
Onplana-specific business logic (a tool, a plan tier, a particular
auth provider), it belongs in your own dispatcher implementation,
not in this package.

The `Dispatcher` interface is the seam. If you're tempted to widen
that interface to expose more of your platform's specifics, the
right move is usually to keep the interface narrow and put the
platform-specific work behind your dispatcher's implementation
instead.

### 2. Tests required for behaviour changes

Every PR that changes runtime behaviour needs a matching test.
The bar is what you'd want to see if you were reviewing:

- A failing test BEFORE your change that passes AFTER
- Or a new test that exercises a previously-untested code path
- Test files live in `packages/<pkg>/tests/` and run via vitest

Pure documentation, type-only, or tooling changes don't need new
tests.

### 3. Don't break the dispatcher contract

The `Dispatcher`, `BearerAuth`, `AuthContext`, `DispatchedTool`,
`ToolCallResult` types are the public contract. Breaking changes
there require a major version bump and an upgrade note in
[CHANGELOG.md](./CHANGELOG.md). When in doubt, prefer adding a new
optional field over changing an existing one.

## Local setup

```bash
git clone https://github.com/Onplana/onplana-mcp-server.git
cd onplana-mcp-server
npm install
npm run typecheck --workspaces
npm run test --workspaces
```

The in-memory example is the fastest way to verify your changes
end-to-end:

```bash
cd examples/in-memory
npm install
npm run start
# Hit http://localhost:3000/api/mcp/v1 with curl or the MCP Inspector.
```

## Commit conventions

We loosely follow [Conventional Commits](https://www.conventionalcommits.org).
Common prefixes:

- `feat:` — new functionality
- `fix:` — bug fix
- `chore:` — tooling, deps, build
- `docs:` — README / inline doc-comments only
- `refactor:` — internal cleanup with no behavior change
- `test:` — test additions / improvements

Please write clear commit messages. "WIP" or "fix stuff" PRs get
asked to rebase before review.

## Pull requests

Open PRs against `main`. The CI workflow runs typecheck + tests on
Node 20 and 22; PRs that don't pass CI won't be reviewed until they
do.

Small, focused PRs review faster than large ones. If you're
unsure whether a change is in scope, open a draft PR or an issue
first to discuss.

## Releases (maintainers only)

Versioning is independent for the two packages:

- `onplana-mcp-server` — tag as `v<MAJOR>.<MINOR>.<PATCH>`
- `onplana-mcp-client` — tag as `client-v<MAJOR>.<MINOR>.<PATCH>`

The `.github/workflows/publish.yml` action handles npm publish on
tag push. Required secret: `NPM_TOKEN` (Automation type).

Update [CHANGELOG.md](./CHANGELOG.md) before tagging — the GitHub
Release workflow uses it for the release notes.

## Code of conduct

Be respectful. Full text in
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Maintainers reserve the
right to close PRs / issues from anyone violating it.

## Questions

For usage questions ("how do I plug in my dispatcher?"), open a
Discussion if the repo has them enabled, or a regular issue with
the `question` label otherwise.

For changes you'd like to discuss before writing code, open an
issue describing the use case + your proposed approach. Saves
both of us time vs. a rejected PR.

---

Thanks again. The MCP ecosystem is small + the patterns matter; a
careful contribution to a foundational library has outsized
leverage.
