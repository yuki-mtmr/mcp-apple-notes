import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runJxa for extended listNotes tests
const mockRunJxa = vi.fn();
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: (...args: unknown[]) => mockRunJxa(...args),
}));

// Import after mocking
import { listNotesExtended, ListNotesExtendedOptionsSchema } from '../src/notes-service.js';

const mockNotesData = [
  {
    id: 'note-1',
    name: 'Alpha Note',
    modificationDate: '2024-01-15T10:00:00.000Z',
    creationDate: '2024-01-10T08:00:00.000Z',
    folderName: 'Work',
    folderId: 'folder-1',
  },
  {
    id: 'note-2',
    name: 'Beta Note',
    modificationDate: '2024-01-14T15:00:00.000Z',
    creationDate: '2024-01-09T12:00:00.000Z',
    folderName: 'Personal',
    folderId: 'folder-2',
  },
  {
    id: 'note-3',
    name: 'Gamma Note',
    modificationDate: '2024-01-13T09:00:00.000Z',
    creationDate: '2024-01-08T14:00:00.000Z',
    folderName: 'Work',
    folderId: 'folder-1',
  },
];

describe('listNotesExtended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response returns all notes
    mockRunJxa.mockResolvedValue(mockNotesData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sorting', () => {
    it('should sort by modificationDate descending by default', async () => {
      const result = await listNotesExtended({});

      expect(result[0].name).toBe('Alpha Note'); // Most recently modified
      expect(result[2].name).toBe('Gamma Note'); // Oldest modification
    });

    it('should sort by modificationDate ascending when specified', async () => {
      const result = await listNotesExtended({
        sortBy: 'modificationDate',
        sortOrder: 'asc',
      });

      expect(result[0].name).toBe('Gamma Note');
      expect(result[2].name).toBe('Alpha Note');
    });

    it('should sort by creationDate descending', async () => {
      const result = await listNotesExtended({
        sortBy: 'creationDate',
        sortOrder: 'desc',
      });

      expect(result[0].name).toBe('Alpha Note'); // Most recently created
      expect(result[2].name).toBe('Gamma Note'); // Oldest creation
    });

    it('should sort by title ascending', async () => {
      const result = await listNotesExtended({
        sortBy: 'title',
        sortOrder: 'asc',
      });

      expect(result[0].name).toBe('Alpha Note');
      expect(result[1].name).toBe('Beta Note');
      expect(result[2].name).toBe('Gamma Note');
    });

    it('should sort by title descending', async () => {
      const result = await listNotesExtended({
        sortBy: 'title',
        sortOrder: 'desc',
      });

      expect(result[0].name).toBe('Gamma Note');
      expect(result[2].name).toBe('Alpha Note');
    });

    it('should sort by folder name', async () => {
      const result = await listNotesExtended({
        sortBy: 'folder',
        sortOrder: 'asc',
      });

      // Personal comes before Work alphabetically
      expect(result[0].folderName).toBe('Personal');
    });
  });

  describe('filtering', () => {
    it('should filter by createdAfter date', async () => {
      const result = await listNotesExtended({
        filter: {
          createdAfter: '2024-01-09T00:00:00.000Z',
        },
      });

      // Should exclude note-3 (created 2024-01-08)
      expect(result.length).toBe(2);
      expect(result.some(n => n.id === 'note-3')).toBe(false);
    });

    it('should filter by createdBefore date', async () => {
      const result = await listNotesExtended({
        filter: {
          createdBefore: '2024-01-09T00:00:00.000Z',
        },
      });

      // Should only include note-3 (created 2024-01-08)
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('note-3');
    });

    it('should filter by modifiedAfter date', async () => {
      const result = await listNotesExtended({
        filter: {
          modifiedAfter: '2024-01-14T00:00:00.000Z',
        },
      });

      // Should include note-1 and note-2
      expect(result.length).toBe(2);
      expect(result.some(n => n.id === 'note-3')).toBe(false);
    });

    it('should filter by modifiedBefore date', async () => {
      const result = await listNotesExtended({
        filter: {
          modifiedBefore: '2024-01-14T00:00:00.000Z',
        },
      });

      // Should only include note-3
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('note-3');
    });

    it('should filter by titleContains (case-insensitive)', async () => {
      const result = await listNotesExtended({
        filter: {
          titleContains: 'alpha',
        },
      });

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Alpha Note');
    });

    it('should combine multiple filters', async () => {
      const result = await listNotesExtended({
        filter: {
          createdAfter: '2024-01-08T00:00:00.000Z',
          modifiedAfter: '2024-01-14T00:00:00.000Z',
        },
      });

      // Should include note-1 and note-2
      expect(result.length).toBe(2);
    });
  });

  describe('combined sort and filter', () => {
    it('should filter then sort', async () => {
      const result = await listNotesExtended({
        sortBy: 'title',
        sortOrder: 'asc',
        filter: {
          createdAfter: '2024-01-09T00:00:00.000Z', // Excludes note-3 (created 2024-01-08)
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Alpha Note');
      expect(result[1].name).toBe('Beta Note');
    });
  });

  describe('limit', () => {
    it('should respect limit parameter', async () => {
      const result = await listNotesExtended({
        limit: 2,
      });

      expect(result.length).toBe(2);
    });
  });

  describe('schema validation', () => {
    it('should validate options schema', () => {
      const validOptions = {
        limit: 10,
        sortBy: 'modificationDate' as const,
        sortOrder: 'desc' as const,
        filter: {
          createdAfter: '2024-01-01',
        },
      };

      expect(() => ListNotesExtendedOptionsSchema.parse(validOptions)).not.toThrow();
    });

    it('should reject invalid sortBy value', () => {
      const invalidOptions = {
        sortBy: 'invalid',
      };

      expect(() => ListNotesExtendedOptionsSchema.parse(invalidOptions)).toThrow();
    });
  });
});
