# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run watch

# Run the compiled server
npm start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture Overview

This is an MCP (Model Context Protocol) server that provides AI assistants with access to Apple Notes on macOS through JXA (JavaScript for Automation).

### Three-Layer Architecture

1. **MCP Server Layer** (`src/index.ts`)
   - Handles MCP protocol communication via stdio transport
   - Defines tool schemas using Zod
   - Routes tool calls to the service layer
   - Error handling for EPIPE (broken pipe) errors when clients disconnect
   - All MCP communication happens over stdin/stdout; errors log to stderr

2. **Service Layer** (`src/notes-service.ts`)
   - Implements business logic for Apple Notes operations
   - Defines data schemas (NoteMetadata, NoteDetail, Folder, etc.)
   - Validates inputs/outputs with Zod schemas
   - Coordinates JXA script execution and result validation

3. **JXA Adapter Layer** (`src/jxa-adapter.ts`)
   - Abstraction for executing JXA scripts via `osascript`
   - Handles JSON serialization/deserialization between Node.js and JXA
   - Timeout management (configurable per operation)
   - Script execution through stdin to avoid shell escaping issues

### Key Design Patterns

**Performance Optimizations in JXA Scripts:**
- Batch property fetching instead of iterating objects (see `listNotes` in notes-service.ts:98-141)
- JXA allows fetching arrays of properties (e.g., `noteContainer.id()`, `noteContainer.name()`) which reduces IPC calls from N*M to M
- Folder filtering happens before fetching note properties to minimize data transfer
- Sorting happens in JXA before limiting results to avoid unnecessary data transfer

**Security Measures:**
- HTML content is escaped in `createNote` to prevent injection attacks (notes-service.ts:344-352)
- Only Create operations are implemented; Update/Delete are intentionally excluded for safety
- Input validation with Zod schemas at the MCP layer

**Error Handling:**
- Graceful handling of EPIPE errors (index.ts:265-270) to prevent crashes on client disconnect
- Timeout handling in JXA execution to prevent hanging (jxa-adapter.ts:57-59)
- Validation errors are caught and converted to MCP error codes (index.ts:230-244)

## MCP Server Configuration

When adding this server to Claude Desktop, use:
```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-apple-notes/dist/index.js"]
    }
  }
}
```

## Important Implementation Notes

### JXA Script Structure
All JXA scripts in `notes-service.ts` follow this pattern:
1. Arguments are passed as JSON array and accessed via `args[0]`, `args[1]`, etc.
2. Scripts are wrapped by `jxa-adapter.ts` which handles JSON I/O
3. Return values must be JSON-serializable objects
4. Console output in JXA goes to stderr, not stdout

### Adding New Tools
To add a new MCP tool:
1. Define Zod schema for input arguments in `index.ts`
2. Add tool definition in `ListToolsRequestSchema` handler (index.ts:58)
3. Add case in `CallToolRequestSchema` handler (index.ts:150)
4. Implement service function in `notes-service.ts` with JXA script
5. Export function from `notes-service.ts` and import in `index.ts`

### Timeout Considerations
- Default JXA timeout: 10s (jxa-adapter.ts:18)
- `listNotes`: 15s timeout for large note collections (notes-service.ts:158)
- `searchNotes`: 20s timeout as it searches content (notes-service.ts:235)
- Increase timeouts for operations on large note collections

### Performance Guidelines
- Use `folderId` parameter in `list_notes` to filter by folder (much faster than scanning all folders)
- Set `includePreview: false` for better performance (plaintext extraction is expensive)
- Batch operations are always faster than multiple individual calls
- Skip "Recently Deleted" folder in all operations (notes-service.ts:92, 405)

## macOS Permissions

This server requires Accessibility permissions for the terminal/IDE running it:
- **System Settings** > **Privacy & Security** > **Accessibility**
- Add and enable Terminal, iTerm2, or VS Code
