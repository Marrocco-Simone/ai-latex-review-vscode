export const CATEGORIES = ["grammar", "clarity", "delivery", "style", "consistency"];

export type Suggestion = {
  id: string;
  file: string;
  category: string;
  original: string;
  context_before?: string;
  context_after?: string;
  replacement?: string;
  explanation: string;
};

export type Anchor = Pick<Suggestion, "original" | "context_before" | "context_after">;
export type TextRange = { start: number; end: number };
export type LocateResult = { range: TextRange } | { error: "not_found" | "ambiguous" };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function locateDetailed(text: string, s: Anchor): LocateResult {
  const words = s.original.trim().split(/\s+/);
  if (!words[0]) return { error: "not_found" };
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const matches = [...text.matchAll(new RegExp(pattern, "g"))].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  if (matches.length === 0) return { error: "not_found" };
  if (matches.length === 1) return { range: matches[0] };

  const before = collapse(s.context_before ?? "");
  const after = collapse(s.context_after ?? "");
  // limit: context is compared inside a window of 4x its length + 200 chars; text with more whitespace than that misses the bonus.
  const scored = matches.map((m) => {
    let score = 0;
    if (before && collapse(text.slice(Math.max(0, m.start - 4 * before.length - 200), m.start)).endsWith(before)) score++;
    if (after && collapse(text.slice(m.end, m.end + 4 * after.length + 200)).startsWith(after)) score++;
    return { m, score };
  });
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score === top);
  return best.length === 1 ? { range: best[0].m } : { error: "ambiguous" };
}

export function locate(text: string, s: Anchor): TextRange | null {
  const r = locateDetailed(text, s);
  return "range" in r ? r.range : null;
}

export function parseSuggestions(raw: unknown): { suggestions: Suggestion[]; errors: string[] } {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.suggestions)) {
    return { suggestions: [], errors: ['root: expected { "version": 1, "suggestions": [...] }'] };
  }
  const suggestions: Suggestion[] = [];
  const errors: string[] = [];
  raw.suggestions.forEach((item: unknown, i: number) => {
    if (!isRecord(item)) {
      errors.push(`#${i}: not an object`);
      return;
    }
    const str = (k: string) => {
      const v = item[k];
      return typeof v === "string" ? v : undefined;
    };
    const id = str("id");
    const file = str("file");
    const category = str("category");
    const original = str("original");
    const explanation = str("explanation");
    const bad = Object.entries({ id, file, category, original, explanation })
      .filter(([, v]) => !v?.trim())
      .map(([k]) => k);
    for (const k of ["context_before", "context_after", "replacement"]) {
      if (item[k] !== undefined && typeof item[k] !== "string") bad.push(k);
    }
    if (bad.length || !id || !file || !category || !original || !explanation) {
      errors.push(`${id || `#${i}`}: missing or not a string: ${bad.join(", ")}`);
      return;
    }
    suggestions.push({
      id,
      file,
      category,
      original,
      explanation,
      context_before: str("context_before"),
      context_after: str("context_after"),
      replacement: str("replacement"),
    });
  });
  return { suggestions, errors };
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
