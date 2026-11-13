# CardGame Asset Manager（デュエマ カード管理）

デュエル・マスターズのカード（メインデッキ・超次元・GR）と、キューブの中身を管理する Web アプリです。
素の HTML / CSS / JavaScript（ビルドなし）。データは Firebase（Cloud Firestore）、ログインは Google ログインです。

- **公開 URL**：https://hiroki030122.github.io/CardGame_Asset_manager/（ゲーム選択）。デュエマは https://hiroki030122.github.io/CardGame_Asset_manager/duema/
- **見る**：誰でも（ログイン不要）。URL を共有すれば、そのままリストを見せられます。
- **書き換える**：管理者だけ。右上の「Google でログイン」から。管理者以外のアカウントでは編集できません。
- 仕様は [SPEC.md](SPEC.md)、開発のルールは [CLAUDE.md](CLAUDE.md)。

## 使い方
- **検索**：メインデッキ・超次元・GR を同時に検索。**カード一覧**：台帳ごとの一覧。
- **キューブ**：キューブごとのタブ。メインデッキ・超次元・GR を入れ、超次元の対応を付け、表示（すべて／メインデッキ／超次元／GR／対応／分布）を切り替えて見ます。
- **超次元**：キューブごとの超次元の対応（対応表示／ドラフト時に入手できる超次元）。
- **集計**：メインデッキ全体と各キューブの枚数・文明・コスト・区分・属性・役割・クロス集計・比較表。
- **設定**：選択肢（属性・役割・区分）、キューブの追加・並べ替え、JSON の書き出し・取り込み（バックアップ）。

## 注意
- 読み取りは誰でもできる設定なので、**カード名・メモ・所持枚数は世界中から見えます**。個人情報や見せたくないメモは入れないでください。
- 定期的に、設定画面から JSON を書き出してバックアップしてください。
- 動作確認は `duema/` の URL に `?game=duema-test` を付けて行うと、本物のデータとは別の場所に保存されます。

## ローカルで動かす
VS Code の拡張機能「Live Server」で `index.html`（ゲーム選択）を開く（または `npx serve .`）。`file://` では動きません。
計算のテストは、Live Server で `tests/calc.test.html` を開くと動きます。

## 公開のしかた（GitHub Pages）
1. 変更をコミットして `main` にプッシュ。
2. GitHub のリポジトリ → Settings → Pages → Source：`Deploy from a branch`、Branch：`main` / `/ (root)` → Save。
3. 数分後、上の公開 URL で開けます。Google ログインは、Firebase の「承認済みドメイン」に `hiroki030122.github.io` が入っていれば使えます。

## ゲームを増やすとき
1. データは `games/<ゲーム名>` に置く（ゲームごとに分かれる）。
2. `<ゲーム名>/index.html` を作る（`duema/index.html` を参考に）。
3. ゲーム選択の `index.html` の `GAMES` に 1 行足す（作る前は `soon: true`）。
