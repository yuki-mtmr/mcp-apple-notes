import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runJxa for moveNote tests
const mockRunJxa = vi.fn();
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: (...args: unknown[]) => mockRunJxa(...args),
}));

// Import after mocking
import { moveNote, MoveNoteResultSchema } from '../src/notes-service.js';

describe('moveNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful mock response
    mockRunJxa.mockResolvedValue({
      id: 'note-1',
      name: 'Test Note',
      previousFolderId: 'folder-1',
      newFolderId: 'folder-2',
      newFolderName: 'Personal',
      success: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful move', () => {
    it('should move note to target folder', async () => {
      const result = await moveNote('note-1', 'folder-2');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.newFolderId).toBe('folder-2');
      expect(mockRunJxa).toHaveBeenCalled();
    });

    it('should return previous folder ID', async () => {
      const result = await moveNote('note-1', 'folder-2');

      expect(result.previousFolderId).toBe('folder-1');
    });

    it('should return new folder name', async () => {
      const result = await moveNote('note-1', 'folder-2');

      expect(result.newFolderName).toBe('Personal');
    });
  });

  describe('error handling', () => {
    it('should throw error when note not found', async () => {
      mockRunJxa.mockRejectedValue(new Error('Note not found: nonexistent'));

      await expect(moveNote('nonexistent', 'folder-2')).rejects.toThrow(
        'Note not found'
      );
    });

    it('should throw error when folder not found', async () => {
      mockRunJxa.mockRejectedValue(new Error('Folder not found: nonexistent-folder'));

      await expect(moveNote('note-1', 'nonexistent-folder')).rejects.toThrow(
        'Folder not found'
      );
    });

    it('should throw error when target is Recently Deleted folder', async () => {
      mockRunJxa.mockRejectedValue(new Error('Cannot move to Recently Deleted folder'));

      await expect(moveNote('note-1', 'recently-deleted-folder-id')).rejects.toThrow(
        'Recently Deleted'
      );
    });
  });

  describe('schema validation', () => {
    it('should return data matching MoveNoteResultSchema', async () => {
      const result = await moveNote('note-1', 'folder-2');

      expect(() => MoveNoteResultSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields in result', async () => {
      const result = await moveNote('note-1', 'folder-2');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('previousFolderId');
      expect(result).toHaveProperty('newFolderId');
      expect(result).toHaveProperty('newFolderName');
      expect(result).toHaveProperty('success');
    });
  });
});
