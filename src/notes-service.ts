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

export const FolderSchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string(),
  name: z.string(),
  accountName: z.string(),
  noteCount: z.number(),
  path: z.string(), // Full path like "AI/GCI" or "etc./その他"
  parentId: z.string().optional(),
  subfolders: z.array(FolderSchema).optional(),
}));

export const MoveNoteResultSchema = z.object({
  success: z.boolean(),
  noteId: z.string(),
  noteName: z.string(),
  targetFolderId: z.string(),
  targetFolderName: z.string(),
});

export const BatchMoveResultSchema = z.object({
  success: z.boolean(),
  moved: z.number(),
  failed: z.array(z.object({
    noteId: z.string(),
    error: z.string(),
  })),
});

export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;
export type NoteDetail = z.infer<typeof NoteDetailSchema>;
export type CreateNoteResult = z.infer<typeof CreateNoteResultSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type MoveNoteResult = z.infer<typeof MoveNoteResultSchema>;
export type BatchMoveResult = z.infer<typeof BatchMoveResultSchema>;

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
    // Timeout strategy: Batch fetch is fast, but folder iteration takes ~1s.
    // 30s is more than enough even for large libraries now.
    const timeout = 30000;

    const result = await runJxa<NoteMetadata[]>(script, [limit, includePreview, folderId], timeout);

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
    // Use longer timeout for search as it may scan many notes
    const result = await runJxa<NoteMetadata[]>(script, [query, limit], 60000);

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
 * List all folders in Apple Notes with nested structure
 * @returns Array of folders with note counts and subfolders
 */
/**
 * List all folders in Apple Notes with nested structure
 * @returns Array of folders with note counts and subfolders
 */
export async function listFolders(): Promise<Folder[]> {
  const script = `
    const notesApp = Application("Notes");
    const accounts = notesApp.accounts();
    const result = [];

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const accountName = account.name();

      // 1. Get ALL folders (flat list) available to the account
      // Note: account.folders() often returns a flattened list of ALL folders, including nested ones.
      const allFolders = account.folders();
      const childIds = new Set();
      const folderMap = {}; // ID -> FolderObject
      const allFolderIds = [];

      // 2. Identify which folders are children (to filter them out from root)
      for (let j = 0; j < allFolders.length; j++) {
        const f = allFolders[j];
        if (f.name() === "Recently Deleted") continue;

        const id = f.id();
        folderMap[id] = f;
        allFolderIds.push(id);
      }

      // For each known folder, query its children and mark them
      for (let j = 0; j < allFolderIds.length; j++) {
        const f = folderMap[allFolderIds[j]];
        try {
          const kids = f.folders();
          const kCount = kids.length;
          if (kCount > 0) {
             // Iterate children manually to be safe (batch .id() failed in testing)
             for (let k = 0; k < kCount; k++) {
               const kid = kids[k];
               const kidId = kid.id();
               if (kidId) childIds.add(kidId);
             }
          }
        } catch(e) {
          // ignore error access
        }
      }

      // 3. Recursive builder
      const processRecursive = (folder, parentPath) => {
         const fName = folder.name();
         const fId = folder.id();
         const fPath = parentPath ? parentPath + "/" + fName : fName;

         const node = {
           id: fId,
           name: fName,
           accountName: accountName,
           noteCount: folder.notes.length,
           path: fPath,
           subfolders: []
         };

         try {
           const sub = folder.folders();
           for(let k = 0; k < sub.length; k++) {
             node.subfolders.push(processRecursive(sub[k], fPath));
           }
         } catch(e) {}

         return node;
      };

      // 4. Construct tree starting only from Roots (folders not in childIds)
      for(let j = 0; j < allFolderIds.length; j++) {
         const fId = allFolderIds[j];
         if (!childIds.has(fId)) {
            const rootFolder = folderMap[fId];
            if (rootFolder) {
              result.push(processRecursive(rootFolder, ""));
            }
         }
      }
    }

    return result;
  `;

  try {
    const result = await runJxa<Folder[]>(script, [], 30000);

    // Validate the result with Zod
    const validated = z.array(FolderSchema).parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to list folders: ${error.message}`);
  }
}


/**
 * Move a note to a different folder
 * @param noteId - ID of the note to move
 * @param targetFolderId - ID of the target folder
 * @returns Result of the move operation
 */
export async function moveNote(noteId: string, targetFolderId: string): Promise<MoveNoteResult> {
  const script = `
    const notesApp = Application("Notes");
    const noteId = args[0];
    const targetFolderId = args[1];

    // Optimized: Use direct note access by ID instead of iterating all notes
    let targetNote = null;
    let noteName = "";

    try {
      // Try to get note directly by referencing it
      const accounts = notesApp.accounts();
      for (let i = 0; i < accounts.length && !targetNote; i++) {
        const account = accounts[i];
        const folders = account.folders();

        for (let j = 0; j < folders.length && !targetNote; j++) {
          const folder = folders[j];
          const notes = folder.notes();

          // Only iterate notes in each folder
          for (let k = 0; k < notes.length; k++) {
            const note = notes[k];
            if (note.id() === noteId) {
              targetNote = note;
              noteName = note.name();
              break;
            }
          }
        }
      }
    } catch (e) {
      throw new Error(\`Failed to find note: \${e.message}\`);
    }

    if (!targetNote) {
      throw new Error(\`Note not found: \${noteId}\`);
    }

    // Optimized: Find folder with early exit
    let targetFolder = null;
    const accounts = notesApp.accounts();

    for (let i = 0; i < accounts.length && !targetFolder; i++) {
      const account = accounts[i];
      const folders = account.folders();

      for (let j = 0; j < folders.length; j++) {
        const folder = folders[j];
        if (folder.id() === targetFolderId) {
          targetFolder = folder;
          break;
        }

        // Check subfolders recursively
        const checkSubfolders = (parentFolder) => {
          try {
            const subfolders = parentFolder.folders();
            for (let s = 0; s < subfolders.length; s++) {
              const subfolder = subfolders[s];
              if (subfolder.id() === targetFolderId) {
                return subfolder;
              }
              const found = checkSubfolders(subfolder);
              if (found) return found;
            }
          } catch (e) {
            // No subfolders
          }
          return null;
        };

        const foundSubfolder = checkSubfolders(folder);
        if (foundSubfolder) {
          targetFolder = foundSubfolder;
          break;
        }
      }
    }

    if (!targetFolder) {
      throw new Error(\`Folder not found: \${targetFolderId}\`);
    }

    // Move the note
    notesApp.move(targetNote, { to: targetFolder });

    return {
      success: true,
      noteId: noteId,
      noteName: noteName,
      targetFolderId: targetFolder.id(),
      targetFolderName: targetFolder.name()
    };
  `;

  try {
    const result = await runJxa<MoveNoteResult>(script, [noteId, targetFolderId], 60000);

    // Validate the result with Zod
    const validated = MoveNoteResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    if (error.message.includes('Note not found') || error.message.includes('Folder not found')) {
      throw new Error(error.message);
    }
    throw new Error(`Failed to move note: ${error.message}`);
  }
}

/**
 * Move multiple notes to a folder in a single JXA call (batch operation)
 * @param noteIds - Array of note IDs to move
 * @param targetFolderId - ID of the target folder
 * @returns Result of the batch move operation
 */
export async function batchMoveNotes(noteIds: string[], targetFolderId: string): Promise<BatchMoveResult> {
  const script = `
    const notesApp = Application("Notes");
    const noteIds = args[0];
    const targetFolderId = args[1];

    // Find target folder first
    let targetFolder = null;
    const accounts = notesApp.accounts();

    for (let i = 0; i < accounts.length && !targetFolder; i++) {
      const account = accounts[i];
      const folders = account.folders();

      for (let j = 0; j < folders.length; j++) {
        const folder = folders[j];
        if (folder.id() === targetFolderId) {
          targetFolder = folder;
          break;
        }

        // Check subfolders recursively
        const checkSubfolders = (parentFolder) => {
          try {
            const subfolders = parentFolder.folders();
            for (let s = 0; s < subfolders.length; s++) {
              const subfolder = subfolders[s];
              if (subfolder.id() === targetFolderId) {
                return subfolder;
              }
              const found = checkSubfolders(subfolder);
              if (found) return found;
            }
          } catch (e) {
            // No subfolders
          }
          return null;
        };

        const foundSubfolder = checkSubfolders(folder);
        if (foundSubfolder) {
          targetFolder = foundSubfolder;
          break;
        }
      }
    }

    if (!targetFolder) {
      throw new Error(\`Folder not found: \${targetFolderId}\`);
    }

    // Batch move all notes
    let movedCount = 0;
    const failed = [];

    for (let i = 0; i < noteIds.length; i++) {
      const noteId = noteIds[i];

      try {
        // Find note by folder iteration
        let targetNote = null;
        for (let a = 0; a < accounts.length && !targetNote; a++) {
          const account = accounts[a];
          const folders = account.folders();

          for (let f = 0; f < folders.length && !targetNote; f++) {
            const folder = folders[f];
            const notes = folder.notes();

            for (let n = 0; n < notes.length; n++) {
              const note = notes[n];
              if (note.id() === noteId) {
                targetNote = note;
                break;
              }
            }
          }
        }

        if (targetNote) {
          notesApp.move(targetNote, { to: targetFolder });
          movedCount++;
        } else {
          failed.push({ noteId: noteId, error: "Note not found" });
        }
      } catch (e) {
        failed.push({ noteId: noteId, error: e.message || String(e) });
      }
    }

    return {
      success: failed.length === 0,
      moved: movedCount,
      failed: failed
    };
  `;

  try {
    const result = await runJxa<BatchMoveResult>(script, [noteIds, targetFolderId], 120000);

    // Validate the result with Zod
    const validated = BatchMoveResultSchema.parse(result);
    return validated;
  } catch (error: any) {
    throw new Error(`Failed to batch move notes: ${error.message}`);
  }
}

/**
 * Create a new folder
 * @param name - Name of the new folder
 * @param parentFolderId - Optional ID of parent folder
 * @returns Created folder metadata
 */
export async function createFolder(name: string, parentFolderId?: string): Promise<{ id: string, name: string }> {
  const script = `
    const notesApp = Application("Notes");
    const newFolderName = args[0];
    const parentId = args[1];

    try {
      // Determine where to create the folder
      let parentContainer;

      if (parentId) {
        // Find parent folder
        const accounts = notesApp.accounts();
        let found = null;

        for (let i = 0; i < accounts.length; i++) {
          const acc = accounts[i];
          // Check root folders
          try {
             const allFolders = acc.folders();
             for(let j=0; j<allFolders.length; j++) {
                if (allFolders[j].id() === parentId) {
                   found = allFolders[j];
                   break;
                }
             }
          } catch(e) {}
          if (found) break;
        }

        if (!found) {
            throw new Error("Parent folder not found: " + parentId);
        }
        parentContainer = found;
      } else {
        // Default to the first account
        const accounts = notesApp.accounts();
        if (accounts.length === 0) throw new Error("No accounts found");
        parentContainer = accounts[0];
      }

      // Check if folder already exists in the container
      let existing = [];
      try {
         // .whose() filter might be flaky, try manual check if small number?
         // JXA whose is usually fine for name
         existing = parentContainer.folders.whose({ name: newFolderName });
      } catch(e) {}

      if (existing && existing.length > 0) {
         const f = existing[0];
         return { id: f.id(), name: f.name() };
      }

      // Create new folder
      const newFolder = notesApp.make({
        new: "folder",
        at: parentContainer,
        withProperties: { name: newFolderName }
      });

      return {
        id: newFolder.id(),
        name: newFolder.name()
      };
    } catch(e) {
      throw e;
    }
  `;

  try {
    const result = await runJxa<{ id: string, name: string }>(script, [name, parentFolderId], 10000);
    return result;
  } catch (error: any) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }
}
