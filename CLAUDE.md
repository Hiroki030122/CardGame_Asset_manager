# CLAUDE.md

このリポジトリは、デュエマのカード管理 Web アプリ（所持カード・キューブ・超次元・GR の管理）。
仕様はすべて `SPEC.md` にある。**作業の前に必ず読むこと。**

## 構成の前提
- GitHub Pages で公開する静的サイト。データは Firebase（Cloud Firestore）、ログインは Firebase Authentication の Google ログイン。
- 閲覧は誰でも、書き込みは管理者（`app-config.js` の `ADMIN_UID`）だけ。書き込みの制限は Firestore のルールで行う。

## 約束事
- 画面の文言・コメント・コミットメッセージは日本語。
- ビルドツールは使わない。素の HTML / CSS / JavaScript（ES Modules）。npm パッケージを追加しない。
- 外部ライブラリは Firebase JS SDK（gstatic から ES Modules）と SheetJS（CDN）だけ。どちらも版を固定し、全ファイルで同じ版を使う。グラフはライブラリを使わず SVG／CSS で描く。
- `firebase-config.js` は書き換えない。
- 計算（使用枚数・残り・集計）は `js/calc.js` に純粋関数としてまとめる。画面のコードに計算を書き散らさない。calc.js を変えたら `node tests/calc.test.mjs` を通す。
- Firestore への書き込みは `js/actions.js` に集める。データの置き方（SPEC.md 3-2）に従い、フィールド単位で更新する（チャンクのドキュメントを丸ごと上書きしない）。
- データ形式を変えるときは `schemaVersion` を上げ、古い形式を読み込んで変換する処理を入れる。
- カード名・メモなどの文字列は `textContent` などで入れる。`innerHTML` に生の文字列を入れない。
- 削除・置き換えなど元に戻せない操作は、必ず確認ダイアログを出す。
- スマホ（幅 360px）で横スクロールが出ないこと。ボタンは指で押しやすい大きさに。
- `SPEC.md` 8 章の順番で 1 段階ずつ作る。段階の初めに計画（作る・変えるファイルと確認手順）を示し、OK をもらってから書く。段階の終わりに動作確認の手順を示し、確認が済んでからコミットする。
- SPEC.md と違うことをしたくなったら、先に理由を説明して相談する。決まったら SPEC.md も直す。

## 動かし方
- VS Code の Live Server、または `npx serve .` で開く。
- **動作確認は必ず `?game=duema-test` を付けて行う**（本物のデータ `games/duema` を触らない）。
