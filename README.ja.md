[English](README.md) | [日本語](README.ja.md)

# Apple Notes MCP Server

macOS上のApple Notesにアクセスするための MCP (Model Context Protocol) サーバーです。ClaudeなどのAIアシスタントがApple Notesアプリのメモを読み取り、検索、作成できるようになります。

## 機能

- **メモ一覧取得**: 更新日時順にソートされたメモの一覧をフォルダ情報付きで取得
- **メモ検索**: タイトルまたは内容でメモを検索
- **メモ読み取り**: 特定のメモの全内容を取得
- **メモ作成**: Apple Notesに新しいメモを作成
- **メモ更新**: 既存メモのタイトルまたは本文を更新
- **メモ削除**: メモを削除（「最近削除した項目」に移動）
- **要約用メモ取得**: AI要約に最適化されたメモ内容を取得
- **フォルダ一覧取得**: ネストされた構造でフォルダを一覧表示
- **メモ移動**: メモを別のフォルダに移動
- **メモ一括移動**: 複数のメモを一度に効率的に移動

## 前提条件

- macOS（JXA - JavaScript for Automation が必要）
- Node.js 18以上
- Apple Notesアプリ

## インストール

### クイックスタート（推奨）

Claude Desktopの設定ファイル（`~/Library/Application Support/Claude/claude_desktop_config.json`）でnpxを直接使用:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "npx",
      "args": ["-y", "mcp-apple-notes"]
    }
  }
}
```

### グローバルインストール

```bash
npm install -g mcp-apple-notes
```

Claude Desktopの設定:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "mcp-apple-notes"
    }
  }
}
```

### ソースからインストール

1. リポジトリをクローン:
```bash
git clone https://github.com/yuki-mtmr/mcp-apple-notes.git
cd mcp-apple-notes
```

2. インストールとビルド:
```bash
npm install
npm run build
```

3. Claude Desktopの設定（`~/Library/Application Support/Claude/claude_desktop_config.json`）:
```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-apple-notes/dist/index.js"]
    }
  }
}
```

`/absolute/path/to/mcp-apple-notes` を実際のプロジェクトパスに置き換えてください。

## 使い方

Claude Desktopを再起動すると、Apple Notesツールが利用可能になります。

### MCP Inspectorでテスト

テスト用に [MCP Inspector](https://github.com/modelcontextprotocol/inspector) を使用できます:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

すべてのツールをテストできるWebインターフェースが開きます。

### 利用可能なツール

#### 1. list_notes

更新日時順（最新順）にメモを一覧表示し、フォルダ情報も含めます。

**パラメータ:**
- `limit`（任意、デフォルト: 100）: 返すメモの最大数。一括分類操作には500以上を使用
- `includePreview`（任意、デフォルト: true）: 簡易分類用にプレーンテキストの最初の200文字を含める

**例:**
```json
{
  "limit": 500,
  "includePreview": true
}
```

**パフォーマンス**: 大規模なコレクションに最適化。フルメタデータ取得前に効率的にソート。

#### 2. search_notes

クエリ文字列でメモを検索（タイトルと内容の両方を検索）。

**パラメータ:**
- `query`（必須）: 検索クエリテキスト（大文字小文字を区別しない）
- `limit`（任意、デフォルト: 50）: 返す結果の最大数

**例:**
```json
{
  "query": "会議メモ",
  "limit": 20
}
```

#### 3. read_note

特定のメモの全内容を読み取ります。

**パラメータ:**
- `nameOrId`（必須）: 取得するメモのIDまたは名前

**例:**
```json
{
  "nameOrId": "重要なメモ"
}
```

#### 4. create_note

Apple Notesに新しいメモを作成します。

**パラメータ:**
- `title`（必須）: 新しいメモのタイトル
- `body`（必須）: メモの本文（プレーンテキスト）

**例:**
```json
{
  "title": "新しいメモ",
  "body": "これは新しいメモの内容です。"
}
```

#### 5. list_folders

Apple Notesのすべてのフォルダをネスト構造で一覧表示（「最近削除した項目」を除く）。

**例:**
```json
{}
```

**返り値:** `id`、`name`、`accountName`、`noteCount`、`path`、およびオプションの`subfolders`を含むフォルダの配列。

#### 6. move_note

単一のメモを別のフォルダに移動します。

**パラメータ:**
- `noteId`（必須）: 移動するメモのID
- `targetFolderId`（必須）: 移動先フォルダのID

**例:**
```json
{
  "noteId": "x-coredata://...../ICNote/p123",
  "targetFolderId": "x-coredata://...../ICFolder/p456"
}
```

**パフォーマンス**: 全メモを走査せず、フォルダごとにメモを検索するよう最適化。

#### 7. batch_move_notes

複数のメモを1回のJXA操作でフォルダに移動。`move_note`を複数回呼び出すより**はるかに高速**です。

**パラメータ:**
- `noteIds`（必須）: 移動するメモIDの配列
- `targetFolderId`（必須）: 移動先フォルダのID

**例:**
```json
{
  "noteIds": ["x-coredata://.../p123", "x-coredata://.../p124", "x-coredata://.../p125"],
  "targetFolderId": "x-coredata://...../ICFolder/p456"
}
```

**パフォーマンス**: 一括操作（例: 100以上のメモの分類）に最適。複数のJXA呼び出しではなく、1回の呼び出しで実行。

#### 8. update_note

既存のメモのタイトルや本文を更新します。

**パラメータ:**
- `noteId`（必須）: 更新するメモのID
- `title`（任意）: メモの新しいタイトル
- `body`（任意）: 新しい本文（プレーンテキスト）

`title` または `body` のいずれか1つ以上を指定する必要があります。

**例:**
```json
{
  "noteId": "x-coredata://...../ICNote/p123",
  "title": "更新されたタイトル",
  "body": "これは更新された内容です。"
}
```

#### 9. delete_note

Apple Notesからメモを削除します。メモは「最近削除した項目」フォルダに移動されます。

**パラメータ:**
- `noteId`（必須）: 削除するメモのID

**例:**
```json
{
  "noteId": "x-coredata://...../ICNote/p123"
}
```

**注意**: 削除されたメモは、Apple Notesの「最近削除した項目」フォルダから30日以内に復元できます。

#### 10. get_note_for_summary

AI要約に最適化されたメモ内容を取得します。要約に役立つメタデータ付きのプレーンテキストを返します。

**パラメータ:**
- `nameOrId`（必須）: 取得するメモのIDまたは名前

**例:**
```json
{
  "nameOrId": "会議メモ 2024"
}
```

**返り値:** `id`、`name`、`plaintext`、`creationDate`、`modificationDate`、`folderName`、`wordCount`、`characterCount`を含むオブジェクト。

## 権限設定

このサーバーを初めて実行する際、macOSがアクセシビリティ権限の付与を求めることがあります。以下の手順で設定してください:

1. **システム設定** > **プライバシーとセキュリティ** > **アクセシビリティ** に移動
2. ターミナルアプリケーション（Terminal、iTerm2、またはVS Code）を追加
3. アプリケーションのトグルを有効にする

## 開発

### プロジェクト構造

```
mcp-apple-notes/
├── src/
│   ├── index.ts           # MCPサーバーエントリーポイント
│   ├── notes-service.ts   # Apple Notes操作
│   └── jxa-adapter.ts     # JXA実行ラッパー
├── dist/                  # コンパイル済みJavaScript（生成される）
├── docs/                  # ドキュメント
│   └── IMPLEMENTATION_PLAN.md
├── package.json
├── tsconfig.json
└── README.md
```

### ビルドコマンド

- `npm run build`: TypeScriptをJavaScriptにコンパイル
- `npm run watch`: 開発用ウォッチモード
- `npm start`: コンパイル済みサーバーを実行

### テスト

サーバーはstdioトランスポートを使用するため、stdinでJSON-RPCメッセージを受け取り、stdoutで応答します。エラーログはstderrに送信されます。

手動テスト:
1. MCP Inspector を使用（推奨）
2. または上記の設定でClaude Desktopを使用

## セキュリティに関する注意

- **作成、更新、削除**操作がメモ管理に利用可能
- 削除されたメモは「最近削除した項目」フォルダに移動され、30日以内に復元可能
- HTMLコンテンツはインジェクション攻撃を防ぐためエスケープされます
- すべての操作にはmacOSアクセシビリティ権限が必要

## トラブルシューティング

### 「operation not permitted」エラー

ターミナル/IDEにアクセシビリティ権限を付与してください:
- **システム設定** > **プライバシーとセキュリティ** > **アクセシビリティ**
- ターミナルアプリケーションを追加して有効化

### JXA実行エラー

- Apple Notesアプリがインストールされ、開けることを確認
- 簡単なJXAコマンドでテスト: `osascript -l JavaScript -e "Application('Notes').notes().length"`

### サーバーが応答しない

- ビルドが成功したか確認: `ls -la dist/`
- Node.jsのバージョンを確認: `node --version`（18以上であること）
- stderrログでエラーメッセージを確認

### Claude Desktopの「process exited with code 1」エラー

このエラーは適切に処理されるようになりました:
- **EPIPEエラー**（クライアント切断時のブロークンパイプ）でサーバーがクラッシュしなくなりました
- 未処理のリジェクションはログに記録されますが、プロセスは終了しません
- 詳細は `~/Library/Logs/Claude/mcp-server-apple-notes.log` のMCPログを確認

### 一括操作のパフォーマンス問題

多くのメモを移動する場合:
- ✅ `move_note`を複数回呼び出す代わりに **`batch_move_notes`を使用**
- ✅ `list_notes`で**高いlimit**（例: 500）を設定して1回の呼び出しで全メモを取得
- サーバーには大規模操作でのハングを防ぐタイムアウト（30〜120秒）が含まれています

## パフォーマンス最適化

このサーバーには大規模なメモコレクションを処理するためのいくつかの最適化が含まれています:

1. **効率的なソート**: フルメタデータ取得前に更新日時でソート
2. **フォルダベースの検索**: メモ移動時、全メモを走査せずフォルダごとに検索
3. **バッチ操作**: `batch_move_notes`は1回のJXA呼び出しで複数の移動を実行
4. **タイムアウト**: ハングを防ぐ設定可能なタイムアウト（デフォルト30秒、バッチ操作は60〜120秒）
5. **エラーハンドリング**: EPIPEと接続エラーはクラッシュせず適切に処理

## 今後の機能拡張

計画中の機能については [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) を参照:

- SSE（Server-Sent Events）によるリモートアクセス
- ショートカットを介したiPhone連携
- 添付ファイルサポート

## ライセンス

ISC

## コントリビューション

コントリビューションを歓迎します！イシューやプルリクエストをお気軽に送信してください。
