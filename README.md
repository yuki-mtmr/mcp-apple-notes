# Apple Notes MCP Server

MCP (Model Context Protocol) server for accessing Apple Notes on macOS. This server allows AI assistants like Claude to read, search, and create notes in your Apple Notes app.

## Features

- **List Notes**: Get a list of all notes sorted by modification date
- **Search Notes**: Search notes by title or content
- **Read Note**: Get the full content of a specific note
- **Create Note**: Create new notes in Apple Notes

## Prerequisites

- macOS (required for JXA - JavaScript for Automation)
- Node.js 18 or higher
- Apple Notes app

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Usage

### With Claude Desktop

Add this configuration to your Claude Desktop config file (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

Restart Claude Desktop, and you should see the Apple Notes tools available.

### With MCP Inspector

For testing, you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This will open a web interface where you can test all the tools.

### Available Tools

#### 1. list_notes

List notes sorted by modification date (most recent first).

**Parameters:**
- `limit` (optional, default: 100): Maximum number of notes to return

**Example:**
```json
{
  "limit": 10
}
```

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

## Future Enhancements

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for planned features:

- Remote access via SSE (Server-Sent Events)
- iPhone integration via Shortcuts
- Update and delete operations
- Folder management
- Attachment support

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
