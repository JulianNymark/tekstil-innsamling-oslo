import { NextResponse } from 'next/server';

export async function GET() {
  const sources = [
    {
      name: 'PubChem',
      description: 'Free chemical database with structures, properties, and synonyms',
      managedBy: '🇺🇸 US National Institutes of Health (NIH)',
      url: 'https://pubchem.ncbi.nlm.nih.gov',
      type: 'reference'
    },
    {
      name: 'EU CosIng',
      description: 'Official EU cosmetic ingredient database with regulatory status',
      managedBy: '🇪🇺 European Commission',
      url: 'https://ec.europa.eu/growth/tools-databases/cosing/',
      type: 'regulatory'
    },
    {
      name: 'CIR',
      description: 'Safety reviews of cosmetic ingredients by expert panel',
      managedBy: '🇺🇸 Personal Care Products Council',
      url: 'https://cir-reports.cir-safety.org/',
      type: 'study'
    },
    {
      name: 'ECHA EC Inventory',
      description: 'Registry of all chemicals on the EU market',
      managedBy: '🇪🇺 EU Chemicals Agency',
      url: 'https://echa.europa.eu/information-on-chemicals/ec-inventory',
      type: 'regulatory'
    },
    {
      name: 'BEAUTEE Dataset',
      description: 'Cosmetic ingredient identifiers (INCI, CAS, EINECS, PubChem)',
      managedBy: '🇷🇺 BEAUTEE (MIT License)',
      url: 'https://github.com/beauteeru/cosmetic-ingredients-dataset',
      type: 'github'
    },
    {
      name: 'Fulton 1989',
      description: 'Original rabbit ear assay comedogenicity scale',
      managedBy: 'Scientific literature',
      url: 'https://pubmed.ncbi.nlm.nih.gov/',
      type: 'study'
    }
  ];

  return NextResponse.json({ sources });
}
