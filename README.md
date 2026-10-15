# AI LaTeX Review

A VS Code extension that shows review suggestions for LaTeX files on the exact text, with Accept and Dismiss actions. A Claude Code skill (`/review-tex`) writes the suggestions.

The extension does not call any AI service and has no network code. All review work happens in your interactive Claude Code session. The extension only reads `.review/suggestions.json` and draws it in the editor. Your `.tex` source never contains review markup.

## How it works

1. In Claude Code, run `/review-tex <file.tex> [focus]`. A focus can be a line range, a category ("clarity only") or "input only" (comments without replacement text).
2. Claude writes `<root>/.review/suggestions.json`. `<root>` is the nearest folder above the `.tex` file that contains `main.tex`. Claude does not edit the `.tex` file.
3. The extension shows each suggestion as a squiggle. Grammar suggestions are warnings. The other categories are information.
4. The hover shows the category, a word-level diff of the change, the explanation, and **Accept** / **Dismiss** links.
   - **Accept** replaces the text in the editor. The file is not saved. Cmd+Z undoes the edit.
   - **Dismiss** adds the suggestion to `.review/dismissed.json`. The next `/review-tex` run reads this file and does not repeat the suggestion.
5. The Problems panel lists all suggestions. F8 / Shift+F8 moves between them. Cmd+. opens the same actions as a quick fix.

## Install

Requirements: [VS Code](https://code.visualstudio.com/), [Bun](https://bun.sh/), [Claude Code](https://claude.com/claude-code).

1. Build and install the extension:
   ```sh
   git clone https://github.com/Marrocco-Simone/ai-latex-review-vscode.git
   cd ai-latex-review-vscode
   bun install
   bun run package
   code --install-extension ai-latex-review-*.vsix
   ```
2. Link the skill into Claude Code:
   ```sh
   ln -s "$PWD/skill/review-tex" ~/.claude/skills/review-tex
   ```
   The skill validator imports `src/anchor.ts` from this repository, so keep the repository folder in place.
3. In VS Code, run **Developer: Reload Window**.

To try the extension without Claude Code, open the `sample/` folder in VS Code and open `sample/main.tex`.

## suggestions.json

The schema is in [`skill/review-tex/schema.md`](skill/review-tex/schema.md). Each suggestion has a `file`, a `category` (`grammar`, `clarity`, `delivery`, `style`, `consistency`), the verbatim `original` text, an optional `replacement` and an `explanation`. A suggestion without `replacement` is a comment and has only Dismiss.

The skill runs `skill/review-tex/validate.ts` after it writes the file. The validator rejects suggestions whose `original` is not found or matches more than one place.

## Anchoring

`src/anchor.ts` finds the text of each suggestion. Each whitespace run in `original` matches any whitespace run in the file, so line breaks, indentation and CRLF do not matter. When `original` occurs more than once, `context_before` and `context_after` select the occurrence. A suggestion that is not found, or that is still ambiguous, gets no squiggle. When you edit the file, the squiggles follow the text.

## Commands

- **AI LaTeX Review: Reload suggestions** reads all `**/.review/suggestions.json` files again.
- **AI LaTeX Review: Clear dismissed suggestions** writes an empty list to each `dismissed.json`.

## Development

```sh
bun install
bun run types
bun test
bun run package
```

## License

MIT
