<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — Tekstilinnsamling + Pore-vakten

## Ingredient Database (`data/ingredients.db`)

The SQLite database is the **single source of truth**. It is committed to git. All ingredient data lives in the DB tables — there is no JSON fallback.

### Schema

```
ingredients (id, inci_name, irritancy, category, category_group, description, flags)
ingredient_ratings (ingredient_id, source_name, rating, irritancy, scale, evidence_level, sample_size, notes)
ingredient_synonyms (ingredient_id, synonym)
ingredient_sources (ingredient_id, name, url, type)
skin_type_notes (ingredient_id, skin_type, advice)
regulatory_status (inci_name, chemical_name, glossary_name, status, annex, restriction_details, conditions, regulation_source, effective_date)
ingredients_fts (FTS5 virtual table for full-text search)
```

### Adding / Editing Ingredients

Use a SQLite editor (e.g. [TablePlus](https://tableplus.com/), [DB Browser for SQLite](https://sqlitebrowser.org/), or `sqlite3` CLI) to modify `data/ingredients.db` directly.

**To add a new ingredient:**

1. Insert into `ingredients` table
2. Add ratings to `ingredient_ratings` if you have comedogenicity data
3. Add synonyms to `ingredient_synonyms` for better matching
4. Add source URLs to `ingredient_sources`
5. Add skin type notes to `skin_type_notes`

**To add EU regulatory data:**

Run the EUR-Lex importer (merges, does not wipe):

```bash
python scripts/import-eur-lex-html.py
```

Or add rows directly to `regulatory_status`.

### Re-importing Data (Changing Processing Rules)

All external data sources follow a **fetch → process → import** pipeline. If you want to change how a source is processed (e.g., remap categories, fix rating scale, add synonyms):

```
data/sources/<source>.json     # Raw fetched data (cached)
scripts/process-sources.py     # Transformation rules live here
  ↓
data/bundles/<source>.json     # Normalized bundle
scripts/import-data.py         # Import into DB (delete-then-replace)
```

**Example: Re-process BEAUTEE with new rules**

```bash
# 1. Edit transformation rules in scripts/process-sources.py
# 2. Re-process the raw data
python scripts/process-sources.py --source beautee

# 3. Review the bundle in data/bundles/beautee.json
# 4. Re-import into DB (deletes old beautee data, inserts new)
python scripts/import-data.py --import data/bundles/beautee.json
```

**To see what sources exist and their counts:**

```bash
python scripts/import-data.py --list
```

**To export a source bundle from the DB (for backup or migration):**

```bash
python scripts/import-data.py --export beautee --output data/bundles/beautee.json
```

### Data Pipeline Architecture

```
External Source (GitHub, API, etc.)
    ↓
scripts/fetch-<source>.py          # Downloads raw data, caches locally
    ↓
data/sources/<source>.json         # Raw cached data (not committed to git)
    ↓
scripts/process-sources.py         # Transforms raw → normalized bundle
    ↓
data/bundles/<source>.json         # Normalized bundle (committed to git)
    ↓
scripts/import-data.py           # Deletes old source data, inserts new
    ↓
data/ingredients.db                # SQLite DB (committed to git, single source of truth)
```

**Pipeline scripts:**

| Script | Purpose |
|--------|---------|
| `scripts/fetch-beautee.py` | Downloads BEAUTEE CSV from GitHub |
| `scripts/fetch-emmanuel.py` | Downloads Emmanuel.Skin JSON from GitHub |
| `scripts/fetch-skincare-scanner.py` | Downloads Skincare Ingredient Scanner JSON |
| `scripts/fetch-comedogenic-ingredients.py` | Downloads Comedogenic Ingredients JSON |
| `scripts/process-sources.py` | Applies transformation rules to all raw sources |
| `scripts/import-data.py` | Imports/exports bundles; delete-then-replace into DB |
| `scripts/import-eur-lex-html.py` | Downloads EUR-Lex HTML, merges regulatory data |

**Adding a new external source:**

1. Create `scripts/fetch-<source>.py` that downloads raw data to `data/cache/` and normalizes to `data/sources/<source>.json`
2. Add a processor function in `scripts/process-sources.py` that transforms the raw data into our bundle format
3. Run `python scripts/process-sources.py --source <source>`
4. Review `data/bundles/<source>.json`
5. Run `python scripts/import-data.py --import data/bundles/<source>.json`
6. Commit `data/bundles/<source>.json` and `data/ingredients.db`

**Important:** Raw data in `data/sources/` and `data/cache/` is NOT committed to git. Only the bundles and the DB are committed.

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

The matcher (API route `POST /api/ingredients/match`) handles:

1. **URL decoding**: `%20`, `$20`, `%2C` etc. → real characters
2. **Active/Inactive split detection**: Splits list at "ACTIVE/INACTIVE INGREDIENTS" headers
3. **Quoted string preservation**: `"1,2-hexanediol"` stays as one ingredient (comma inside quotes not a separator)
4. **Parenthetical stripping**: `GLYCINE SOJA (SOYBEAN) OIL` → matches `Glycine Soja Oil`
5. **Word-boundary matching**: Prevents false positives (e.g., "hexane" no longer matches inside "1,2-hexanediol")
6. **Deduplication**: One match per ingredient ID even if multiple aliases appear

### Sorting Order

1. Section: active → unknown → inactive
2. Rating: descending (worst first)
3. Position: ascending (appearance order)

## Architecture (v2.1 — SQLite as Source of Truth)

### Backend
- **Database**: SQLite (`data/ingredients.db`) with full-text search (FTS5). Committed to git.
- **API Routes**: Next.js App Router API routes
  - `GET /api/ingredients` — Paginated browse with search/filter
  - `POST /api/ingredients/match` — Batch ingredient matching from pasted lists
  - `GET /api/ingredients/search?q={query}` — Quick search
  - `GET /api/regulatory?ingredient={name}` — EU regulatory status lookup
  - `GET /api/sources` — Database source metadata
- **Build**: `pnpm build` (no longer static export)

### Data Sources & Legal

#### ✅ Safe to use (already merged)
- **Emmanuel.Skin** (GitHub): https://github.com/VincentEmmanuel/emmanuel.skin — 150 ingredients, MIT license
- **Skincare Ingredient Scanner** (GitHub): https://github.com/ruupedev/skincare-ingredient-scanner — 166 ingredients, open source
- **Comedogenic Ingredients** (GitHub): https://github.com/e-zob/comedogenic-ingredients — 98 ingredients, open source
- **BEAUTEE dataset** (GitHub): https://github.com/beauteeru/cosmetic-ingredients-dataset — 28K identifiers, MIT license

#### ⚠️ Do NOT scrape (ToS violations)
- **SkinSort**: Explicitly prohibits scraping in ToS
- **CosDNA**: Blocks AI crawlers, no bulk access, legally grey
- **INCIDecoder**: No explicit ban but no permission either — grey area
- **EWG Skin Deep**: Proprietary, legally risky
- **beautee.ru**: Commercial product with proprietary analysis data

#### ✅ Regulatory sources (free, authoritative)
- **EU CosIng / EUR-Lex**: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R1223 — scraped via `scripts/import-eur-lex-html.py`
- **CIR (Cosmetic Ingredient Review)**: https://cir-reports.cir-safety.org/ — Safety assessments, public access
- **PubMed**: https://pubmed.ncbi.nlm.nih.gov/ — Peer-reviewed studies

## Build & Deploy

```bash
# Install Node dependencies
pnpm install

# Python dependencies (for data pipeline scripts)
# Uses .venv virtualenv with requests, beautifulsoup4, etc.
# If missing: uv pip install requests beautifulsoup4

# Dev server
pnpm dev

# Production build
pnpm build:iso

# Database commands
pnpm db:list                          # List all sources and their counts
pnpm db:export -- <source>            # Export a source bundle (e.g., pnpm db:export -- emmanuel)
pnpm db:import -- <path>             # Import a bundle into DB (e.g., pnpm db:import -- data/bundles/emmanuel.json)
pnpm db:process                       # Process all raw sources into bundles
pnpm db:process -- --source <name>    # Process specific source only
pnpm db:regulatory                    # Update EU regulatory data (cached, merges)
pnpm db:regulatory:refresh            # Force re-download EUR-Lex HTML

# Find unused dependencies, exports, and files (run before committing)
pnpm knip

# Deploy to Fly.io (scale-to-zero)
fly deploy
```

## Known Quirks

1. **Merged ingredients lack some fields**: Ingredients from external datasets may not have `function`, `flags`, `categoryGroup`, or `skinTypeNotes`. The UI guards against missing fields.

2. **SQLite is committed to git**: The `data/ingredients.db` file is the source of truth. When you modify it, commit the changes. It is ~27 MB.

3. **Ingredient ordering ambiguity**: For OTC drug-cosmetics (sunscreens), active ingredients are listed alphabetically with %, inactive by concentration within inactive section only. Cross-section comparison is not possible.

4. **Rating interpretation**: Ratings 4-5 from rabbit ear assay may not correlate to human comedogenicity at formulation concentrations. The Draelos 2006 disclaimer addresses this.

## Adding Features

### New ingredient data field
1. Update `Ingredient` interface in `PoreChecker.tsx`
2. Update SQLite schema (if needed) — add column via migration or recreate DB
3. Add UI rendering in the detail modal or ingredient card
4. Guard against undefined for merged ingredients

### New data source
1. Verify license/ToS allows reuse
2. Prefer open-source GitHub repos with clear licenses
3. Avoid scraping commercial databases without permission, we might manually add some, but have CLEAR attribution, so it could be removed in the future if it becomes an issue, this is primarily something just intended for personal use... so in theory this shouldn't be a big deal at all.
4. Document source in `ingredient_sources` table
5. Commit the updated `data/ingredients.db`

### New UI feature
1. Check if it works with both light and dark mode (Tailwind `dark:` prefixes)
2. Ensure it handles missing data gracefully (many merged ingredients have sparse fields)
3. Test with both single-list and active/inactive-split ingredient lists

## Testing Checklist

Before committing changes:
- [ ] `pnpm lint` passes without errors
- [ ] `pnpm knip` passes without issues
- [ ] `pnpm build:iso` passes without errors
- [ ] `data/ingredients.db` is committed if you changed data

## Version History

- **v2.1.0** (2026-05-25): SQLite database is now the single source of truth. Removed `public/ingredients.json` and `scripts/build-db.ts`. EUR-Lex importer caches locally and merges into DB without wiping. Added `scripts/import-data.py` for source-level re-import. Removed unused `scripts/import-eur-lex-annexes.py`.
- **v2.0.0** (2026-05-25): Server-based architecture with SQLite database and API routes. Added EU regulatory status (banned/restricted ingredients). Database explainer component with source metadata.
- **v1.4.0** (2026-05-25): Expanded to 28,489 ingredients by merging BEAUTEE Cosmetic Ingredients Dataset (28K+ INCI identifiers with CAS/EINECS/PubChem links). Most new entries have no comedogenicity rating yet — they serve as recognized ingredient names for better matching coverage.
- **v1.3.0** (2026-05-24): Expanded to 377 ingredients from 3 open-source datasets + manual additions
- **v1.2.0**: Added source URLs, skin type notes, evidence levels
- **v1.1.0**: Initial 113-ingredient database

## Contact / Issues

For questions about the codebase or data sources, check:
- This AGENTS.md file
- The `ingredient_sources` table in `data/ingredients.db`
- Individual ingredient `sourceUrls` (from the API) for specific citations
