import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockNotes } from './mocks/jxa-mock.js';

// Mock runJxa for updateNote tests
const mockRunJxa = vi.fn();
vi.mock('../src/jxa-adapter.js', () => ({
  runJxa: (...args: unknown[]) => mockRunJxa(...args),
}));

// Import after mocking
import { updateNote, UpdateNoteResultSchema } from '../src/notes-service.js';

describe('updateNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful mock response
    mockRunJxa.mockResolvedValue({
      id: 'note-1',
      name: 'Updated Title',
      modificationDate: '2024-01-20T10:00:00.000Z',
      success: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('title update', () => {
    it('should update note title only', async () => {
      const result = await updateNote('note-1', { title: 'New Title' });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.id).toBe('note-1');
      expect(mockRunJxa).toHaveBeenCalled();
    });

    it('should return updated name in result', async () => {
      mockRunJxa.mockResolvedValue({
        id: 'note-1',
        name: 'New Title',
        modificationDate: '2024-01-20T10:00:00.000Z',
        success: true,
      });

      const result = await updateNote('note-1', { title: 'New Title' });

      expect(result.name).toBe('New Title');
    });
  });

  describe('body update', () => {
    it('should update note body only', async () => {
      const result = await updateNote('note-1', { body: 'New body content' });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should HTML escape body content for XSS prevention', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      await updateNote('note-1', { body: xssPayload });

      // Verify the script was called with escaped content (not raw HTML)
      const callArgs = mockRunJxa.mock.calls[0];
      const passedBody = callArgs[1][2]; // Third argument is the body
      // Should contain escaped version, not raw <script>
      expect(passedBody).toContain('&lt;script&gt;');
      expect(passedBody).not.toContain('<script>');
    });
  });

  describe('title and body update', () => {
    it('should update both title and body', async () => {
      const result = await updateNote('note-1', {
        title: 'New Title',
        body: 'New body',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error when note not found', async () => {
      mockRunJxa.mockRejectedValue(new Error('Note not found: nonexistent'));

      await expect(updateNote('nonexistent', { title: 'New Title' })).rejects.toThrow(
        'Note not found'
      );
    });

    it('should throw error when no update parameters provided', async () => {
      await expect(updateNote('note-1', {})).rejects.toThrow();
    });

    it('should throw error when body exceeds 100KB', async () => {
      const largeBody = 'x'.repeat(100 * 1024 + 1); // 100KB + 1 byte

      await expect(updateNote('note-1', { body: largeBody })).rejects.toThrow(
        'Body exceeds maximum size'
      );
    });
  });

  describe('schema validation', () => {
    it('should return data matching UpdateNoteResultSchema', async () => {
      const result = await updateNote('note-1', { title: 'Test' });

      expect(() => UpdateNoteResultSchema.parse(result)).not.toThrow();
    });

    it('should include modificationDate in result', async () => {
      const result = await updateNote('note-1', { title: 'Test' });

      expect(result.modificationDate).toBeDefined();
      expect(typeof result.modificationDate).toBe('string');
    });
  });
});
