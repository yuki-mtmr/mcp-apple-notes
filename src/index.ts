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
import { listNotes, listNotesExtended, searchNotes, readNote, getNoteForSummary, createNote, listFolders, updateNote, moveNote, deleteNote } from './notes-service.js';

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
const ListNotesFilterSchema = z.object({
  createdAfter: z.string().optional().describe('Filter notes created after this ISO date'),
  createdBefore: z.string().optional().describe('Filter notes created before this ISO date'),
  modifiedAfter: z.string().optional().describe('Filter notes modified after this ISO date'),
  modifiedBefore: z.string().optional().describe('Filter notes modified before this ISO date'),
  titleContains: z.string().optional().describe('Filter notes whose title contains this text (case-insensitive)'),
});

const ListNotesArgsSchema = z.object({
  limit: z.number().optional().default(100).describe('Maximum number of notes to return'),
  includePreview: z.boolean().optional().default(false).describe('Include preview text'),
  folderId: z.string().optional().describe('Filter by specific folder ID'),
  sortBy: z.enum(['modificationDate', 'creationDate', 'title', 'folder']).optional().default('modificationDate').describe('Field to sort by'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort order (asc or desc)'),
  filter: ListNotesFilterSchema.optional().describe('Additional filters'),
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

const UpdateNoteArgsSchema = z.object({
  noteId: z.string().describe('The ID of the note to update'),
  title: z.string().optional().describe('New title for the note'),
  body: z.string().optional().describe('New body content for the note (max 100KB)'),
});

const MoveNoteArgsSchema = z.object({
  noteId: z.string().describe('The ID of the note to move'),
  targetFolderId: z.string().describe('The ID of the target folder'),
});

const GetNoteForSummaryArgsSchema = z.object({
  nameOrId: z.string().describe('The ID or name of the note to summarize'),
});

const DeleteNoteArgsSchema = z.object({
  noteId: z.string().describe('The ID of the note to delete'),
});

/**
 * Handle list_tools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_notes',
        description: 'List notes from Apple Notes with sorting and filtering. PERFORMANCE TIP: Use folderId for speed. Set includePreview=false for better performance.',
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
              description: 'Include first 200 chars of plaintext (default: false)',
              default: false,
            },
            folderId: {
              type: 'string',
              description: 'Filter by specific folder ID (get IDs from list_folders)',
            },
            sortBy: {
              type: 'string',
              enum: ['modificationDate', 'creationDate', 'title', 'folder'],
              description: 'Field to sort by (default: modificationDate)',
              default: 'modificationDate',
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order (default: desc)',
              default: 'desc',
            },
            filter: {
              type: 'object',
              description: 'Additional filters',
              properties: {
                createdAfter: { type: 'string', description: 'Filter notes created after this ISO date' },
                createdBefore: { type: 'string', description: 'Filter notes created before this ISO date' },
                modifiedAfter: { type: 'string', description: 'Filter notes modified after this ISO date' },
                modifiedBefore: { type: 'string', description: 'Filter notes modified before this ISO date' },
                titleContains: { type: 'string', description: 'Filter notes whose title contains this text (case-insensitive)' },
              },
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
        name: 'update_note',
        description: 'Update an existing note in Apple Notes. At least one of title or body must be provided.',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'The ID of the note to update',
            },
            title: {
              type: 'string',
              description: 'New title for the note (optional)',
            },
            body: {
              type: 'string',
              description: 'New body content for the note (optional, max 100KB)',
            },
          },
          required: ['noteId'],
        },
      },
      {
        name: 'move_note',
        description: 'Move a note to a different folder. Cannot move to Recently Deleted folder.',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'The ID of the note to move',
            },
            targetFolderId: {
              type: 'string',
              description: 'The ID of the target folder (get folder IDs from list_folders)',
            },
          },
          required: ['noteId', 'targetFolderId'],
        },
      },
      {
        name: 'get_note_for_summary',
        description: 'Get a note optimized for AI summarization. Returns plaintext with word/character counts and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            nameOrId: {
              type: 'string',
              description: 'The ID or name of the note to get for summarization',
            },
          },
          required: ['nameOrId'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note from Apple Notes. The note will be moved to Recently Deleted.',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'string',
              description: 'The ID of the note to delete',
            },
          },
          required: ['noteId'],
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
        const notes = await listNotesExtended({
          limit: parsed.limit,
          includePreview: parsed.includePreview,
          folderId: parsed.folderId,
          sortBy: parsed.sortBy,
          sortOrder: parsed.sortOrder,
          filter: parsed.filter,
        });

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

      case 'update_note': {
        const parsed = UpdateNoteArgsSchema.parse(args);
        const result = await updateNote(parsed.noteId, {
          title: parsed.title,
          body: parsed.body,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'move_note': {
        const parsed = MoveNoteArgsSchema.parse(args);
        const result = await moveNote(parsed.noteId, parsed.targetFolderId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_note_for_summary': {
        const parsed = GetNoteForSummaryArgsSchema.parse(args);
        const result = await getNoteForSummary(parsed.nameOrId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'delete_note': {
        const parsed = DeleteNoteArgsSchema.parse(args);
        const result = await deleteNote(parsed.noteId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
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
