# Write Now

[中文](#中文) · [English](#english)

![Write Now](docs/screenshot.png)

---

## 中文

Write Now 是一个 macOS 上的剧本写作软件。打开就是一张纸，只管写；场次、人物、台词、括号、转场由它自己认出来、排好。稿子存成纯文本（Fountain），别的软件也能打开。

全程离线，不联网，不上传。

### 能做什么

- **三种排法**（菜单「排法」）：中文剧本、美式剧本（Courier、标准缩进）、日文竖排台本。
- **中文不用记符号**：「1. 外景.屋顶.日」「12、内景 客厅 夜」这样的场次行自己认；人名不用加 `@`，后面紧跟台词就算。也认 Fountain 的全部写法。
- **左侧导航**：平时隐藏，鼠标靠到左边出现。列出同一文件夹里的其他剧本、本稿的场次；场号从头重数时自动分出序列。⇧⌘L 让它常显。
- **封面**（⇧⌘T）：稿首写「标题：／编剧：／日期：／联系：」（英文 Title:／Author: 等）就是封面，没有就插一份模板。打印和导出时封面单独一页。
- **导出 PDF**（⇧⌘E）：A4，直接存文件。
- **导出 Word**：出 `.docx`，Word 和 Pages 都能打开，版式跟当前排法走。
- **打印**（⌘P）、查找（⌘F）、放大缩小、撤销重做。
- 打开 `.fountain`、`.txt`、`.md`。

### 下载

到 [Releases](../../releases) 下载 `Write-Now-0.3.0-arm64.dmg`（Apple 芯片，macOS 11 及以上）。

安装包没有经过苹果的付费签名，第一次打开时系统会拦一下：在「应用程序」里右键 Write Now，选「打开」，再点「打开」。如果仍然打不开，在终端运行 `xattr -dr com.apple.quarantine "/Applications/Write Now.app"`。

### 从源码构建

需要 Rust（2024 edition）和 Node（只跑测试用）。

```sh
node tests/model.cjs      # 解析、封面、Word 导出的测试
cargo test
./scripts/bundle.sh       # 出 dist/Write Now.app 与 dmg
```

界面是 `ui/` 下的 HTML、CSS、JS，由 [wry](https://github.com/tauri-apps/wry) 装进原生窗口；`src/main.rs` 管菜单、文件、导出。

---

## English

Write Now is a screenwriting app for macOS. It opens on a blank page and you just write; it recognises scene headings, characters, dialogue, parentheticals and transitions and lays them out for you. Scripts are saved as plain text (Fountain), so other apps can open them.

It runs fully offline and uploads nothing.

### What it does

- **Three layouts** (Layout menu): Chinese script, US screenplay (Courier, standard margins), and Japanese vertical script.
- **Chinese without markup**: scene lines such as 「1. 外景.屋顶.日」 are recognised as they are, and a name followed by a line of dialogue is a character, no `@` needed. All Fountain syntax works too.
- **Side rail**: hidden while you write, it appears when the mouse reaches the left edge. It lists the other scripts in the same folder and the scenes of this one, and splits the scenes into sequences when the numbering restarts. ⇧⌘L keeps it open.
- **Title page** (⇧⌘T): a first block of `Title:` / `Author:` / `Draft date:` / `Contact:` lines is the title page; if there is none, a template is inserted. It prints on a page of its own.
- **Export PDF** (⇧⌘E): A4, saved straight to a file.
- **Export Word**: writes a `.docx` that Word and Pages open, in the current layout.
- **Print** (⌘P), find (⌘F), zoom, undo and redo.
- Opens `.fountain`, `.txt` and `.md`.

### Download

Get `Write-Now-0.3.0-arm64.dmg` from [Releases](../../releases) (Apple silicon, macOS 11 or later).

The app is not paid-signed by Apple, so macOS will stop you once: in Applications, right-click Write Now, choose Open, then click Open. If it still will not open, run `xattr -dr com.apple.quarantine "/Applications/Write Now.app"` in Terminal.

### Building from source

You need Rust (2024 edition), and Node for the tests.

```sh
node tests/model.cjs      # parser, title page and Word export tests
cargo test
./scripts/bundle.sh       # builds dist/Write Now.app and the dmg
```

The interface is the HTML, CSS and JS in `ui/`, hosted in a native window by [wry](https://github.com/tauri-apps/wry); `src/main.rs` handles menus, files and export.

MIT License.
