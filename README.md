# Steam 圧倒的に好評ランキング

Steamが通算評価を実際に「Overwhelmingly Positive（圧倒的に好評）」と判定したゲームを、通算レビュー数の多い順に最大200件表示する、GitHub Pages向けの静的Webアプリです。

## ランキング定義

1. Steam検索のゲームカテゴリーをレビュー数の多い順に走査
2. Steamレビュー集計APIの `review_score = 9`（Overwhelmingly Positive）のみ採用
3. `total_reviews` の降順でランキング
4. App IDで重複を除外
5. 最大200件

95%以上という推測だけでは決めず、Steamが返す評価区分を最終判定に使います。

## GitHubへ上げる方法

このフォルダの「中身」を、`steam-serch` リポジトリの直下へすべて上書きアップロードしてください。

重要：`.github` フォルダも必ずアップロードしてください。ここに毎日の自動取得設定が入っています。

Pages設定は次のままで動きます。

- Source: Deploy from a branch
- Branch: main
- Folder: /(root)

初回アップロード時にGitHub Actionsが動き、`games.json`を更新します。Actionsが完了してからPagesへ反映されるまで数分かかることがあります。

## データ取得に失敗した場合

- 初回失敗：ゲーム一覧は空のまま、画面に取得失敗を表示
- 更新失敗：最後に成功したデータを「前回取得データ」と明示して表示
- ダミーデータや手入力のランキングは使用しません

GitHubの「Actions」タブから `Update Steam ranking data` を手動実行できます。

## ローカルテスト

```bash
npm test
```

データ更新を試す場合：

```bash
npm run update
```

Steamへのアクセスが制限された環境では失敗表示になります。
