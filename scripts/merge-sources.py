#!/usr/bin/env python3
"""
Merge ingredient sources with deduplication.

Re-imports all bundles, merging ingredients that match by name or synonym.
Preserves ratings from all sources on a single ingredient row.

Usage:
    python scripts/merge-sources.py --dry-run    # Preview changes
    python scripts/merge-sources.py              # Execute merge
    python scripts/merge-sources.py --restore    # Restore from latest backup
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
MANUAL_SYNONYMS_PATH = PROJECT_DIR / "data" / "manual-synonyms.json"

# Import order matters: sources with most synonyms first
IMPORT_ORDER = [
    "manual",
    "cir",
    "comedogenic-ingredients",
    "incidecoder",  # Has 298 synonyms - import before emmanuel/skincare-scanner
    "emmanuel",
    "skincare-scanner",
    "beautee",
]


def get_db():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)
    return sqlite3.connect(DB_PATH)


def normalize_name(name: str) -> str:
    """Normalize an ingredient name for matching."""
    return (
        name.lower()
        .strip()
        .replace("  ", " ")
        .replace("\t", " ")
    )


def find_existing_ingredient(cursor, inci_name: str, synonyms: list[str]) -> str | None:
    """
    Find an existing ingredient that matches this name or any synonym.
    Returns the ingredient ID if found, None otherwise.
    """
    normalized = normalize_name(inci_name)
    all_names = [normalized] + [normalize_name(s) for s in synonyms]
    placeholders = ",".join("?" * len(all_names))

    # Strategy 1: Exact normalized INCI name match
    cursor.execute(
        "SELECT id FROM ingredients WHERE LOWER(inci_name) = ?",
        (normalized,)
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    # Strategy 2: Check if any of our names match an existing ingredient's synonyms
    cursor.execute(
        f"""
        SELECT DISTINCT i.id
        FROM ingredients i
        JOIN ingredient_synonyms s ON i.id = s.ingredient_id
        WHERE LOWER(s.synonym) IN ({placeholders})
        LIMIT 1
        """,
        tuple(all_names)
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    # Strategy 3: Check if any of our synonyms match an existing ingredient's name
    cursor.execute(
        f"""
        SELECT id FROM ingredients
        WHERE LOWER(inci_name) IN ({placeholders})
        LIMIT 1
        """,
        tuple(all_names)
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    return None


def merge_source(conn, bundle_path: Path, dry_run: bool = False):
    """Import a bundle, merging with existing ingredients when possible."""
    with open(bundle_path, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    source_name = bundle["meta"]["source"]
    print(f"\n{'=' * 60}")
    print(f"Merging source: {source_name}")
    print(f"  Ingredients: {len(bundle['ingredients'])}")
    print(f"  Ratings: {len(bundle['ratings'])}")
    print(f"  Synonyms: {len(bundle['synonyms'])}")
    print(f"  Sources: {len(bundle['sources'])}")
    print(f"  Skin type notes: {len(bundle['skin_type_notes'])}")

    cursor = conn.cursor()

    stats = {
        "created": 0,
        "merged": 0,
        "ratings_added": 0,
        "synonyms_added": 0,
        "sources_added": 0,
        "notes_added": 0,
    }

    # Build lookup maps from the bundle
    bundle_ratings = {}
    for r in bundle["ratings"]:
        bundle_ratings.setdefault(r["ingredient_id"], []).append(r)

    bundle_synonyms = {}
    for s in bundle["synonyms"]:
        bundle_synonyms.setdefault(s["ingredient_id"], []).append(s)

    bundle_sources = {}
    for s in bundle["sources"]:
        bundle_sources.setdefault(s["ingredient_id"], []).append(s)

    bundle_notes = {}
    for n in bundle["skin_type_notes"]:
        bundle_notes.setdefault(n["ingredient_id"], []).append(n)

    for ing in bundle["ingredients"]:
        ing_id = ing["id"]
        inci_name = ing["inci_name"]
        ing_synonyms = bundle_synonyms.get(ing_id, [])
        synonym_names = [s["synonym"] for s in ing_synonyms]

        # Try to find existing match
        existing_id = find_existing_ingredient(cursor, inci_name, synonym_names)

        if existing_id:
            # MERGE: Add this source's data to existing ingredient
            stats["merged"] += 1

            # Add ratings
            for rating in bundle_ratings.get(ing_id, []):
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO ingredient_ratings
                    (ingredient_id, source_name, rating, irritancy, scale, evidence_level, sample_size, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        existing_id,
                        rating["source_name"],
                        rating.get("rating"),
                        rating.get("irritancy"),
                        rating.get("scale", "fulton-0-5"),
                        rating.get("evidence_level", "low"),
                        rating.get("sample_size"),
                        rating.get("notes"),
                    )
                )
                if cursor.rowcount > 0:
                    stats["ratings_added"] += 1

            # Add synonyms
            for syn in ing_synonyms:
                cursor.execute(
                    "INSERT OR IGNORE INTO ingredient_synonyms (ingredient_id, synonym) VALUES (?, ?)",
                    (existing_id, syn["synonym"])
                )
                if cursor.rowcount > 0:
                    stats["synonyms_added"] += 1

            # Add source URLs
            for src in bundle_sources.get(ing_id, []):
                cursor.execute(
                    "INSERT OR IGNORE INTO ingredient_sources (ingredient_id, name, url, type) VALUES (?, ?, ?, ?)",
                    (existing_id, src["name"], src.get("url"), src.get("type"))
                )
                if cursor.rowcount > 0:
                    stats["sources_added"] += 1

            # Add skin type notes
            for note in bundle_notes.get(ing_id, []):
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO skin_type_notes (ingredient_id, skin_type, advice)
                    VALUES (?, ?, ?)
                    """,
                    (existing_id, note["skin_type"], note["advice"])
                )
                if cursor.rowcount > 0:
                    stats["notes_added"] += 1

            # Update data_source to track merge
            cursor.execute(
                "UPDATE ingredients SET data_source = ? WHERE id = ?",
                (f"merged:{source_name}", existing_id)
            )

        else:
            # CREATE: New ingredient
            stats["created"] += 1

            cursor.execute(
                """
                INSERT INTO ingredients (id, inci_name, irritancy, category, category_group, description, flags, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ing_id,
                    inci_name,
                    ing.get("irritancy", 0),
                    ing.get("category"),
                    ing.get("category_group"),
                    ing.get("description"),
                    json.dumps(ing["flags"]) if ing.get("flags") else None,
                    source_name,
                )
            )

            # Add ratings
            for rating in bundle_ratings.get(ing_id, []):
                cursor.execute(
                    """
                    INSERT INTO ingredient_ratings
                    (ingredient_id, source_name, rating, irritancy, scale, evidence_level, sample_size, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ing_id,
                        rating["source_name"],
                        rating.get("rating"),
                        rating.get("irritancy"),
                        rating.get("scale", "fulton-0-5"),
                        rating.get("evidence_level", "low"),
                        rating.get("sample_size"),
                        rating.get("notes"),
                    )
                )
                stats["ratings_added"] += 1

            # Add synonyms
            for syn in ing_synonyms:
                cursor.execute(
                    "INSERT INTO ingredient_synonyms (ingredient_id, synonym) VALUES (?, ?)",
                    (ing_id, syn["synonym"])
                )
                stats["synonyms_added"] += 1

            # Add source URLs
            for src in bundle_sources.get(ing_id, []):
                cursor.execute(
                    "INSERT INTO ingredient_sources (ingredient_id, name, url, type) VALUES (?, ?, ?, ?)",
                    (ing_id, src["name"], src.get("url"), src.get("type"))
                )
                stats["sources_added"] += 1

            # Add skin type notes
            for note in bundle_notes.get(ing_id, []):
                cursor.execute(
                    """
                    INSERT INTO skin_type_notes (ingredient_id, skin_type, advice)
                    VALUES (?, ?, ?)
                    """,
                    (ing_id, note["skin_type"], note["advice"])
                )
                stats["notes_added"] += 1

    print(f"  Created: {stats['created']} new ingredients")
    print(f"  Merged: {stats['merged']} existing ingredients")
    print(f"  Ratings added: {stats['ratings_added']}")
    print(f"  Synonyms added: {stats['synonyms_added']}")
    print(f"  Sources added: {stats['sources_added']}")
    print(f"  Notes added: {stats['notes_added']}")

    if not dry_run:
        conn.commit()
        print(f"  Committed.")
    else:
        conn.rollback()
        print(f"  [DRY RUN] Rolled back.")

    return stats


def rebuild_fts(conn):
    """Rebuild the FTS5 index after bulk changes."""
    print("Rebuilding FTS index...")
    cursor = conn.cursor()
    # Use the FTS5 rebuild command for external content tables
    cursor.execute("INSERT INTO ingredients_fts(ingredients_fts) VALUES('rebuild')")
    conn.commit()
    print("FTS index rebuilt.")


def vacuum_db(conn):
    """Run VACUUM and ANALYZE to optimize the database."""
    print("Running VACUUM and ANALYZE...")
    conn.execute("VACUUM")
    conn.execute("ANALYZE")
    print("Database optimized.")


def restore_latest_backup():
    """Restore the most recent backup."""
    backup_dir = DB_PATH.parent
    backups = sorted(
        [f for f in backup_dir.glob("ingredients.db.backup-*")],
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    if not backups:
        print("No backups found!")
        sys.exit(1)

    latest = backups[0]
    print(f"Restoring from {latest.name}...")
    import shutil
    shutil.copy2(latest, DB_PATH)
    print("Restored.")


def apply_manual_synonyms(conn, dry_run=False):
    """Load manual synonyms from JSON and insert into the database."""
    if not MANUAL_SYNONYMS_PATH.exists():
        print(f"Warning: Manual synonyms file not found: {MANUAL_SYNONYMS_PATH}")
        return 0

    with open(MANUAL_SYNONYMS_PATH, "r", encoding="utf-8") as f:
        manual_synonyms = json.load(f)

    cursor = conn.cursor()
    inserted = 0
    skipped = 0

    for ingredient_id, synonyms in manual_synonyms.items():
        # Verify the ingredient exists
        cursor.execute("SELECT 1 FROM ingredients WHERE id = ?", (ingredient_id,))
        if not cursor.fetchone():
            print(f"  Warning: Ingredient '{ingredient_id}' not found, skipping {len(synonyms)} synonyms")
            skipped += len(synonyms)
            continue

        for synonym in synonyms:
            if dry_run:
                print(f"  [DRY RUN] Would add synonym '{synonym}' for '{ingredient_id}'")
                inserted += 1
            else:
                cursor.execute(
                    "INSERT OR IGNORE INTO ingredient_synonyms (ingredient_id, synonym) VALUES (?, ?)",
                    (ingredient_id, synonym)
                )
                if cursor.rowcount > 0:
                    inserted += 1

    if not dry_run:
        conn.commit()

    print(f"\nManual synonyms: {inserted} inserted, {skipped} skipped (ingredient not found)")
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Merge ingredient sources with deduplication")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    parser.add_argument("--restore", action="store_true", help="Restore from latest backup")
    args = parser.parse_args()

    if args.restore:
        restore_latest_backup()
        return

    conn = get_db()

    try:
        # Clear existing data (we'll rebuild from bundles)
        print("Clearing existing data...")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM skin_type_notes")
        cursor.execute("DELETE FROM ingredient_sources")
        cursor.execute("DELETE FROM ingredient_synonyms")
        cursor.execute("DELETE FROM ingredient_ratings")
        cursor.execute("DELETE FROM ingredients")
        conn.commit()
        print("Cleared.")

        total_stats = {
            "created": 0,
            "merged": 0,
            "ratings_added": 0,
            "synonyms_added": 0,
            "sources_added": 0,
            "notes_added": 0,
        }

        # Import each source in order
        for source_name in IMPORT_ORDER:
            bundle_path = BUNDLE_DIR / f"{source_name}.json"
            if not bundle_path.exists():
                print(f"Warning: Bundle not found: {bundle_path}")
                continue

            stats = merge_source(conn, bundle_path, dry_run=args.dry_run)
            for key in total_stats:
                total_stats[key] += stats.get(key, 0)

        print(f"\n{'=' * 60}")
        print("MERGE COMPLETE")
        print(f"{'=' * 60}")
        print(f"Total created: {total_stats['created']}")
        print(f"Total merged: {total_stats['merged']}")
        print(f"Total ratings added: {total_stats['ratings_added']}")
        print(f"Total synonyms added: {total_stats['synonyms_added']}")
        print(f"Total sources added: {total_stats['sources_added']}")
        print(f"Total notes added: {total_stats['notes_added']}")

        if not args.dry_run:
            rebuild_fts(conn)
            vacuum_db(conn)

        # Apply manual synonyms LAST (after all ingredients exist)
        apply_manual_synonyms(conn, dry_run=args.dry_run)

        if not args.dry_run:
            rebuild_fts(conn)  # Rebuild again after synonym changes

            # Show multi-source ingredients
            cursor.execute("""
                SELECT i.inci_name, COUNT(DISTINCT r.source_name) as source_count
                FROM ingredients i
                JOIN ingredient_ratings r ON i.id = r.ingredient_id
                GROUP BY i.id
                HAVING source_count > 1
                ORDER BY source_count DESC
                LIMIT 20
            """)
            rows = cursor.fetchall()
            if rows:
                print(f"\nIngredients with multiple sources ({len(rows)} shown):")
                for row in rows:
                    cursor2 = conn.cursor()
                    cursor2.execute(
                        "SELECT DISTINCT source_name FROM ingredient_ratings WHERE ingredient_id = (SELECT id FROM ingredients WHERE inci_name = ?)",
                        (row[0],)
                    )
                    sources = ", ".join([r[0] for r in cursor2.fetchall()])
                    print(f"  {row[0]}: {row[1]} sources ({sources})")
            else:
                print("\nNo ingredients with multiple sources found.")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
