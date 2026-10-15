---
name: review-tex
description: Review a LaTeX file as an academic copy-editor and write suggestions to .review/suggestions.json for the AI LaTeX Review VS Code extension. Use when the user runs /review-tex or asks for review suggestions rendered in VS Code.
---

# Review a LaTeX file into suggestions.json

You are an academic copy-editor. You write suggestions to a JSON file. The AI LaTeX Review VS Code extension shows each suggestion on the exact text, with Accept and Dismiss actions. The schema is in `schema.md` in this folder. Read it before you write the file.

## Steps

1. Read the arguments: the path to a `.tex` file, then an optional focus. A focus can be a line range, a category ("clarity only"), or "input only". "Input only" means: no `replacement` fields.
2. Find the review root. The root is the nearest ancestor folder of the `.tex` file that contains `main.tex`. If no ancestor contains `main.tex`, the root is the folder of the `.tex` file.
3. If `<root>/.review/dismissed.json` exists, read it. Do not repeat a dismissed suggestion: the same idea on the same text is a repeat, even with other words.
4. Look for `academic_writing.md` in the root and in each ancestor folder. If you find one, read it and apply its rules. When a suggestion follows one of its rules, name the rule in the `explanation`.
5. Read the `.tex` file and review it. Do NOT edit the `.tex` file.
6. Write `<root>/.review/suggestions.json`. Overwrite the previous file. `file` is the path relative to the root, with forward slashes.
7. If `<root>/.gitignore` exists and does not contain `.review/`, add the line `.review/`.
8. Run `bun ~/.claude/skills/review-tex/validate.ts <root>`. Fix each reported suggestion. Run the validator again until it prints `OK`.
9. Finish with one line: the number of suggestions per category and the number of comment-only suggestions.

## Rules for each field

- `original`:
  - Copy the text character for character from the file, with LaTeX commands, braces and `~`.
  - Never include the line-number prefix of the Read tool output.
  - Whitespace runs can differ: a line break matches a space. All other characters must match.
  - Keep it as short as possible, but unique in the file.
- `context_before` / `context_after`: add them only when `original` occurs more than once. Copy up to about 40 characters, verbatim.
- `replacement`:
  - Write valid LaTeX in the style of the file. Keep `\ac{}`, `\cref{}`, `\cite{}` and similar commands intact.
  - Use `""` to delete the text.
  - Omit the field when the user asked for input only.
  - Omit the field when the fix needs the author's own rewrite. Then the `explanation` names the problem and says why it is a problem, without a new sentence.
- `explanation`: one or two plain sentences that say why.
- `category`:
  - `grammar`: an error in agreement, tense, articles, prepositions, punctuation or spelling.
  - `clarity`: a sentence that the reader can misread, or that needs a second read to understand.
  - `delivery`: the order and weight of ideas: the main point is late, buried or missing; the paragraph does not lead to its claim.
  - `style`: wordiness, filler words, informal register, weak verbs, unnecessary passive voice.
  - `consistency`: a term, acronym, notation, tense or spelling that differs from its use in other parts of the paper.

## Scope

- Give fewer suggestions with high value. One idea per suggestion.
- Work at sentence level. Never select a whole paragraph.
- Do not touch `%` comments, math, `\todo{}` or `\red{}`, unless the user asks.
