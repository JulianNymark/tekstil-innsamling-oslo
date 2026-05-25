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
    SELECT DISTINCT i.id, i.inci_name, i.category, i.description
    FROM ingredients i
    LEFT JOIN ingredient_synonyms s ON i.id = s.ingredient_id
    WHERE LOWER(i.inci_name) LIKE ? OR LOWER(s.synonym) LIKE ?
    ORDER BY
      CASE WHEN LOWER(i.inci_name) = ? THEN 0 ELSE 1 END,
      i.inci_name
    LIMIT 20
  `).all(`%${searchTerm}%`, `%${searchTerm}%`, searchTerm);

  // Also search regulatory-only ingredients
  const regulatoryResults = db.prepare(`
    SELECT inci_name, status, restriction_details
    FROM regulatory_status
    WHERE LOWER(inci_name) LIKE ?
    LIMIT 10
  `).all(`%${searchTerm}%`);

  // Merge regulatory results, avoiding duplicates with main DB
  const existingNames = new Set((results as { inci_name: string }[]).map(r => r.inci_name.toLowerCase()));
  const merged = [
    ...(results as { id: string; inci_name: string; rating: number | null; category: string; description: string; evidence_level: string }[]),
    ...(regulatoryResults as { inci_name: string; status: string; restriction_details: string }[])
      .filter(r => !existingNames.has(r.inci_name.toLowerCase()))
      .map(r => ({
        id: `regulatory-${r.inci_name.toLowerCase().replace(/\s+/g, '-')}`,
        inci_name: r.inci_name,
        rating: null,
        category: 'Regulatory',
        description: r.restriction_details || `This ingredient is ${r.status} in the EU Cosmetics Regulation.`,
        evidence_level: 'high',
        regulatory_status: r.status
      }))
  ];

  return NextResponse.json({ results: merged });
}
