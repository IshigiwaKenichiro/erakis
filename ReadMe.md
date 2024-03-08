# Erakis
kintoneのシンプルなカスタマイズ開発環境です。   
windows対象(2024年3月時点)

## Install
必要な作業は以下の２つです。
- 前提条件の準備
    - parcelのインストール
    - mkcertのインストール（任意）
- Erakisのインストール

### 前提条件
[parcel.v2](https://parceljs.org/)のインストール
```
npm i parcel
```

[mkcert](https://github.com/FiloSottile/mkcert)のインストール（なくても使えますが、devServerでのホスティングができません。）
```
# windows
choco install mkcert
```
---
### 本体のインストール
```
npm i https://github.com/IshigiwaKenichiro/erakis.git
```
---

## Usage
```
# セットアップ
npx erakis init

# 自己証明書と秘密鍵の生成
npx erakis genkey

# プロファイルの作成(一度作ると何度でもつかえます。)
npx erakis profile add

# アプリとの紐づけ
npx erakis app connect

# 開発の開始
npx erakis start

```


## Commands
### init
- npx erakis init
    - プロジェクトのセットアップ。安全な再生成。
### genkey
- npx erakis genkey
    - HTTPSで利用する自己証明書を作成する。(localhostでソースを公開するため。)

### profile
- npx erakis profile add
    - kintoneアクセスデータの登録
- npx erakis profile list
    - kintoneアクセスデータの一覧表示
- npx erakis profile update < profileName >
    - kintoneアクセスデータの更新
- npx erakis profile remove < profileName >
    - kintoneアクセスデータの削除

### app
- npx erakis app connect < appName >
    - kintone上のアプリとカスタマイズの紐づけ。
- npx erakis app status
    - kintoneカスタマイズの状態表示
- npx erakis app codegen
    - ソースファイルの再生成
- npx erakis app open
    - アプリを開く

### start
- npx erakis start
    - 開発を開始する。

### build
- npx erakis build
    - ソースコードを本番向けにビルドする。

### launch
- npx erakis launch app
    - kintoneアプリのカスタマイズ状態を変える（デフォルトはlocal）
- npx erakis launch all
    - 配下のkintoneアプリのカスタマイズ状態をまとめて変える

### clear
- npx erakis clear
    - dist, buildディレクトリを削除する。


## license
MIT License.

