"use client";

import { useState, useEffect, useMemo } from "react";

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
}

type SkinType = "all" | "oily" | "dry" | "sensitive" | "acneProne" | "normal";
type Mode = "check" | "browse";

function getRatingColor(rating: number): string {
  if (rating === 0) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (rating === 1) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";
  if (rating === 2) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (rating === 3) return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
  if (rating === 4) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return "bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300";
}

function getRatingLabel(rating: number): string {
  if (rating === 0) return "Non-comedogenic";
  if (rating === 1) return "Very Low";
  if (rating === 2) return "Low";
  if (rating === 3) return "Moderate";
  if (rating === 4) return "High";
  return "Very High";
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
    safe: { text: "Safe for your skin type", color: "text-emerald-600 dark:text-emerald-400" },
    caution: { text: "Use with caution", color: "text-yellow-600 dark:text-yellow-400" },
    avoid: { text: "Best to avoid", color: "text-red-600 dark:text-red-400" },
  };

  return adviceMap[advice]?.text || advice;
}

function getSkinTypeAdviceColor(ingredient: Ingredient, skinType: SkinType): string {
  if (skinType === "all") return "";
  const advice = ingredient.skinTypeNotes[skinType];
  if (!advice) return "";

  const colorMap: Record<string, string> = {
    safe: "text-emerald-600 dark:text-emerald-400",
    caution: "text-yellow-600 dark:text-yellow-400",
    avoid: "text-red-600 dark:text-red-400",
  };

  return colorMap[advice] || "";
}

function findMatchesInText(
  text: string,
  ingredients: Ingredient[]
): MatchedIngredient[] {
  if (!text.trim()) return [];

  // Some websites copy-paste URL-encoded text. Decode it first.
  let decodedText = text;
  try {
    if (/%20|%2C|%2F|%3B|%7C/.test(text)) {
      decodedText = decodeURIComponent(text);
    } else if (/\$20/.test(text)) {
      // Some sites use $20 instead of %20 for spaces
      decodedText = text.replace(/\$20/g, " ");
    }
  } catch {
    decodedText = text;
  }

  const normalizedText = decodedText.toLowerCase();
  const matches: MatchedIngredient[] = [];
  const matchedIds = new Set<string>();

  for (const ing of ingredients) {
    if (matchedIds.has(ing.id)) continue;

    // Check INCI name as whole word
    const inciPattern = new RegExp(
      "\\b" + escapeRegex(ing.inciName.toLowerCase()) + "\\b"
    );
    if (inciPattern.test(normalizedText)) {
      matches.push({ ingredient: ing, matchedName: ing.inciName, originalText: ing.inciName });
      matchedIds.add(ing.id);
      continue;
    }

    // Check common names as whole words
    for (const commonName of ing.commonNames) {
      const commonPattern = new RegExp(
        "\\b" + escapeRegex(commonName.toLowerCase()) + "\\b"
      );
      if (commonPattern.test(normalizedText)) {
        matches.push({ ingredient: ing, matchedName: commonName, originalText: commonName });
        matchedIds.add(ing.id);
        break;
      }
    }
  }

  // Sort by rating descending (worst first)
  return matches.sort((a, b) => b.ingredient.rating - a.ingredient.rating);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function PoreChecker() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientText, setIngredientText] = useState("");
  const [selectedSkinType, setSelectedSkinType] = useState<SkinType>("all");
  const [mode, setMode] = useState<Mode>("check");
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
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
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ingredients.forEach((ing) => {
      counts[ing.rating] = (counts[ing.rating] || 0) + 1;
    });
    return counts;
  }, [ingredients]);

  const matchedRatingCounts = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    matchedIngredients.forEach((m) => {
      counts[m.ingredient.rating] = (counts[m.ingredient.rating] || 0) + 1;
    });
    return counts;
  }, [matchedIngredients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500 dark:text-zinc-400">Loading ingredients database...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Pore-vakten
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-lg mx-auto">
          Din personlige vakt for porene. Sjekk om skjønnhetsproduktene dine smugler inn uønskte gjester (les: tetter porene).
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setMode("check")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === "check"
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm border border-zinc-200 dark:border-zinc-700"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Check Product
        </button>
        <button
          onClick={() => setMode("browse")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === "browse"
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm border border-zinc-200 dark:border-zinc-700"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          Browse Database
        </button>
      </div>

      {mode === "check" ? (
        <>
          {/* Textarea Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Paste ingredient list
              </label>
              <textarea
                value={ingredientText}
                onChange={(e) => setIngredientText(e.target.value)}
                placeholder="Lim inn ingrediensliste her, f.eks. fra baksiden av kremen din..."
                rows={6}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all resize-y text-sm"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                Kopier og lim inn ingredienslisten fra produktet ditt. Vi sjekker automatisk mot databasen vår — for porene dine fortjener bedre enn restavfall.
              </p>
            </div>

            {/* Skin Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Skin Type:</span>
              <select
                value={selectedSkinType}
                onChange={(e) => setSelectedSkinType(e.target.value as SkinType)}
                className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                {(["all", "oily", "dry", "sensitive", "acneProne", "normal"] as SkinType[]).map(
                  (type) => (
                    <option key={type} value={type}>
                      {getSkinTypeLabel(type)}
                    </option>
                  )
                )}
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
                    <div className="text-2xl font-bold">{matchedRatingCounts[rating] || 0}</div>
                    <div className="text-xs font-medium opacity-80">{getRatingLabel(rating)}</div>
                  </div>
                ))}
              </div>

              {/* Results */}
              {matchedIngredients.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Matched Ingredients ({matchedIngredients.length})
                  </h3>
                  {matchedIngredients.map((matched) => (
                    <div
                      key={matched.ingredient.id}
                      onClick={() => setSelectedIngredient(matched.ingredient)}
                      className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-all hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                              {matched.ingredient.inciName}
                            </h3>
                            {matched.matchedName !== matched.ingredient.inciName && (
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                (matched as &quot;{matched.matchedName}&quot;)
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            {matched.ingredient.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full">
                              {matched.ingredient.category}
                            </span>
                            {matched.ingredient.irritancy > 0 && (
                              <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full">
                                Irritancy: {matched.ingredient.irritancy}/5
                              </span>
                            )}
                            {selectedSkinType !== "all" && (
                              <span className={`text-xs font-medium ${getSkinTypeAdviceColor(matched.ingredient, selectedSkinType)}`}>
                                {getSkinTypeAdvice(matched.ingredient, selectedSkinType)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(matched.ingredient.rating)}`}>
                          <div className="text-2xl font-bold">{matched.ingredient.rating}</div>
                          <div className="text-xs font-medium opacity-80">{getRatingLabel(matched.ingredient.rating)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : unmatchedIngredients.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-500 dark:text-zinc-400">
                    No ingredients parsed. Try pasting a comma-separated list.
                  </p>
                </div>
              ) : null}

              {/* Unmatched ingredients */}
              {unmatchedIngredients.length > 0 && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                    Not in database ({unmatchedIngredients.length})
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">
                    These ingredients were not found in our database. This could mean they are not known to be comedogenic, or we need to add them.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unmatchedIngredients.map((name, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
            className="bg-white dark:bg-zinc-950 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto border border-zinc-200 dark:border-zinc-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                  {selectedIngredient.inciName}
                </h3>
                {selectedIngredient.commonNames.length > 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Also known as: {selectedIngredient.commonNames.join(", ")}
                  </p>
                )}
              </div>
              <div className={`px-3 py-2 rounded-lg text-center ${getRatingColor(selectedIngredient.rating)}`}>
                <div className="text-2xl font-bold">{selectedIngredient.rating}</div>
                <div className="text-xs">{getRatingLabel(selectedIngredient.rating)}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Description</h4>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                  {selectedIngredient.description}
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Functions</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedIngredient.function.map((fn) => (
                    <span
                      key={fn}
                      className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-zinc-800"
                    >
                      {fn.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                  Skin Type Recommendations
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(selectedIngredient.skinTypeNotes).map(([type, advice]) => (
                    <div
                      key={type}
                      className={`p-2 rounded-lg text-xs font-medium ${
                        advice === "safe"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : advice === "caution"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      <div className="font-semibold capitalize">{type.replace(/([A-Z])/g, " $1").trim()}</div>
                      <div className="opacity-80">{advice}</div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedIngredient.irritancy > 0 && (
                <div>
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Irritancy</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${(selectedIngredient.irritancy / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">{selectedIngredient.irritancy}/5</span>
                  </div>
                </div>
              )}

              {selectedIngredient.flags.length > 0 && (
                <div>
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Flags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedIngredient.flags.map((flag) => (
                      <span
                        key={flag}
                        className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-full border border-zinc-200 dark:border-zinc-800"
                      >
                        {flag.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs space-y-2">
                <div className="text-zinc-500 dark:text-zinc-500">
                  Evidence level: {selectedIngredient.evidenceLevel}
                </div>
                
                {selectedIngredient.sourceUrls && selectedIngredient.sourceUrls.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Sources</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredient.sourceUrls.map((source) => {
                        const typeColors: Record<string, string> = {
                          government: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                          study: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
                          regulatory: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
                          database: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                          reference: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
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
              className="mt-6 w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
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
  const [sortBy, setSortBy] = useState<"rating" | "name" | "category">("rating");

  const filteredIngredients = useMemo(() => {
    let filtered = ingredients;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((ing) => {
        const nameMatch = ing.inciName.toLowerCase().includes(query);
        const commonMatch = ing.commonNames.some((name) =>
          name.toLowerCase().includes(query)
        );
        const categoryMatch = ing.category.toLowerCase().includes(query);
        const functionMatch = ing.function.some((fn) =>
          fn.toLowerCase().includes(query)
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
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          About the Comedogenic Scale
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">
          Based on the Fulton 1989 rabbit ear assay (REA). Ratings 0-1 are generally safe, 2-3 use caution, 4-5 avoid for acne-prone skin.
          Note: REA is more sensitive than human skin; concentration and formulation matter.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <span key={r} className={`text-xs px-2 py-1 rounded-full ${getRatingColor(r)}`}>
              {r}: {getRatingLabel(r)}
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[0, 1, 2, 3, 4, 5].map((rating) => (
          <div
            key={rating}
            className={`p-3 rounded-xl text-center ${getRatingColor(rating)}`}
          >
            <div className="text-2xl font-bold">{ratingCounts[rating] || 0}</div>
            <div className="text-xs font-medium opacity-80">{getRatingLabel(rating)}</div>
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
            className="w-full px-4 py-3 pl-11 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400"
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
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Skin Type:</span>
            <select
              value={selectedSkinType}
              onChange={(e) => onSkinTypeChange(e.target.value as SkinType)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              {(["all", "oily", "dry", "sensitive", "acneProne", "normal"] as SkinType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {getSkinTypeLabel(type)}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "rating" | "name" | "category")}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="rating">Rating (High to Low)</option>
              <option value="name">Name (A-Z)</option>
              <option value="category">Category</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-zinc-500 dark:text-zinc-500">
        Showing {filteredIngredients.length} of {ingredients.length} ingredients
      </div>

      {/* Ingredient List */}
      <div className="space-y-3">
        {filteredIngredients.map((ingredient) => (
          <div
            key={ingredient.id}
            onClick={() => onSelectIngredient(ingredient)}
            className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-all hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {ingredient.inciName}
                  </h3>
                  {ingredient.commonNames.length > 0 && (
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                      ({ingredient.commonNames[0]})
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2">
                  {ingredient.description}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full">
                    {ingredient.category}
                  </span>
                  {ingredient.irritancy > 0 && (
                    <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full">
                      Irritancy: {ingredient.irritancy}/5
                    </span>
                  )}
                  {selectedSkinType !== "all" && (
                    <span className={`text-xs font-medium ${getSkinTypeAdviceColor(ingredient, selectedSkinType)}`}>
                      {getSkinTypeAdvice(ingredient, selectedSkinType)}
                    </span>
                  )}
                </div>
              </div>
              <div className={`flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px] ${getRatingColor(ingredient.rating)}`}>
                <div className="text-2xl font-bold">{ingredient.rating}</div>
                <div className="text-xs font-medium opacity-80">{getRatingLabel(ingredient.rating)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredIngredients.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            No ingredients found
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
}
