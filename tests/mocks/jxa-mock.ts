import { vi } from 'vitest';

/**
 * Mock data for Apple Notes testing
 */
export const mockNotes = [
  {
    id: 'note-1',
    name: 'Test Note 1',
    modificationDate: '2024-01-15T10:00:00.000Z',
    creationDate: '2024-01-10T08:00:00.000Z',
    folderName: 'Work',
    folderId: 'folder-1',
    preview: 'This is the first test note content...',
    body: '<div>This is the first test note content.</div>',
    plaintext: 'This is the first test note content.',
  },
  {
    id: 'note-2',
    name: 'Test Note 2',
    modificationDate: '2024-01-14T15:00:00.000Z',
    creationDate: '2024-01-09T12:00:00.000Z',
    folderName: 'Personal',
    folderId: 'folder-2',
    preview: 'Second note with different content...',
    body: '<div>Second note with different content.</div>',
    plaintext: 'Second note with different content.',
  },
  {
    id: 'note-3',
    name: 'Meeting Notes',
    modificationDate: '2024-01-13T09:00:00.000Z',
    creationDate: '2024-01-08T14:00:00.000Z',
    folderName: 'Work',
    folderId: 'folder-1',
    preview: 'Discussion about project timeline...',
    body: '<div>Discussion about project timeline.</div>',
    plaintext: 'Discussion about project timeline.',
  },
];

export const mockFolders = [
  {
    id: 'folder-1',
    name: 'Work',
    accountName: 'iCloud',
    noteCount: 2,
  },
  {
    id: 'folder-2',
    name: 'Personal',
    accountName: 'iCloud',
    noteCount: 1,
  },
  {
    id: 'folder-3',
    name: 'Archive',
    accountName: 'iCloud',
    noteCount: 0,
  },
];

/**
 * Create a mock implementation for runJxa
 * This mock simulates Apple Notes responses based on the script content
 */
export function createJxaMock() {
  return vi.fn().mockImplementation(async (script: string, args: unknown[] = []) => {
    // Detect operation type based on script content
    if (script.includes('noteContainer.id()') || script.includes('allNotesData')) {
      // listNotes operation
      const limit = args[0] as number || 100;
      const includePreview = args[1] as boolean || false;
      const folderId = args[2] as string | undefined;

      let filteredNotes = [...mockNotes];
      if (folderId) {
        filteredNotes = filteredNotes.filter(n => n.folderId === folderId);
      }

      return filteredNotes.slice(0, limit).map(note => ({
        id: note.id,
        name: note.name,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
        folderName: note.folderName,
        folderId: note.folderId,
        preview: includePreview ? note.preview : undefined,
      }));
    }

    if (script.includes('searchQuery') && script.includes('matchingNotes')) {
      // searchNotes operation
      const query = (args[0] as string).toLowerCase();
      const limit = args[1] as number || 50;

      const matchingNotes = mockNotes.filter(
        note =>
          note.name.toLowerCase().includes(query) ||
          note.plaintext.toLowerCase().includes(query)
      );

      return matchingNotes.slice(0, limit).map(note => ({
        id: note.id,
        name: note.name,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      }));
    }

    if (script.includes('targetNote') && script.includes('targetNote.body()')) {
      // readNote operation
      const nameOrId = args[0] as string;
      const note = mockNotes.find(n => n.id === nameOrId || n.name === nameOrId);

      if (!note) {
        throw new Error(`Note not found: ${nameOrId}`);
      }

      return {
        id: note.id,
        name: note.name,
        body: note.body,
        plaintext: note.plaintext,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      };
    }

    if (script.includes('notesApp.make') && script.includes('new: "note"')) {
      // createNote operation
      const title = args[0] as string;
      return {
        id: `new-note-${Date.now()}`,
        name: title,
      };
    }

    if (script.includes('folder.notes.length') && script.includes('accountName')) {
      // listFolders operation
      return mockFolders;
    }

    // updateNote operation
    if (script.includes('note.name.set') || script.includes('note.body.set')) {
      const noteId = args[0] as string;
      const note = mockNotes.find(n => n.id === noteId);
      if (!note) {
        throw new Error(`Note not found: ${noteId}`);
      }
      const title = args[1] as string | undefined;
      const body = args[2] as string | undefined;
      return {
        id: note.id,
        name: title || note.name,
        modificationDate: new Date().toISOString(),
        success: true,
      };
    }

    // moveNote operation
    if (script.includes('move') && script.includes('targetFolder')) {
      const noteId = args[0] as string;
      const targetFolderId = args[1] as string;
      const note = mockNotes.find(n => n.id === noteId);
      const targetFolder = mockFolders.find(f => f.id === targetFolderId);

      if (!note) {
        throw new Error(`Note not found: ${noteId}`);
      }
      if (!targetFolder) {
        throw new Error(`Folder not found: ${targetFolderId}`);
      }
      if (targetFolder.name === 'Recently Deleted') {
        throw new Error('Cannot move to Recently Deleted folder');
      }

      return {
        id: note.id,
        name: note.name,
        previousFolderId: note.folderId,
        newFolderId: targetFolderId,
        newFolderName: targetFolder.name,
        success: true,
      };
    }

    throw new Error('Unknown JXA operation');
  });
}

/**
 * Reset mock data to initial state
 */
export function resetMockData() {
  // Can be expanded if mutable state is needed
}
