import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'ingredients.db');
const JSON_PATH = path.join(process.cwd(), 'public', 'ingredients.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Remove existing DB
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

console.log('Creating SQLite database from ingredients.json...');

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE ingredients (
    id TEXT PRIMARY KEY,
    inci_name TEXT NOT NULL,
    rating INTEGER,
    irritancy INTEGER DEFAULT 0,
    category TEXT,
    category_group TEXT,
    description TEXT,
    evidence_level TEXT CHECK(evidence_level IN ('high', 'medium', 'low')),
    flags TEXT,
    sources TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE ingredient_synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id TEXT NOT NULL,
    synonym TEXT NOT NULL,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
    UNIQUE(ingredient_id, synonym)
  );

  CREATE TABLE ingredient_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    type TEXT CHECK(type IN ('government', 'study', 'regulatory', 'database', 'reference', 'github')),
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
  );

  CREATE TABLE skin_type_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id TEXT NOT NULL,
    skin_type TEXT NOT NULL CHECK(skin_type IN ('oily', 'dry', 'sensitive', 'acneProne', 'normal')),
    advice TEXT NOT NULL CHECK(advice IN ('safe', 'caution', 'avoid')),
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
    UNIQUE(ingredient_id, skin_type)
  );

  CREATE TABLE regulatory_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id TEXT,
    inci_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('banned', 'restricted', 'allowed')),
    annex TEXT,
    restriction_details TEXT,
    regulation_source TEXT,
    effective_date TEXT,
    UNIQUE(inci_name)
  );

  CREATE VIRTUAL TABLE ingredients_fts USING fts5(
    inci_name,
    content='ingredients',
    content_rowid='rowid'
  );

  CREATE INDEX idx_ingredients_rating ON ingredients(rating);
  CREATE INDEX idx_ingredients_category ON ingredients(category);
  CREATE INDEX idx_synonyms_synonym ON ingredient_synonyms(synonym);
  CREATE INDEX idx_regulatory_status ON regulatory_status(inci_name, status);
`);

// Load JSON
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

console.log(`Inserting ${data.ingredients.length} ingredients...`);

// Prepare statements
const insertIngredient = db.prepare(`
  INSERT INTO ingredients (id, inci_name, rating, irritancy, category, category_group, description, evidence_level, flags, sources)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertSynonym = db.prepare(`
  INSERT OR IGNORE INTO ingredient_synonyms (ingredient_id, synonym)
  VALUES (?, ?)
`);

const insertSource = db.prepare(`
  INSERT INTO ingredient_sources (ingredient_id, name, url, type)
  VALUES (?, ?, ?, ?)
`);

const insertSkinTypeNote = db.prepare(`
  INSERT OR IGNORE INTO skin_type_notes (ingredient_id, skin_type, advice)
  VALUES (?, ?, ?)
`);

// Insert in batches
const batchSize = 1000;
const seenIds = new Set<string>();
let skippedDuplicates = 0;

for (let i = 0; i < data.ingredients.length; i += batchSize) {
  const batch = data.ingredients.slice(i, i + batchSize);
  
  db.exec('BEGIN TRANSACTION');
  
  for (const ing of batch) {
    // Handle duplicate IDs by merging synonyms and skipping duplicate insert
    if (seenIds.has(ing.id)) {
      skippedDuplicates++;
      // Still add synonyms from the duplicate to the original
      if (ing.commonNames && ing.commonNames.length > 0) {
        for (const synonym of ing.commonNames) {
          insertSynonym.run(ing.id, synonym.toLowerCase());
        }
      }
      continue;
    }
    seenIds.add(ing.id);
    
    insertIngredient.run(
      ing.id,
      ing.inciName,
      ing.rating ?? null,
      ing.irritancy ?? 0,
      ing.category ?? 'Unknown',
      ing.categoryGroup ?? null,
      ing.description ?? null,
      ing.evidenceLevel ?? 'low',
      ing.flags ? JSON.stringify(ing.flags) : null,
      ing.sources ? JSON.stringify(ing.sources) : null
    );

    // Insert synonyms
    if (ing.commonNames && ing.commonNames.length > 0) {
      for (const synonym of ing.commonNames) {
        insertSynonym.run(ing.id, synonym.toLowerCase());
      }
    }

    // Insert sources
    if (ing.sourceUrls && ing.sourceUrls.length > 0) {
      for (const source of ing.sourceUrls) {
        insertSource.run(ing.id, source.name, source.url, source.type);
      }
    }

    // Insert skin type notes
    if (ing.skinTypeNotes) {
      for (const [skinType, advice] of Object.entries(ing.skinTypeNotes)) {
        insertSkinTypeNote.run(ing.id, skinType, advice);
      }
    }
  }
  
  db.exec('COMMIT');
  
  if ((i + batchSize) % 5000 === 0 || i + batchSize >= data.ingredients.length) {
    console.log(`  Progress: ${Math.min(i + batchSize, data.ingredients.length)}/${data.ingredients.length}`);
  }
}

// Build FTS index
console.log('Building full-text search index...');
db.exec(`
  INSERT INTO ingredients_fts(rowid, inci_name)
  SELECT rowid, inci_name FROM ingredients;
`);

// Insert EU regulatory data
console.log('Inserting EU regulatory data...');

const regulatoryData = [
  // Annex II - Prohibited substances
  { inci_name: 'Mercury', status: 'banned', annex: 'II', restriction_details: 'All mercury compounds prohibited except specific exceptions', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Lead', status: 'banned', annex: 'II', restriction_details: 'Lead and its compounds prohibited', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Arsenic', status: 'banned', annex: 'II', restriction_details: 'Arsenic and its compounds prohibited', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Cadmium', status: 'banned', annex: 'II', restriction_details: 'Cadmium and its compounds prohibited', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Antimony', status: 'banned', annex: 'II', restriction_details: 'Antimony and its compounds prohibited', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Hydroquinone', status: 'restricted', annex: 'III', restriction_details: 'Max 2% in face creams, max 0.02% in other products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Formaldehyde', status: 'restricted', annex: 'III', restriction_details: 'Max 0.2% (calculated as free formaldehyde)', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Methylene glycol', status: 'restricted', annex: 'III', restriction_details: 'Max 0.2% (calculated as free formaldehyde)', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Methylparaben', status: 'restricted', annex: 'V', restriction_details: 'Max 0.4% (single), max 0.8% (mixture of parabens)', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Ethylparaben', status: 'restricted', annex: 'V', restriction_details: 'Max 0.4% (single), max 0.8% (mixture of parabens)', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Propylparaben', status: 'restricted', annex: 'V', restriction_details: 'Max 0.14% (single), prohibited in leave-on products for children under 3', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Butylparaben', status: 'restricted', annex: 'V', restriction_details: 'Max 0.14% (single), prohibited in leave-on products for children under 3', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Isobutylparaben', status: 'banned', annex: 'II', restriction_details: 'Prohibited in all cosmetic products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Isopropylparaben', status: 'banned', annex: 'II', restriction_details: 'Prohibited in all cosmetic products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Phenylparaben', status: 'banned', annex: 'II', restriction_details: 'Prohibited in all cosmetic products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Benzylparaben', status: 'banned', annex: 'II', restriction_details: 'Prohibited in all cosmetic products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Pentylparaben', status: 'banned', annex: 'II', restriction_details: 'Prohibited in all cosmetic products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Triclosan', status: 'restricted', annex: 'III', restriction_details: 'Max 0.3% in specific products only', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Triclocarban', status: 'restricted', annex: 'III', restriction_details: 'Max 0.2% in specific products only', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Diethyl phthalate', status: 'restricted', annex: 'III', restriction_details: 'Max 10% in specific products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Dibutyl phthalate', status: 'restricted', annex: 'III', restriction_details: 'Max 10% in specific products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Diethylhexyl phthalate', status: 'restricted', annex: 'III', restriction_details: 'Max 0.1% in specific products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Retinol', status: 'restricted', annex: 'III', restriction_details: 'Max 0.05% in body lotions, max 0.3% in face/ hand creams', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Retinyl palmitate', status: 'restricted', annex: 'III', restriction_details: 'Max 0.05% in body lotions, max 0.3% in face/ hand creams', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Retinyl acetate', status: 'restricted', annex: 'III', restriction_details: 'Max 0.05% in body lotions, max 0.3% in face/ hand creams', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Alpha-isomethyl ionone', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Amyl cinnamal', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Benzyl alcohol', status: 'restricted', annex: 'III', restriction_details: 'Max 1% as preservative, must be labeled if > 0.001% as fragrance', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Benzyl salicylate', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Cinnamyl alcohol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Citral', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Citronellol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Coumarin', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Eugenol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Farnesol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Geraniol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Hydroxycitronellal', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Hydroxyisohexyl 3-cyclohexene carboxaldehyde', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Isoeugenol', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Limonene', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Linalool', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Methyl 2-octynoate', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Evernia prunastri extract', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Evernia furfuracea extract', status: 'restricted', annex: 'III', restriction_details: 'Must be labeled if concentration > 0.001% in leave-on, > 0.01% in rinse-off', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Talc', status: 'restricted', annex: 'III', restriction_details: 'Must not contain asbestos fibers; purity requirements apply', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Butylated hydroxyanisole', status: 'restricted', annex: 'III', restriction_details: 'Max 0.02% in specific products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Butylated hydroxytoluene', status: 'restricted', annex: 'III', restriction_details: 'Max 0.02% in specific products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Oxybenzone', status: 'restricted', annex: 'VI', restriction_details: 'Max 6% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Octinoxate', status: 'restricted', annex: 'VI', restriction_details: 'Max 10% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Avobenzone', status: 'restricted', annex: 'VI', restriction_details: 'Max 5% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Homosalate', status: 'restricted', annex: 'VI', restriction_details: 'Max 10% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Octocrylene', status: 'restricted', annex: 'VI', restriction_details: 'Max 10% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Octisalate', status: 'restricted', annex: 'VI', restriction_details: 'Max 5% in sunscreen products', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Titanium dioxide', status: 'restricted', annex: 'VI', restriction_details: 'Max 25% in sunscreen products; nanoparticle forms must meet specific requirements', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
  { inci_name: 'Zinc oxide', status: 'restricted', annex: 'VI', restriction_details: 'Max 25% in sunscreen products; nanoparticle forms must meet specific requirements', regulation_source: 'EU Cosmetics Regulation (EC) No 1223/2009', effective_date: '2013-07-11' },
];

const insertRegulatory = db.prepare(`
  INSERT OR IGNORE INTO regulatory_status (inci_name, status, annex, restriction_details, regulation_source, effective_date)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const reg of regulatoryData) {
  insertRegulatory.run(
    reg.inci_name,
    reg.status,
    reg.annex,
    reg.restriction_details,
    reg.regulation_source,
    reg.effective_date
  );
}

// Optimize
db.exec('VACUUM;');
db.exec('ANALYZE;');

// Stats
const stats = db.prepare('SELECT COUNT(*) as count FROM ingredients').get() as { count: number };
const synonymStats = db.prepare('SELECT COUNT(*) as count FROM ingredient_synonyms').get() as { count: number };
const regulatoryStats = db.prepare('SELECT COUNT(*) as count FROM regulatory_status').get() as { count: number };

console.log(`\nDatabase created successfully!`);
console.log(`  Ingredients: ${stats.count}`);
console.log(`  Synonyms: ${synonymStats.count}`);
console.log(`  Regulatory entries: ${regulatoryStats.count}`);
console.log(`  Skipped duplicates: ${skippedDuplicates}`);
console.log(`  DB size: ${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2)} MB`);

db.close();
console.log('\nDone!');
