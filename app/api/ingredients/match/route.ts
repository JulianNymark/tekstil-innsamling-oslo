import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * Normalizes an ingredient name for matching:
 * - Strips surrounding quotes: "1,2-hexanediol" -> 1,2-hexanediol
 * - Strips concentrations: (8%), [10%], {5%}, 8%, etc.
 * - Strips parenthetical content: (SOYBEAN), (RICE), etc.
 * - Strips leading section header remnants like "ACTIVE INGREDIENTS:"
 * - Trims whitespace
 * - Preserves slash-separated alternatives (e.g., "AQUA/WATER")
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip surrounding quotes
    .replace(/^["']|["']$/g, '')
    // Strip trailing period (e.g., "potassium sorbate.")
    .replace(/\.$/, '')
    // Strip leading section headers (e.g., "active ingredients:", "inactive ingredients:", "inci formula:")
    .replace(/^(?:active|inactive|ingredients|inci\s+formula)\s*:?\s*/i, '')
    // Strip concentrations in various formats
    .replace(/\s*[\(\[\{]\s*\d+(?:\.\d+)?\s*%?\s*[\)\]\}]\s*/g, ' ')
    // Strip standalone percentages like "8 %" or "(8%)" that weren't caught above
    .replace(/\s*\d+(?:\.\d+)?\s*%\s*/g, ' ')
    // Strip parenthetical content entirely (e.g., (SOYBEAN), (RICE))
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * For slash-separated alternatives like "AQUA/WATER" or "Flower/Leaf/Stem Juice",
 * returns each alternative as a separate normalized name to try.
 * The full normalized name is always tried first.
 */
function getAlternativeNames(name: string): string[] {
  const normalized = normalizeIngredientName(name);
  if (!normalized.includes('/')) {
    return [normalized];
  }
  
  // Split on slash and generate alternatives
  // e.g., "aqua/water" -> ["aqua/water", "aqua", "water"]
  // e.g., "flower/leaf/stem juice" -> ["flower/leaf/stem juice", "flower juice", "leaf juice", "stem juice"]
  const parts = normalized.split('/').map(p => p.trim());
  const alternatives = [normalized];
  
  // Try each part individually (assumes slash separates alternative names for same ingredient)
  for (const part of parts) {
    if (part.length >= 2 && !alternatives.includes(part)) {
      alternatives.push(part);
    }
  }
  
  return alternatives;
}

export async function POST(request: NextRequest) {
  try {
    const { ingredients } = await request.json();
    
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: 'Ingredients array required' }, { status: 400 });
    }

    const db = getDb();
    const matches = [];
    const matchedRawNames = new Set<string>();

    for (let i = 0; i < ingredients.length; i++) {
      const rawName = ingredients[i];
      const alternativeNames = getAlternativeNames(rawName);
      
      let result = null;
      let matchedName = null;
      
      // Try each alternative name in order (full name first, then slash parts)
      for (const name of alternativeNames) {
        // Skip empty or too-short after normalization
        if (name.length < 2) continue;
        
        // Skip section headers that leaked through
        if (/^(?:active|inactive)\s*ingredients?$/i.test(name)) continue;
        
        // Try exact match on normalized name
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group, 
                 i.description, i.flags
          FROM ingredients i
          WHERE LOWER(i.inci_name) = ?
          LIMIT 1
        `).get(name);

        // Try synonym match
        if (!result) {
          result = db.prepare(`
            SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                   i.description, i.flags
            FROM ingredients i
            JOIN ingredient_synonyms s ON i.id = s.ingredient_id
            WHERE LOWER(s.synonym) = ?
            LIMIT 1
          `).get(name);
        }

        // Try regulatory-only exact match (banned/restricted ingredients not in main DB)
        if (!result) {
          const regulatoryExact = db.prepare(`
            SELECT inci_name, status, annex, restriction_details, conditions, regulation_source
            FROM regulatory_status
            WHERE LOWER(inci_name) = ?
               OR LOWER(chemical_name) = ?
               OR LOWER(glossary_name) = ?
            LIMIT 1
          `).get(name, name, name);

          if (regulatoryExact) {
            matchedRawNames.add(name);
            matches.push({
              id: `regulatory-${regulatoryExact.inci_name.toLowerCase().replace(/\s+/g, '-')}`,
              inci_name: regulatoryExact.inci_name,
              rating: null,
              irritancy: 0,
              category: 'Regulatory',
              category_group: null,
              description: regulatoryExact.restriction_details || `This ingredient is ${regulatoryExact.status} in the EU Cosmetics Regulation.`,
              evidence_level: 'high',
              flags: JSON.stringify([regulatoryExact.status]),
              sources: null,
              index: i,
              regulatory: {
                status: regulatoryExact.status,
                annex: regulatoryExact.annex,
                restriction_details: regulatoryExact.restriction_details,
                conditions: regulatoryExact.conditions,
                regulation_source: regulatoryExact.regulation_source
              },
              skinTypeNotes: {},
              sourceUrls: []
            });
            break; // Stop trying alternatives for this ingredient
          }
        }

        // Try partial match on regulatory names before partial ingredient match
        // This ensures banned/restricted ingredients are prioritized
        // Use word-boundary matching to avoid short substrings matching inside longer words
        // (e.g., "cetyl" should NOT match "Acetylcholine")
        // We replace punctuation with spaces so words are clearly separated
        if (!result) {
          const regulatoryPartial = db.prepare(`
            SELECT inci_name, status, annex, restriction_details, conditions, regulation_source
            FROM regulatory_status
            WHERE ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(inci_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
               OR ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(chemical_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
               OR ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(glossary_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
            LIMIT 1
          `).get(name, name, name);

          if (regulatoryPartial) {
            matchedRawNames.add(name);
            matches.push({
              id: `regulatory-${regulatoryPartial.inci_name.toLowerCase().replace(/\s+/g, '-')}`,
              inci_name: regulatoryPartial.inci_name,
              rating: null,
              irritancy: 0,
              category: 'Regulatory',
              category_group: null,
              description: regulatoryPartial.restriction_details || `This ingredient is ${regulatoryPartial.status} in the EU Cosmetics Regulation.`,
              evidence_level: 'high',
              flags: JSON.stringify([regulatoryPartial.status]),
              sources: null,
              index: i,
              regulatory: {
                status: regulatoryPartial.status,
                annex: regulatoryPartial.annex,
                restriction_details: regulatoryPartial.restriction_details,
                conditions: regulatoryPartial.conditions,
                regulation_source: regulatoryPartial.regulation_source
              },
              skinTypeNotes: {},
              sourceUrls: []
            });
            break; // Stop trying alternatives for this ingredient
          }
        }

        // Try partial match on ingredients (only after regulatory checks)
        if (!result) {
          result = db.prepare(`
            SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                   i.description, i.flags
            FROM ingredients i
            WHERE LOWER(i.inci_name) LIKE ?
            LIMIT 1
          `).get(`%${name}%`);
        }

        // Try word-boundary match: INCI is a complete word in the normalized input
        if (!result && name.length >= 3) {
          result = db.prepare(`
            SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                   i.description, i.flags
            FROM ingredients i
            WHERE ? LIKE '% ' || LOWER(i.inci_name) || ' %'
               OR ? LIKE LOWER(i.inci_name) || ' %'
               OR ? LIKE '% ' || LOWER(i.inci_name)
               OR ? = LOWER(i.inci_name)
            LIMIT 1
          `).get(name, name, name, name);
        }

      if (result) {
        matchedName = name;
        break; // Stop trying alternatives for this ingredient
      }
    }

    if (result) {
      // Add the original full normalized name (not just the matching alternative)
      // so the frontend can correctly identify this chunk as matched
      matchedRawNames.add(alternativeNames[0]);

        // Get ratings from all sources
        const ratings = db.prepare(`
          SELECT source_name, rating, irritancy, scale, evidence_level, sample_size, notes
          FROM ingredient_ratings
          WHERE ingredient_id = ?
        `).all(result.id);

        // Compute consensus rating (use highest for safety/conservatism)
        const ratingValues = (ratings as { rating: number }[]).map(r => r.rating).filter(r => r !== null);
        const consensusRating = ratingValues.length > 0 ? Math.max(...ratingValues) : null;

        // Get regulatory status - search inci_name, glossary_name, and chemical_name
        const regulatory = db.prepare(`
          SELECT status, annex, restriction_details, conditions, regulation_source
          FROM regulatory_status
          WHERE LOWER(inci_name) = LOWER(?)
             OR LOWER(chemical_name) = LOWER(?)
             OR LOWER(glossary_name) LIKE '%' || LOWER(?) || '%'
          LIMIT 1
        `).get(result.inci_name, result.inci_name, result.inci_name);

        // Get skin type notes
        const skinTypeNotes = db.prepare(`
          SELECT skin_type, advice
          FROM skin_type_notes
          WHERE ingredient_id = ?
        `).all(result.id);

        // Get sources
        const sources = db.prepare(`
          SELECT name, url, type
          FROM ingredient_sources
          WHERE ingredient_id = ?
        `).all(result.id);

        matches.push({
          ...result,
          rating: consensusRating,
          ratings: ratings,
          index: i,
          regulatory: regulatory || null,
          skinTypeNotes: skinTypeNotes.reduce((acc: Record<string, string>, note: { skin_type: string; advice: string }) => {
            acc[note.skin_type] = note.advice;
            return acc;
          }, {}),
          sourceUrls: sources
        });
      }
    }

    // Deduplicate matches by ingredient ID — keep first match only
    const seenIds = new Set<string>();
    const uniqueMatches = matches.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    return NextResponse.json({ matches: uniqueMatches, matchedNames: Array.from(matchedRawNames) });
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
