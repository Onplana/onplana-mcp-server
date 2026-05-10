# In-memory MCP server example

A runnable, dependency-light MCP server that exposes three trivial
tools (`echo`, `time_now`, `add`). Use it to verify the
`onplana-mcp-server` template works end-to-end before wiring in
your real dispatcher and auth.

## Run

```bash
npm install
npm run start
```

Server listens on `http://localhost:3000/api/mcp/v1`.

## Test from a terminal

```bash
# List tools
curl -X POST http://localhost:3000/api/mcp/v1 \
  -H "Authorization: Bearer demo-token-abc123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call the echo tool
curl -X POST http://localhost:3000/api/mcp/v1 \
  -H "Authorization: Bearer demo-token-abc123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hi there"}}}'
```

## Test from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(or the equivalent path on your OS):

```json
{
  "mcpServers": {
    "in-memory-demo": {
      "url": "http://localhost:3000/api/mcp/v1",
      "headers": {
        "Authorization": "Bearer demo-token-abc123"
      }
    }
  }
}
```

Restart Claude Desktop. Ask Claude *"add 13 and 29 using the demo
server"* — it'll call the `add` tool and report 42.

## What to study

The whole thing is ~120 lines in `server.ts`. The interesting parts:

- The `Dispatcher` implementation — three small `async` methods.
- The `auth` validator — anything starting with `demo-` resolves to a
  fixed user. Real deployments call into your token store.
- The Express wiring — three `app.use` / `app.post` calls connect
  the auth middleware to the MCP transport handler.

Compare this to Onplana's production deployment (closed-source, but
the template surface is identical) to see what the same template
looks like under load with plan gates, idempotency, audit, and 21
real tools layered on. The transport itself doesn't change.

## License

[MIT](../../LICENSE)
