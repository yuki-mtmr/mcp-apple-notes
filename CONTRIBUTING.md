# Contributing to mcp-apple-notes

Thank you for your interest in contributing to mcp-apple-notes!

## How to Contribute

### Reporting Issues

1. **Search existing issues** - Check if your issue has already been reported
2. **Create a new issue** - Use a clear, descriptive title
3. **Provide details**:
   - macOS version
   - Node.js version
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages (if any)

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Write/update tests** (TDD is required - see below)
5. **Run tests**
   ```bash
   npm test
   npm run test:coverage  # Ensure 80%+ coverage
   ```
6. **Build the project**
   ```bash
   npm run build
   ```
7. **Commit with a descriptive message**
   ```bash
   git commit -m "機能追加: 新機能の説明"
   ```
8. **Push and create a PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-apple-notes.git
cd mcp-apple-notes

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode for development
npm run watch
```

### Test-Driven Development (TDD)

This project follows strict TDD practices:

1. **Write test first** - Create a failing test
2. **Run test** - Verify it fails
3. **Implement** - Write minimal code to pass
4. **Run test** - Verify it passes
5. **Refactor** - Improve code while keeping tests green

Minimum test coverage: **80%**

### Code Style

- Use TypeScript
- Follow existing code patterns
- Keep functions small and focused
- Add JSDoc comments for public APIs
- Use meaningful variable/function names

### Commit Message Format

```
動詞: 変更内容の要約（50文字以内）

詳細な説明（必要に応じて）
```

Examples:
- `機能追加: ノートの更新機能を実装`
- `修正: フォルダ一覧取得のエラーハンドリング`
- `リファクタ: JXAアダプタの共通処理を抽出`

## Questions?

Feel free to open an issue for any questions about contributing.
