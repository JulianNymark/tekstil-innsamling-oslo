export interface IngredientSection {
  name: "active" | "inactive" | "unknown";
  content: string;
}

/**
 * Splits an ingredient list text into active / inactive sections.
 *
 * Rule:
 * - If we find "active" (case-insensitive), everything after it is active
 *   until we hit another "ingredients" header (case-insensitive).
 * - Everything after that second header is inactive.
 * - If no split is detected, the whole text is treated as a single "unknown" list.
 */
export function parseIngredientSections(
  text: string,
): IngredientSection[] {
  const sections: IngredientSection[] = [];

  // Strip any leading label like "INCI Formula:", "Ingredients:", etc.
  // But NOT "active ingredients:" or "inactive ingredients:" — those are handled below.
  let strippedText = text;
  if (!/^\s*(?:active|inactive)/i.test(text)) {
    strippedText = text.replace(/^\s*[\w\s]+:\s*/i, '').trim();
  }

  // Find "active" as the start marker
  const activeMatch = strippedText.match(/\bactive\b/i);
  if (!activeMatch) {
    // No active section — strip bare "ingredients:" prefix if present
    const content = strippedText
      .replace(/^\s*ingredients\s*:\s*/i, '')
      .trim();
    return [{ name: "unknown", content }];
  }

  const activeIndex = activeMatch.index ?? 0;

  // Text before the active header (if any)
  if (activeIndex > 0) {
    const preamble = strippedText.slice(0, activeIndex).trim();
    if (preamble.length > 0) {
      sections.push({ name: "unknown", content: preamble });
    }
  }

  // Skip past the active header (including "ingredients" and colon if present)
  const afterActiveWord = activeIndex + activeMatch[0].length;
  const afterActiveText = strippedText.slice(afterActiveWord);
  const activeHeaderEndMatch = afterActiveText.match(/^[^:\n]*:?\s*/);
  const activeContentStart =
    afterActiveWord + (activeHeaderEndMatch?.[0].length ?? 0);

  // Look for the next "(inactive )?ingredients" header after the active one
  const remaining = strippedText.slice(activeContentStart);
  const splitMatch = remaining.match(
    /\b(?:inactive\s+)?ingredients\b[^:\n]*:?\s*/i,
  );

  if (splitMatch && splitMatch.index !== undefined) {
    const splitIndex = splitMatch.index;
    const splitEnd = splitIndex + splitMatch[0].length;

    const activeContent = remaining.slice(0, splitIndex).trim();
    if (activeContent.length > 0) {
      sections.push({ name: "active", content: activeContent });
    }

    const inactiveContent = remaining.slice(splitEnd).trim();
    if (inactiveContent.length > 0) {
      sections.push({ name: "inactive", content: inactiveContent });
    }
  } else {
    // No ingredients marker found after active — everything is active
    const activeContent = remaining.trim();
    if (activeContent.length > 0) {
      sections.push({ name: "active", content: activeContent });
    }
  }

  return sections;
}
