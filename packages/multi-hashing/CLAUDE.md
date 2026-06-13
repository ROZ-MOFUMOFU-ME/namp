# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) 向けのガイドです。

## マルチリポジトリ開発

このネイティブアドオンは、一体で開発される3リポジトリ構成の最下層です。**開発は `develop` ブランチで行い、`main` はリリース／プレリリース用です**（2026-06-13 に旧 dev/stable/old を main へ統合・整理し、その後 `develop` を切って開発を再開しました。区切りごとに develop → main をマージしてタグ（例 `v1.2.0-beta.0`）を切ります。このリポジトリの main は直接 push 可能です）。利用側はこのリポジトリを git 依存（`#main`＝リリース版）としてインストールします。兄弟リポジトリは隣のディレクトリにローカルクローンがある前提です:

```
../zny-nomp (ポータル本体)
  └─ ../node-stratum-pool (stratum ライブラリ)
       └─ multi-hashing (このリポジトリ — git 依存 ROZ-MOFUMOFU-ME/node-multi-hashing#main として公開)
```

各兄弟リポジトリにもそれぞれ CLAUDE.md があります。重要なポイント:

- 利用側はこのリポジトリを**ローカルパスではなく GitHub の `main` ブランチから**インストールします。ローカルの編集は `main` に push するまで `../node-stratum-pool` / `../zny-nomp` に届きません。ローカルクローンをリンクする場合:

```bash
npm link                                            # このリポジトリで実行（アドオンをビルド）
cd ../node-stratum-pool && npm link multi-hashing && npm link
cd ../zny-nomp          && npm link stratum-pool
```

- リンクしない場合: `main` に push してから、node-stratum-pool で `npm update multi-hashing`（さらに zny-nomp で `npm update stratum-pool`）を実行します。
- 主要な利用元は `../node-stratum-pool/lib/algoProperties.js`（`import multiHashing from 'multi-hashing'`）です。エクスポートされる各ハッシュ関数は `fn(dataBuffer, ...params) → Buffer` として呼ばれます。

## コマンド

```bash
npm install          # node-gyp がアドオンをビルド（binding.gyp）— C/C++ ツールチェーンと Python が必要
npm run build        # node-gyp rebuild
npm test             # mocha --require @babel/register --gc-global tests/test.vectors.js
```

ビルドは `-std=c++20` を使用します（`binding.gyp`）。Node 24 の V8 ヘッダが C++20 を要求するため、C++20 以上を維持してください。Node 24 でのビルドと全テストベクタの合格を確認済み（gcc 10 以上が必要）。

**ABI の注意点**: これは NAN ベースのアドオン（N-API ではない）のため、コンパイル済みの `build/Release/multihashing.node` はビルド時の Node ABI に固定されます。Node のバージョンを切り替えると、利用側で `Error: Module did not self-register` が発生します — ここで `npm run build` を再実行するか、利用側リポジトリで `npm rebuild multi-hashing` を実行してください。

## アーキテクチャ

- `index.js` は1行のみ: `require('bindings')('multihashing.node')` — API 全体がネイティブ側で定義されています。
- `src/multihashing.cc` が NAN バインディング層です: アルゴリズムごとに1つの `NAN_METHOD` があり、ファイル末尾の `NAN_MODULE_INIT(init)` で登録されます（`NAN_MODULE_WORKER_ENABLED` によりワーカースレッド対応）。各メソッドは Buffer 引数を検証し、C のハッシュ関数を呼んで Buffer を返します。
- アルゴリズム実装は `src/` にアルゴリズムごとに1ファイル（`x11.c`、`quark.c`、`neoscrypt.c`、…）で、共有プリミティブライブラリの上に構築されています:
  - `src/sha3/` — sph_* ハッシュプリミティブ（blake, bmw, cubehash, echo, groestl, jh, keccak, luffa, shavite, simd, skein, whirlpool, …）。チェーン型の X 系アルゴリズムが使用
  - `src/crypto/` — argon2、lyra2、yespower（yescrypt 系アルゴリズムもここで処理）、cryptonight の内部実装
  - `src/kawpow/` — ethash/kawpow の機構
- `binding.gyp` はコンパイル対象の全ソースを明示的に列挙し、`-std=c++20` を設定しています。

アルゴリズムの追加手順:
1. C/C++ 実装を `src/` 配下に追加し、`binding.gyp` の `sources` に列挙する。
2. `src/multihashing.cc` に `NAN_METHOD` を追加してエクスポートを登録する。
3. `npm run build` を実行し、`tests/vectors/` に既知解ベクタを追加して `tests/test.vectors.js` でカバーする。
4. 下流の `../node-stratum-pool/lib/algoProperties.js` に登録する（ハッシュラッパー＋難易度 multiplier）。
