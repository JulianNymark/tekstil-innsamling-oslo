import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const rating = searchParams.get('rating') || '';
  const sortBy = searchParams.get('sortBy') || 'inci_name';
  const sortOrder = searchParams.get('sortOrder') || 'asc';

  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (search) {
    whereClause += ' AND (LOWER(i.inci_name) LIKE ? OR EXISTS (SELECT 1 FROM ingredient_synonyms s WHERE s.ingredient_id = i.id AND LOWER(s.synonym) LIKE ?))';
    const searchPattern = `%${search.toLowerCase()}%`;
    params.push(searchPattern, searchPattern);
  }

  if (category) {
    whereClause += ' AND i.category = ?';
    params.push(category);
  }

  if (rating !== '') {
    whereClause += ' AND i.rating = ?';
    params.push(parseInt(rating));
  }

  const validSortColumns = ['inci_name', 'rating', 'category', 'irritancy'];
  const orderColumn = validSortColumns.includes(sortBy) ? sortBy : 'inci_name';
  const orderDirection = sortOrder === 'desc' ? 'DESC' : 'ASC';

  // Get total count
  const countResult = db.prepare(`
    SELECT COUNT(*) as total FROM ingredients i ${whereClause}
  `).get(...params) as { total: number };

  // Get ingredients
  const ingredients = db.prepare(`
    SELECT i.id, i.inci_name, i.irritancy, i.category, i.category_group,
           i.description, i.flags
    FROM ingredients i
    ${whereClause}
    ORDER BY ${orderColumn} ${orderDirection}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // If searching, also include regulatory-only matches
  let regulatoryIngredients: any[] = [];
  if (search) {
    const searchPattern = `%${search.toLowerCase()}%`;
    regulatoryIngredients = db.prepare(`
      SELECT inci_name, chemical_name, glossary_name, status, annex, restriction_details, conditions, regulation_source
      FROM regulatory_status
      WHERE LOWER(inci_name) LIKE ?
         OR LOWER(chemical_name) LIKE ?
         OR LOWER(glossary_name) LIKE ?
      LIMIT ? OFFSET ?
    `).all(searchPattern, searchPattern, searchPattern, limit, offset);
  }

  // Get categories
  const categories = db.prepare(`
    SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category
  `).all() as { category: string }[];

  // Enrich with synonyms, sources, ratings, and skin type notes
  const enrichedIngredients = ingredients.map((ing: any) => {
    const synonyms = db.prepare(`
      SELECT synonym FROM ingredient_synonyms WHERE ingredient_id = ?
    `).all(ing.id) as { synonym: string }[];

    const sources = db.prepare(`
      SELECT name, url, type FROM ingredient_sources WHERE ingredient_id = ?
    `).all(ing.id) as { name: string; url: string; type: string }[];

    const skinTypeNotes = db.prepare(`
      SELECT skin_type, advice FROM skin_type_notes WHERE ingredient_id = ?
    `).all(ing.id) as { skin_type: string; advice: string }[];

    const ratings = db.prepare(`
      SELECT source_name, rating, irritancy, scale, evidence_level, sample_size, notes
      FROM ingredient_ratings
      WHERE ingredient_id = ?
    `).all(ing.id) as { source_name: string; rating: number; irritancy: number | null; scale: string; evidence_level: string; sample_size: number | null; notes: string | null }[];

    // Compute consensus rating (use max for safety)
    const ratingValues = ratings.map(r => r.rating).filter(r => r !== null);
    const consensusRating = ratingValues.length > 0 ? Math.max(...ratingValues) : null;

    return {
      id: ing.id,
      inciName: ing.inci_name,
      commonNames: synonyms.map(s => s.synonym),
      rating: consensusRating,
      ratings: ratings,
      irritancy: ing.irritancy,
      category: ing.category,
      categoryGroup: ing.category_group,
      function: [],
      description: ing.description,
      skinTypeNotes: skinTypeNotes.reduce((acc: Record<string, string>, note: any) => {
        acc[note.skin_type] = note.advice;
        return acc;
      }, {}),
      flags: ing.flags ? JSON.parse(ing.flags) : [],
      sourceUrls: sources
    };
  });

  // Merge regulatory-only ingredients, avoiding duplicates
  const existingIds = new Set(enrichedIngredients.map(i => i.inciName.toLowerCase()));
  const mergedIngredients = [
    ...enrichedIngredients,
    ...regulatoryIngredients
      .filter((r: any) => !existingIds.has(r.inci_name.toLowerCase()))
      .map((r: any) => ({
        id: `regulatory-${r.inci_name.toLowerCase().replace(/\s+/g, '-')}`,
        inciName: r.inci_name,
        commonNames: [],
        rating: null,
        irritancy: 0,
        category: 'Regulatory',
        categoryGroup: null,
        function: [],
        description: r.restriction_details || `This ingredient is ${r.status} in the EU Cosmetics Regulation.`,
        skinTypeNotes: {},
        flags: [r.status],
        evidenceLevel: 'high',
        sources: [],
        sourceUrls: [],
        regulatory: {
          status: r.status,
          annex: r.annex,
          restriction_details: r.restriction_details,
          conditions: r.conditions,
          regulation_source: r.regulation_source,
          chemical_name: r.chemical_name,
          glossary_name: r.glossary_name
        }
      }))
  ];

  return NextResponse.json({
    version: '1.4.0',
    lastUpdated: new Date().toISOString().split('T')[0],
    sources: ['SQLite Database'],
    scale: {
      name: 'Fulton Comedogenic Scale',
      range: '0-5',
      description: '0 = Non-comedogenic, 5 = Highly comedogenic',
      levels: {
        '0': 'Non-comedogenic',
        '1': 'Very low risk',
        '2': 'Low risk',
        '3': 'Moderate risk',
        '4': 'High risk',
        '5': 'Very high risk'
      }
    },
    ingredients: mergedIngredients,
    pagination: {
      page,
      limit,
      total: countResult.total + regulatoryIngredients.length,
      totalPages: Math.ceil((countResult.total + regulatoryIngredients.length) / limit)
    },
    categories: categories.map(c => c.category)
  });
}
