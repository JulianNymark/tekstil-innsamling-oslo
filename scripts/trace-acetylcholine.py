#!/usr/bin/env python3
"""Trace why the acetylcholine regulatory entry matches."""
import sqlite3
import json

DB_PATH = "data/ingredients.db"

def normalize(name):
    return (name.lower()
            .strip()
            .replace(/^["']|["']$/g, '')
            .replace(/\.$/, '')
            .replace(/^(?:active|inactive|ingredients|inci\s+formula)\s*:?\s*/i, '')
            .replace(/\s*[\(\[\{]\s*\d+(?:\.\d+)?\s*%?\s*[\)\]\}]\s*/g, ' ')
            .replace(/\s*\d+(?:\.\d+)?\s*%\s*/g, ' ')
            .replace(/\s*\([^)]*\)\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim())

def get_alternatives(name):
    normalized = normalize(name)
    if '/' not in normalized:
        return [normalized]
    parts = [p.strip() for p in normalized.split('/')]
    alts = [normalized]
    for part in parts:
        if len(part) >= 2 and part not in alts:
            alts.append(part)
    return alts

# The input list
query = "Aqua, Niacinamide, Ethylhexyl Salicylate, Dibutyl Adipate, Diisopropyl Sebacate, Bis-Ethylhexyloxyphenol, Methoxyphenyl Triazine, Diethylamino Hydroxybenzoyl Hexyl Benzoate, Glycerin, Dimethicone, Methylene Bis, Benzotriazolyl Tetramethylbutylphenol (nano), Diethylhexyl Carbonate, 1,2-Hexanediol, Propanediol, Cetyl, Dimethicone, Ethylhexyl Triazone, Silica, Methoxy PEG/PPG-25/4 Dimethicone, Bis-PEG/PPG-20/5 PEG/PPG-20/5, Dimethicone, Tris-Biphenyl Triazine (nano), Canola Oil, Hydrolyzed Hyaluronic Acid, Ascorbyl Tetraisopalmitate, Tocopheryl Acetate, Ammonium Acryloyldimethyltaurate/VP Copolymer, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Xanthan Gum, Polysorbate 80, Decyl Glucoside, Caprylic/Capric Triglyceride, Cetearyl Alcohol, Glyceryl Stearate, Propylene Glycol, Butylene Glycol, Citric Acid, Disodium Phosphate, Pentaerythrityl Tetra-di-t-butyl Hydroxyhydrocinnamate, Sodium Benzoate, Parfum."

# Split by comma
chunks = [c.strip() for c in query.split(',') if c.strip()]

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Check the acetylcholine entry
cursor.execute("SELECT inci_name, chemical_name, glossary_name FROM regulatory_status WHERE inci_name LIKE '%Acetylcholine%'")
row = cursor.fetchone()
print("Regulatory entry:")
print(f"  INCI: {row[0]}")
print(f"  Chemical: {row[1]}")
print(f"  Glossary: {row[2]}")
print()

# Find which chunk matches
for chunk in chunks:
    alts = get_alternatives(chunk)
    for alt in alts:
        if len(alt) < 2:
            continue
        # Try regulatory partial match
        cursor.execute("""
            SELECT inci_name FROM regulatory_status
            WHERE LOWER(inci_name) LIKE '%' || LOWER(?) || '%'
               OR LOWER(chemical_name) LIKE '%' || LOWER(?) || '%'
               OR LOWER(glossary_name) LIKE '%' || LOWER(?) || '%'
            LIMIT 1
        """, (alt, alt, alt))
        match = cursor.fetchone()
        if match:
            print(f"MATCH: '{chunk}' → alt '{alt}' → regulatory '{match[0]}'")
            break

conn.close()
