#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { listNotes, searchNotes, readNote, createNote, listFolders, moveNote, batchMoveNotes, createFolder } from './notes-service.js';

/**
 * Apple Notes MCP Server
 * Provides tools to interact with macOS Apple Notes application via JXA
 */

// Create MCP server instance
const server = new Server(
  {
    name: 'mac-notes-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool input schemas
 */
const ListNotesArgsSchema = z.object({
  limit: z.number().optional().default(100).describe('Maximum number of notes to return'),
  includePreview: z.boolean().optional().default(false).describe('Include preview text'),
  folderId: z.string().optional().describe('Filter by specific folder ID'),
});

const SearchNotesArgsSchema = z.object({
  query: z.string().describe('Search query text'),
  limit: z.number().optional().default(50).describe('Maximum number of results to return'),
});

const ReadNoteArgsSchema = z.object({
  nameOrId: z.string().describe('Note ID or name to retrieve'),
});

const CreateNoteArgsSchema = z.object({
  title: z.string().describe('Title of the new note'),
  body: z.string().describe('Body content of the note'),
});

/**
 * Handle list_tools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_notes',
        description: 'List notes from Apple Notes with folder info, sorted by modification date (most recent first). PERFORMANCE TIP: Use folderId to get notes from a specific folder MUCH faster (recommended). Set includePreview=false for speed.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return (default: 100)',
              default: 100,
            },
            includePreview: {
              type: 'boolean',
              description: 'Include first 200 chars of plaintext (default: false for speed). WARNING: Slow for large collections.',
              default: false,
            },
            folderId: {
              type: 'string',
              description: 'Optional: Filter by specific folder ID (MUCH faster than scanning all folders). Get folder IDs from list_folders.',
            },
          },
        },
      },
      {
        name: 'search_notes',
        description: 'Search notes by query string (searches in both title and content)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text (case-insensitive)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 50)',
              default: 50,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_note',
        description: 'Read the full content of a specific note by ID or name',
        inputSchema: {
          type: 'object',
          properties: {
            nameOrId: {
              type: 'string',
              description: 'Note ID or name to retrieve',
            },
          },
          required: ['nameOrId'],
        },
      },
      {
        name: 'create_note',
        description: 'Create a new note in Apple Notes',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new note',
            },
            body: {
              type: 'string',
              description: 'Body content of the note (plain text)',
            },
          },
          required: ['title', 'body'],
        },
      },
      {
        name: 'list_folders',
        description: 'List all folders in Apple Notes (excluding Recently Deleted)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'move_note',
        description: 'Move a single note to a different folder. IMPORTANT: Only use this for moving 1-2 notes. For 3+ notes, you MUST use batch_move_notes instead for performance.',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'ID of the note to move',
            },
            targetFolderId: {
              type: 'string',
              description: 'ID of the target folder',
            },
          },
          required: ['noteId', 'targetFolderId'],
        },
      },
      {
        name: 'batch_move_notes',
        description: 'Move multiple notes to a folder in a single JXA operation. ALWAYS use this when moving 3 or more notes - it is 10-50x faster than calling move_note multiple times. Automatically handles errors for individual notes.',
        inputSchema: {
          type: 'object',
          properties: {
            noteIds: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of note IDs to move (can handle 100+ notes efficiently)',
            },
            targetFolderId: {
              type: 'string',
              description: 'ID of the target folder',
            },
          },
          required: ['noteIds', 'targetFolderId'],
        },
      },
      {
        name: 'create_folder',
        description: 'Create a new folder (optionally inside another folder)',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the new folder',
            },
            parentFolderId: {
              type: 'string',
              description: 'Optional: ID of the parent folder to create inside',
            },
          },
          required: ['name'],
        },
      },
    ],
  };
});

/**
 * Handle call_tool request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_notes': {
        const parsed = ListNotesArgsSchema.parse(args);
        const notes = await listNotes(parsed.limit, parsed.includePreview, parsed.folderId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(notes, null, 2),
            },
          ],
        };
      }

      case 'search_notes': {
        const parsed = SearchNotesArgsSchema.parse(args);
        const notes = await searchNotes(parsed.query, parsed.limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(notes, null, 2),
            },
          ],
        };
      }

      case 'read_note': {
        const parsed = ReadNoteArgsSchema.parse(args);
        const note = await readNote(parsed.nameOrId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(note, null, 2),
            },
          ],
        };
      }

      case 'create_note': {
        const parsed = CreateNoteArgsSchema.parse(args);
        const result = await createNote(parsed.title, parsed.body);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_folders': {
        const folders = await listFolders();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(folders, null, 2),
            },
          ],
        };
      }

      case 'move_note': {
        const MoveNoteArgsSchema = z.object({
          noteId: z.string(),
          targetFolderId: z.string(),
        });
        const parsed = MoveNoteArgsSchema.parse(args);
        const result = await moveNote(parsed.noteId, parsed.targetFolderId);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully moved note "${result.noteName}" to folder "${result.targetFolderName}"`,
            },
          ],
        };
      }

      case 'batch_move_notes': {
        const BatchMoveNotesArgsSchema = z.object({
          noteIds: z.array(z.string()),
          targetFolderId: z.string(),
        });
        const parsed = BatchMoveNotesArgsSchema.parse(args);
        const result = await batchMoveNotes(parsed.noteIds, parsed.targetFolderId);

        let message = `Batch move completed: ${result.moved} notes moved successfully`;
        if (result.failed.length > 0) {
          message += `\n\nFailed to move ${result.failed.length} notes:\n`;
          message += result.failed.map((f: any) => `- ${f.noteId}: ${f.error}`).join('\n');
        }

        return {
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
        };
      }

      case 'create_folder': {
        const CreateFolderArgsSchema = z.object({
          name: z.string(),
          parentFolderId: z.string().optional(),
        });
        const parsed = CreateFolderArgsSchema.parse(args);
        const result = await createFolder(parsed.name, parsed.parentFolderId);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully created folder "${result.name}" (ID: ${result.id})`,
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error: any) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    // Handle application errors
    console.error(`Error executing tool ${name}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to execute ${name}: ${error.message}`
    );
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();

  // Log to stderr (stdout is used for MCP protocol)
  console.error('Apple Notes MCP Server starting...');
  console.error('Server name: mac-notes-mcp');
  console.error('Version: 1.0.0');

  await server.connect(transport);

  console.error('Apple Notes MCP Server running on stdio');
}

// Error handling for uncaught errors
process.on('uncaughtException', (error: any) => {
  // Don't crash on EPIPE errors (broken pipe when client disconnects)
  if (error.code === 'EPIPE' || error.errno === 'EPIPE') {
    console.error('Client disconnected (EPIPE)');
    return;
  }
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on rejection - log and continue
});

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
