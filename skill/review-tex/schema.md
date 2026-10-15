# suggestions.json schema (version 1)

File location: `<root>/.review/suggestions.json`. `<root>` is the folder that contains `.review/`.

```json
{
  "version": 1,
  "generated_at": "2026-10-15T10:00:00Z",
  "suggestions": [ { "...": "one object per suggestion" } ]
}
```

## Suggestion fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique string in this file, for example `s001`. |
| `file` | yes | Path relative to `<root>`, with forward slashes. |
| `category` | yes | `grammar`, `clarity`, `delivery`, `style` or `consistency`. The extension shows an unknown value as `style`; the validator rejects it. |
| `original` | yes | Verbatim text from the file. Whitespace runs match any whitespace run (line break, indentation, tab, non-breaking space). All other characters must match exactly. |
| `context_before` | no | Verbatim text that comes directly before `original`. Use it only when `original` occurs more than once. |
| `context_after` | no | Verbatim text that comes directly after `original`. Use it only when `original` occurs more than once. |
| `replacement` | no | New LaTeX text for `original`. `""` deletes `original`. Omit the field for a comment-only suggestion: the extension then offers only Dismiss. |
| `explanation` | yes | One or two plain sentences that say why. |

The extension skips a suggestion when `replacement` equals `original`.

## Examples

With a replacement:

```json
{
  "id": "s001",
  "file": "sections/intro.tex",
  "category": "grammar",
  "original": "used against jamming, or to make eavesdropping more difficult",
  "replacement": "used against jamming or to make eavesdropping more difficult",
  "explanation": "No comma before \"or\" when only two items are joined."
}
```

With context, because `the channel model` occurs more than once:

```json
{
  "id": "s002",
  "file": "main.tex",
  "category": "consistency",
  "original": "the channel model",
  "context_before": "we study ",
  "context_after": " of a passive",
  "replacement": "the cascaded channel model",
  "explanation": "Name the model precisely, so the reader can tell it apart from the direct channel."
}
```

Comment only (no `replacement`):

```json
{
  "id": "s003",
  "file": "main.tex",
  "category": "delivery",
  "original": "Our results, which we obtained after a very long and careful campaign of simulations in several different scenarios, confirm the gain.",
  "explanation": "The main claim comes after a long relative clause. State the gain first, with a number, and move the simulation setup to a second sentence."
}
```

## dismissed.json

The extension writes `<root>/.review/dismissed.json` when the user dismisses a suggestion:

```json
{
  "version": 1,
  "dismissed": [
    { "file": "main.tex", "original": "...", "replacement": "...", "explanation": "...", "dismissed_at": "2026-10-15T10:05:00Z" }
  ]
}
```

The extension hides a suggestion when an entry has the same `file`, `original` and `replacement`.
