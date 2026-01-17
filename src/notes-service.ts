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

export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;
export type NoteDetail = z.infer<typeof NoteDetailSchema>;
export type CreateNoteResult = z.infer<typeof CreateNoteResultSchema>;
export type Folder = z.infer<typeof FolderSchema>;

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
