import * as vscode from "vscode";
import { isRecord, locate, parseSuggestions } from "./anchor";
import type { Suggestion } from "./anchor";
import { wordDiff } from "./diff";

type Dismissed = { file: string; original: string; replacement?: string; explanation: string; dismissed_at: string };
type Root = { dir: vscode.Uri; suggestions: Suggestion[]; dismissed: Dismissed[] };
type Entry = { root: Root; uri: vscode.Uri; s: Suggestion };
type Shown = { diagnostic: vscode.Diagnostic; entry: Entry; key: string };

const SOURCE = "AI LaTeX Review";
const roots = new Map<string, Root>();
const shown = new Map<string, Shown[]>();
const accepted = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const decoder = new TextDecoder();
const encoder = new TextEncoder();
let collection: vscode.DiagnosticCollection;
let log: vscode.OutputChannel;

const keyOf = (dir: vscode.Uri, file: string, original: string, replacement: string | undefined) =>
  JSON.stringify([dir.toString(), file, original, replacement ?? null]);
const reviewFile = (dir: vscode.Uri, name: string) => vscode.Uri.joinPath(dir, ".review", name);

function debounce(key: string, ms: number, fn: () => Promise<void>) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn().catch((err: unknown) => log.appendLine(String(err)));
    }, ms),
  );
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return decoder.decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

// Returns [] when the file is missing and undefined when it exists but cannot be parsed.
async function readDismissed(dir: vscode.Uri): Promise<Dismissed[] | undefined> {
  const text = await readText(reviewFile(dir, "dismissed.json"));
  if (text === undefined) return [];
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !Array.isArray(raw.dismissed)) throw new Error("expected { dismissed: [...] }");
    return raw.dismissed.filter(
      (d: unknown): d is Dismissed => isRecord(d) && typeof d.file === "string" && typeof d.original === "string",
    );
  } catch (err) {
    log.appendLine(`${reviewFile(dir, "dismissed.json").fsPath}: ${String(err)}`);
    return undefined;
  }
}

async function loadRoot(dir: vscode.Uri) {
  const key = dir.toString();
  const file = reviewFile(dir, "suggestions.json");
  const text = await readText(file);
  if (text === undefined) {
    roots.delete(key);
    return;
  }
  try {
    const { suggestions, errors } = parseSuggestions(JSON.parse(text));
    if (errors.length) throw new Error(errors.join("; "));
    const dismissed = (await readDismissed(dir)) ?? roots.get(key)?.dismissed ?? [];
    roots.set(key, { dir, suggestions, dismissed });
  } catch (err) {
    log.appendLine(`${file.fsPath}: keeping last good state: ${String(err)}`);
  }
}

function entriesFor(uri: vscode.Uri): Entry[] {
  const target = uri.toString();
  const result: Entry[] = [];
  for (const root of roots.values()) {
    const hidden = new Set(root.dismissed.map((d) => keyOf(root.dir, d.file, d.original, d.replacement)));
    for (const s of root.suggestions) {
      const key = keyOf(root.dir, s.file, s.original, s.replacement);
      const fileUri = vscode.Uri.joinPath(root.dir, s.file);
      if (fileUri.toString() !== target || s.replacement === s.original || hidden.has(key) || accepted.has(key)) continue;
      result.push({ root, uri: fileUri, s });
    }
  }
  return result;
}

function reviewedUris(): vscode.Uri[] {
  const uris = new Map<string, vscode.Uri>();
  for (const root of roots.values()) {
    for (const s of root.suggestions) {
      const uri = vscode.Uri.joinPath(root.dir, s.file);
      uris.set(uri.toString(), uri);
    }
  }
  return [...uris.values()];
}

async function refreshUri(uri: vscode.Uri) {
  const entries = entriesFor(uri);
  if (!entries.length) {
    collection.delete(uri);
    shown.delete(uri.toString());
    return;
  }
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(uri);
  } catch (err) {
    log.appendLine(`${uri.fsPath}: ${String(err)}`);
    collection.delete(uri);
    shown.delete(uri.toString());
    return;
  }
  const text = doc.getText();
  const items: Shown[] = [];
  for (const entry of entries) {
    const r = locate(text, entry.s);
    if (!r) continue;
    const { s } = entry;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)),
      s.explanation,
      s.category === "grammar" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information,
    );
    diagnostic.source = SOURCE;
    diagnostic.code = s.category;
    items.push({ diagnostic, entry, key: keyOf(entry.root.dir, s.file, s.original, s.replacement) });
  }
  shown.set(uri.toString(), items);
  collection.set(
    uri,
    items.map((i) => i.diagnostic),
  );
}

async function refreshAll() {
  const uris = reviewedUris();
  const keep = new Set(uris.map((u) => u.toString()));
  collection.forEach((uri) => {
    if (!keep.has(uri.toString())) {
      collection.delete(uri);
      shown.delete(uri.toString());
    }
  });
  await Promise.all(uris.map(refreshUri));
}

async function reloadAll() {
  const files = await vscode.workspace.findFiles("**/.review/suggestions.json", "**/node_modules/**");
  const dirs = files.map((f) => vscode.Uri.joinPath(f, "..", ".."));
  const found = new Set(dirs.map((d) => d.toString()));
  for (const key of roots.keys()) if (!found.has(key)) roots.delete(key);
  await Promise.all(dirs.map(loadRoot));
  await refreshAll();
}

function isReviewed(uri: vscode.Uri) {
  return reviewedUris().some((u) => u.toString() === uri.toString());
}

function scheduleRefresh(uri: vscode.Uri) {
  if (isReviewed(uri)) debounce(`doc:${uri.toString()}`, 300, () => refreshUri(uri));
}

async function accept(entry: Entry) {
  const { s, uri } = entry;
  const doc = await vscode.workspace.openTextDocument(uri);
  const r = locate(doc.getText(), s);
  if (!r || s.replacement === undefined) {
    vscode.window.showWarningMessage("Text changed; suggestion is stale.");
    await refreshUri(uri);
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)), s.replacement);
  if (!(await vscode.workspace.applyEdit(edit))) return;
  // The original can still match after the edit: inside the replacement, or at another occurrence that is now unique.
  if (locate(doc.getText(), s)) accepted.add(keyOf(entry.root.dir, s.file, s.original, s.replacement));
  await refreshUri(uri);
}

async function writeDismissed(dir: vscode.Uri, dismissed: Dismissed[]) {
  const json = JSON.stringify({ version: 1, dismissed }, null, 2) + "\n";
  await vscode.workspace.fs.writeFile(reviewFile(dir, "dismissed.json"), encoder.encode(json));
}

async function dismiss(entry: Entry) {
  const { root, s, uri } = entry;
  const dismissed = await readDismissed(root.dir);
  if (!dismissed) {
    vscode.window.showErrorMessage("dismissed.json is not valid JSON. Fix or delete it, then try again.");
    return;
  }
  dismissed.push({
    file: s.file,
    original: s.original,
    replacement: s.replacement,
    explanation: s.explanation,
    dismissed_at: new Date().toISOString(),
  });
  await writeDismissed(root.dir, dismissed);
  await loadRoot(root.dir);
  await refreshUri(uri);
}

async function clearDismissed() {
  await Promise.all([...roots.values()].map((root) => writeDismissed(root.dir, [])));
  await reloadAll();
}

function preview(replacement: string) {
  if (replacement === "") return "(delete)";
  const flat = replacement.replace(/\s+/g, " ");
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

const codeActions: vscode.CodeActionProvider = {
  provideCodeActions(doc, range) {
    return (shown.get(doc.uri.toString()) ?? [])
      .filter(({ diagnostic }) => diagnostic.range.intersection(range))
      .flatMap(({ diagnostic, entry, key }) => {
        const actions: vscode.CodeAction[] = [];
        if (entry.s.replacement !== undefined) {
          const a = new vscode.CodeAction(`Accept: ${preview(entry.s.replacement)}`, vscode.CodeActionKind.QuickFix);
          a.isPreferred = true;
          a.diagnostics = [diagnostic];
          a.command = { command: "aiLatexReview.accept", title: "Accept", arguments: [key] };
          actions.push(a);
        }
        const d = new vscode.CodeAction("Dismiss suggestion", vscode.CodeActionKind.QuickFix);
        d.diagnostics = [diagnostic];
        d.command = { command: "aiLatexReview.dismiss", title: "Dismiss", arguments: [key] };
        actions.push(d);
        return actions;
      });
  },
};

function withShown(key: string, fn: (entry: Entry) => Promise<void>) {
  for (const items of shown.values()) {
    const item = items.find((i) => i.key === key);
    if (item) return fn(item.entry);
  }
}

const BADGE: Record<string, string> = {
  grammar: "#d1242f",
  clarity: "#0969da",
  delivery: "#8250df",
  style: "#1a7f37",
  consistency: "#bc4c00",
};

const escapeMd = (text: string) =>
  text
    .replace(/[\\`*_{}[\]()#+\-.!|~]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// The hover sanitizer keeps a span style only in this exact form: color, then background-color, no spaces.
const span = (fg: string, bg: string | undefined, html: string) =>
  `<span style="color:${fg};${bg ? `background-color:${bg};` : ""}">${html}</span>`;

function renderDiff(original: string, replacement: string) {
  return wordDiff(original, replacement)
    .map(({ op, text }) => {
      if (op === "same") return escapeMd(text);
      if (op === "del")
        return span("var(--vscode-gitDecoration-deletedResourceForeground)", "var(--vscode-diffEditor-removedTextBackground)", `~~${escapeMd(text)}~~`);
      return span("var(--vscode-gitDecoration-addedResourceForeground)", "var(--vscode-diffEditor-insertedTextBackground)", `**${escapeMd(text)}**`);
    })
    .join(" ");
}

function renderHover({ entry: { s }, key }: Shown) {
  const md = new vscode.MarkdownString(undefined, true);
  md.supportHtml = true;
  md.isTrusted = { enabledCommands: ["aiLatexReview.accept", "aiLatexReview.dismiss"] };
  const label = s.category.charAt(0).toUpperCase() + s.category.slice(1);
  md.appendMarkdown(`${span("#ffffff", BADGE[s.category] ?? BADGE.style, `&nbsp;${label}&nbsp;`)}&nbsp;&nbsp;`);
  md.appendMarkdown(`${span("var(--vscode-descriptionForeground)", undefined, SOURCE)}\n\n`);
  if (s.replacement !== undefined) md.appendMarkdown(`${renderDiff(s.original, s.replacement)}\n\n`);
  md.appendMarkdown(`${escapeMd(s.explanation)}\n\n`);
  const args = encodeURIComponent(JSON.stringify([key]));
  const links = [`[$(close) Dismiss](command:aiLatexReview.dismiss?${args} "Hide this suggestion")`];
  if (s.replacement !== undefined) links.unshift(`[$(check) Accept](command:aiLatexReview.accept?${args} "Apply the change")`);
  md.appendMarkdown(links.join("&nbsp;&nbsp;&nbsp;"));
  return md;
}

const hovers: vscode.HoverProvider = {
  provideHover(doc, position) {
    const items = (shown.get(doc.uri.toString()) ?? []).filter(({ diagnostic }) => diagnostic.range.contains(position));
    if (!items.length) return;
    return new vscode.Hover(items.map(renderHover), items[0].diagnostic.range);
  },
};

export function activate(context: vscode.ExtensionContext) {
  collection = vscode.languages.createDiagnosticCollection(SOURCE);
  log = vscode.window.createOutputChannel(SOURCE);
  const watcher = vscode.workspace.createFileSystemWatcher("**/.review/{suggestions,dismissed}.json");
  const onReviewFile = (uri: vscode.Uri) => {
    const dir = vscode.Uri.joinPath(uri, "..", "..");
    debounce(`root:${dir.toString()}`, 200, async () => {
      await loadRoot(dir);
      await refreshAll();
    });
  };

  context.subscriptions.push(
    collection,
    log,
    watcher,
    watcher.onDidCreate(onReviewFile),
    watcher.onDidChange(onReviewFile),
    watcher.onDidDelete(onReviewFile),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document.uri)),
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleRefresh(doc.uri)),
    vscode.workspace.onDidCloseTextDocument(async (doc) => {
      // Documents opened by this extension close on their own; refreshing them unconditionally reopens them in a loop.
      if (isReviewed(doc.uri) && (await readText(doc.uri)) !== doc.getText()) scheduleRefresh(doc.uri);
    }),
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, codeActions, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.languages.registerHoverProvider({ scheme: "file" }, hovers),
    vscode.commands.registerCommand("aiLatexReview.accept", (key: string) => withShown(key, accept)),
    vscode.commands.registerCommand("aiLatexReview.dismiss", (key: string) => withShown(key, dismiss)),
    vscode.commands.registerCommand("aiLatexReview.reload", reloadAll),
    vscode.commands.registerCommand("aiLatexReview.clearDismissed", clearDismissed),
  );
  reloadAll().catch((err: unknown) => log.appendLine(String(err)));
}

export function deactivate() {
  for (const t of timers.values()) clearTimeout(t);
}
