# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-01-14

### Added
- **batch_move_notes**: New tool for moving multiple notes in a single JXA operation
- Timeout handling for JXA operations (30s default, 60-120s for batch/move operations)
- Better error messages for failed operations

### Fixed
- **EPIPE error crashes**: Server now handles broken pipe errors gracefully when Claude Desktop disconnects
- **Unhandled rejections**: Logged but no longer crash the server

### Performance Optimizations
- **moveNote**: Now searches notes by folder first instead of iterating all notes
- **Batch operations**: Single JXA call instead of multiple calls for bulk moves
- **Subfolder support**: Recursive search for target folders in nested structures

### Changed
- Improved error handling to prevent process exits on connection issues
- Enhanced README with performance tips and troubleshooting

## [1.0.0] - 2026-01-14

### Added
- Initial release
- list_notes with folder information and preview text
- search_notes for finding notes by title or content
- read_note for getting full note content
- create_note for creating new notes
- list_folders for listing all folders with nested structure
- move_note for moving notes between folders
