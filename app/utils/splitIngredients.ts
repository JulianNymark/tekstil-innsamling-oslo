/**
 * Splits an ingredient list string by commas/semicolons/newlines/pipes,
 * but respects quoted strings and balanced parentheses.
 *
 * E.g. `"1,2-hexanediol", propylene glycol`
 *   -> `["1,2-hexanediol", "propylene glycol"]`
 */
export function splitIngredients(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let parenDepth = 0;

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

      if (
        (char === "," || char === ";" || char === "|" || char === "\n") &&
        parenDepth === 0
      ) {
        const trimmed = current.trim().replace(/\.$/, "");
        if (trimmed.length >= 2) {
          result.push(trimmed);
        }
        current = "";
        continue;
      }
    }

    current += char;
  }

  const trimmed = current.trim().replace(/\.$/, "");
  if (trimmed.length >= 2) {
    result.push(trimmed);
  }

  return result;
}
