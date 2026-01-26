import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runJxa for deleteNote tests
const mockRunJxa = vi.fn();
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: (...args: unknown[]) => mockRunJxa(...args),
}));

// Import after mocking
import { deleteNote, DeleteNoteResultSchema } from '../src/notes-service.js';

describe('deleteNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunJxa.mockResolvedValue({
      id: 'note-1',
      name: 'Deleted Note',
      success: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful deletion', () => {
    it('should delete note and return result', async () => {
      const result = await deleteNote('note-1');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.id).toBe('note-1');
    });

    it('should return deleted note name', async () => {
      const result = await deleteNote('note-1');

      expect(result.name).toBe('Deleted Note');
    });
  });

  describe('error handling', () => {
    it('should throw error when note not found', async () => {
      mockRunJxa.mockRejectedValue(new Error('Note not found: nonexistent'));

      await expect(deleteNote('nonexistent')).rejects.toThrow('Note not found');
    });
  });

  describe('schema validation', () => {
    it('should return data matching DeleteNoteResultSchema', async () => {
      const result = await deleteNote('note-1');

      expect(() => DeleteNoteResultSchema.parse(result)).not.toThrow();
    });
  });
});
