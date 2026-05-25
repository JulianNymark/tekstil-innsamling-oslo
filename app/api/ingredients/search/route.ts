import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const db = getDb();
  const searchTerm = query.toLowerCase();

  // Search by name or synonym
  const results = db.prepare(`
    SELECT DISTINCT i.id, i.inci_name, i.rating, i.category, i.description, i.evidence_level
    FROM ingredients i
    LEFT JOIN ingredient_synonyms s ON i.id = s.ingredient_id
    WHERE LOWER(i.inci_name) LIKE ? OR LOWER(s.synonym) LIKE ?
    ORDER BY 
      CASE WHEN LOWER(i.inci_name) = ? THEN 0 ELSE 1 END,
      i.inci_name
    LIMIT 20
  `).all(`%${searchTerm}%`, `%${searchTerm}%`, searchTerm);

  return NextResponse.json({ results });
}
