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
    SELECT i.id, i.inci_name, i.rating, i.irritancy, i.category, i.category_group,
           i.description, i.evidence_level, i.flags, i.sources
    FROM ingredients i
    ${whereClause}
    ORDER BY ${orderColumn} ${orderDirection}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // Get categories
  const categories = db.prepare(`
    SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category
  `).all() as { category: string }[];

  // Enrich with synonyms, sources, and skin type notes
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

    return {
      id: ing.id,
      inciName: ing.inci_name,
      commonNames: synonyms.map(s => s.synonym),
      rating: ing.rating,
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
      evidenceLevel: ing.evidence_level,
      sources: ing.sources ? JSON.parse(ing.sources) : [],
      sourceUrls: sources
    };
  });

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
    ingredients: enrichedIngredients,
    pagination: {
      page,
      limit,
      total: countResult.total,
      totalPages: Math.ceil(countResult.total / limit)
    },
    categories: categories.map(c => c.category)
  });
}
