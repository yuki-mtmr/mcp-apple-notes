import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJxaMock, mockNotes, mockFolders } from './mocks/jxa-mock.js';

// Mock the jxa-adapter module
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: createJxaMock(),
}));

// Import after mocking
import { listNotes, searchNotes, readNote, createNote, listFolders } from '../src/notes-service.js';
import { runJxa } from '../src/jxa-adapter.js';

describe('notes-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listNotes', () => {
    it('should return notes sorted by modification date', async () => {
      const notes = await listNotes(10, false);

      expect(notes).toBeDefined();
      expect(Array.isArray(notes)).toBe(true);
      expect(runJxa).toHaveBeenCalled();
    });

    it('should respect limit parameter', async () => {
      const notes = await listNotes(2, false);

      expect(notes.length).toBeLessThanOrEqual(2);
    });

    it('should include preview when requested', async () => {
      const notes = await listNotes(10, true);

      notes.forEach(note => {
        if (note.preview !== undefined) {
          expect(typeof note.preview).toBe('string');
        }
      });
    });

    it('should filter by folderId when provided', async () => {
      const notes = await listNotes(10, false, 'folder-1');

      notes.forEach(note => {
        expect(note.folderId).toBe('folder-1');
      });
    });

    it('should validate return data against schema', async () => {
      const notes = await listNotes(10, false);

      notes.forEach(note => {
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('name');
        expect(note).toHaveProperty('modificationDate');
        expect(note).toHaveProperty('creationDate');
      });
    });
  });

  describe('searchNotes', () => {
    it('should return matching notes by title', async () => {
      const notes = await searchNotes('Test', 50);

      expect(notes).toBeDefined();
      expect(Array.isArray(notes)).toBe(true);
    });

    it('should return matching notes by content', async () => {
      const notes = await searchNotes('project', 50);

      expect(notes).toBeDefined();
      expect(Array.isArray(notes)).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const notes = await searchNotes('TEST', 50);

      expect(notes).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const notes = await searchNotes('note', 1);

      expect(notes.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for no matches', async () => {
      const notes = await searchNotes('xyznonexistent', 50);

      expect(notes).toEqual([]);
    });
  });

  describe('readNote', () => {
    it('should return note details by ID', async () => {
      const note = await readNote('note-1');

      expect(note).toBeDefined();
      expect(note.id).toBe('note-1');
      expect(note).toHaveProperty('body');
      expect(note).toHaveProperty('plaintext');
    });

    it('should return note details by name', async () => {
      const note = await readNote('Test Note 1');

      expect(note).toBeDefined();
      expect(note.name).toBe('Test Note 1');
    });

    it('should throw error for non-existent note', async () => {
      await expect(readNote('nonexistent-id')).rejects.toThrow('Note not found');
    });

    it('should include all required fields', async () => {
      const note = await readNote('note-1');

      expect(note).toHaveProperty('id');
      expect(note).toHaveProperty('name');
      expect(note).toHaveProperty('body');
      expect(note).toHaveProperty('plaintext');
      expect(note).toHaveProperty('modificationDate');
      expect(note).toHaveProperty('creationDate');
    });
  });

  describe('createNote', () => {
    it('should create a note and return metadata', async () => {
      const result = await createNote('New Test Note', 'Test body content');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result.name).toBe('New Test Note');
    });

    it('should escape HTML in title and body', async () => {
      const result = await createNote('<script>alert("xss")</script>', '<b>Bold</b>');

      expect(result).toBeDefined();
      expect(result.name).toBe('<script>alert("xss")</script>');
    });
  });

  describe('listFolders', () => {
    it('should return list of folders', async () => {
      const folders = await listFolders();

      expect(folders).toBeDefined();
      expect(Array.isArray(folders)).toBe(true);
    });

    it('should include required folder properties', async () => {
      const folders = await listFolders();

      folders.forEach(folder => {
        expect(folder).toHaveProperty('id');
        expect(folder).toHaveProperty('name');
        expect(folder).toHaveProperty('accountName');
        expect(folder).toHaveProperty('noteCount');
      });
    });

    it('should not include Recently Deleted folder', async () => {
      const folders = await listFolders();

      const deletedFolder = folders.find(f => f.name === 'Recently Deleted');
      expect(deletedFolder).toBeUndefined();
    });
  });
});
