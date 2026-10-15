import { expect, test } from "bun:test";
import { wordDiff } from "./diff";

test("one changed word", () => {
  expect(wordDiff("the authors shows that", "the authors show that")).toEqual([
    { op: "same", text: "the authors" },
    { op: "del", text: "shows" },
    { op: "add", text: "show" },
    { op: "same", text: "that" },
  ]);
});

test("deletion and insertion with LaTeX", () => {
  expect(wordDiff("a passive \\ac{RIS} reflects", "an \\ac{RIS} reflects")).toEqual([
    { op: "del", text: "a passive" },
    { op: "add", text: "an" },
    { op: "same", text: "\\ac{RIS} reflects" },
  ]);
});

test("empty replacement deletes everything", () => {
  expect(wordDiff("very much", "")).toEqual([{ op: "del", text: "very much" }]);
});
