import { z } from 'zod';
import { runJxa } from './jxa-adapter.js';

/**
 * Zod schemas for Apple Notes data structures
 */

export const NoteMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  modificationDate: z.string(),
  creationDate: z.string(),
  folderName: z.string().optional(),
  folderId: z.string().optional(),
  preview: z.string().optional(), // First 200 chars of plaintext
});

export const ListNotesOptionsSchema = z.object({
  limit: z.number().optional().default(100),
  includePreview: z.boolean().optional().default(false),
  folderId: z.string().optional(), // Filter by specific folder
});

export const NoteDetailSchema = NoteMetadataSchema.extend({
  body: z.string(), // HTML content
  plaintext: z.string(),
});

export const CreateNoteResultSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountName: z.string(),
  noteCount: z.number(),
});

export const UpdateNoteResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  modificationDate: z.string(),
  success: z.boolean(),
});

export const UpdateNoteOptionsSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
});

export const MoveNoteResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  previousFolderId: z.string(),
  newFolderId: z.string(),
  newFolderName: z.string(),
  success: z.boolean(),
});

export const DeleteNoteResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  success: z.boolean(),
});

export const ListNotesFilterSchema = z.object({
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  modifiedAfter: z.string().optional(),
  modifiedBefore: z.string().optional(),
  titleContains: z.string().optional(),
});

export const ListNotesExtendedOptionsSchema = z.object({
  limit: z.number().optional().default(100),
  includePreview: z.boolean().optional().default(false),
  folderId: z.string().optional(),
  sortBy: z.enum(['modificationDate', 'creationDate', 'title', 'folder']).optional().default('modificationDate'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  filter: ListNotesFilterSchema.optional(),
});

export const NoteForSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  plaintext: z.string(),
  creationDate: z.string(),
  modificationDate: z.string(),
  folderName: z.string(),
  wordCount: z.number(),
  characterCount: z.number(),
});

export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;
export type NoteDetail = z.infer<typeof NoteDetailSchema>;
export type CreateNoteResult = z.infer<typeof CreateNoteResultSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type UpdateNoteResult = z.infer<typeof UpdateNoteResultSchema>;
export type UpdateNoteOptions = z.infer<typeof UpdateNoteOptionsSchema>;
export type MoveNoteResult = z.infer<typeof MoveNoteResultSchema>;
export type DeleteNoteResult = z.infer<typeof DeleteNoteResultSchema>;
export type ListNotesFilter = z.infer<typeof ListNotesFilterSchema>;
export type ListNotesExtendedOptions = z.infer<typeof ListNotesExtendedOptionsSchema>;
export type ListNotesExtendedInput = z.input<typeof ListNotesExtendedOptionsSchema>;
export type NoteForSummary = z.infer<typeof NoteForSummarySchema>;

// Maximum body size: 100KB
const MAX_BODY_SIZE = 100 * 1024;

/**
 * Escape HTML entities to prevent XSS
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * List notes from Apple Notes app with enhanced metadata
 * @param limit - Maximum number of notes to return (default: 10)
 * @param includePreview - Whether to include preview text (default: false)
 * @param folderId - Optional folder ID to filter notes
 * @returns Array of note metadata sorted by modification date (descending)
 */
/**
 * List notes from Apple Notes app with enhanced metadata
 * @param limit - Maximum number of notes to return (default: 10)
 * @param includePreview - Whether to include preview text (default: false)
 * @param folderId - Optional folder ID to filter notes
 * @returns Array of note metadata sorted by modification date (descending)
 */
export async function listNotes(limit: number = 10, includePreview: boolean = false, folderId?: string): Promise<NoteMetadata[]> {
  const script = `
    const notesApp = Application("Notes");
    const limitCount = args[0];
    const includePreview = args[1];
    const targetFolderId = args[2]; // Optional filter

    // Helper to safely get date string
    function safelyGetDateString(dateObj) {
      if (!dateObj) return new Date().toISOString();
      try {
        return dateObj.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    }

    const allNotesData = [];
    const accounts = notesApp.accounts();

    for (let a = 0; a < accounts.length; a++) {
      const account = accounts[a];
      // Batch fetch folders for the account if possible?
      // Iterating folders is reasonably fast (~1s for 30 folders), so we do that to ensure we can filter "Recently Deleted"
      const folders = account.folders();

      for (let f = 0; f < folders.length; f++) {
        const folder = folders[f];
        const fName = folder.name();
        const fId = folder.id();

        // Skip Recently Deleted
        if (fName === "Recently Deleted") continue;

        // Micro-optimization: Check ID before getting notes if filtering
        if (targetFolderId && fId !== targetFolderId) continue;

        // --- BATCH FETCH START ---
        // Instead of iterating notes, we fetch arrays of properties
        // This reduces IPC calls from N*M to M (where M is # of properties)

        const noteContainer = folder.notes;
        // Check count first to avoid empty array fetches if not needed (optional, but good for empty folders)
        if (noteContainer.length === 0) continue;

        // Fetch parallel arrays
        const ids = noteContainer.id();
        const names = noteContainer.name();
        const modDates = noteContainer.modificationDate();
        const creationDates = noteContainer.creationDate();

        // Conditional heavyweight fetch
        let previews = [];
        if (includePreview) {
          try {
            previews = noteContainer.plaintext();
          } catch(e) {
            // Fallback or empty if failed
            // If batch fails (e.g. one note is corrupt), we might lose all previews.
            // But usually it works. If it fails, we supply empty strings.
             previews = new Array(ids.length).fill("");
          }
        }

        // Map to objects
        // Note: ids, names, etc. are arrays. access by index [i]
        for (let i = 0; i < ids.length; i++) {
          const modDateVal = modDates[i];
          const createDateVal = creationDates[i];

          allNotesData.push({
            id: ids[i],
            name: names[i],
            modificationDate: safelyGetDateString(modDateVal),
            creationDate: safelyGetDateString(createDateVal),
            modDate: modDateVal ? modDateVal.getTime() : 0, // For sorting
            folderName: fName,
            folderId: fId,
            preview: includePreview ? (previews[i] ? previews[i].substring(0, 200) : "") : undefined
          });
        }
        // --- BATCH FETCH END ---
      }
    }

    // Sort by modification date descending
    allNotesData.sort((a, b) => b.modDate - a.modDate);

    // Slice to limit
    const result = allNotesData.slice(0, limitCount);

    // Remove temporary field
    result.forEach(n => delete n.modDate);

    return result;
  `;

  try {
    const result = await runJxa<NoteMetadata[]>(script, [limit, includePreview, folderId], 15000);

    // Validate the result with Zod
    const validated = z.array(NoteMetadataSchema).parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to list notes: ${error.message}`);
  }
}

/**
 * List notes with extended sorting and filtering options
 * @param options - Extended options including sortBy, sortOrder, and filter
 * @returns Array of note metadata sorted and filtered as specified
 */
export async function listNotesExtended(options: ListNotesExtendedInput = {}): Promise<NoteMetadata[]> {
  const {
    limit = 100,
    includePreview = false,
    folderId,
    sortBy = 'modificationDate',
    sortOrder = 'desc',
    filter,
  } = options;

  // Fetch all notes (we'll sort and filter in JS for flexibility)
  const allNotes = await listNotes(10000, includePreview, folderId);

  // Apply filters
  let filteredNotes = allNotes;

  if (filter) {
    filteredNotes = allNotes.filter(note => {
      // Filter by createdAfter
      if (filter.createdAfter) {
        const createdDate = new Date(note.creationDate);
        const afterDate = new Date(filter.createdAfter);
        if (createdDate < afterDate) return false;
      }

      // Filter by createdBefore
      if (filter.createdBefore) {
        const createdDate = new Date(note.creationDate);
        const beforeDate = new Date(filter.createdBefore);
        if (createdDate >= beforeDate) return false;
      }

      // Filter by modifiedAfter
      if (filter.modifiedAfter) {
        const modifiedDate = new Date(note.modificationDate);
        const afterDate = new Date(filter.modifiedAfter);
        if (modifiedDate < afterDate) return false;
      }

      // Filter by modifiedBefore
      if (filter.modifiedBefore) {
        const modifiedDate = new Date(note.modificationDate);
        const beforeDate = new Date(filter.modifiedBefore);
        if (modifiedDate >= beforeDate) return false;
      }

      // Filter by titleContains (case-insensitive)
      if (filter.titleContains) {
        const titleLower = note.name.toLowerCase();
        const searchLower = filter.titleContains.toLowerCase();
        if (!titleLower.includes(searchLower)) return false;
      }

      return true;
    });
  }

  // Apply sorting
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'modificationDate':
        comparison = new Date(a.modificationDate).getTime() - new Date(b.modificationDate).getTime();
        break;
      case 'creationDate':
        comparison = new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime();
        break;
      case 'title':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'folder':
        comparison = (a.folderName || '').localeCompare(b.folderName || '');
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Apply limit
  return sortedNotes.slice(0, limit);
}

/**
 * Search notes by query string
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum number of results to return (default: 50)
 * @returns Array of matching notes
 */
export async function searchNotes(query: string, limit: number = 50): Promise<NoteMetadata[]> {
  const script = `
    const notesApp = Application("Notes");
    const allNotes = notesApp.notes();
    const searchQuery = args[0].toLowerCase();
    const searchLimit = args[1];

    const matchingNotes = [];

    // First pass: search by name (title)
    for (let i = 0; i < allNotes.length && matchingNotes.length < searchLimit; i++) {
      const note = allNotes[i];
      const noteName = note.name().toLowerCase();

      if (noteName.includes(searchQuery)) {
        matchingNotes.push({
          id: note.id(),
          name: note.name(),
          modificationDate: note.modificationDate().toISOString(),
          creationDate: note.creationDate().toISOString(),
        });
      }
    }

    // Second pass: search in body if we don't have enough results
    if (matchingNotes.length < searchLimit) {
      for (let i = 0; i < allNotes.length && matchingNotes.length < searchLimit; i++) {
        const note = allNotes[i];
        const noteId = note.id();

        // Skip if already matched by name
        if (matchingNotes.some(n => n.id === noteId)) {
          continue;
        }

        try {
          const plaintext = note.plaintext().toLowerCase();
          if (plaintext.includes(searchQuery)) {
            matchingNotes.push({
              id: noteId,
              name: note.name(),
              modificationDate: note.modificationDate().toISOString(),
              creationDate: note.creationDate().toISOString(),
            });
          }
        } catch (e) {
          // Skip notes that can't be read
          continue;
        }
      }
    }

    // Sort by modification date descending
    matchingNotes.sort((a, b) => {
      return new Date(b.modificationDate).getTime() - new Date(a.modificationDate).getTime();
    });

    return matchingNotes;
  `;

  try {
    const result = await runJxa<NoteMetadata[]>(script, [query, limit], 20000);

    // Validate the result with Zod
    const validated = z.array(NoteMetadataSchema).parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to search notes: ${error.message}`);
  }
}

/**
 * Read a specific note by ID or name
 * @param nameOrId - Note ID or name to search for
 * @returns Complete note details including body and plaintext
 */
export async function readNote(nameOrId: string): Promise<NoteDetail> {
  const script = `
    const notesApp = Application("Notes");
    const searchTerm = args[0];

    let targetNote = null;

    // First, try to find by ID
    try {
      const allNotes = notesApp.notes();
      for (let i = 0; i < allNotes.length; i++) {
        const note = allNotes[i];
        if (note.id() === searchTerm) {
          targetNote = note;
          break;
        }
      }
    } catch (e) {
      // Continue to name search
    }

    // If not found by ID, try to find by name
    if (!targetNote) {
      try {
        const allNotes = notesApp.notes();
        for (let i = 0; i < allNotes.length; i++) {
          const note = allNotes[i];
          if (note.name() === searchTerm) {
            targetNote = note;
            break;
          }
        }
      } catch (e) {
        throw new Error(\`Note not found: \${searchTerm}\`);
      }
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${searchTerm}\`);
    }

    // Extract all details
    return {
      id: targetNote.id(),
      name: targetNote.name(),
      body: targetNote.body(),
      plaintext: targetNote.plaintext(),
      modificationDate: targetNote.modificationDate().toISOString(),
      creationDate: targetNote.creationDate().toISOString(),
    };
  `;

  try {
    const result = await runJxa<NoteDetail>(script, [nameOrId]);

    // Validate the result with Zod
    const validated = NoteDetailSchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found')) {
      throw new Error(`Note not found: ${nameOrId}`);
    }
    throw new Error(`Failed to read note: ${error.message}`);
  }
}

/**
 * Get a note's content optimized for summarization
 * Returns plaintext with metadata useful for AI summarization
 * @param nameOrId - Note ID or name to retrieve
 * @returns Note content with metadata for summarization
 */
export async function getNoteForSummary(nameOrId: string): Promise<NoteForSummary> {
  const script = `
    const notesApp = Application("Notes");
    const searchTerm = args[0];

    let targetNote = null;
    let folderName = "";

    // Find note by ID or name
    const accounts = notesApp.accounts();
    for (let a = 0; a < accounts.length && !targetNote; a++) {
      const folders = accounts[a].folders();
      for (let f = 0; f < folders.length && !targetNote; f++) {
        const folder = folders[f];
        if (folder.name() === "Recently Deleted") continue;
        const notes = folder.notes();
        for (let n = 0; n < notes.length; n++) {
          const note = notes[n];
          if (note.id() === searchTerm || note.name() === searchTerm) {
            targetNote = note;
            folderName = folder.name();
            break;
          }
        }
      }
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${searchTerm}\`);
    }

    // Get plaintext content
    const plaintext = targetNote.plaintext();

    // Calculate word count (split by whitespace, filter empty)
    const words = plaintext.trim().split(/\\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Character count (excluding leading/trailing whitespace)
    const characterCount = plaintext.trim().length;

    return {
      id: targetNote.id(),
      name: targetNote.name(),
      plaintext: plaintext,
      creationDate: targetNote.creationDate().toISOString(),
      modificationDate: targetNote.modificationDate().toISOString(),
      folderName: folderName,
      wordCount: wordCount,
      characterCount: characterCount,
    };
  `;

  try {
    const result = await runJxa<NoteForSummary>(script, [nameOrId], 10000);

    // Validate the result with Zod
    const validated = NoteForSummarySchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found')) {
      throw new Error(`Note not found: ${nameOrId}`);
    }
    throw new Error(`Failed to get note for summary: ${error.message}`);
  }
}

/**
 * Create a new note in Apple Notes
 * @param title - Title of the new note
 * @param body - Body content of the note (plain text or HTML)
 * @returns Created note metadata
 */
export async function createNote(title: string, body: string): Promise<CreateNoteResult> {
  const script = `
    const notesApp = Application("Notes");
    const noteTitle = args[0];
    const noteBody = args[1];

    // Get the default account
    const accounts = notesApp.accounts();
    if (accounts.length === 0) {
      throw new Error("No Notes account found");
    }

    const defaultAccount = accounts[0];

    // Get the first folder in the default account
    const folders = defaultAccount.folders();
    if (folders.length === 0) {
      throw new Error("No folders found in the default account");
    }

    const defaultFolder = folders[0];

    // Escape HTML entities to prevent injection
    const escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Create the note with escaped content
    const escapedBody = escapeHtml(noteBody);
    const htmlContent = \`<div><b>\${escapeHtml(noteTitle)}</b></div><div><br></div><div>\${escapedBody}</div>\`;

    // Use make command to properly create a single note (prevents duplication)
    const newNote = notesApp.make({
      new: "note",
      withProperties: {
        name: noteTitle,
        body: htmlContent
      }
    });

    // Return the created note's metadata
    return {
      id: newNote.id(),
      name: newNote.name(),
    };
  `;

  try {
    const result = await runJxa<CreateNoteResult>(script, [title, body]);

    // Validate the result with Zod
    const validated = CreateNoteResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to create note: ${error.message}`);
  }
}

/**
 * Update an existing note in Apple Notes
 * @param noteId - The ID of the note to update
 * @param options - Update options (title, body)
 * @returns Updated note metadata with success flag
 */
export async function updateNote(noteId: string, options: UpdateNoteOptions): Promise<UpdateNoteResult> {
  // Validate that at least one update field is provided
  if (!options.title && !options.body) {
    throw new Error('At least one of title or body must be provided');
  }

  // Validate body size
  if (options.body && options.body.length > MAX_BODY_SIZE) {
    throw new Error(`Body exceeds maximum size of ${MAX_BODY_SIZE} bytes`);
  }

  const script = `
    const notesApp = Application("Notes");
    const noteId = args[0];
    const newTitle = args[1];
    const newBody = args[2];

    let targetNote = null;

    // Find note by ID
    const allNotes = notesApp.notes();
    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (note.id() === noteId) {
        targetNote = note;
        break;
      }
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${noteId}\`);
    }

    // Update title if provided
    if (newTitle !== null && newTitle !== undefined) {
      targetNote.name = newTitle;
    }

    // Update body if provided
    if (newBody !== null && newBody !== undefined) {
      // Body should be HTML content
      targetNote.body = newBody;
    }

    // Return updated note metadata
    return {
      id: targetNote.id(),
      name: targetNote.name(),
      modificationDate: targetNote.modificationDate().toISOString(),
      success: true,
    };
  `;

  // Prepare body with HTML escaping if provided
  const escapedBody = options.body ? escapeHtml(options.body) : null;
  const htmlBody = escapedBody ? `<div>${escapedBody}</div>` : null;

  try {
    const result = await runJxa<UpdateNoteResult>(
      script,
      [noteId, options.title ?? null, htmlBody],
      10000
    );

    // Validate the result with Zod
    const validated = UpdateNoteResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found')) {
      throw new Error(`Note not found: ${noteId}`);
    }
    throw new Error(`Failed to update note: ${error.message}`);
  }
}

/**
 * Move a note to a different folder
 * @param noteId - The ID of the note to move
 * @param targetFolderId - The ID of the target folder
 * @returns Move result with previous and new folder info
 */
export async function moveNote(noteId: string, targetFolderId: string): Promise<MoveNoteResult> {
  const script = `
    const notesApp = Application("Notes");
    const noteId = args[0];
    const targetFolderId = args[1];

    let targetNote = null;
    let previousFolderId = null;
    let targetFolder = null;

    // Find note by ID and track its current folder
    const accounts = notesApp.accounts();
    for (let a = 0; a < accounts.length && !targetNote; a++) {
      const folders = accounts[a].folders();
      for (let f = 0; f < folders.length && !targetNote; f++) {
        const folder = folders[f];
        const notes = folder.notes();
        for (let n = 0; n < notes.length; n++) {
          if (notes[n].id() === noteId) {
            targetNote = notes[n];
            previousFolderId = folder.id();
            break;
          }
        }
      }
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${noteId}\`);
    }

    // Find target folder by ID
    for (let a = 0; a < accounts.length && !targetFolder; a++) {
      const folders = accounts[a].folders();
      for (let f = 0; f < folders.length; f++) {
        if (folders[f].id() === targetFolderId) {
          targetFolder = folders[f];
          break;
        }
      }
    }

    if (!targetFolder) {
      throw new Error(\`Folder not found: \${targetFolderId}\`);
    }

    // Prevent moving to Recently Deleted folder
    if (targetFolder.name() === "Recently Deleted") {
      throw new Error("Cannot move to Recently Deleted folder");
    }

    // Move the note to the target folder
    notesApp.move(targetNote, { to: targetFolder });

    return {
      id: noteId,
      name: targetNote.name(),
      previousFolderId: previousFolderId,
      newFolderId: targetFolderId,
      newFolderName: targetFolder.name(),
      success: true,
    };
  `;

  try {
    const result = await runJxa<MoveNoteResult>(script, [noteId, targetFolderId], 15000);

    // Validate the result with Zod
    const validated = MoveNoteResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found')) {
      throw new Error(`Note not found: ${noteId}`);
    }
    if (error.message.includes('Folder not found')) {
      throw new Error(`Folder not found: ${targetFolderId}`);
    }
    if (error.message.includes('Recently Deleted')) {
      throw new Error('Cannot move to Recently Deleted folder');
    }
    throw new Error(`Failed to move note: ${error.message}`);
  }
}

/**
 * List all folders in Apple Notes (flat list)
 * @returns Array of folders with note counts
 */
export async function listFolders(): Promise<Folder[]> {
  const script = `
    const notesApp = Application("Notes");
    const accounts = notesApp.accounts();
    const result = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const accountName = account.name();
      const folders = account.folders();

      for (let j = 0; j < folders.length; j++) {
        const folder = folders[j];
        const folderName = folder.name();

        // Skip Recently Deleted
        if (folderName === "Recently Deleted") continue;

        result.push({
          id: folder.id(),
          name: folderName,
          accountName: accountName,
          noteCount: folder.notes.length
        });
      }
    }

    return result;
  `;

  try {
    const result = await runJxa<Folder[]>(script, [], 10000);
    const validated = z.array(FolderSchema).parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to list folders: ${error.message}`);
  }
}

/**
 * Delete a note from Apple Notes
 * @param noteId - The ID of the note to delete
 * @returns Delete result with note info and success flag
 */
export async function deleteNote(noteId: string): Promise<DeleteNoteResult> {
  const script = `
    const notesApp = Application("Notes");
    const noteId = args[0];

    let targetNote = null;
    let noteName = "";

    // Find note by ID
    const allNotes = notesApp.notes();
    for (let i = 0; i < allNotes.length; i++) {
      const note = allNotes[i];
      if (note.id() === noteId) {
        targetNote = note;
        noteName = note.name();
        break;
      }
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${noteId}\`);
    }

    // Delete the note
    notesApp.delete(targetNote);

    return {
      id: noteId,
      name: noteName,
      success: true,
    };
  `;

  try {
    const result = await runJxa<DeleteNoteResult>(script, [noteId], 10000);

    // Validate the result with Zod
    const validated = DeleteNoteResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found')) {
      throw new Error(`Note not found: ${noteId}`);
    }
    throw new Error(`Failed to delete note: ${error.message}`);
  }
}
