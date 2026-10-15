import { describe, expect, test } from "bun:test";
import { locate, locateDetailed, parseSuggestions } from "./anchor";

const slice = (text: string, r: { start: number; end: number } | null) => (r ? text.slice(r.start, r.end) : null);

describe("locate", () => {
  test("unique match", () => {
    const text = "RIS can be used against jamming. For example";
    expect(locate(text, { original: "used against jamming" })).toEqual({ start: 11, end: 31 });
  });

  test("repeated match resolved by context_before", () => {
    const text = "first the channel model. Then the channel model again.";
    const r = locate(text, { original: "the channel model", context_before: "Then " });
    expect(r?.start).toBe(text.lastIndexOf("the channel model"));
  });

  test("repeated match resolved by context_after", () => {
    const text = "the channel model is linear. Later, the channel model is nonlinear.";
    const r = locate(text, { original: "the channel model", context_after: " is nonlinear" });
    expect(r?.start).toBe(text.lastIndexOf("the channel model"));
  });

  test("context compares with collapsed whitespace", () => {
    const text = "we use\n    the model here. We also use the model there.";
    const r = locate(text, { original: "the model", context_before: "we use " });
    expect(r?.start).toBe(text.indexOf("the model"));
  });

  test("ambiguous tie returns null", () => {
    const text = "the model and the model";
    expect(locate(text, { original: "the model" })).toBeNull();
    expect(locateDetailed(text, { original: "the model", context_after: "xyz" })).toEqual({ error: "ambiguous" });
  });

  test("not found returns null", () => {
    expect(locate("some text", { original: "other text" })).toBeNull();
    expect(locateDetailed("some text", { original: "other text" })).toEqual({ error: "not_found" });
    expect(locateDetailed("some text", { original: "   " })).toEqual({ error: "not_found" });
  });

  test("CRLF document with LF and space in original", () => {
    const text = "Line one ends\r\nhere and\r\ncontinues.";
    expect(slice(text, locate(text, { original: "ends\nhere and continues" }))).toBe("ends\r\nhere and\r\ncontinues");
  });

  test("hard-wrapped line with indentation", () => {
    const text = "  RIS can be used against\n    jamming, or to make eavesdropping";
    expect(slice(text, locate(text, { original: " used against jamming, or " }))).toBe("used against\n    jamming, or");
  });

  test("non-breaking space and tab match a space", () => {
    const text = "Fig. \\ref{f}\tshows";
    expect(slice(text, locate(text, { original: "Fig. \\ref{f} shows" }))).toBe(text);
  });

  test("regex special characters and LaTeX", () => {
    const text = "An \\ac{RIS} (see \\cite{a,b}) costs $1+x^2$ [dB]? Yes.";
    expect(slice(text, locate(text, { original: "\\ac{RIS} (see \\cite{a,b})" }))).toBe("\\ac{RIS} (see \\cite{a,b})");
    expect(slice(text, locate(text, { original: "$1+x^2$ [dB]?" }))).toBe("$1+x^2$ [dB]?");
  });

  test("accented Unicode", () => {
    const text = "L'università di Trento è qui. Ça va.";
    expect(slice(text, locate(text, { original: "università di Trento è" }))).toBe("università di Trento è");
    expect(slice(text, locate(text, { original: "Ça va" }))).toBe("Ça va");
  });
});

describe("parseSuggestions", () => {
  test("accepts a valid file and reports invalid items", () => {
    const { suggestions, errors } = parseSuggestions({
      version: 1,
      suggestions: [
        { id: "a", file: "main.tex", category: "grammar", original: "x", explanation: "e" },
        { id: "b", file: "main.tex", category: "style", original: "", explanation: "e", replacement: 3 },
      ],
    });
    expect(suggestions.map((s) => s.id)).toEqual(["a"]);
    expect(errors).toEqual(["b: missing or not a string: original, replacement"]);
  });

  test("rejects a wrong root", () => {
    expect(parseSuggestions({ version: 2, suggestions: [] }).errors).toHaveLength(1);
  });
});
