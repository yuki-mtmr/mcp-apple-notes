[English](README.md) | [日本語](README.ja.md)

# Apple Notes MCP Server

MCP (Model Context Protocol) server for accessing Apple Notes on macOS. This server allows AI assistants like Claude to read, search, and create notes in your Apple Notes app.

## Features

- **List Notes**: Get a list of all notes sorted by modification date with folder info
- **Search Notes**: Search notes by title or content
- **Read Note**: Get the full content of a specific note
- **Create Note**: Create new notes in Apple Notes
- **List Folders**: List all folders with nested structure
- **Move Note**: Move a note to a different folder
- **Batch Move Notes**: Move multiple notes efficiently in a single operation

## Prerequisites

- macOS (required for JXA - JavaScript for Automation)
- Node.js 18 or higher
- Apple Notes app

## Installation

### Quick Start (Recommended)

Use npx directly in Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "npx",
      "args": ["-y", "mcp-apple-notes"]
    }
  }
}
```

### Global Installation

```bash
npm install -g mcp-apple-notes
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "mcp-apple-notes"
    }
  }
}
```

### From Source

1. Clone the repository:
```bash
git clone https://github.com/yuki-mtmr/mcp-apple-notes.git
cd mcp-apple-notes
```

2. Install and build:
```bash
npm install
npm run build
```

3. Configure Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

Replace `/absolute/path/to/mcp-apple-notes` with the actual path to this project.

## Usage

Restart Claude Desktop, and you should see the Apple Notes tools available.

### With MCP Inspector

For testing, you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This will open a web interface where you can test all the tools.

### Available Tools

#### 1. list_notes

List notes sorted by modification date (most recent first) with folder information.

**Parameters:**
- `limit` (optional, default: 100): Maximum number of notes to return. Use 500+ for bulk categorization operations.
- `includePreview` (optional, default: true): Include first 200 chars of plaintext for quick categorization

**Example:**
```json
{
  "limit": 500,
  "includePreview": true
}
```

**Performance**: Optimized for large collections. Sorting is done efficiently before fetching full metadata.

#### 2. search_notes

Search notes by query string (searches both title and content).

**Parameters:**
- `query` (required): Search query text (case-insensitive)
- `limit` (optional, default: 50): Maximum number of results to return

**Example:**
```json
{
  "query": "meeting notes",
  "limit": 20
}
```

#### 3. read_note

Read the full content of a specific note.

**Parameters:**
- `nameOrId` (required): Note ID or name to retrieve

**Example:**
```json
{
  "nameOrId": "My Important Note"
}
```

#### 4. create_note

Create a new note in Apple Notes.

**Parameters:**
- `title` (required): Title of the new note
- `body` (required): Body content of the note (plain text)

**Example:**
```json
{
  "title": "New Note",
  "body": "This is the content of my new note."
}
```

#### 5. list_folders

List all folders in Apple Notes with nested structure, excluding "Recently Deleted".

**Example:**
```json
{}
```

**Returns:** Array of folders with `id`, `name`, `accountName`, `noteCount`, `path`, and optional `subfolders`.

#### 6. move_note

Move a single note to a different folder.

**Parameters:**
- `noteId` (required): ID of the note to move
- `targetFolderId` (required): ID of the target folder

**Example:**
```json
{
  "noteId": "x-coredata://...../ICNote/p123",
  "targetFolderId": "x-coredata://...../ICFolder/p456"
}
```

**Performance**: Optimized to search notes by folder first, not by iterating all notes.

#### 7. batch_move_notes

Move multiple notes to a folder in a single JXA operation. **Much faster** than calling `move_note` multiple times.

**Parameters:**
- `noteIds` (required): Array of note IDs to move
- `targetFolderId` (required): ID of the target folder

**Example:**
```json
{
  "noteIds": ["x-coredata://.../p123", "x-coredata://.../p124", "x-coredata://.../p125"],
  "targetFolderId": "x-coredata://...../ICFolder/p456"
}
```

**Performance**: Ideal for bulk operations (e.g., categorizing 100+ notes). Single JXA call instead of multiple.

## Permissions

When you first run this server, macOS may prompt you to grant accessibility permissions. You need to:

1. Go to **System Settings** > **Privacy & Security** > **Accessibility**
2. Add your terminal application (Terminal, iTerm2, or VS Code)
3. Enable the toggle for the application

## Development

### Project Structure

```
mcp-apple-notes/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── notes-service.ts   # Apple Notes operations
│   └── jxa-adapter.ts     # JXA execution wrapper
├── dist/                  # Compiled JavaScript (generated)
├── docs/                  # Documentation
│   └── IMPLEMENTATION_PLAN.md
├── package.json
├── tsconfig.json
└── README.md
```

### Build Commands

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Watch mode for development
- `npm start`: Run the compiled server

### Testing

The server uses stdio transport, so it expects JSON-RPC messages on stdin and responds on stdout. Error logs are sent to stderr.

For manual testing:
1. Use MCP Inspector (recommended)
2. Or use Claude Desktop with the configuration above

## Security Notes

- The server only implements **Create** operations for write access
- Update and Delete operations are intentionally not implemented for safety
- HTML content is escaped to prevent injection attacks
- All operations require macOS accessibility permissions

## Troubleshooting

### "operation not permitted" error

Grant accessibility permissions to your terminal/IDE:
- **System Settings** > **Privacy & Security** > **Accessibility**
- Add and enable your terminal application

### JXA execution errors

- Ensure Apple Notes app is installed and can be opened
- Try running a simple JXA command to test: `osascript -l JavaScript -e "Application('Notes').notes().length"`

### Server not responding

- Check that the build succeeded: `ls -la dist/`
- Verify Node.js version: `node --version` (should be 18+)
- Check stderr logs for error messages

### Claude Desktop "process exited with code 1" error

This error is now handled gracefully:
- **EPIPE errors** (broken pipe when client disconnects) no longer crash the server
- Unhandled rejections are logged but don't terminate the process
- Check MCP logs at `~/Library/Logs/Claude/mcp-server-apple-notes.log` for details

### Performance issues with bulk operations

For moving many notes:
- ✅ **Use `batch_move_notes`** instead of calling `move_note` multiple times
- ✅ **Use high limit** (e.g., 500) with `list_notes` to get all notes in one call
- The server includes timeouts (30-120s) to prevent hanging on large operations

## Performance Optimizations

This server includes several optimizations for handling large note collections:

1. **Efficient Sorting**: Notes are sorted by modification date before fetching full metadata
2. **Folder-Based Search**: When moving notes, searches by folder first instead of iterating all notes
3. **Batch Operations**: `batch_move_notes` performs multiple moves in a single JXA call
4. **Timeouts**: Configurable timeouts prevent hanging (30s default, 60-120s for batch operations)
5. **Error Handling**: EPIPE and connection errors are handled gracefully without crashing

## Future Enhancements

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for planned features:

- Remote access via SSE (Server-Sent Events)
- iPhone integration via Shortcuts
- Update and delete operations
- Attachment support

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
