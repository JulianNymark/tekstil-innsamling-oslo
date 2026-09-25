/**
 * Splits an ingredient list string by commas/semicolons/newlines/pipes/periods,
 * but respects quoted strings and balanced parentheses.
 *
 * Periods only act as separators when followed by whitespace or at the end of
 * the string, so interior periods (e.g. "HYDROXYETHYL.ACRYLATE") are preserved.
 * Numeric commas (e.g. "1,2-hexanediol") are treated as part of the name.
 *
 * E.g. `"1,2-hexanediol", propylene glycol`
 *   -> `["1,2-hexanediol", "propylene glycol"]`
 */
export function splitIngredients(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let parenDepth = 0;

  const pushCurrent = () => {
    const trimmed = current.trim().replace(/\.$/, "");
    if (trimmed.length >= 2) {
      result.push(trimmed);
    }
    current = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes) {
      if (char === "(") {
        parenDepth++;
        current += char;
        continue;
      }
      if (char === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        current += char;
        continue;
      }

      if (parenDepth === 0) {
        // A comma between two digits belongs to the name (e.g. "1,2-hexanediol")
        const isNumericComma =
          char === "," &&
          /\d/.test(text[i - 1] ?? "") &&
          /\d/.test(text[i + 1] ?? "");

        // A period separates ingredients when followed by whitespace or EOF
        const isPeriodSeparator =
          char === "." &&
          (i === text.length - 1 || /\s/.test(text[i + 1] ?? ""));

        const isSeparator =
          char === "," || char === ";" || char === "|" || char === "\n";

        if (!isNumericComma && (isSeparator || isPeriodSeparator)) {
          pushCurrent();
          continue;
        }
      }
    }

    current += char;
  }

  pushCurrent();

  return result;
}
