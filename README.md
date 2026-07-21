# STEAM / OVW

Steamで「圧倒的に好評」のゲームを抽出し、レビュー数が多い順に表示する非公式Webアプリです。GitHub Pagesだけで公開できます。

## GitHub Pagesで公開する方法

1. ZIPを解凍する
2. `steam-overwhelming-ranking` フォルダの「中身」をGitHubリポジトリのルートへアップロードする
3. Settings → Pages を開く
4. Sourceを `Deploy from a branch`、Branchを `main`、Folderを `/(root)` にする
5. 数分後に `https://ユーザー名.github.io/リポジトリ名/` を開く

今回のリポジトリ名が `steam-serch` の場合、公開URLは次のとおりです。

`https://sthsz7t74m-glitch.github.io/steam-serch/`

## データ更新

`.github/workflows/update-steam-data.yml` が毎日午前3時ごろ（日本時間）にSteamの公開検索結果を取得し、`games.json` を更新します。初回アップロード時にも自動実行されます。

GitHubの「Actions」→「Update Steam ranking data」→「Run workflow」から手動更新もできます。

## 主な機能

- GitHub ActionsがSteamの検索結果から「圧倒的に好評」を抽出
- レビュー数・高評価率・タイトルで並べ替え
- タイトル検索と最低レビュー数フィルター
- 25〜200件の表示件数切り替え
- 表示結果のCSV保存
- 更新に失敗しても直前のデータを保持
- スマートフォン対応の白黒・太字ゴシックUI

## 注意

Steamの検索ページ仕様が変わった場合は、`scripts/update-data.mjs` の解析処理を調整する必要があります。価格・評価・レビュー数は取得時点の情報です。このアプリはValve CorporationおよびSteamの公式アプリではありません。
