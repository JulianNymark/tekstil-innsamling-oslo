import { useState, useEffect, useMemo } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverTriggerContext,
} from "@digdir/designsystemet-react";
import { InformationSquareFillIcon } from "@navikt/aksel-icons";
import { getRatingColor, getRatingLabel } from "../utils/ratingColors";

interface Ingredient {
  id: string;
  inciName: string;
  commonNames: string[];
  rating: number;
  irritancy: number;
  category: string;
  categoryGroup: string;
  function: string[];
  description: string;
  skinTypeNotes: Record<string, string>;
  flags: string[];
  evidenceLevel: string;
  sources?: string[];
  sourceUrls?: { name: string; url: string; type: string }[];
}

interface IngredientsData {
  version: string;
  lastUpdated: string;
  sources: string[];
  globalSources?: { name: string; url: string; type: string }[];
  scale: {
    name: string;
    range: string;
    description: string;
    levels: Record<string, string>;
  };
  ingredients: Ingredient[];
}

interface MatchedIngredient {
  ingredient: Ingredient;
  matchedName: string;
  originalText: string;
  position: number; // position within section (0 = first in that section)
  section: "active" | "inactive" | "unknown"; // which section of split list
}

type SkinType = "all" | "oily" | "dry" | "sensitive" | "acneProne" | "normal";
type Mode = "map" | "check" | "browse";

function getVerdictStyles(semanticColor: string) {
  const styles: Record<
    string,
    { border: string; bg: string; text: string; iconBg: string }
  > = {
    success: {
      border: "border-[var(--ds-color-success-border-default)]",
      bg: "bg-[var(--ds-color-success-surface-default)]",
      text: "text-[var(--ds-color-success-text-default)]",
      iconBg: "bg-[var(--ds-color-success-surface-tinted)]",
    },
    warning: {
      border: "border-[var(--ds-color-warning-border-default)]",
      bg: "bg-[var(--ds-color-warning-surface-default)]",
      text: "text-[var(--ds-color-warning-text-default)]",
      iconBg: "bg-[var(--ds-color-warning-surface-tinted)]",
    },
    danger: {
      border: "border-[var(--ds-color-danger-border-default)]",
      bg: "bg-[var(--ds-color-danger-surface-default)]",
      text: "text-[var(--ds-color-danger-text-default)]",
      iconBg: "bg-[var(--ds-color-danger-surface-tinted)]",
    },
    neutral: {
      border: "border-[var(--ds-color-neutral-border-default)]",
      bg: "bg-[var(--ds-color-neutral-surface-default)]",
      text: "text-[var(--ds-color-neutral-text-default)]",
      iconBg: "bg-[var(--ds-color-neutral-surface-tinted)]",
    },
    info: {
      border: "border-[var(--ds-color-info-border-default)]",
      bg: "bg-[var(--ds-color-info-surface-default)]",
      text: "text-[var(--ds-color-info-text-default)]",
      iconBg: "bg-[var(--ds-color-info-surface-tinted)]",
    },
  };
  return styles[semanticColor] || styles.neutral;
}

function getSkinTypeLabel(type: SkinType): string {
  const labels: Record<SkinType, string> = {
    all: "All Skin Types",
    oily: "Oily",
    dry: "Dry",
    sensitive: "Sensitive",
    acneProne: "Acne-Prone",
    normal: "Normal",
  };
  return labels[type];
}

function getSkinTypeAdvice(ingredient: Ingredient, skinType: SkinType): string {
  if (skinType === "all") return "";
  const advice = ingredient.skinTypeNotes[skinType];
  if (!advice) return "";

  const adviceMap: Record<string, { text: string; color: string }> = {
    safe: {
      text: "Safe for your skin type",
      color: "text-[var(--ds-color-success-text-default)]",
    },
    caution: {
      text: "Use with caution",
      color: "text-[var(--ds-color-warning-text-default)]",
    },
    avoid: {
      text: "Best to avoid",
      color: "text-[var(--ds-color-danger-text-default)]",
    },
  };

  return adviceMap[advice]?.text || advice;
}

function getSkinTypeAdviceColor(
  ingredient: Ingredient,
  skinType: SkinType,
): string {
  if (skinType === "all") return "";
  const advice = ingredient.skinTypeNotes[skinType];
  if (!advice) return "";

  const colorMap: Record<string, string> = {
    safe: "text-[var(--ds-color-success-text-default)]",
    caution: "text-[var(--ds-color-warning-text-default)]",
    avoid: "text-[var(--ds-color-danger-text-default)]",
  };

  return colorMap[advice] || "";
}

function parseIngredientSections(
  text: string,
): { name: "active" | "inactive" | "unknown"; content: string }[] {
  const sections: {
    name: "active" | "inactive" | "unknown";
    content: string;
  }[] = [];

  // Find headers with their positions
  const activeMatch = text.match(/active\s+ingredients\s*[:\-]?/i);
  const inactiveMatch = text.match(/inactive\s+ingredients\s*[:\-]?/i);

  if (!activeMatch || !inactiveMatch) {
    // No split detected, treat as single list
    return [{ name: "unknown", content: text }];
  }

  const activeIndex = activeMatch.index ?? 0;
  const inactiveIndex = inactiveMatch.index ?? 0;

  // Text before first header
  const firstHeaderIndex = Math.min(activeIndex, inactiveIndex);
  if (firstHeaderIndex > 0) {
    const preamble = text.slice(0, firstHeaderIndex).trim();
    if (preamble.length > 0) {
      sections.push({ name: "unknown", content: preamble });
    }
  }

  // Determine which header comes first
  if (activeIndex < inactiveIndex) {
    // Active first, then inactive
    const activeEnd = activeIndex + activeMatch[0].length;
    const activeContent = text.slice(activeEnd, inactiveIndex).trim();
    if (activeContent.length > 0) {
      sections.push({ name: "active", content: activeContent });
    }

    const inactiveEnd = inactiveIndex + inactiveMatch[0].length;
    const inactiveContent = text.slice(inactiveEnd).trim();
    if (inactiveContent.length > 0) {
      sections.push({ name: "inactive", content: inactiveContent });
    }
  } else {
    // Inactive first, then active (unusual but possible)
    const inactiveEnd = inactiveIndex + inactiveMatch[0].length;
    const inactiveContent = text.slice(inactiveEnd, activeIndex).trim();
    if (inactiveContent.length > 0) {
      sections.push({ name: "inactive", content: inactiveContent });
    }

    const activeEnd = activeIndex + activeMatch[0].length;
    const activeContent = text.slice(activeEnd).trim();
    if (activeContent.length > 0) {
      sections.push({ name: "active", content: activeContent });
    }
  }

  return sections;
}

function findMatchesInText(
  text: string,
  ingredients: Ingredient[],
): MatchedIngredient[] {
  if (!text.trim()) return [];

  // Some websites copy-paste URL-encoded text. Decode it first.
  let decodedText = text;
  try {
    if (/%20|%2C|%2F|%3B|%7C/.test(text)) {
      decodedText = decodeURIComponent(text);
    } else if (/\$20/.test(text)) {
      decodedText = text.replace(/\$20/g, " ");
    }
  } catch {
    decodedText = text;
  }

  const matches: MatchedIngredient[] = [];
  const matchedIds = new Set<string>();

  // Parse sections (handles active/inactive split or single list)
  const sections = parseIngredientSections(decodedText);

  // Process each section
  for (const section of sections) {
    const chunks = section.content.split(/[,;\n|]+/);
    let sectionPos = 0;

    for (const chunk of chunks) {
      const normalizedChunk = chunk.toLowerCase().trim();
      // Strip parenthetical content for matching (e.g., "Glycine Soja (Soybean) Oil" -> "Glycine Soja Oil")
      const strippedChunk = normalizedChunk
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (normalizedChunk.length < 2) {
        sectionPos++;
        continue;
      }

      for (const ing of ingredients) {
        if (matchedIds.has(ing.id)) continue;

        // Check INCI name as whole word (on both original and stripped)
        const inciPattern = new RegExp(
          "\\b" + escapeRegex(ing.inciName.toLowerCase()) + "\\b",
        );
        if (
          inciPattern.test(normalizedChunk) ||
          inciPattern.test(strippedChunk)
        ) {
          matches.push({
            ingredient: ing,
            matchedName: ing.inciName,
            originalText: ing.inciName,
            position: sectionPos,
            section: section.name,
          });
          matchedIds.add(ing.id);
          break;
        }

        // Check common names as whole words (on both original and stripped)
        let found = false;
        for (const commonName of ing.commonNames) {
          const commonPattern = new RegExp(
            "\\b" + escapeRegex(commonName.toLowerCase()) + "\\b",
          );
          if (
            commonPattern.test(normalizedChunk) ||
            commonPattern.test(strippedChunk)
          ) {
            matches.push({
              ingredient: ing,
              matchedName: commonName,
              originalText: commonName,
              position: sectionPos,
              section: section.name,
            });
            matchedIds.add(ing.id);
            found = true;
            break;
          }
        }
        if (found) break;
      }

      sectionPos++;
    }
  }

  // Sort by section (active first), then by rating descending (worst first), then by position
  return matches.sort((a, b) => {
    // Active section always comes first
    if (a.section !== b.section) {
      const sectionOrder = { active: 0, unknown: 1, inactive: 2 };
      return sectionOrder[a.section] - sectionOrder[b.section];
    }
    // Within same section, sort by rating descending
    if (b.ingredient.rating !== a.ingredient.rating) {
      return b.ingredient.rating - a.ingredient.rating;
    }
    return a.position - b.position;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getProductVerdict(matched: MatchedIngredient[]): {
  verdict: "safe" | "low-risk" | "caution" | "not-suitable";
  label: string;
  emoji: string;
  semanticColor: "success" | "warning" | "danger" | "neutral" | "info";
  summary: string;
  details: string[];
} {
  if (matched.length === 0) {
    return {
      verdict: "safe",
      label: "No data",
      emoji: "🤷",
      semanticColor: "neutral",
      summary:
        "Ingen ingredienser funnet i databasen. Dette betyr ikke at produktet er utrygt — bare at vi ikke har nok info.",
      details: [],
    };
  }

  const highRisk = matched.filter((m) => m.ingredient.rating >= 4);
  const moderateRisk = matched.filter((m) => m.ingredient.rating === 3);
  const lowRisk = matched.filter((m) => m.ingredient.rating === 2);

  // Fatty alcohols that are commonly rating 2 but actually safe
  const fattyAlcohols = lowRisk.filter((m) =>
    ["cetearyl-alcohol", "stearyl-alcohol", "cetyl-alcohol"].includes(
      m.ingredient.id,
    ),
  );
  const nonFattyAlcoholLowRisk = lowRisk.filter(
    (m) =>
      !["cetearyl-alcohol", "stearyl-alcohol", "cetyl-alcohol"].includes(
        m.ingredient.id,
      ),
  );

  // Determine verdict
  if (highRisk.length > 0) {
    const hasMultiple = highRisk.length >= 2;
    const earlyPosition = highRisk.some((m) => m.position < 3);
    return {
      verdict: "not-suitable",
      label: "Use with caution",
      emoji: "⚠️",
      semanticColor: "danger",
      summary: hasMultiple
        ? `This product contains ${highRisk.length} ingredients with high comedogenic risk (rating 4–5). These are known pore-cloggers.`
        : `This product contains ${highRisk[0].ingredient.inciName} (rating ${highRisk[0].ingredient.rating}), which is known to clog pores in many people.`,
      details: [
        "Highly comedogenic ingredients (rating 4–5) have been shown to clog pores in both rabbit ear assays and clinical studies.",
        earlyPosition
          ? "This ingredient is among the first in the list, meaning high concentration. This increases the risk of pore-clogging."
          : "This ingredient is lower in the list (lower concentration), which reduces the risk somewhat.",
        "If you are prone to breakouts, consider avoiding this product.",
      ],
    };
  }

  if (moderateRisk.length > 0) {
    const earlyPosition = moderateRisk.some((m) => m.position < 3);
    return {
      verdict: "caution",
      label: "Moderate risk",
      emoji: "⚡",
      semanticColor: "warning",
      summary: `This product contains ${moderateRisk.length} ingredient(s) with moderate comedogenic risk (rating 3).`,
      details: [
        "Moderately comedogenic ingredients (rating 3) can clog pores in some people, especially with frequent use.",
        earlyPosition
          ? "One or more of these are among the first ingredients (high concentration)."
          : "These ingredients are lower in the list (lower concentration).",
        "Consider testing the product on a small skin area first.",
      ],
    };
  }

  if (
    lowRisk.length > 0 &&
    nonFattyAlcoholLowRisk.length === 0 &&
    fattyAlcohols.length > 0
  ) {
    // Only fatty alcohols at rating 2 — these are generally safe
    return {
      verdict: "safe",
      label: "Likely safe",
      emoji: "✅",
      semanticColor: "success",
      summary: `This product contains ${fattyAlcohols.length} fatty alcohol(s) with low comedogenic risk (rating 2). These are moisturizing and safe for most people.`,
      details: [
        "Fatty alcohols (like Cetearyl Alcohol, Stearyl Alcohol, Cetyl Alcohol) are NOT drying alcohols. They are moisturizing and help repair the skin barrier.",
        "Dermatologists consider these safe for over 90% of the population.",
        "Rating 2 means 'low risk' — most people will not experience pore-clogging from these.",
      ],
    };
  }

  if (lowRisk.length > 0) {
    return {
      verdict: "low-risk",
      label: "Low risk",
      emoji: "🟡",
      semanticColor: "warning",
      summary: `This product contains ${lowRisk.length} ingredient(s) with low comedogenic risk (rating 2).`,
      details: [
        "Low comedogenic risk (rating 2) means the ingredient rarely clogs pores, but it can happen in some individuals.",
        "The formulation as a whole matters more than individual ingredients. A product with multiple rating-2 ingredients is not necessarily worse than one with a single rating-2 ingredient.",
      ],
    };
  }

  // All safe (0-1)
  return {
    verdict: "safe",
    label: "Likely safe",
    emoji: "✅",
    semanticColor: "success",
    summary: `No comedogenic ingredients found among the ${matched.length} we know of in the database.`,
    details: [
      "All known ingredients have rating 0–1 (non-comedogenic).",
      "This looks like a well-formulated product for most skin types.",
    ],
  };
}

export default function PoreChecker({ mode }: { mode: Mode }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientText, setIngredientText] = useState("");
  const [selectedSkinType, setSelectedSkinType] = useState<SkinType>("all");
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/ingredients.json")
      .then((res) => res.json())
      .then((data: IngredientsData) => {
        setIngredients(data.ingredients);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const matchedIngredients = useMemo(() => {
    return findMatchesInText(ingredientText, ingredients);
  }, [ingredientText, ingredients]);

  const unmatchedIngredients = useMemo(() => {
    if (!ingredientText.trim()) return [];
    const matches = findMatchesInText(ingredientText, ingredients);
    const matchedPatterns = new Set<string>();
    for (const m of matches) {
      matchedPatterns.add(m.matchedName.toLowerCase());
      matchedPatterns.add(m.ingredient.inciName.toLowerCase());
      for (const cn of m.ingredient.commonNames) {
        matchedPatterns.add(cn.toLowerCase());
      }
    }

    // Split by common delimiters and check each chunk
    const chunks = ingredientText.split(/[,;\n|]+/);
    const unmatched: string[] = [];
    for (const chunk of chunks) {
      const normalizedChunk = chunk.toLowerCase().trim();
      if (normalizedChunk.length < 2) continue;
      // Check if this chunk contains any matched ingredient
      let found = false;
      for (const pattern of matchedPatterns) {
        const regex = new RegExp("\\b" + escapeRegex(pattern) + "\\b");
        if (regex.test(normalizedChunk)) {
          found = true;
          break;
        }
      }
      if (!found) {
        unmatched.push(chunk.trim());
      }
    }
    return unmatched;
  }, [ingredientText, ingredients]);

  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    ingredients.forEach((ing) => {
      counts[ing.rating] = (counts[ing.rating] || 0) + 1;
    });
    return counts;
  }, [ingredients]);

  const productVerdict = useMemo(() => {
    return getProductVerdict(matchedIngredients);
  }, [matchedIngredients]);

  const matchedRatingCounts = useMemo(() => {
    const counts: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    matchedIngredients.forEach((m) => {
      counts[m.ingredient.rating] = (counts[m.ingredient.rating] || 0) + 1;
    });
    return counts;
  }, [matchedIngredients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--ds-color-text-subtle)]">
          Loading ingredients database...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "check" ? (
        <>
          {/* Textarea Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--ds-color-text-subtle)] mb-2">
                Paste ingredient list
              </label>
              <textarea
                value={ingredientText}
                onChange={(e) => setIngredientText(e.target.value)}
                placeholder="Paste ingredient list here, e.g., from the back of your cream..."
                rows={6}
                className="w-full px-4 py-3 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-xl text-[var(--ds-color-text-default)] placeholder-text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)] focus:border-transparent transition-all resize-y min-h-80 text-sm"
              />
              <p className="text-xs text-[var(--ds-color-text-subtle)] mt-1">
                Copy and paste the ingredient list from your product. We
                automatically check against our database — because your pores
                deserve better than landfill.
              </p>
            </div>

            {/* Skin Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--ds-color-text-subtle)]">
                Skin Type:
              </span>
              <select
                value={selectedSkinType}
                onChange={(e) =>
                  setSelectedSkinType(e.target.value as SkinType)
                }
                className="px-3 py-2 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-lg text-sm text-[var(--ds-color-text-default)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)]"
              >
                {(
                  [
                    "all",
                    "oily",
                    "dry",
                    "sensitive",
                    "acneProne",
                    "normal",
                  ] as SkinType[]
                ).map((type) => (
                  <option key={type} value={type}>
                    {getSkinTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {ingredientText.trim() && (
            <>
              {/* Match Summary */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[5, 4, 3, 2, 1, 0].map((rating) => (
                  <div
                    key={rating}
                    className={`p-3 rounded-xl text-center ${getRatingColor(rating)}`}
                  >
                    <div className="text-2xl font-bold">
                      {matchedRatingCounts[rating] || 0}
                    </div>
                    <div className="text-xs font-medium opacity-80">
                      {getRatingLabel(rating)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Product Verdict */}
              {ingredientText.trim() &&
                matchedIngredients.length > 0 &&
                (() => {
                  const styles = getVerdictStyles(productVerdict.semanticColor);
                  return (
                    <div
                      className={`rounded-2xl border-2 ${styles.border} ${styles.bg} overflow-hidden`}
                    >
                      {/* Header with icon and label */}
                      <div className={`p-5 pb-4 flex items-start gap-4`}>
                        <div
                          className={`flex-shrink-0 w-12 h-12 rounded-xl ${styles.iconBg} flex items-center justify-center text-2xl`}
                        >
                          {productVerdict.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-lg font-bold ${styles.text}`}>
                            {productVerdict.label}
                          </h3>
                          <p
                            className={`text-sm ${styles.text} opacity-80 leading-relaxed mt-1`}
                          >
                            {productVerdict.summary}
                          </p>
                        </div>
                      </div>

                      {/* Details list */}
                      {productVerdict.details.length > 0 && (
                        <div className="px-5 pb-5">
                          <div
                            className={`rounded-xl border ${styles.border} bg-[var(--ds-color-surface-default)]/50 overflow-hidden`}
                          >
                            <ul className="divide-y divide-current/10">
                              {productVerdict.details.map((detail, i) => (
                                <li
                                  key={i}
                                  className={`px-4 py-3 text-sm ${styles.text} opacity-70 flex items-start gap-3`}
                                >
                                  <span
                                    className={`flex-shrink-0 w-5 h-5 rounded-full ${styles.iconBg} flex items-center justify-center text-xs font-bold ${styles.text} mt-0.5`}
                                  >
                                    {i + 1}
                                  </span>
                                  <span className="leading-relaxed">
                                    {detail}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* Results */}
              {matchedIngredients.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-[var(--ds-color-text-default)]">
                    Matched Ingredients ({matchedIngredients.length})
                  </h3>

                  {/* Group by section for split lists */}
                  {(() => {
                    const sections: {
                      name: string;
                      items: typeof matchedIngredients;
                    }[] = [];
                    let currentSection = "";
                    let currentItems: typeof matchedIngredients = [];

                    for (const matched of matchedIngredients) {
                      const sectionName =
                        matched.section === "active"
                          ? "Active Ingredients"
                          : matched.section === "inactive"
                            ? "Inactive Ingredients"
                            : "";
                      if (sectionName !== currentSection) {
                        if (currentItems.length > 0) {
                          sections.push({
                            name: currentSection,
                            items: currentItems,
                          });
                        }
                        currentSection = sectionName;
                        currentItems = [matched];
                      } else {
                        currentItems.push(matched);
                      }
                    }
                    if (currentItems.length > 0) {
                      sections.push({
                        name: currentSection,
                        items: currentItems,
                      });
                    }

                    return sections.map((section) => (
                      <div key={section.name || "all"} className="space-y-3">
                        {section.name && (
                          <div className="flex items-center gap-2">
                            <div
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-block ${
                                section.name === "Active Ingredients"
                                  ? "bg-[var(--ds-color-accent-surface-default)] text-[var(--ds-color-accent-text-default)]"
                                  : "bg-[var(--ds-color-brand1-surface-default)] text-[var(--ds-color-brand1-text-default)]"
                              }`}
                            >
                              {section.name}
                            </div>
                            {section.name === "Active Ingredients" && (
                              <PopoverTriggerContext>
                                <PopoverTrigger
                                  variant="tertiary"
                                  icon
                                  data-color="warning"
                                  data-size="sm"
                                >
                                  <InformationSquareFillIcon aria-label="Info om aktiv/inaktiv liste" />
                                </PopoverTrigger>
                                <Popover
                                  placement="right"
                                  variant="tinted"
                                  data-color="warning"
                                >
                                  <div>
                                    <strong>Split list detected:</strong> This
                                    product separates &quot;Active&quot; and
                                    &quot;Inactive&quot; ingredients. Active
                                    ingredients are listed{" "}
                                    <strong>alphabetically</strong> with
                                    percentages (not by concentration). Inactive
                                    ingredients are ordered by concentration{" "}
                                    <strong>
                                      only within the inactive section
                                    </strong>
                                    . We cannot compare concentration across the
                                    two sections.
                                  </div>
                                </Popover>
                              </PopoverTriggerContext>
                            )}
                          </div>
                        )}
                        {section.items.map((matched) => (
                          <div
                            key={matched.ingredient.id}
                            onClick={() =>
                              setSelectedIngredient(matched.ingredient)
                            }
                            className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
                              matched.section === "active"
                                ? "border-[var(--ds-color-accent-border-default)] hover:border-[var(--ds-color-accent-border-strong)]"
                                : matched.section === "inactive"
                                  ? "border-[var(--ds-color-accent-border-default)] hover:border-[var(--ds-color-brand1-border-strong)]"
                                  : "bg-[var(--ds-color-surface-tinted)] border-[var(--ds-color-border-default)] hover:border-[var(--ds-color-border-strong)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-[var(--ds-color-text-default)]">
                                    {matched.ingredient.inciName}
                                  </h3>
                                  {matched.matchedName !==
                                    matched.ingredient.inciName && (
                                    <span className="text-sm text-[var(--ds-color-text-subtle)]">
                                      (matched as &quot;{matched.matchedName}
                                      &quot;)
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-[var(--ds-color-text-subtle)] mt-1">
                                  {matched.ingredient.description}
                                </p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="text-xs px-2 py-1 bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)] rounded-full">
                                    {matched.ingredient.category}
                                  </span>
                                  {matched.position < 5 && (
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full ${
                                        matched.section === "active"
                                          ? "bg-[var(--ds-color-accent-surface-tinted)] text-[var(--ds-color-accent-text-default)]"
                                          : matched.section === "inactive"
                                            ? "bg-[var(--ds-color-brand1-surface-tinted)] text-[var(--ds-color-brand1-text-default)]"
                                            : "bg-[var(--ds-color-info-surface-tinted)] text-[var(--ds-color-info-text-default)]"
                                      }`}
                                      title={
                                        matched.section === "active"
                                          ? "Active ingredients are listed alphabetically with percentages (OTC drug labeling). Position within active section only."
                                          : matched.section === "inactive"
                                            ? "Inactive ingredients are ordered by concentration within the inactive section only. Cannot compare to active ingredients."
                                            : "Ingredient lists are ordered by concentration (highest first)"
                                      }
                                    >
                                      {matched.section === "active"
                                        ? `${matched.position === 0 ? "1st" : matched.position === 1 ? "2nd" : matched.position === 2 ? "3rd" : `${matched.position + 1}th`} active`
                                        : matched.section === "inactive"
                                          ? `${matched.position === 0 ? "1st" : matched.position === 1 ? "2nd" : matched.position === 2 ? "3rd" : `${matched.position + 1}th`} inactive`
                                          : matched.position === 0
                                            ? "1st ingredient — highest concentration"
                                            : matched.position === 1
                                              ? "2nd ingredient"
                                              : matched.position === 2
                                                ? "3rd ingredient"
                                                : `${matched.position + 1}th ingredient`}
                                    </span>
                                  )}
                                  {matched.ingredient.irritancy > 0 && (
                                    <span className="text-xs px-2 py-1 bg-[var(--ds-color-warning-surface-tinted)] text-[var(--ds-color-warning-text-default)] rounded-full">
                                      Irritancy: {matched.ingredient.irritancy}
                                      /5
                                    </span>
                                  )}
                                  {selectedSkinType !== "all" && (
                                    <span
                                      className={`text-xs font-medium ${getSkinTypeAdviceColor(matched.ingredient, selectedSkinType)}`}
                                    >
                                      {getSkinTypeAdvice(
                                        matched.ingredient,
                                        selectedSkinType,
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div
                                className={`flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(matched.ingredient.rating)}`}
                              >
                                <div className="text-2xl font-bold">
                                  {matched.ingredient.rating}
                                </div>
                                <div className="text-xs font-medium opacity-80">
                                  {getRatingLabel(matched.ingredient.rating)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              ) : unmatchedIngredients.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[var(--ds-color-text-subtle)]">
                    No ingredients parsed. Try pasting a comma-separated list.
                  </p>
                </div>
              ) : null}

              {/* Unmatched ingredients */}
              {unmatchedIngredients.length > 0 && (
                <div className="p-4 bg-[var(--ds-color-surface-tinted)] rounded-xl border border-[var(--ds-color-border-default)]">
                  <h4 className="text-sm font-semibold text-[var(--ds-color-text-subtle)] mb-2">
                    Not in database ({unmatchedIngredients.length})
                  </h4>
                  <p className="text-xs text-[var(--ds-color-text-subtle)] mb-2">
                    These ingredients were not found in our database. This could
                    mean they are not known to be comedogenic, or we need to add
                    them.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unmatchedIngredients.map((name, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)] rounded-full"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Draelos 2006 Disclaimer */}
              <div className="p-4 bg-[var(--ds-color-info-surface-default)] rounded-xl border border-[var(--ds-color-info-border-default)]">
                <h4 className="text-sm font-semibold text-[var(--ds-color-info-text-default)] mb-2 flex items-center gap-2">
                  <span>🧪</span>
                  <span>Important: Raw ingredient vs. finished product</span>
                </h4>
                <p className="text-sm text-[var(--ds-color-info-text-subtle)] leading-relaxed">
                  These ratings are based on tests of{" "}
                  <strong>pure ingredients</strong> in high concentrations
                  (often 100%). A finished product contains ingredients at much
                  lower concentrations, and the formulation as a whole can
                  change how an ingredient affects the skin.
                </p>
                <p className="text-sm text-[var(--ds-color-info-text-subtle)] mt-2 leading-relaxed">
                  A study by{" "}
                  <a
                    href="https://pubmed.ncbi.nlm.nih.gov/16488305/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-[var(--ds-color-info-text-default)]"
                  >
                    Draelos & DiNardo (2006,{" "}
                    <em>Journal of the American Academy of Dermatology</em>)
                  </a>{" "}
                  found that many ingredients scoring high in pure tests did not
                  clog pores when formulated in products with appropriate
                  concentrations and pH. So treat these results as a{" "}
                  <strong>guiding tool</strong>, not an absolute verdict.
                </p>
                <div className="mt-3 pt-3 border-t border-[var(--ds-color-info-border-default)]">
                  <p className="text-xs text-[var(--ds-color-info-text-subtle)] font-medium mb-1.5">
                    Key studies on comedogenicity:
                  </p>
                  <ul className="space-y-1">
                    <li>
                      <a
                        href="https://pubmed.ncbi.nlm.nih.gov/6229554/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        Fulton et al. (1984) — First major JAAD study;
                        established the 0-5 scale
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://pdfs.semanticscholar.org/578c/d23064f4be5f9f623e9cb9dbfe4a6c29eef2.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        Fulton (1989) — 200+ ingredienser testet; detaljert 0-5
                        skala
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://pubmed.ncbi.nlm.nih.gov/7138047/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        Mills & Kligman (1982) — Human modell; REA er mer
                        sensitiv enn menneskelig hud
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://pubmed.ncbi.nlm.nih.gov/4264346/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        Kligman & Mills (1972) — Coined the term &quot;acne
                        cosmetica&quot;
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://pubmed.ncbi.nlm.nih.gov/2521642/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        AAD Symposium (1989) — Konsensus: REA-negativ = trygt
                        for mennesker
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <BrowseMode
          ingredients={ingredients}
          selectedSkinType={selectedSkinType}
          onSkinTypeChange={setSelectedSkinType}
          ratingCounts={ratingCounts}
          onSelectIngredient={setSelectedIngredient}
        />
      )}

      {/* Detail Modal */}
      {selectedIngredient && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedIngredient(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto border border-[var(--ds-color-border-default)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-[var(--ds-color-text-default)]">
                  {selectedIngredient.inciName}
                </h3>
                {selectedIngredient.commonNames.length > 0 && (
                  <p className="text-sm text-[var(--ds-color-text-subtle)]">
                    Also known as: {selectedIngredient.commonNames.join(", ")}
                  </p>
                )}
              </div>
              <div
                className={`px-3 py-2 rounded-lg text-center ${getRatingColor(selectedIngredient.rating)}`}
              >
                <div className="text-2xl font-bold">
                  {selectedIngredient.rating}
                </div>
                <div className="text-xs">
                  {getRatingLabel(selectedIngredient.rating)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-1">
                  Description
                </h4>
                <p className="text-[var(--ds-color-text-subtle)] text-sm">
                  {selectedIngredient.description}
                </p>
              </div>

              {selectedIngredient.function &&
                selectedIngredient.function.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-1">
                      Functions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredient.function.map((fn) => (
                        <span
                          key={fn}
                          className="text-xs px-2 py-1 bg-[var(--ds-color-surface-tinted)] text-[var(--ds-color-text-subtle)] rounded-full border border-[var(--ds-color-border-default)]"
                        >
                          {fn.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {selectedIngredient.skinTypeNotes &&
                Object.keys(selectedIngredient.skinTypeNotes).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-2">
                      Skin Type Recommendations
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(selectedIngredient.skinTypeNotes).map(
                        ([type, advice]) => (
                          <div
                            key={type}
                            className={`p-2 rounded-lg text-xs font-medium ${
                              advice === "safe"
                                ? "bg-[var(--ds-color-success-surface-default)] text-[var(--ds-color-success-text-default)]"
                                : advice === "caution"
                                  ? "bg-[var(--ds-color-warning-surface-default)] text-[var(--ds-color-warning-text-default)]"
                                  : "bg-[var(--ds-color-danger-surface-default)] text-[var(--ds-color-danger-text-default)]"
                            }`}
                          >
                            <div className="font-semibold capitalize">
                              {type.replace(/([A-Z])/g, " $1").trim()}
                            </div>
                            <div className="opacity-80">{advice}</div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {selectedIngredient.irritancy > 0 && (
                <div>
                  <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-1">
                    Irritancy
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-[var(--ds-color-surface-hover)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--ds-color-warning-base-default)] rounded-full"
                        style={{
                          width: `${(selectedIngredient.irritancy / 5) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-[var(--ds-color-text-subtle)]">
                      {selectedIngredient.irritancy}/5
                    </span>
                  </div>
                </div>
              )}

              {selectedIngredient.flags &&
                selectedIngredient.flags.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-1">
                      Flags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredient.flags.map((flag) => (
                        <span
                          key={flag}
                          className="text-xs px-2 py-1 bg-[var(--ds-color-surface-tinted)] text-[var(--ds-color-text-subtle)] rounded-full border border-[var(--ds-color-border-default)]"
                        >
                          {flag.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              <div className="text-xs space-y-2">
                <div className="text-[var(--ds-color-text-subtle)]">
                  Evidence level:{" "}
                  {selectedIngredient.evidenceLevel || "unknown"}
                </div>

                {selectedIngredient.sourceUrls &&
                  selectedIngredient.sourceUrls.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-[var(--ds-color-text-subtle)] mb-1.5">
                        Sources
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedIngredient.sourceUrls.map((source) => {
                          const typeColors: Record<string, string> = {
                            government:
                              "bg-[var(--ds-color-info-surface-default)] text-[var(--ds-color-info-text-default)]",
                            study:
                              "bg-[var(--ds-color-success-surface-default)] text-[var(--ds-color-success-text-default)]",
                            regulatory:
                              "bg-[var(--ds-color-accent-surface-default)] text-[var(--ds-color-accent-text-default)]",
                            database:
                              "bg-[var(--ds-color-neutral-surface-default)] text-[var(--ds-color-neutral-text-default)]",
                            reference:
                              "bg-[var(--ds-color-neutral-surface-default)] text-[var(--ds-color-neutral-text-default)]",
                          };
                          return (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-xs px-2 py-1 rounded-full hover:opacity-80 transition-opacity ${typeColors[source.type] || typeColors.database}`}
                            >
                              {source.name}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            <button
              onClick={() => setSelectedIngredient(null)}
              className="mt-6 w-full py-2.5 bg-[var(--ds-color-base-default)] text-[var(--ds-color-base-contrast-default)] rounded-xl font-medium hover:bg-[var(--ds-color-base-hover)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Browse Mode Component
function BrowseMode({
  ingredients,
  selectedSkinType,
  onSkinTypeChange,
  ratingCounts,
  onSelectIngredient,
}: {
  ingredients: Ingredient[];
  selectedSkinType: SkinType;
  onSkinTypeChange: (type: SkinType) => void;
  ratingCounts: Record<number, number>;
  onSelectIngredient: (ing: Ingredient | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "name" | "category">(
    "rating",
  );

  const filteredIngredients = useMemo(() => {
    let filtered = ingredients;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((ing) => {
        const nameMatch = ing.inciName.toLowerCase().includes(query);
        const commonMatch = ing.commonNames.some((name) =>
          name.toLowerCase().includes(query),
        );
        const categoryMatch = ing.category.toLowerCase().includes(query);
        const functionMatch = ing.function.some((fn) =>
          fn.toLowerCase().includes(query),
        );
        return nameMatch || commonMatch || categoryMatch || functionMatch;
      });
    }

    if (selectedSkinType !== "all") {
      filtered = filtered.filter((ing) => {
        const advice = ing.skinTypeNotes[selectedSkinType];
        return advice && advice !== "avoid";
      });
    }

    const sorted = [...filtered];
    if (sortBy === "rating") {
      sorted.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.inciName.localeCompare(b.inciName));
    } else if (sortBy === "category") {
      sorted.sort((a, b) => a.category.localeCompare(b.category));
    }

    return sorted;
  }, [ingredients, searchQuery, selectedSkinType, sortBy]);

  return (
    <div className="space-y-6">
      {/* Scale Info */}
      <div className="p-4 bg-[var(--ds-color-surface-tinted)] rounded-xl border border-[var(--ds-color-border-default)]">
        <h3 className="text-sm font-semibold text-[var(--ds-color-text-default)] mb-2">
          About the Comedogenic Scale
        </h3>
        <p className="text-xs text-[var(--ds-color-text-subtle)] mb-2">
          Based on the Fulton 1989 rabbit ear assay (REA). Ratings 0-1 are
          generally safe, 2-3 use caution, 4-5 avoid for acne-prone skin. Note:
          REA is more sensitive than human skin; concentration and formulation
          matter.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[5, 4, 3, 2, 1, 0].map((r) => (
            <span
              key={r}
              className={`text-xs px-2 py-1 rounded-full ${getRatingColor(r)}`}
            >
              {r}: {getRatingLabel(r)}
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[5, 4, 3, 2, 1, 0].map((rating) => (
          <div
            key={rating}
            className={`p-3 rounded-xl text-center ${getRatingColor(rating)}`}
          >
            <div className="text-2xl font-bold">
              {ratingCounts[rating] || 0}
            </div>
            <div className="text-xs font-medium opacity-80">
              {getRatingLabel(rating)}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search ingredients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 pl-11 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-xl text-[var(--ds-color-text-default)] placeholder-text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)] focus:border-transparent transition-all"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ds-color-text-subtle)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ds-color-text-subtle)]">
              Skin Type:
            </span>
            <select
              value={selectedSkinType}
              onChange={(e) => onSkinTypeChange(e.target.value as SkinType)}
              className="px-3 py-2 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-lg text-sm text-[var(--ds-color-text-default)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)]"
            >
              {(
                [
                  "all",
                  "oily",
                  "dry",
                  "sensitive",
                  "acneProne",
                  "normal",
                ] as SkinType[]
              ).map((type) => (
                <option key={type} value={type}>
                  {getSkinTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ds-color-text-subtle)]">
              Sort by:
            </span>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "rating" | "name" | "category")
              }
              className="px-3 py-2 bg-[var(--ds-color-surface-tinted)] border border-[var(--ds-color-border-default)] rounded-lg text-sm text-[var(--ds-color-text-default)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-neutral-base-default)]"
            >
              <option value="rating">Rating (High to Low)</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-[var(--ds-color-text-subtle)]">
        Showing {filteredIngredients.length} of {ingredients.length} ingredients
      </div>

      {/* Ingredient List */}
      <div className="space-y-3">
        {filteredIngredients.map((ingredient) => (
          <div
            key={ingredient.id}
            onClick={() => onSelectIngredient(ingredient)}
            className="p-4 bg-[var(--ds-color-surface-tinted)] rounded-xl border border-[var(--ds-color-border-default)] hover:border-[var(--ds-color-border-strong)] cursor-pointer transition-all hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-[var(--ds-color-text-default)]">
                    {ingredient.inciName}
                  </h3>
                  {ingredient.commonNames.length > 0 && (
                    <span className="text-sm text-[var(--ds-color-text-subtle)] truncate">
                      ({ingredient.commonNames[0]})
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--ds-color-text-subtle)] mt-1 line-clamp-2">
                  {ingredient.description}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-1 bg-[var(--ds-color-surface-hover)] text-[var(--ds-color-text-subtle)] rounded-full">
                    {ingredient.category}
                  </span>
                  {ingredient.irritancy > 0 && (
                    <span className="text-xs px-2 py-1 bg-[var(--ds-color-warning-surface-tinted)] text-[var(--ds-color-warning-text-default)] rounded-full">
                      Irritancy: {ingredient.irritancy}/5
                    </span>
                  )}
                  {selectedSkinType !== "all" && (
                    <span
                      className={`text-xs font-medium ${getSkinTypeAdviceColor(ingredient, selectedSkinType)}`}
                    >
                      {getSkinTypeAdvice(ingredient, selectedSkinType)}
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(ingredient.rating)}`}
              >
                <div className="text-2xl font-bold">{ingredient.rating}</div>
                <div className="text-xs font-medium opacity-80">
                  {getRatingLabel(ingredient.rating)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredIngredients.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-[var(--ds-color-text-default)] mb-1">
            No ingredients found
          </h3>
          <p className="text-[var(--ds-color-text-subtle)]">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
}
