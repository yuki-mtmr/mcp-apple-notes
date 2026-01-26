import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runJxa for getNoteForSummary tests
const mockRunJxa = vi.fn();
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: (...args: unknown[]) => mockRunJxa(...args),
}));

// Import after mocking
import { getNoteForSummary, NoteForSummarySchema } from '../src/notes-service.js';

describe('getNoteForSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response
    mockRunJxa.mockResolvedValue({
      id: 'note-1',
      name: 'Test Note',
      plaintext: 'This is the plain text content of the note.\n\nIt has multiple paragraphs.',
      creationDate: '2024-01-10T08:00:00.000Z',
      modificationDate: '2024-01-15T10:00:00.000Z',
      folderName: 'Work',
      wordCount: 12,
      characterCount: 70,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful retrieval', () => {
    it('should return plaintext content', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result).toBeDefined();
      expect(result.plaintext).toBe('This is the plain text content of the note.\n\nIt has multiple paragraphs.');
    });

    it('should return note metadata', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result.id).toBe('note-1');
      expect(result.name).toBe('Test Note');
      expect(result.folderName).toBe('Work');
    });

    it('should return word count', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result.wordCount).toBe(12);
    });

    it('should return character count', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result.characterCount).toBe(70);
    });

    it('should return creation and modification dates', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result.creationDate).toBe('2024-01-10T08:00:00.000Z');
      expect(result.modificationDate).toBe('2024-01-15T10:00:00.000Z');
    });
  });

  describe('error handling', () => {
    it('should throw error when note not found', async () => {
      mockRunJxa.mockRejectedValue(new Error('Note not found: nonexistent'));

      await expect(getNoteForSummary('nonexistent')).rejects.toThrow('Note not found');
    });
  });

  describe('schema validation', () => {
    it('should return data matching NoteForSummarySchema', async () => {
      const result = await getNoteForSummary('note-1');

      expect(() => NoteForSummarySchema.parse(result)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const result = await getNoteForSummary('note-1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('plaintext');
      expect(result).toHaveProperty('creationDate');
      expect(result).toHaveProperty('modificationDate');
      expect(result).toHaveProperty('folderName');
      expect(result).toHaveProperty('wordCount');
      expect(result).toHaveProperty('characterCount');
    });
  });
});
