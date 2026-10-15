export type DiffPart = { op: "same" | "del" | "add"; text: string };

// limit: O(n·m) LCS over words; fine for sentence-level suggestions, switch to a Myers diff for paragraph-sized text.
export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const parts: DiffPart[] = [];
  const push = (op: DiffPart["op"], word: string) => {
    const last = parts.at(-1);
    if (last?.op === op) last.text += ` ${word}`;
    else parts.push({ op, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      push("same", x[i]);
      i++;
      j++;
    } else if (i < x.length && (j === y.length || lcs[i + 1][j] >= lcs[i][j + 1])) push("del", x[i++]);
    else push("add", y[j++]);
  }
  return parts;
}
