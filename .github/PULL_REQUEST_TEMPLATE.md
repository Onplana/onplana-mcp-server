<!--
Thanks for the contribution. Quick checklist before submitting —
see CONTRIBUTING.md for the full version.
-->

## What this PR does

<!-- One- or two-sentence summary. Reference the linked issue if any. -->

Fixes #

## Type of change

<!-- Check whichever apply. Multiple OK. -->

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Tooling / CI / build
- [ ] Breaking change (major version bump required)

## Affected package(s)

- [ ] `onplana-mcp-server` (server template)
- [ ] `onplana-mcp-client` (client SDK)
- [ ] `examples/in-memory`
- [ ] Workspace root / CI / docs only

## Test coverage

<!--
Per CONTRIBUTING.md rule #2, behavior changes need a matching test.
Doc/type-only/tooling PRs are exempt.
-->

- [ ] I added a failing test BEFORE this change that passes AFTER.
- [ ] I added a new test that exercises a previously-untested code path.
- [ ] No behavior change — tests N/A.

## Checklist

- [ ] `npm run typecheck --workspaces` passes locally
- [ ] `npm run test --workspaces` passes locally (server template + client)
- [ ] `npm run build --workspaces` produces clean dist artifacts
- [ ] If this is a security-relevant change, I've thought about whether
      to disclose it via SECURITY.md instead of a public PR
- [ ] If this changes the public exports (Dispatcher / BearerAuth /
      handler factories), I've documented the change in CHANGELOG.md
      and noted whether it's a breaking change

## Notes for the reviewer

<!-- Anything else the reviewer should know — design tradeoffs you
     considered, edge cases the test doesn't cover, follow-up issues
     this enables, etc. -->
