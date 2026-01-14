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
});

export const NoteDetailSchema = NoteMetadataSchema.extend({
  body: z.string(), // HTML content
  plaintext: z.string(),
});

export const CreateNoteResultSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;
export type NoteDetail = z.infer<typeof NoteDetailSchema>;
export type CreateNoteResult = z.infer<typeof CreateNoteResultSchema>;

/**
 * List notes from Apple Notes app
 * @param limit - Maximum number of notes to return (default: 100)
 * @returns Array of note metadata sorted by modification date (descending)
 */
export async function listNotes(limit: number = 10): Promise<NoteMetadata[]> {
  const script = `
    const notesApp = Application("Notes");
    const allNotes = notesApp.notes();
    const limitCount = Math.min(args[0], allNotes.length);

    // Extract only id and modificationDate for sorting (lightweight)
    const notesForSort = [];
    for (let i = 0; i < allNotes.length; i++) {
      notesForSort.push({
        index: i,
        modDate: allNotes[i].modificationDate().getTime()
      });
    }

    // Sort by modification date descending
    notesForSort.sort((a, b) => b.modDate - a.modDate);

    // Get only the top N notes and extract full metadata
    const notesData = [];
    for (let i = 0; i < limitCount; i++) {
      const note = allNotes[notesForSort[i].index];
      notesData.push({
        id: note.id(),
        name: note.name(),
        modificationDate: note.modificationDate().toISOString(),
        creationDate: note.creationDate().toISOString(),
      });
    }

    return notesData;
  `;

  try {
    const result = await runJxa<NoteMetadata[]>(script, [limit]);

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
    const result = await runJxa<NoteMetadata[]>(script, [query, limit]);

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
