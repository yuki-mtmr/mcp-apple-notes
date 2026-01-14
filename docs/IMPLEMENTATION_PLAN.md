# Apple Notes MCP Server 実装計画書

この計画書は、Claude Code (およびその他のAIエージェント) が「Mac Notes MCP Server」を実装するためのマスタープランです。
最終目標は **iPhoneや外部ネットワークから利用可能なHybrid MCPサーバー** の構築です。

## プロジェクト概要
- **目的**: macOS Apple Notesを操作可能にし、ローカルおよびリモート(iPhone)から利用する。
- **技術スタック**: Node.js (TypeScript), MCP SDK, JXA (JavaScript for Automation).

## 現在の進捗状況
- [x] **Phase 1: プロジェクト初期化** (Step 1)
  - [x] `package.json`, `tsconfig.json` 作成完了
  - [x] 依存関係のインストール
- [x] **Phase 2: 基盤実装** (Step 2)
  - [x] `src/jxa-adapter.ts` (JXA実行ラッパー) 実装完了
- [x] **Phase 3: コア機能実装** (Step 3)
  - [x] `src/notes-service.ts` (メモ操作ロジック)
  - [x] Zodスキーマ定義
  - [x] `listNotes`, `searchNotes`, `readNote`, `createNote` 実装完了
- [x] **Phase 4: サーバー実装** (Step 4)
  - [x] `src/index.ts` (MCPサーバーエントリポイント)
  - [x] ツール登録とハンドラー実装
  - [x] 4つのツール（list_notes, search_notes, read_note, create_note）実装完了
- [x] **Phase 5: テストと検証** (Step 5)
  - [x] ビルド設定（package.jsonにスクリプト追加）
  - [x] ビルド成功確認
  - [x] サーバー起動確認
  - [ ] MCP Inspector での動作テスト（推奨）
  - [ ] Claude Desktop での統合テスト（推奨）
- [ ] **Phase 6: リモート対応** (将来実装)
  - [ ] SSE Server実装

---

## 次に実行すべき実装ステップ (AIエージェント向け指示書)

### Step 3: ノート操作サービスの実装 (`src/notes-service.ts`)
Apple Notesを操作する具体的な関数群を実装してください。`runJxa` を使用します。
各関数はエラーハンドリングを適切に行い、Zodスキーマに適合するデータを返却する必要があります。

**実装する関数:**
1.  **`listNotes(limit: number = 100)`**
    *   JXA: `Application("Notes").notes` から `id, name, modificationDate, creationDate` を取得
    *   ソート: 更新日順 (descending)
    *   limitパラメータでメモ数を制限（デフォルト100件）
    *   戻り値: `Array<{id: string, name: string, modificationDate: string, creationDate: string}>`

2.  **`searchNotes(query: string, limit: number = 50)`**
    *   JXA: 名前または本文にクエリを含むメモをフィルタリング
    *   **パフォーマンス最適化**:
      - まず名前（タイトル）で検索し、該当がなければ本文を検索
      - limit パラメータで検索結果を制限
      - 大文字小文字を区別しない検索
    *   戻り値: `listNotes` と同じ形式

3.  **`readNote(nameOrId: string)`**
    *   JXA: 指定されたIDまたは名前のメモの詳細を取得
    *   取得情報: `id, name, body (HTML), plaintext, modificationDate, creationDate`
    *   IDでの検索を優先し、見つからない場合は名前で検索
    *   戻り値: `{id: string, name: string, body: string, plaintext: string, modificationDate: string, creationDate: string}`

4.  **`createNote(title: string, body: string)`**
    *   JXA: 新規メモを作成
    *   **セキュリティ**: HTMLエンティティのエスケープ処理が必要
    *   デフォルトアカウントの最初のフォルダに作成
    *   戻り値: 作成されたメモの `{id: string, name: string}`

**エラーハンドリング:**
- JXA実行エラー時は適切なエラーメッセージを返す
- メモが見つからない場合は明確なエラーメッセージ
- パーミッションエラーの適切な処理

### Step 4: MCPサーバーのエントリポイント実装 (`src/index.ts`)
MCP SDKを使用してサーバーを起動します。

1.  **McpServer インスタンス化**:
    *   名前: "mac-notes-mcp"
    *   バージョン: "1.0.0"

2.  **ツール定義 (Tool Registration)**:
    以下の4つのツールを登録し、それぞれに適切なZodスキーマを定義:

    *   **`list_notes`**: 既存メモのリスト取得
        - 入力: `{limit?: number}` (オプション、デフォルト100)
        - 出力: メモのリスト (id, name, modificationDate, creationDate)

    *   **`search_notes`**: メモ検索（テキストマッチ）
        - 入力: `{query: string, limit?: number}` (limitはオプション、デフォルト50)
        - 出力: 検索結果のメモリスト

    *   **`read_note`**: メモの詳細取得
        - 入力: `{nameOrId: string}`
        - 出力: メモの完全な内容 (id, name, body, plaintext, 日付情報)

    *   **`create_note`**: 新規メモ作成
        - 入力: `{title: string, body: string}`
        - 出力: 作成されたメモの基本情報 (id, name)

3.  **ハンドラー実装**:
    *   各ツールのリクエストハンドラーで `notes-service.ts` の関数を呼び出す
    *   エラーハンドリングとログ出力を適切に行う
    *   戻り値を適切なMCPレスポンス形式に変換

4.  **トランスポート設定**:
    *   `StdioServerTransport` を使用してstdin/stdoutで接続
    *   エラーログは stderr に出力

### Step 5: ビルドと動作確認
1.  **package.json にスクリプト追加**:
    ```json
    {
      "scripts": {
        "build": "tsc",
        "watch": "tsc --watch",
        "start": "node dist/index.js"
      }
    }
    ```

2.  **ビルド実行**:
    ```bash
    npm run build
    ```
    - TypeScriptのコンパイルエラーがないことを確認
    - `dist/` ディレクトリにJSファイルが生成されることを確認

3.  **動作確認**:
    ```bash
    node dist/index.js
    ```
    - エラーなく起動し、Stdio待ち受け状態になることを確認
    - macOS のアクセシビリティ権限が必要な場合は許可する

4.  **MCP Inspector での動作テスト** (推奨):
    - MCP Inspector を使用してツールの動作を確認
    - 各ツール (list_notes, search_notes, read_note, create_note) が正常に動作することを確認
    - エラーケースの動作確認 (存在しないメモの読み取りなど)

5.  **Claude Desktop での統合テスト**:
    - `claude_desktop_config.json` に設定を追加
    - Claude Desktop から実際にメモ操作ができることを確認

---

---

## 将来の拡張 (Phase 6: Remote/Hybrid)
ローカル動作確認後、以下の順で拡張します。

### SSE (Server-Sent Events) による遠隔接続対応
1.  **Express サーバーの導入**:
    *   `express` と関連パッケージのインストール
    *   HTTPサーバーとMCPサーバーの統合

2.  **SSE エンドポイントの実装**:
    *   `/sse` エンドポイントでMCPプロトコルを処理
    *   認証トークンによるアクセス制御
    *   タイムアウトとコネクション管理

3.  **セキュリティ対策**:
    *   API キーまたはトークンベース認証
    *   HTTPS対応（本番環境）
    *   レート制限の実装
    *   IP制限（オプション）

4.  **iPhone (Shortcuts) からの接続**:
    *   Shortcuts アプリからのHTTPリクエスト設定
    *   認証ヘッダーの設定
    *   レスポンスの解析と表示

### 追加機能の検討
- メモの更新機能 (`update_note`)
- メモの削除機能 (`delete_note`)
- フォルダ管理機能
- 添付ファイルの取得
- メモの共有機能

---

## 技術的制約事項と注意点

### JXA関連
- **戻り値の制約**: JXAの戻り値は必ずJSONシリアライズ可能なオブジェクトであること
- **パフォーマンス**: Apple Notesアプリが大量のメモを持つ場合、JXAの実行が遅くなる可能性がある
  - limit パラメータを適切に使用してパフォーマンスを最適化
  - 必要最小限のプロパティのみ取得
- **エラーハンドリング**: JXAスクリプトのエラーは適切にキャッチして分かりやすいメッセージに変換

### セキュリティ
- **Write操作**: メモの作成・更新・削除は慎重に実装
  - 現在はCreateのみを実装し、Delete/Updateは後回しでも良い
  - 入力値のサニタイゼーション（HTMLインジェクション対策）
- **アクセス権限**: macOSのアクセシビリティ権限が必要
- **データの機密性**: Apple Notesには個人情報が含まれる可能性があるため、リモート接続時は認証・暗号化を必須とする

### 開発環境
- **macOS専用**: このMCPサーバーはmacOS専用（JXAを使用するため）
- **Node.js バージョン**: Node.js 18以上を推奨
- **TypeScript**: 厳格な型チェックを有効化

---

## トラブルシューティング

### よくある問題
1.  **"operation not permitted" エラー**:
    - システム環境設定 > プライバシーとセキュリティ > アクセシビリティ
    - ターミナルまたはVS Codeにアクセス権を付与

2.  **JXA実行エラー**:
    - Apple Notesアプリが起動していることを確認
    - JXAスクリプトの構文を確認

3.  **MCPサーバーが応答しない**:
    - ログを確認（stderr出力）
    - ビルドが成功しているか確認
    - トランスポート設定が正しいか確認

### デバッグ方法
- `console.error()` を使用してログをstderrに出力
- JXAスクリプトを単体でテスト（`osascript` コマンド）
- MCP Inspector を使用してツールの動作を確認
