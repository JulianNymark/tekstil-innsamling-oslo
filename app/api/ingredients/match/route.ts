import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * Normalizes an ingredient name for matching:
 * - Strips concentrations: (8%), [10%], {5%}, 8%, etc.
 * - Strips parenthetical content: (SOYBEAN), (RICE), etc.
 * - Strips leading section header remnants like "ACTIVE INGREDIENTS:"
 * - Trims whitespace
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip leading section headers (e.g., "active ingredients:", "inactive ingredients:")
    .replace(/^(?:active|inactive)\s*(?:ingredients)?\s*:?\s*/i, '')
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

    for (const rawName of ingredients) {
      const normalizedName = normalizeIngredientName(rawName);
      
      // Skip empty or too-short after normalization
      if (normalizedName.length < 2) continue;
      
      // Skip section headers that leaked through
      if (/^(?:active|inactive)\s*ingredients?$/i.test(normalizedName)) continue;
      
      let result = null;
      
      // Try exact match on normalized name
      result = db.prepare(`
        SELECT i.id, i.inci_name, i.rating, i.irritancy, i.category, i.category_group, 
               i.description, i.evidence_level, i.flags, i.sources
        FROM ingredients i
        WHERE LOWER(i.inci_name) = ?
        LIMIT 1
      `).get(normalizedName);

      // Try synonym match
      if (!result) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.rating, i.irritancy, i.category, i.category_group,
                 i.description, i.evidence_level, i.flags, i.sources
          FROM ingredients i
          JOIN ingredient_synonyms s ON i.id = s.ingredient_id
          WHERE LOWER(s.synonym) = ?
          LIMIT 1
        `).get(normalizedName);
      }

      // Try partial match (normalized name is substring of INCI)
      if (!result) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.rating, i.irritancy, i.category, i.category_group,
                 i.description, i.evidence_level, i.flags, i.sources
          FROM ingredients i
          WHERE LOWER(i.inci_name) LIKE ?
          LIMIT 1
        `).get(`%${normalizedName}%`);
      }

      // Try reverse: INCI name is substring of normalized (for truncated inputs)
      if (!result) {
        result = db.prepare(`
          SELECT i.id, i.inci_name, i.rating, i.irritancy, i.category, i.category_group,
                 i.description, i.evidence_level, i.flags, i.sources
          FROM ingredients i
          WHERE ? LIKE '%' || LOWER(i.inci_name) || '%'
          LIMIT 1
        `).get(normalizedName);
      }

      if (result) {
        matchedRawNames.add(rawName.toLowerCase().trim());
        
        // Get regulatory status
        const regulatory = db.prepare(`
          SELECT status, annex, restriction_details
          FROM regulatory_status
          WHERE LOWER(inci_name) = LOWER(?)
        `).get(result.inci_name);

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
          regulatory: regulatory || null,
          skinTypeNotes: skinTypeNotes.reduce((acc: Record<string, string>, note: any) => {
            acc[note.skin_type] = note.advice;
            return acc;
          }, {}),
          sourceUrls: sources
        });
      }
    }

    return NextResponse.json({ matches, matchedNames: Array.from(matchedRawNames) });
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
