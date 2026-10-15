import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES, locateDetailed, parseSuggestions } from "../../src/anchor";

const root = process.argv[2];
if (!root) {
  console.error("usage: bun validate.ts <reviewRootDir>");
  process.exit(2);
}

const path = join(root, ".review", "suggestions.json");
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const { suggestions, errors } = parseSuggestions(raw);
const warnings: string[] = [];
const ids = new Set<string>();
const texts = new Map<string, string>();

for (const s of suggestions) {
  const problems: string[] = [];
  if (ids.has(s.id)) problems.push("duplicate id");
  ids.add(s.id);
  if (!CATEGORIES.includes(s.category)) problems.push(`unknown category "${s.category}"; use ${CATEGORIES.join(" | ")}`);
  if (s.replacement === s.original) problems.push("replacement equals original");
  if (s.original.length > 400) warnings.push(`${s.id}: original has ${s.original.length} chars; keep it to one sentence`);

  const file = join(root, s.file);
  if (!texts.has(file) && existsSync(file)) texts.set(file, readFileSync(file, "utf8"));
  const text = texts.get(file);
  if (text === undefined) {
    problems.push(`file not found: ${s.file}`);
  } else {
    const r = locateDetailed(text, s);
    if ("error" in r && r.error === "not_found") problems.push("original not found in file; copy it verbatim");
    if ("error" in r && r.error === "ambiguous") problems.push("original matches several places; add or extend context_before/context_after");
  }
  errors.push(...problems.map((p) => `${s.id}: ${p}`));
}

for (const w of warnings) console.log(`warning ${w}`);
for (const e of errors) console.log(e);
if (errors.length) {
  console.log(`FAILED: ${errors.length} problem(s) in ${path}`);
  process.exit(1);
}
console.log(`OK: ${suggestions.length} suggestions`);
