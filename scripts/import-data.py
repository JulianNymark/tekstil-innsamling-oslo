#!/usr/bin/env python3
"""
Generic data importer for the SQLite database.

Supports re-importing data from specific sources without wiping the entire DB.
Each import "bundle" is a JSON file that contains ingredients, ratings, synonyms,
sources, and skin type notes for a specific data source.

Usage:
    # Export a source bundle from the current DB
    python scripts/import-data.py --export beautee > data/bundles/beautee.json

    # Re-import a source bundle (deletes old data from that source first)
    python scripts/import-data.py --import data/bundles/beautee.json

    # List all sources in the DB
    python scripts/import-data.py --list

    # Dry-run an import (show what would change without writing)
    python scripts/import-data.py --import data/bundles/beautee.json --dry-run
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DB_PATH = PROJECT_DIR / "data" / "ingredients.db"
BUNDLE_DIR = PROJECT_DIR / "data" / "bundles"


def get_db():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)
    return sqlite3.connect(DB_PATH)


def list_sources(conn):
    """List all data sources and their counts."""
    cursor = conn.cursor()

    # Ingredients by data_source
    cursor.execute("SELECT data_source, COUNT(*) FROM ingredients GROUP BY data_source")
    ingredient_counts = {row[0] or "unknown": row[1] for row in cursor.fetchall()}

    # Ratings by source_name
    cursor.execute("SELECT source_name, COUNT(*) FROM ingredient_ratings GROUP BY source_name")
    rating_counts = {row[0]: row[1] for row in cursor.fetchall()}

    # Regulatory by regulation_source
    cursor.execute("SELECT regulation_source, COUNT(*) FROM regulatory_status GROUP BY regulation_source")
    regulatory_counts = {row[0]: row[1] for row in cursor.fetchall()}

    print("\n=== Ingredient Sources ===")
    for source, count in sorted(ingredient_counts.items(), key=lambda x: -x[1]):
        print(f"  {source}: {count} ingredients")

    print("\n=== Rating Sources ===")
    for source, count in sorted(rating_counts.items(), key=lambda x: -x[1]):
        print(f"  {source}: {count} ratings")

    print("\n=== Regulatory Sources ===")
    for source, count in sorted(regulatory_counts.items(), key=lambda x: -x[1]):
        print(f"  {source}: {count} entries")


def export_source(conn, source_name, output_path=None):
    """Export all data for a given source into a bundle JSON."""
    cursor = conn.cursor()

    # Get ingredient IDs for this source
    cursor.execute(
        "SELECT id FROM ingredients WHERE data_source = ?",
        (source_name,)
    )
    ingredient_ids = [row[0] for row in cursor.fetchall()]

    if not ingredient_ids:
        print(f"No ingredients found with data_source='{source_name}'")
        return None

    print(f"Found {len(ingredient_ids)} ingredients for source '{source_name}'")

    # Fetch full ingredient records
    placeholders = ",".join("?" * len(ingredient_ids))
    cursor.execute(f"""
        SELECT id, inci_name, irritancy, category, category_group, description, flags
        FROM ingredients WHERE id IN ({placeholders})
    """, ingredient_ids)
    ingredients = []
    for row in cursor.fetchall():
        ingredients.append({
            "id": row[0],
            "inci_name": row[1],
            "irritancy": row[2],
            "category": row[3],
            "category_group": row[4],
            "description": row[5],
            "flags": json.loads(row[6]) if row[6] else None,
        })

    # Fetch ratings
    cursor.execute(f"""
        SELECT ingredient_id, source_name, rating, irritancy, scale, evidence_level, sample_size, notes
        FROM ingredient_ratings WHERE ingredient_id IN ({placeholders})
    """, ingredient_ids)
    ratings = []
    for row in cursor.fetchall():
        ratings.append({
            "ingredient_id": row[0],
            "source_name": row[1],
            "rating": row[2],
            "irritancy": row[3],
            "scale": row[4],
            "evidence_level": row[5],
            "sample_size": row[6],
            "notes": row[7],
        })

    # Fetch synonyms
    cursor.execute(f"""
        SELECT ingredient_id, synonym FROM ingredient_synonyms
        WHERE ingredient_id IN ({placeholders})
    """, ingredient_ids)
    synonyms = []
    for row in cursor.fetchall():
        synonyms.append({"ingredient_id": row[0], "synonym": row[1]})

    # Fetch sources
    cursor.execute(f"""
        SELECT ingredient_id, name, url, type FROM ingredient_sources
        WHERE ingredient_id IN ({placeholders})
    """, ingredient_ids)
    sources = []
    for row in cursor.fetchall():
        sources.append({
            "ingredient_id": row[0],
            "name": row[1],
            "url": row[2],
            "type": row[3],
        })

    # Fetch skin type notes
    cursor.execute(f"""
        SELECT ingredient_id, skin_type, advice FROM skin_type_notes
        WHERE ingredient_id IN ({placeholders})
    """, ingredient_ids)
    skin_type_notes = []
    for row in cursor.fetchall():
        skin_type_notes.append({
            "ingredient_id": row[0],
            "skin_type": row[1],
            "advice": row[2],
        })

    bundle = {
        "meta": {
            "source": source_name,
            "exported_at": datetime.now().isoformat(),
            "db_path": str(DB_PATH),
        },
        "ingredients": ingredients,
        "ratings": ratings,
        "synonyms": synonyms,
        "sources": sources,
        "skin_type_notes": skin_type_notes,
    }

    if output_path:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(bundle, f, indent=2, ensure_ascii=False)
        print(f"Saved bundle to {output_path}")
        print(f"  {len(ingredients)} ingredients")
        print(f"  {len(ratings)} ratings")
        print(f"  {len(synonyms)} synonyms")
        print(f"  {len(sources)} source URLs")
        print(f"  {len(skin_type_notes)} skin type notes")

    return bundle


def delete_source_data(conn, source_name, dry_run=False):
    """Delete all data for a given source from the database."""
    cursor = conn.cursor()

    # Get ingredient IDs to delete
    cursor.execute("SELECT id FROM ingredients WHERE data_source = ?", (source_name,))
    ingredient_ids = [row[0] for row in cursor.fetchall()]

    if not ingredient_ids:
        print(f"No existing data for source '{source_name}' to delete")
        return 0

    print(f"Deleting {len(ingredient_ids)} ingredients for source '{source_name}'...")

    if dry_run:
        print(f"  [DRY RUN] Would delete {len(ingredient_ids)} ingredients")
        return len(ingredient_ids)

    placeholders = ",".join("?" * len(ingredient_ids))

    # Delete in order to respect foreign keys
    cursor.execute(f"DELETE FROM skin_type_notes WHERE ingredient_id IN ({placeholders})", ingredient_ids)
    cursor.execute(f"DELETE FROM ingredient_sources WHERE ingredient_id IN ({placeholders})", ingredient_ids)
    cursor.execute(f"DELETE FROM ingredient_synonyms WHERE ingredient_id IN ({placeholders})", ingredient_ids)
    cursor.execute(f"DELETE FROM ingredient_ratings WHERE ingredient_id IN ({placeholders})", ingredient_ids)
    cursor.execute(f"DELETE FROM ingredients WHERE id IN ({placeholders})", ingredient_ids)

    conn.commit()
    print(f"  Deleted.")
    return len(ingredient_ids)


def import_bundle(conn, bundle_path, dry_run=False):
    """Import a bundle JSON file into the database."""
    with open(bundle_path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    source_name = bundle["meta"]["source"]
    print(f"Importing bundle for source '{source_name}' from {bundle_path}")

    # First, delete existing data for this source
    delete_source_data(conn, source_name, dry_run=dry_run)

    if dry_run:
        print(f"\n[DRY RUN] Would insert:")
        print(f"  {len(bundle['ingredients'])} ingredients")
        print(f"  {len(bundle['ratings'])} ratings")
        print(f"  {len(bundle['synonyms'])} synonyms")
        print(f"  {len(bundle['sources'])} source URLs")
        print(f"  {len(bundle['skin_type_notes'])} skin type notes")
        return

    cursor = conn.cursor()

    # Insert ingredients
    for ing in bundle["ingredients"]:
        cursor.execute("""
            INSERT INTO ingredients (id, inci_name, irritancy, category, category_group, description, flags, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ing["id"],
            ing["inci_name"],
            ing.get("irritancy", 0),
            ing.get("category"),
            ing.get("category_group"),
            ing.get("description"),
            json.dumps(ing["flags"]) if ing.get("flags") else None,
            source_name,
        ))

    # Insert ratings
    for rating in bundle["ratings"]:
        cursor.execute("""
            INSERT INTO ingredient_ratings
            (ingredient_id, source_name, rating, irritancy, scale, evidence_level, sample_size, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rating["ingredient_id"],
            rating["source_name"],
            rating.get("rating"),
            rating.get("irritancy"),
            rating.get("scale", "fulton-0-5"),
            rating.get("evidence_level", "low"),
            rating.get("sample_size"),
            rating.get("notes"),
        ))

    # Insert synonyms
    for syn in bundle["synonyms"]:
        cursor.execute("""
            INSERT OR IGNORE INTO ingredient_synonyms (ingredient_id, synonym)
            VALUES (?, ?)
        """, (syn["ingredient_id"], syn["synonym"]))

    # Insert sources
    for src in bundle["sources"]:
        cursor.execute("""
            INSERT INTO ingredient_sources (ingredient_id, name, url, type)
            VALUES (?, ?, ?, ?)
        """, (src["ingredient_id"], src["name"], src.get("url"), src.get("type")))

    # Insert skin type notes
    for note in bundle["skin_type_notes"]:
        cursor.execute("""
            INSERT OR IGNORE INTO skin_type_notes (ingredient_id, skin_type, advice)
            VALUES (?, ?, ?)
        """, (note["ingredient_id"], note["skin_type"], note["advice"]))

    conn.commit()
    print(f"\nImport complete for source '{source_name}'")


def rebuild_fts(conn):
    """Rebuild the FTS5 index after bulk changes."""
    print("\nRebuilding FTS index...")
    cursor = conn.cursor()
    cursor.execute("DELETE FROM ingredients_fts")
    cursor.execute("INSERT INTO ingredients_fts(rowid, inci_name) SELECT rowid, inci_name FROM ingredients")
    conn.commit()
    print("FTS index rebuilt.")


def vacuum_db(conn):
    """Run VACUUM and ANALYZE to optimize the database."""
    print("Running VACUUM and ANALYZE...")
    conn.execute("VACUUM")
    conn.execute("ANALYZE")
    print("Database optimized.")


def main():
    parser = argparse.ArgumentParser(description="Import/export data bundles for the SQLite database")
    parser.add_argument("--list", action="store_true", help="List all sources in the database")
    parser.add_argument("--export", metavar="SOURCE", help="Export a source bundle to stdout or --output")
    parser.add_argument("--import", dest="import_path", metavar="PATH", help="Import a bundle JSON file")
    parser.add_argument("--output", "-o", metavar="PATH", help="Output file for --export")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--no-vacuum", action="store_true", help="Skip VACUUM after import")
    args = parser.parse_args()

    conn = get_db()

    try:
        if args.list:
            list_sources(conn)

        elif args.export:
            output = args.output or None
            bundle = export_source(conn, args.export, output_path=output)
            if not output and bundle:
                print(json.dumps(bundle, indent=2, ensure_ascii=False))

        elif args.import_path:
            import_bundle(conn, args.import_path, dry_run=args.dry_run)
            if not args.dry_run and not args.no_vacuum:
                rebuild_fts(conn)
                vacuum_db(conn)

        else:
            parser.print_help()

    finally:
        conn.close()


if __name__ == "__main__":
    main()
