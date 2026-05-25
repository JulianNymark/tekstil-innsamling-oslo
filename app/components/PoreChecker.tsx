import { useState, useEffect, useMemo } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverTriggerContext,
} from "@digdir/designsystemet-react";
import { InformationSquareFillIcon, ExclamationmarkTriangleFillIcon } from "@navikt/aksel-icons";
import {
  getRatingColor,
  getRatingColorBorder,
  getRatingLabel,
} from "../utils/ratingColors";
import { parseIngredientSections } from "../utils/parseIngredientSections";
import { splitIngredients } from "../utils/splitIngredients";

function explainConditions(text: string): string {
  // Explain standalone percentages as max concentration limits
  // European format: "5 %", "2,5 %", "0,1 %" — these are max allowed in final product
  text = text.replace(
    /(^|;\s*|\|\s*)(\d+(?:,\d+)?)\s*%(\s*\([^)]*\))?/g,
    "$1$2%$3 (max concentration in final product)"
  );
  
  const glossary: Record<string, string> = {
    "mucous membranes": "mucous membranes (moist linings of mouth, nose, eyes, genitals)",
    "rinse-off products": "rinse-off products (shampoo, face wash — washed off quickly)",
    "leave-on products": "leave-on products (moisturizer, serum — stays on skin)",
    "professional use": "professional use only (salon/treatment, not home use)",
    "not to be used": "not to be used (avoid this usage completely)",
    "not to be applied": "not to be applied (do not put on this area)",
    "maximum concentration": "max concentration (highest safe amount allowed)",
    "acid": "acid (as free acid, not salt form)",
    "ready for use": "ready for use (final diluted product, not concentrate)",
    "pH": "pH (acidity level; lower = more acidic)",
    "wear suitable gloves": "wear suitable gloves (protective gloves required)",
    "keep out of reach of children": "keep out of reach of children (child safety warning)",
    "in the finished product": "in the finished product (in final cosmetic, not raw ingredient)",
    "when mixed with": "when mixed with (combined with other substances)",
    "as maximum": "as maximum (upper limit)",
    "must not exceed": "must not exceed (hard limit, cannot go over)",
    "other than": "other than (except for)",
    "except": "except (excluded from restriction)",
    "oral products": "oral products (toothpaste, mouthwash — goes in mouth)",
    "hair products": "hair products (shampoo, conditioner, dye, styling)",
    "eye products": "eye products (mascara, eyeshadow, eye cream — near eyes)",
    "nail products": "nail products (polish, remover, treatments)",
    "skin products": "skin products (lotion, cream, body butter)",
    "depilatories": "depilatories (hair removal creams)",
    "bleach": "bleach (lightening/highlighting products)",
    "sunscreen": "sunscreen (UV protection products)",
    "tanning": "tanning (self-tanner, bronzer)",
    "tattoo": "tattoo (permanent makeup, body art)",
    "aerosol": "aerosol (spray products)",
    "powder": "powder (loose or pressed powder products)",
    "lip products": "lip products (lipstick, gloss, balm — near mouth)",
  };

  let explained = text;
  for (const [term, explanation] of Object.entries(glossary)) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    explained = explained.replace(regex, explanation);
  }
  return explained;
}
import SkinTypeSelect from "./SkinTypeSelect";
import BrowseMode from "./BrowseMode";

interface IngredientRating {
  source_name: string;
  rating: number;
  irritancy: number | null;
  scale: string;
  evidence_level: string;
  sample_size: number | null;
  notes: string | null;
}

interface Ingredient {
  id: string;
  inciName: string;
  commonNames: string[];
  rating: number | null;
  ratings?: IngredientRating[];
  irritancy: number;
  category: string;
  categoryGroup: string;
  function: string[];
  description: string;
  skinTypeNotes: Record<string, string>;
  flags: string[];
  sourceUrls?: { name: string; url: string; type: string }[];
  regulatory?: { status: string; annex: string; restriction_details: string; conditions?: string; regulation_source?: string; chemical_name?: string; glossary_name?: string } | null;
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
    const chunks = splitIngredients(section.content);
    let sectionPos = 0;

    for (const chunk of chunks) {
      // Strip surrounding quotes for matching
      const normalizedChunk = chunk.toLowerCase().trim().replace(/^["']|["']$/g, '');
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
    // Within same section, sort by rating descending (null ratings last)
    const ratingA = a.ingredient.rating ?? -1;
    const ratingB = b.ingredient.rating ?? -1;
    if (ratingB !== ratingA) {
      return ratingB - ratingA;
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

  // Check for banned ingredients first — this overrides everything
  const banned = matched.filter((m) => m.ingredient.regulatory?.status === 'banned');
  if (banned.length > 0) {
    return {
      verdict: "not-suitable",
      label: "Contains Banned Ingredient",
      emoji: "🚫",
      semanticColor: "danger",
      summary: `This product contains ${banned.length === 1 ? banned[0].ingredient.inciName : banned.length + ' banned ingredients'} prohibited under EU Cosmetics Regulation (EC) No 1223/2009.`,
      details: [
        "Banned ingredients are prohibited in cosmetic products sold in the EU due to safety concerns.",
        ...banned.map((b) => `${b.ingredient.inciName}: ${b.ingredient.regulatory?.restriction_details || 'Prohibited in all cosmetic products'}`),
        "If you see this on a product label, it should not be sold in the EU market.",
      ],
    };
  }

  const highRisk = matched.filter((m) => (m.ingredient.rating ?? -1) >= 4);
  const moderateRisk = matched.filter((m) => (m.ingredient.rating ?? -1) === 3);
  const lowRisk = matched.filter((m) => (m.ingredient.rating ?? -1) === 2);

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
        : `This product contains ${highRisk[0].ingredient.inciName} (rating ${highRisk[0].ingredient.rating ?? '?'}), which is known to clog pores in many people.`,
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

  // Check if we have matched ingredients but none have rating data
  const hasRatedIngredients = matched.some((m) => m.ingredient.rating !== null && m.ingredient.rating !== undefined);
  const hasOnlyRegulatory = matched.length > 0 && !hasRatedIngredients;

  if (hasOnlyRegulatory) {
    return {
      verdict: "safe",
      label: "No comedogenic data",
      emoji: "🤷",
      semanticColor: "neutral",
      summary: `We found ${matched.length} ingredient(s) in the database, but none have comedogenicity ratings.`,
      details: [
        "These ingredients are tracked for EU regulatory status (banned/restricted) but we don't have comedogenicity data for them.",
        "This doesn't mean the product is safe or unsafe for acne-prone skin — we simply don't have enough information.",
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
  const [ingredientText, setIngredientText] = useState("");
  const [selectedSkinType, setSelectedSkinType] = useState<SkinType>("all");
  const [selectedIngredient, setSelectedIngredient] =
    useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiMatches, setApiMatches] = useState<MatchedIngredient[]>([]);
  const [matchedRawNames, setMatchedRawNames] = useState<Set<string>>(new Set());

  // Debounced API call for ingredient matching
  useEffect(() => {
    if (!ingredientText.trim()) {
      setApiMatches([]);
      setMatchedRawNames(new Set());
      return;
    }

    const timeoutId = setTimeout(() => {
      setLoading(true);
      const sections = parseIngredientSections(ingredientText);
      
      // Collect all ingredient names with their section info
      const ingredientsWithSections: { name: string; section: string }[] = [];
      
      for (const section of sections) {
        const chunks = splitIngredients(section.content);
        for (const chunk of chunks) {
          const trimmed = chunk.trim();
          if (trimmed.length >= 2) {
            ingredientsWithSections.push({
              name: trimmed,
              section: section.name
            });
          }
        }
      }

      if (ingredientsWithSections.length === 0) {
        setLoading(false);
        return;
      }

      fetch('/api/ingredients/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ingredients: ingredientsWithSections.map(i => i.name)
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.matches) {
            // Build a map from raw ingredient index to section info
            const indexToSection = new Map<number, { section: string; sectionPos: number }>();
            const sectionCounters: Record<string, number> = {};
            
            for (let i = 0; i < ingredientsWithSections.length; i++) {
              const section = ingredientsWithSections[i].section;
              if (!sectionCounters[section]) sectionCounters[section] = 0;
              indexToSection.set(i, { section, sectionPos: sectionCounters[section] });
              sectionCounters[section]++;
            }

            const matches: MatchedIngredient[] = data.matches.map((m: { id: string; inci_name: string; rating: number | null; ratings?: { source_name: string; rating: number; irritancy: number | null; scale: string; evidence_level: string; sample_size: number | null; notes: string | null }[]; irritancy: number; category: string; category_group: string; description: string; flags: string | null; skinTypeNotes: Record<string, string> | undefined; sourceUrls: { name: string; url: string; type: string }[] | undefined; regulatory: { status: string; annex: string; restriction_details: string } | null | undefined; index: number }) => {
              const originalIndex = m.index;
              const sectionInfo = indexToSection.get(originalIndex) || { section: 'unknown', sectionPos: originalIndex };
              return {
                ingredient: {
                  id: m.id,
                  inciName: m.inci_name,
                  commonNames: [],
                  rating: m.rating,
                  ratings: m.ratings || [],
                  irritancy: m.irritancy,
                  category: m.category,
                  categoryGroup: m.category_group,
                  function: [],
                  description: m.description,
                  skinTypeNotes: m.skinTypeNotes || {},
                  flags: m.flags ? JSON.parse(m.flags) : [],
                  sourceUrls: m.sourceUrls || [],
                  regulatory: m.regulatory || null
                },
                matchedName: m.inci_name,
                originalText: ingredientsWithSections[originalIndex]?.name || m.inci_name,
                position: sectionInfo.sectionPos,
                section: sectionInfo.section as "active" | "inactive" | "unknown"
              };
            });
            
            // Sort: banned first, then section order (active → unknown → inactive), then rating desc, then position asc
            const sectionOrder = { active: 0, unknown: 1, inactive: 2 };
            matches.sort((a, b) => {
              // Banned ingredients always go to the top
              const aBanned = a.ingredient.regulatory?.status === 'banned' ? 1 : 0;
              const bBanned = b.ingredient.regulatory?.status === 'banned' ? 1 : 0;
              if (bBanned !== aBanned) {
                return bBanned - aBanned;
              }
              if (a.section !== b.section) {
                return sectionOrder[a.section] - sectionOrder[b.section];
              }
              // Null ratings sort to bottom within same section
              const ratingA = a.ingredient.rating ?? -1;
              const ratingB = b.ingredient.rating ?? -1;
              if (ratingB !== ratingA) {
                return ratingB - ratingA;
              }
              return a.position - b.position;
            });
            
            setApiMatches(matches);
            setMatchedRawNames(new Set((data.matchedNames || []).map((n: string) => n.toLowerCase().trim())));
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [ingredientText]);

  const matchedIngredients = useMemo(() => {
    return apiMatches;
  }, [apiMatches]);

  const unmatchedIngredients = useMemo(() => {
    if (!ingredientText.trim()) return [];
    
    // Parse sections to get proper chunks
    const sections = parseIngredientSections(ingredientText);
    const allChunks: string[] = [];
    for (const section of sections) {
      const chunks = splitIngredients(section.content);
      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (trimmed.length >= 2) {
          allChunks.push(trimmed);
        }
      }
    }

    const unmatched: string[] = [];

    for (const chunk of allChunks) {
      // Normalize chunk the same way the API does (including quote + period stripping)
      const normalizedChunk = chunk
        .toLowerCase()
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\.$/, '')
        .replace(/^(?:active|inactive|ingredients)\s*:?\s*/i, '')
        .replace(/\s*[\(\[\{]\s*\d+(?:\.\d+)?\s*%?\s*[\)\]\}]\s*/g, ' ')
        .replace(/\s*\d+(?:\.\d+)?\s*%\s*/g, ' ')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Skip section headers
      if (/^(?:active|inactive|ingredients)\s*:?$/i.test(normalizedChunk)) continue;
      if (normalizedChunk.length < 2) continue;
      
      // Check if this chunk was matched by the API (using the raw names the API returned)
      if (!matchedRawNames.has(normalizedChunk)) {
        unmatched.push(chunk);
      }
    }
    return unmatched;
  }, [ingredientText, matchedRawNames]);

  const ratingCounts = useMemo(() => {
    // This is now computed server-side, we'll fetch it
    return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }, []);

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
      const r = m.ingredient.rating;
      if (r !== null && r !== undefined) {
        counts[r] = (counts[r] || 0) + 1;
      }
    });
    return counts;
  }, [matchedIngredients]);

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
              {loading && (
                <p className="text-xs text-[var(--ds-color-text-subtle)] mt-2 animate-pulse">
                  Checking ingredients...
                </p>
              )}
            </div>

            {/* Skin Type Filter */}
            <SkinTypeSelect
              value={selectedSkinType}
              onChange={setSelectedSkinType}
            />
          </div>

          {ingredientText.trim() && (
            <>
              {/* Match Summary */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[5, 4, 3, 2, 1, 0].map((rating) => (
                  <div
                    key={rating}
                    className={`p-3 rounded-xl text-center ${getRatingColorBorder(rating)} ${getRatingColor(rating)}`}
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-block bg-[var(--ds-color-brand1-surface-default)] text-[var(--ds-color-brand1-text-default)]`}
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
                                  style={{ maxWidth: "400px" }}
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
                        {section.items.map((matched) => {
                          const isBanned = matched.ingredient.regulatory?.status === 'banned';
                          return (
                          <div
                            key={matched.ingredient.id}
                            onClick={() =>
                              setSelectedIngredient(matched.ingredient)
                            }
                            className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
                              isBanned
                                ? 'border-[var(--ds-color-danger-border-default)] bg-[var(--ds-color-danger-surface-default)]/10 hover:border-[var(--ds-color-danger-border-strong)]'
                                : 'border-(--ds-color-accent-border-default) hover:border-(--ds-color-accent-border-strong)'
                            }`}
                          >
                            {isBanned && (
                              <div className="flex items-center gap-2 mb-2">
                                <ExclamationmarkTriangleFillIcon className="text-[var(--ds-color-danger-text-default)]" aria-label="Banned ingredient warning" />
                                <span className="text-sm font-bold text-[var(--ds-color-danger-text-default)]">
                                  Banned Ingredient
                                </span>
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className={`font-semibold ${isBanned ? 'text-[var(--ds-color-danger-text-default)]' : 'text-[var(--ds-color-text-default)]'}`}>
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
                                  {matched.ingredient.regulatory && (
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${
                                      matched.ingredient.regulatory.status === 'banned'
                                        ? 'bg-[var(--ds-color-danger-surface-default)] text-[var(--ds-color-danger-text-default)]'
                                        : 'bg-[var(--ds-color-warning-surface-default)] text-[var(--ds-color-warning-text-default)]'
                                    }`}>
                                      {matched.ingredient.regulatory.status === 'banned' && (
                                        <ExclamationmarkTriangleFillIcon className="w-3 h-3" aria-label="Banned" />
                                      )}
                                      {matched.ingredient.regulatory.status === 'banned' ? 'BANNED' : 'RESTRICTED'}
                                      {matched.ingredient.regulatory.annex && ` (Annex ${matched.ingredient.regulatory.annex})`}
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
                                className={`border border-[var(--ds-color-border-subtle)] flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(matched.ingredient.rating)}`}
                              >
                                <div className="text-xs font-medium opacity-80">
                                  {getRatingLabel(matched.ingredient.rating)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        )}
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
                        href="https://library.scconline.org/is-cacheable/1708705747445/Comedogenicity-Irritancy-Commonly-Used-Skincare-Products.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--ds-color-info-text-subtle)] underline hover:text-[var(--ds-color-info-text-default)]"
                      >
                        Fulton (1989) — 200+ ingredienser; J. Soc. Cosmet. Chem. 40:321-333
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
          selectedSkinType={selectedSkinType}
          onSkinTypeChange={setSelectedSkinType}
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
            className="bg-[var(--ds-color-neutral-base-contrast-default)] rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto border border-[var(--ds-color-border-default)] shadow-2xl"
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
                  {selectedIngredient.rating ?? '-'}
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
                selectedIngredient.rating !== null &&
                selectedIngredient.rating !== undefined &&
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

              {selectedIngredient.regulatory && (
                <div>
                  <h4 className="font-semibold text-[var(--ds-color-text-default)] mb-1">
                    Regulatory Status
                  </h4>
                  <div className={`p-3 rounded-lg ${
                    selectedIngredient.regulatory.status === 'banned'
                      ? 'bg-[var(--ds-color-danger-surface-default)] border border-[var(--ds-color-danger-border-default)]'
                      : 'bg-[var(--ds-color-warning-surface-default)] border border-[var(--ds-color-warning-border-default)]'
                  }`}>
                    <div className={`flex items-center gap-2 font-bold text-sm ${
                      selectedIngredient.regulatory.status === 'banned'
                        ? 'text-[var(--ds-color-danger-text-default)]'
                        : 'text-[var(--ds-color-warning-text-default)]'
                    }`}>
                      {selectedIngredient.regulatory.status === 'banned' && (
                        <ExclamationmarkTriangleFillIcon aria-label="Banned" />
                      )}
                      {selectedIngredient.regulatory.status === 'banned' ? 'BANNED' : 'RESTRICTED'}
                      {selectedIngredient.regulatory.annex && ` — Annex ${selectedIngredient.regulatory.annex}`}
                    </div>
                    {selectedIngredient.regulatory.restriction_details && (
                      <p className={`text-xs mt-1 ${
                        selectedIngredient.regulatory.status === 'banned'
                          ? 'text-[var(--ds-color-danger-text-subtle)]'
                          : 'text-[var(--ds-color-warning-text-subtle)]'
                      }`}>
                        {selectedIngredient.regulatory.restriction_details}
                      </p>
                    )}
                    {selectedIngredient.regulatory.chemical_name && selectedIngredient.regulatory.chemical_name !== selectedIngredient.inciName && (
                      <p className={`text-xs mt-1 ${
                        selectedIngredient.regulatory.status === 'banned'
                          ? 'text-[var(--ds-color-danger-text-subtle)]'
                          : 'text-[var(--ds-color-warning-text-subtle)]'
                      }`}>
                        Chemical name: {selectedIngredient.regulatory.chemical_name}
                      </p>
                    )}
                    {selectedIngredient.regulatory.glossary_name && (
                      <p className={`text-xs mt-1 ${
                        selectedIngredient.regulatory.status === 'banned'
                          ? 'text-[var(--ds-color-danger-text-subtle)]'
                          : 'text-[var(--ds-color-warning-text-subtle)]'
                      }`}>
                        Also known as: {selectedIngredient.regulatory.glossary_name}
                      </p>
                    )}
                    {selectedIngredient.regulatory.conditions && (
                      <div className={`mt-2 p-2 rounded bg-[var(--ds-color-surface-default)]/50 ${
                        selectedIngredient.regulatory.status === 'banned'
                          ? 'text-[var(--ds-color-danger-text-subtle)]'
                          : 'text-[var(--ds-color-warning-text-subtle)]'
                      }`}>
                        <p className="text-xs font-semibold mb-1">Conditions:</p>
                        <p className="text-xs">{explainConditions(selectedIngredient.regulatory.conditions)}</p>
                      </div>
                    )}
                    <a
                      href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009R1223"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 text-xs mt-2 underline hover:opacity-80 ${
                        selectedIngredient.regulatory.status === 'banned'
                          ? 'text-[var(--ds-color-danger-text-subtle)]'
                          : 'text-[var(--ds-color-warning-text-subtle)]'
                      }`}
                    >
                      EU Cosmetics Regulation (EC) No 1223/2009
                    </a>
                  </div>
                </div>
              )}

              <div className="text-xs space-y-2">
                {selectedIngredient.ratings && selectedIngredient.ratings.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-[var(--ds-color-text-subtle)] mb-1.5">
                      Source Ratings
                    </h4>
                    <div className="space-y-1.5">
                      {selectedIngredient.ratings.map((r) => {
                        // Find the source URL for this rating
                        const sourceUrl = selectedIngredient.sourceUrls?.find(
                          s => s.name === r.source_name
                        );
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
                        const chipColor = sourceUrl
                          ? (typeColors[sourceUrl.type] || typeColors.database)
                          : "bg-[var(--ds-color-neutral-surface-default)] text-[var(--ds-color-neutral-text-default)]";
                        return (
                          <div key={r.source_name} className="flex items-center justify-between">
                            {sourceUrl ? (
                              <a
                                href={sourceUrl.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`text-xs px-2 py-1 rounded-full hover:opacity-80 transition-opacity ${chipColor}`}
                              >
                                {r.source_name}
                              </a>
                            ) : (
                              <span className={`text-xs px-2 py-1 rounded-full ${chipColor}`}>
                                {r.source_name}
                              </span>
                            )}
                            <div className="flex items-center gap-3">
                              <span className={`font-bold ${
                                r.rating >= 4 ? 'text-[var(--ds-color-danger-text-default)]' :
                                r.rating >= 3 ? 'text-[var(--ds-color-warning-text-default)]' :
                                'text-[var(--ds-color-success-text-default)]'
                              }`}>
                                {r.rating}/5
                              </span>
                              {r.irritancy !== null && r.irritancy !== undefined && (
                                <span className="text-xs text-[var(--ds-color-text-subtle)] opacity-70">
                                  irritancy: {r.irritancy}/5
                                </span>
                              )}
                              <span className="text-[var(--ds-color-text-subtle)] opacity-60 text-xs">
                                confidence: {r.evidence_level}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-[var(--ds-color-text-subtle)] opacity-50 mt-3">
                      Confidence reflects how much evidence supports this rating (high = multiple studies, low = limited data)
                    </p>
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
