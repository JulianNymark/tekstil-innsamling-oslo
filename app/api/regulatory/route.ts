import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ingredient = searchParams.get('ingredient');

  if (!ingredient) {
    return NextResponse.json({ error: 'Ingredient parameter required' }, { status: 400 });
  }

  const db = getDb();
  
  const result = db.prepare(`
    SELECT inci_name, chemical_name, glossary_name, status, annex, restriction_details, conditions, regulation_source, effective_date
    FROM regulatory_status
    WHERE LOWER(inci_name) = LOWER(?)
       OR LOWER(chemical_name) = LOWER(?)
       OR LOWER(glossary_name) LIKE '%' || LOWER(?) || '%'
       OR ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(inci_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
       OR ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(chemical_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
       OR ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(glossary_name), '(', ' '), ')', ' '), ',', ' '), '-', ' '), '/', ' ') || ' ' LIKE '% ' || LOWER(?) || ' %'
    LIMIT 1
  `).get(ingredient, ingredient, ingredient, ingredient, ingredient, ingredient);

  if (!result) {
    return NextResponse.json({ status: 'unknown', message: 'No regulatory data available' });
  }

  return NextResponse.json(result);
}
