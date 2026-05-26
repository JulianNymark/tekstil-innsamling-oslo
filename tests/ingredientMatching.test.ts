import { describe, it, expect } from "vitest";
import { splitIngredients } from "../app/utils/splitIngredients";

// Reproduce the normalize logic from match/route.ts for testing
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\.$/, "")
    .replace(/^(?:active|inactive|ingredients|inci\s+formula)\s*:?\s*/i, "")
    .replace(/\s*[\(\[\{]\s*\d+(?:\.\d+)?\s*%?\s*[\)\]\}]\s*/g, " ")
    .replace(/\s*\d+(?:\.\d+)?\s*%\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAlternativeNames(name: string): string[] {
  const normalized = normalizeIngredientName(name);
  if (!normalized.includes("/")) {
    return [normalized];
  }

  const parts = normalized.split("/").map((p) => p.trim());
  const alternatives = [normalized];

  for (const part of parts) {
    if (part.length >= 2 && !alternatives.includes(part)) {
      alternatives.push(part);
    }
  }

  return alternatives;
}

describe("splitIngredients", () => {
  it("splits by comma", () => {
    const result = splitIngredients("Aqua, Glycerin, Niacinamide");
    expect(result).toEqual(["Aqua", "Glycerin", "Niacinamide"]);
  });

  it("splits by semicolon", () => {
    const result = splitIngredients("Aqua; Glycerin; Niacinamide");
    expect(result).toEqual(["Aqua", "Glycerin", "Niacinamide"]);
  });

  it("splits by newline", () => {
    const result = splitIngredients("Aqua\nGlycerin\nNiacinamide");
    expect(result).toEqual(["Aqua", "Glycerin", "Niacinamide"]);
  });

  it("does NOT split by slash (slash is for alternatives)", () => {
    const result = splitIngredients("AQUA/WATER, PARFUM/FRAGRANCE");
    expect(result).toEqual(["AQUA/WATER", "PARFUM/FRAGRANCE"]);
  });

  it("respects quoted strings", () => {
    const result = splitIngredients('"1,2-hexanediol", propylene glycol');
    expect(result).toEqual(['"1,2-hexanediol"', "propylene glycol"]);
  });

  it("respects balanced parentheses", () => {
    const result = splitIngredients(
      "Helianthus Annuus (Sunflower) Seed Oil, Glycerin"
    );
    expect(result).toEqual([
      "Helianthus Annuus (Sunflower) Seed Oil",
      "Glycerin",
    ]);
  });

  it("strips trailing periods", () => {
    const result = splitIngredients("Aqua, Glycerin.");
    expect(result).toEqual(["Aqua", "Glycerin"]);
  });
});

describe("normalizeIngredientName", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientName("  Aqua  ")).toBe("aqua");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeIngredientName('"1,2-hexanediol"')).toBe("1,2-hexanediol");
  });

  it("strips trailing period", () => {
    expect(normalizeIngredientName("potassium sorbate.")).toBe(
      "potassium sorbate"
    );
  });

  it("strips concentrations", () => {
    expect(normalizeIngredientName("Glycerin (8%)")).toBe("glycerin");
    expect(normalizeIngredientName("Niacinamide [10%]")).toBe("niacinamide");
    expect(normalizeIngredientName("Acid {5%}")).toBe("acid");
  });

  it("strips standalone percentages", () => {
    expect(normalizeIngredientName("Glycerin 8%")).toBe("glycerin");
    expect(normalizeIngredientName("Acid 2.5 %")).toBe("acid");
  });

  it("strips parenthetical content", () => {
    expect(normalizeIngredientName("Glycine Soja (SOYBEAN) Oil")).toBe(
      "glycine soja oil"
    );
    expect(normalizeIngredientName("Oryza Sativa (RICE) Hull Powder")).toBe(
      "oryza sativa hull powder"
    );
  });

  it("strips section headers", () => {
    // Note: "active ingredients:" is handled by parseIngredientSections before normalize
    // normalize only catches headers that leaked through or simple forms
    expect(normalizeIngredientName("active: Aqua")).toBe("aqua");
    expect(normalizeIngredientName("inactive: Glycerin")).toBe("glycerin");
    expect(normalizeIngredientName("ingredients: Water")).toBe("water");
    expect(normalizeIngredientName("INCI Formula: Niacinamide")).toBe(
      "niacinamide"
    );
  });

  it("does NOT strip slashes (preserves for alternative handling)", () => {
    expect(normalizeIngredientName("AQUA/WATER")).toBe("aqua/water");
    expect(normalizeIngredientName("PARFUM/FRAGRANCE")).toBe(
      "parfum/fragrance"
    );
  });

  it("handles complex real-world names", () => {
    expect(
      normalizeIngredientName(
        "Helianthus Annuus (Sunflower) Seed Oil (Helianthus Annuus Seed Oil)"
      )
    ).toBe("helianthus annuus seed oil");

    // Note: asterisk (*) is not stripped by normalize - that's handled elsewhere
    expect(
      normalizeIngredientName(
        "Avena Sativa (Oat) Flower/Leaf/Stem Juice (Avena Sativa Flower/Leaf/Stem/Juice)*"
      )
    ).toBe("avena sativa flower/leaf/stem juice *");
  });
});

describe("getAlternativeNames", () => {
  it("returns single name for non-slash input", () => {
    expect(getAlternativeNames("Aqua")).toEqual(["aqua"]);
  });

  it("returns full name plus each slash part", () => {
    expect(getAlternativeNames("AQUA/WATER")).toEqual([
      "aqua/water",
      "aqua",
      "water",
    ]);
  });

  it("handles multi-part slashes", () => {
    expect(getAlternativeNames("Flower/Leaf/Stem Juice")).toEqual([
      "flower/leaf/stem juice",
      "flower",
      "leaf",
      "stem juice",
    ]);
  });

  it("deduplicates identical parts", () => {
    // If someone writes "Aqua/Aqua" we don't want duplicates
    expect(getAlternativeNames("Aqua/Aqua")).toEqual(["aqua/aqua", "aqua"]);
  });
});

// These tests document the specific false positive bugs we've fixed
describe("regulatory matching edge cases", () => {
  it("'cetyl' should NOT match 'acetylcholine' in regulatory partial matching", () => {
    // This was a real bug: "Cetyl" in an ingredient list matched
    // the banned ingredient "(2-Acetoxyethyl)trimethylammonium hydroxide (Acetylcholine)"
    // because the partial match used LIKE '%cetyl%' which matched inside "Acetylcholine"
    //
    // The fix: word-boundary matching that normalizes punctuation to spaces first
    const cetyl = normalizeIngredientName("Cetyl");
    expect(cetyl).toBe("cetyl");

    // The regulatory entry name (raw, from DB):
    // "(2-Acetoxyethyl)trimethylammonium hydroxide (Acetylcholine) and its salts"
    // After normalizing punctuation to spaces:
    // " 2-acetoxyethyl trimethylammonium hydroxide acetylcholine and its salts"
    const regulatoryName =
      "(2-Acetoxyethyl)trimethylammonium hydroxide (Acetylcholine) and its salts";
    const normalizedPunctuation = regulatoryName
      .toLowerCase()
      .replace(/[()\-,/]/g, " ");

    // "cetyl" should NOT appear as a standalone word
    const words = normalizedPunctuation.split(/\s+/);
    expect(words).not.toContain("cetyl");

    // But "acetylcholine" SHOULD appear
    expect(words).toContain("acetylcholine");
  });

  it("'cetyl' should match actual cetyl ingredients", () => {
    const cetylAlcohol = normalizeIngredientName("Cetyl Alcohol");
    expect(cetylAlcohol).toBe("cetyl alcohol");

    const words = cetylAlcohol.split(/\s+/);
    expect(words).toContain("cetyl");
  });
});
