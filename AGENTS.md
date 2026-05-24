# AGENTS.md — Tekstilinnsamling + Pore-vakten

## Ingredient Database (`public/ingredients.json`)

### Structure

```typescript
interface Ingredient {
  id: string;                    // URL-safe slug (e.g., "isopropyl-myristate")
  inciName: string;              // Official INCI name (e.g., "Isopropyl Myristate")
  commonNames: string[];         // Aliases/alt names (e.g., ["IPM"])
  rating: number;                // 0-5 comedogenicity scale
  category: string;               // e.g., "Emollient", "Sunscreen"
  categoryGroup?: string;         // Optional grouping
  function?: string[];           // e.g., ["emollient", "slip_agent"]
  description: string;
  skinTypeNotes: Record<SkinType, "safe" | "caution" | "avoid">;
  flags?: string[];             // e.g., ["highly_comedogenic"]
  evidenceLevel: "high" | "medium" | "low";
  irritancy: number;            // 0-5 irritation scale
  sourceUrls: {                  // Clickable source links
    name: string;
    url: string;
    type: "government" | "study" | "regulatory" | "database" | "reference" | "github";
  }[];
  sources?: string[];           // Internal tracking (e.g., ["emmanuel.skin"])
}
```

### Adding New Ingredients

1. Open `public/ingredients.json`
2. Add to the `ingredients` array:

```json
{
  "id": "my-new-ingredient",
  "inciName": "My New Ingredient",
  "commonNames": ["MNI", "Alternative Name"],
  "rating": 2,
  "category": "Emollient",
  "description": "Brief description of what it is and its comedogenicity risk.",
  "skinTypeNotes": {
    "oily": "caution",
    "dry": "safe",
    "sensitive": "caution",
    "acneProne": "avoid",
    "normal": "safe"
  },
  "evidenceLevel": "medium",
  "irritancy": 1,
  "sourceUrls": [
    {
      "name": "INCIDecoder",
      "url": "https://incidecoder.com/ingredients/my-new-ingredient",
      "type": "database"
    }
  ]
}
```

3. Run `pnpm build` to verify JSON is valid
4. Test in the app by pasting an ingredient list containing the new name

### Rating Guidelines

| Rating | Meaning | Action for acne-prone |
|--------|---------|----------------------|
| 0 | Non-comedogenic | Safe |
| 1 | Very low risk | Generally safe |
| 2 | Low risk | Usually safe; caution if very prone |
| 3 | Moderate risk | Avoid in leave-on products |
| 4 | High risk | Avoid on face |
| 5 | Very high risk | Avoid entirely |

Scale based on **Fulton 1989** rabbit ear assay. Note: REA is more sensitive than human skin.

## Intended Ingredient Matching Logic

The matcher (`findMatchesInText()` in `PoreChecker.tsx`) handles:

1. **URL decoding**: `%20`, `$20`, `%2C` etc. → real characters
2. **Active/Inactive split detection**: Splits list at "ACTIVE/INACTIVE INGREDIENTS" headers
3. **Section-aware position tracking**: "1st active ingredient" vs "1st inactive ingredient"
4. **Parenthetical stripping**: `GLYCINE SOJA (SOYBEAN) OIL` → matches `Glycine Soja Oil`
5. **Whole-word regex matching**: Prevents false positives (e.g., "Sodium" matching "Sodium Lauryl Sulfate")
6. **Deduplication**: One match per ingredient ID even if multiple aliases appear

### Sorting Order

1. Section: active → unknown → inactive
2. Rating: descending (worst first)
3. Position: ascending (appearance order)

## Data Sources & Legal

### ✅ Safe to use (already merged)
- **Emmanuel.Skin** (GitHub): https://github.com/VincentEmmanuel/emmanuel.skin — 150 ingredients, MIT license
- **Skincare Ingredient Scanner** (GitHub): https://github.com/ruupedev/skincare-ingredient-scanner — 166 ingredients, open source
- **Comedogenic Ingredients** (GitHub): https://github.com/e-zob/comedogenic-ingredients — 98 ingredients, open source
- **BEAUTEE dataset** (GitHub): https://github.com/beauteeru/cosmetic-ingredients-dataset — 28K identifiers, MIT license

### ⚠️ Do NOT scrape (ToS violations)
- **SkinSort**: Explicitly prohibits scraping in ToS
- **CosDNA**: Blocks AI crawlers, no bulk access, legally grey
- **INCIDecoder**: No explicit ban but no permission either — grey area
- **EWG Skin Deep**: Proprietary, legally risky

### ✅ Regulatory sources (free, authoritative)
- **EU CosIng**: https://ec.europa.eu/growth/tools-databases/cosing/ — 30K ingredients, open data
- **CIR (Cosmetic Ingredient Review)**: https://cir-reports.cir-safety.org/ — Safety assessments, public access
- **PubMed**: https://pubmed.ncbi.nlm.nih.gov/ — Peer-reviewed studies

## Build & Deploy

```bash
# Install dependencies
pnpm install

# Dev server
pnpm dev

# Production build (static export)
pnpm build

# The `out/` directory contains static files for deployment
```

## Known Quirks

1. **Merged ingredients lack some fields**: Ingredients from external datasets may not have `function`, `flags`, `categoryGroup`, or `skinTypeNotes`. The UI guards against missing fields.

2. **Static export limitations**: No API routes, no server-side rendering, no dynamic routes.

3. **Ingredient ordering ambiguity**: For OTC drug-cosmetics (sunscreens), active ingredients are listed alphabetically with %, inactive by concentration within inactive section only. Cross-section comparison is not possible.

4. **Rating interpretation**: Ratings 4-5 from rabbit ear assay may not correlate to human comedogenicity at formulation concentrations. The Draelos 2006 disclaimer addresses this.

## Adding Features

### New ingredient data field
1. Update `Ingredient` interface in `PoreChecker.tsx`
2. Update JSON schema in `public/ingredients.json`
3. Add UI rendering in the detail modal or ingredient card
4. Guard against undefined for merged ingredients

### New data source
1. Verify license/ToS allows reuse
2. Prefer open-source GitHub repos with clear licenses
3. Avoid scraping commercial databases without permission, we might manually add some, but have CLEAR attribution, so it could be removed in the future if it becomes an issue, this is primarily something just intended for personal use... so in theory this shouldn't be a big deal at all.
4. Document source in `ingredients.json` `sources` array

### New UI feature
1. Check if it works with both light and dark mode (Tailwind `dark:` prefixes)
2. Ensure it handles missing data gracefully (many merged ingredients have sparse fields)
3. Test with both single-list and active/inactive-split ingredient lists

## Testing Checklist

Before committing changes:
- [ ] `pnpm build` passes without errors

## Version History

- **v1.3.0** (2026-05-24): Expanded to 377 ingredients from 3 open-source datasets + manual additions
- **v1.2.0**: Added source URLs, skin type notes, evidence levels
- **v1.1.0**: Initial 113-ingredient database

## Contact / Issues

For questions about the codebase or data sources, check:
- This AGENTS.md file
- The `sources` array in `public/ingredients.json`
- Individual ingredient `sourceUrls` for specific citations
