# Server-Side Architecture Plan

## Context
- Current: Static export (`output: "export"`), 22MB ingredients.json loaded client-side
- Target: Server-based Next.js app with API routes, SQLite backend
- Deploy: Fly.io with scale-to-zero

## Storage Options Considered

### 1. SQLite + better-sqlite3 (RECOMMENDED)
**Pros:**
- Single file, zero config, perfect for scale-to-zero
- `better-sqlite3`: synchronous, extremely fast, simpler than async SQLite
- No external database service needed
- Can generate DB at build time from JSON
- Perfect for read-heavy workloads (our use case: ingredient lookups)
- 22MB JSON → ~50-100MB SQLite (with indexes) — still very manageable

**Cons:**
- Single writer (fine for our read-heavy use case)
- Need to regenerate DB when data changes

**Why this wins:** Simplicity, performance, no external deps, perfect for Fly.io scale-to-zero.

### 2. Turso (libSQL)
**Pros:**
- SQLite-compatible with cloud sync
- Branching, replicas, edge distribution
- Free tier generous

**Cons:**
- External service dependency
- Overkill for our use case
- Adds network latency

### 3. PostgreSQL (Vercel, Supabase, etc.)
**Pros:**
- Full-featured RDBMS
- Good for complex queries

**Cons:**
- Overkill for simple ingredient lookups
- External service = cost and complexity
- Needs connection pooling for serverless

## Recommended Architecture

```
┌─────────────────┐
│   Next.js App   │
│  (Server Mode)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ API   │ │Static │
│Routes │ │ Pages │
└───┬───┘ └──┬────┘
    │        │
┌───▼────────▼────┐
│  SQLite DB      │
│  (ingredients.db) │
└─────────────────┘
```

## Database Schema

```sql
-- Core ingredients table
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,
  inci_name TEXT NOT NULL,
  rating INTEGER, -- null = unknown
  irritancy INTEGER DEFAULT 0,
  category TEXT,
  category_group TEXT,
  description TEXT,
  evidence_level TEXT CHECK(evidence_level IN ('high', 'medium', 'low')),
  flags TEXT, -- JSON array
  sources TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Synonyms / common names
CREATE TABLE ingredient_synonyms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL,
  synonym TEXT NOT NULL,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  UNIQUE(ingredient_id, synonym)
);

-- Source URLs
CREATE TABLE ingredient_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  type TEXT CHECK(type IN ('government', 'study', 'regulatory', 'database', 'reference', 'github')),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Skin type notes
CREATE TABLE skin_type_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL,
  skin_type TEXT NOT NULL CHECK(skin_type IN ('oily', 'dry', 'sensitive', 'acneProne', 'normal')),
  advice TEXT NOT NULL CHECK(advice IN ('safe', 'caution', 'avoid')),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  UNIQUE(ingredient_id, skin_type)
);

-- EU Regulatory status (banned/restricted)
CREATE TABLE regulatory_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT,
  inci_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('banned', 'restricted', 'allowed')),
  annex TEXT, -- 'II', 'III', etc.
  restriction_details TEXT, -- concentration limits, conditions
  regulation_source TEXT,
  effective_date TEXT,
  UNIQUE(inci_name)
);

-- Full-text search index
CREATE VIRTUAL TABLE ingredients_fts USING fts5(
  inci_name,
  content='ingredients',
  content_rowid='rowid'
);

-- Indexes for performance
CREATE INDEX idx_ingredients_rating ON ingredients(rating);
CREATE INDEX idx_ingredients_category ON ingredients(category);
CREATE INDEX idx_synonyms_synonym ON ingredient_synonyms(synonym);
CREATE INDEX idx_regulatory_status ON regulatory_status(inci_name, status);
```

## API Routes

```
/api/ingredients/search?q={query}     -- Search by name/synonym
/api/ingredients/{id}                  -- Get single ingredient
/api/ingredients/match                 -- POST: batch match from ingredient list
/api/regulatory?ingredient={name}       -- Check EU regulatory status
/api/sources                           -- List all database sources with metadata
```

## Data Flow

1. **Build time:** `scripts/build-db.ts` reads `ingredients.json`, creates `ingredients.db`
2. **Runtime:** API routes query SQLite via `better-sqlite3`
3. **Client:** PoreChecker calls `/api/ingredients/match` instead of loading JSON

## EU Banned/Restricted Ingredients (Manual Curation)

Key sources:
- EU Cosmetics Regulation (EC) No 1223/2009, Annex II (prohibited)
- Annex III (restricted substances with conditions)
- SCCS Opinions

I'll curate ~50-100 high-impact entries:
- Mercury compounds (banned)
- Lead acetate (restricted in hair dyes)
- Hydroquinone (restricted, 2% in face creams)
- Certain parabens (prohibited in leave-on products for children)
- etc.

## Database Explainer (UI Component)

Create `DatabaseSources.tsx` component showing:

| Database | Description | Managed By | Type |
|----------|-------------|------------|------|
| **PubChem** | Free chemical database with structures, properties, synonyms | 🇺🇸 US National Institutes of Health (NIH) | Reference |
| **EU CosIng** | Official EU cosmetic ingredient database with regulatory status | 🇪🇺 European Commission | Regulatory |
| **CIR** | Safety reviews of cosmetic ingredients | 🇺🇸 Personal Care Products Council (industry-funded) | Study |
| **ECHA EC Inventory** | Registry of all chemicals on EU market | 🇪🇺 EU Chemicals Agency | Regulatory |
| **BEAUTEE** | Cosmetic ingredient identifiers dataset | 🇷🇺 BEAUTEE (MIT License) | Reference |

## Implementation Steps

1. **Install deps:** `better-sqlite3`, `@types/better-sqlite3`
2. **Remove static export:** Update `next.config.ts`
3. **Build script:** `scripts/build-db.ts` — converts JSON to SQLite
4. **Database module:** `lib/db.ts` — singleton DB connection
5. **API routes:** Create `app/api/` routes
6. **Update PoreChecker:** Use API instead of client-side JSON
7. **Add regulatory data:** Curate EU banned/restricted list
8. **Add explainer component:** DatabaseSources.tsx
9. **Test & deploy:** Verify on Fly.io

## File Size Impact

- Current: `ingredients.json` = 22MB
- SQLite DB: ~50-100MB (with FTS indexes)
- Client download: ~0MB (data comes from API)
- API response: ~1-5KB per ingredient lookup

## Next Steps

Start implementing: install deps, create build script, convert to server mode.
