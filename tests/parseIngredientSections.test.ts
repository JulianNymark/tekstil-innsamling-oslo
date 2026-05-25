import { describe, it, expect } from "vitest";
import { parseIngredientSections } from "../app/utils/parseIngredientSections";

describe("parseIngredientSections", () => {
  it("handles 'active ingredients:' followed by 'inactive ingredients:'", () => {
    const text =
      "active ingredients: Aqua / Water / Eau\n\ninactive ingredients: AP";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("active");
    expect(result[0].content).toBe("Aqua / Water / Eau");
    expect(result[1].name).toBe("inactive");
    expect(result[1].content).toBe("AP");
  });

  it("handles 'active:' followed by 'ingredients:'", () => {
    const text = "active: Aqua / Water / Eau\n\n ingredients: AP";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("active");
    expect(result[0].content).toBe("Aqua / Water / Eau");
    expect(result[1].name).toBe("inactive");
    expect(result[1].content).toBe("AP");
  });

  it("returns unknown when no active header is found", () => {
    const text = "Aqua, Glycerin, Niacinamide";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unknown");
    expect(result[0].content).toBe("Aqua, Glycerin, Niacinamide");
  });

  it("ignores case", () => {
    const text =
      "ACTIVE INGREDIENTS: Zinc Oxide\nINACTIVE INGREDIENTS: Water, Oil";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("active");
    expect(result[0].content).toBe("Zinc Oxide");
    expect(result[1].name).toBe("inactive");
    expect(result[1].content).toBe("Water, Oil");
  });

  it("puts preamble before active into unknown", () => {
    const text =
      "Some preamble text. active ingredients: Zinc Oxide. inactive ingredients: Water.";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("unknown");
    expect(result[0].content).toContain("Some preamble text");
    expect(result[1].name).toBe("active");
    expect(result[1].content).toContain("Zinc Oxide");
    expect(result[2].name).toBe("inactive");
    expect(result[2].content).toContain("Water");
  });

  it("treats everything after active as active if no inactive header found", () => {
    const text = "active ingredients: Zinc Oxide, Titanium Dioxide";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("active");
    expect(result[0].content).toBe("Zinc Oxide, Titanium Dioxide");
  });

  it("treats bare 'ingredients:' as unknown (not active)", () => {
    const text = "ingredients: Water, Glycerin";
    const result = parseIngredientSections(text);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unknown");
    expect(result[0].content).toBe("Water, Glycerin");
  });
});
