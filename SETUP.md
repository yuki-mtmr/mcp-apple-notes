# Apple Notes MCP Server - セットアップガイド

## 完了した作業

✅ プロジェクト初期化
✅ JXA アダプター実装（stderr出力の修正済み）
✅ Notes サービス実装（4つの関数）
✅ MCP サーバー実装
✅ TypeScript ビルド成功
✅ 動作確認（Node.js経由でのテスト完了）

## 使用方法

### 1. Claude Desktop で使用

設定ファイルは既に更新済みです：
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**次のステップ：**
1. Claude Desktop を再起動してください
2. 再起動後、以下のツールが使えるようになります：
   - `list_notes` - メモ一覧を取得
   - `search_notes` - メモを検索
   - `read_note` - メモの内容を読む
   - `create_note` - 新しいメモを作成

### 2. 使用例（Claude Desktop で試せます）

**メモ一覧を取得：**
```
最新のメモを10件見せて
```

**メモを検索：**
```
「卒業制作」に関するメモを検索して
```

**メモを読む：**
```
「色々混ざってる」というメモの内容を教えて
```

**新しいメモを作成：**
```
「MCP Server テスト」というタイトルで「動作確認用のメモです」という内容のメモを作成して
```

## アクセシビリティ権限について

初回使用時、macOSから以下の権限を求められる場合があります：

1. **システム設定** > **プライバシーとセキュリティ** > **アクセシビリティ**
2. 「Claude」または「Code Helper」を探して有効化
3. Claude Desktop を再起動

## トラブルシューティング

### ツールが表示されない場合

1. Claude Desktop を完全に終了（Command + Q）
2. Claude Desktop を再起動
3. 新しい会話を開始

### "operation not permitted" エラー

- システム設定でアクセシビリティ権限を付与してください（上記参照）

### JXA 実行エラー

1. Apple Notes アプリが起動できることを確認
2. ターミナルで以下のコマンドでテスト：
   ```bash
   osascript -l JavaScript -e 'Application("Notes").notes().length'
   ```
   数字が返ってくればOK

## 技術詳細

### 修正した問題

- **JXA console.log の出力先**: JXAの`console.log`はstderrに出力されるため、stderrからJSONをパースするように修正しました
- **JSON パース**: JXAスクリプトの戻り値を正しくJSON形式で取得できるように修正

### アーキテクチャ

```
src/
├── index.ts          # MCPサーバーエントリポイント（Stdioトランスポート）
├── notes-service.ts  # Apple Notes操作ロジック（4つの関数）
└── jxa-adapter.ts    # JXA実行ラッパー（stderr対応済み）
```

### データフロー

```
Claude Desktop
    ↓ (MCP Protocol via stdio)
index.ts (MCPサーバー)
    ↓ (関数呼び出し)
notes-service.ts
    ↓ (JXAスクリプト実行)
jxa-adapter.ts
    ↓ (osascript)
Apple Notes.app
```

## 次のステップ（オプション）

現在はローカル（stdio）接続のみですが、将来的には以下の機能を追加できます：

1. **リモート接続（SSE）**: iPhoneやネットワーク経由でアクセス
2. **追加機能**:
   - メモの更新（update_note）
   - メモの削除（delete_note）
   - フォルダ管理
   - 添付ファイルの取得

詳細は [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) を参照してください。

## サポート

問題が発生した場合は、以下を確認してください：

1. ビルドが成功しているか: `npm run build`
2. サーバーが起動できるか: `node dist/index.js` (Ctrl+Cで停止)
3. JXAが動作するか: `osascript -l JavaScript -e 'Application("Notes").notes().length'`

それでも解決しない場合は、エラーメッセージと共にissueを作成してください。
