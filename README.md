# DataVisualizer

## Essentials

- Opens `.json`, `.jsonl`, `.csv` files
- Displays data in a table view
- Inline cell editing (double-click)
- Search with match highlighting
- Add/delete rows and columns
- Export to any supported format

JSON objects (`{...}`) and arrays (`[{...}]`) are preserved as-is when saving.

## Installation

Download the `.exe` file from [Releases](https://github.com/askoq/DataVisualizer/releases)

## Building from source

```bash
git clone https://github.com/askoq/DataVisualizer.git
cd DataVisualizer
npm install
npx tauri icon ./app-icon.png
npm run tauri build
```

The exe will be in `src-tauri/target/release` | msi installer `src-tauri/target/release/bundle/msi/`

## Requirements

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/)

## Stack

- Tauri v2
- Vanilla JS
- Rust (serde_json, csv)

## License

MIT
