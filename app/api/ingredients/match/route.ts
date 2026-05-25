import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * Normalizes an ingredient name for matching:
 * - Strips surrounding quotes: "1,2-hexanediol" -> 1,2-hexanediol
 * - Strips concentrations: (8%), [10%], {5%}, 8%, etc.
 * - Strips parenthetical content: (SOYBEAN), (RICE), etc.
 * - Strips leading section header remnants like "ACTIVE INGREDIENTS:"
 * - Trims whitespace
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip surrounding quotes
    .replace(/^["']|["']$/g, '')
    // Strip trailing period (e.g., "potassium sorbate.")
    .replace(/\.$/, '')
    // Strip leading section headers (e.g., "active ingredients:", "inactive ingredients:")
    .replace(/^(?:active|inactive|ingredients)\s*:?\s*/i, '')
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
      const normalizedName = normalizeIngredientName(rawName);
      
      // Skip empty or too-short after normalization
      if (normalizedName.length < 2) continue;
      
      // Skip section headers that leaked through
      if (/^(?:active|inactive)\s*ingredients?$/i.test(normalizedName)) continue;
      
      let result = null;
      
      // Try exact match on normalized name
      result = db.prepare(`
        SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group, 
               i.description, i.flags
        FROM ingredients i
        WHERE LOWER(i.inci_name) = ?
        LIMIT 1
      `).get(normalizedName);

      // Try synonym match
      if (!result) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                 i.description, i.flags
          FROM ingredients i
          JOIN ingredient_synonyms s ON i.id = s.ingredient_id
          WHERE LOWER(s.synonym) = ?
          LIMIT 1
        `).get(normalizedName);
      }

      // Try partial match (normalized name is substring of INCI)
      if (!result) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                 i.description, i.flags
          FROM ingredients i
          WHERE LOWER(i.inci_name) LIKE ?
          LIMIT 1
        `).get(`%${normalizedName}%`);
      }

      // Try word-boundary match: INCI is a complete word in the normalized input
      // This avoids false positives like "hexane" matching inside "2-hexanediol"
      if (!result && normalizedName.length >= 3) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
                 i.description, i.flags
          FROM ingredients i
          WHERE ? LIKE '% ' || LOWER(i.inci_name) || ' %'
             OR ? LIKE LOWER(i.inci_name) || ' %'
             OR ? LIKE '% ' || LOWER(i.inci_name)
             OR ? = LOWER(i.inci_name)
          LIMIT 1
        `).get(normalizedName, normalizedName, normalizedName, normalizedName);
      }

      if (result) {
        matchedRawNames.add(normalizedName);

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
        } else {
          // Try regulatory-only match (banned/restricted ingredients not in main DB)
          // Search inci_name, glossary_name, and chemical_name
          const regulatory = db.prepare(`
            SELECT inci_name, status, annex, restriction_details, conditions, regulation_source
            FROM regulatory_status
            WHERE LOWER(inci_name) = ?
               OR LOWER(chemical_name) = ?
               OR LOWER(glossary_name) LIKE '%' || LOWER(?) || '%'
            LIMIT 1
          `).get(normalizedName, normalizedName, normalizedName);

          if (!regulatory) {
            // Try partial match on regulatory names (e.g., "mercury" matches "Mercury and its compounds...")
            const regulatoryPartial = db.prepare(`
              SELECT inci_name, status, annex, restriction_details, conditions, regulation_source
              FROM regulatory_status
              WHERE LOWER(inci_name) LIKE '%' || LOWER(?) || '%'
                 OR LOWER(chemical_name) LIKE '%' || LOWER(?) || '%'
                 OR LOWER(glossary_name) LIKE '%' || LOWER(?) || '%'
              LIMIT 1
            `).get(normalizedName, normalizedName, normalizedName);

            if (regulatoryPartial) {
              matchedRawNames.add(normalizedName);
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
            }
          } else {
            matchedRawNames.add(normalizedName);
            matches.push({
              id: `regulatory-${regulatory.inci_name.toLowerCase().replace(/\s+/g, '-')}`,
              inci_name: regulatory.inci_name,
              rating: null,
              irritancy: 0,
              category: 'Regulatory',
              category_group: null,
              description: regulatory.restriction_details || `This ingredient is ${regulatory.status} in the EU Cosmetics Regulation.`,
              evidence_level: 'high',
              flags: JSON.stringify([regulatory.status]),
              sources: null,
              index: i,
              regulatory: {
                status: regulatory.status,
                annex: regulatory.annex,
                restriction_details: regulatory.restriction_details,
                conditions: regulatory.conditions,
                regulation_source: regulatory.regulation_source
              },
              skinTypeNotes: {},
              sourceUrls: []
            });
          }
      }
    }

    return NextResponse.json({ matches, matchedNames: Array.from(matchedRawNames) });
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
