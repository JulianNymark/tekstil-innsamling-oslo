#!/usr/bin/env python3
"""
Process raw source data from data/sources/ into normalized DB bundles.

This is where all data transformation rules live. If you want to change how
a source is processed (e.g., change rating scale, merge synonyms differently,
add new fields), edit the processor for that source here and re-run.

Usage:
    # Process all sources
    python scripts/process-sources.py

    # Process specific source
    python scripts/process-sources.py --source beautee

    # Dry run (show what would change without writing)
    python scripts/process-sources.py --dry-run

    # After processing, import into DB:
    python scripts/import-data.py --import data/bundles/beautee.json
"""
import argparse
import json
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SOURCES_DIR = PROJECT_DIR / "data" / "sources"
BUNDLES_DIR = PROJECT_DIR / "data" / "bundles"


def slugify(name: str) -> str:
    """Create a URL-safe ID from an ingredient name."""
    slug = name.lower().replace(" ", "-").replace(",", "")
    slug = "".join(c for c in slug if c.isalnum() or c == "-").strip("-")
    return slug or "unknown"


# =============================================================================
# PROCESSORS - one per data source
# =============================================================================

def process_beautee(raw_data: dict) -> dict:
    """
    Process BEAUTEE dataset.
    Rules:
      - No comedogenicity ratings (identifier-only dataset)
      - Create basic ingredient entries for name matching coverage
      - Add source metadata
    """
    ingredients = []
    sources = []

    for item in raw_data["ingredients"]:
        ing_id = item["id"]

        ingredients.append({
            "id": ing_id,
            "inci_name": item["inci_name"],
            "irritancy": 0,
            "category": "Unknown",
            "category_group": None,
            "description": f"INCI identifier from BEAUTEE dataset. CAS: {item.get('cas') or 'N/A'}, EC: {item.get('ec') or 'N/A'}",
            "flags": None,
        })

        sources.append({
            "ingredient_id": ing_id,
            "name": "BEAUTEE Cosmetic Ingredients Dataset",
            "url": "https://github.com/beauteeru/cosmetic-ingredients-dataset",
            "type": "github",
        })

    return {
        "meta": {
            "source": "beautee",
            "processed_at": None,
            "rules_version": "1.0",
            "total_ingredients": len(ingredients),
        },
        "ingredients": ingredients,
        "ratings": [],
        "synonyms": [],
        "sources": sources,
        "skin_type_notes": [],
    }


def process_emmanuel(raw_data: dict) -> dict:
    """
    Process Emmanuel.Skin dataset.
    Rules:
      - Extract ratings (0-5 scale)
      - Map categories
      - Generate synonyms from common names
    """
    ingredients = []
    ratings = []
    synonyms = []
    sources = []

    for item in raw_data["ingredients"]:
        raw = item.get("raw", {})
        ing_id = item["id"]

        # Determine rating
        rating = item.get("rating")
        if rating is not None:
            try:
                rating = int(rating)
                if not (0 <= rating <= 5):
                    rating = None
            except (ValueError, TypeError):
                rating = None

        # Map category
        category = item.get("category") or "Unknown"

        ingredients.append({
            "id": ing_id,
            "inci_name": item["inci_name"],
            "irritancy": 0,
            "category": category,
            "category_group": None,
            "description": item.get("description") or f"From Emmanuel.Skin dataset",
            "flags": None,
        })

        if rating is not None:
            ratings.append({
                "ingredient_id": ing_id,
                "source_name": "Emmanuel.Skin (Open Source)",
                "rating": rating,
                "irritancy": 0,
                "scale": "fulton-0-5",
                "evidence_level": "medium",
                "sample_size": None,
                "notes": None,
            })

        # Add common names as synonyms
        common_names = raw.get("commonNames", []) if isinstance(raw, dict) else []
        for name in common_names:
            if name and name.lower() != item["inci_name"].lower():
                synonyms.append({
                    "ingredient_id": ing_id,
                    "synonym": name.lower(),
                })

        sources.append({
            "ingredient_id": ing_id,
            "name": "Emmanuel.Skin (Open Source)",
            "url": "https://github.com/VincentEmmanuel/emmanuel.skin",
            "type": "github",
        })

    return {
        "meta": {
            "source": "emmanuel",
            "processed_at": None,
            "rules_version": "1.0",
            "total_ingredients": len(ingredients),
        },
        "ingredients": ingredients,
        "ratings": ratings,
        "synonyms": synonyms,
        "sources": sources,
        "skin_type_notes": [],
    }


# Registry of processors
PROCESSORS = {
    "beautee": process_beautee,
    "emmanuel": process_emmanuel,
    # Add more sources here as needed:
    # "skincare-scanner": process_skincare_scanner,
    # "comedogenic-ingredients": process_comedogenic,
}


def process_source(source_name: str, dry_run: bool = False) -> dict:
    """Process a single source and write bundle."""
    raw_path = SOURCES_DIR / f"{source_name}.json"
    if not raw_path.exists():
        print(f"Raw data not found: {raw_path}")
        print(f"Run scripts/fetch-{source_name}.py first (or add raw data manually)")
        return None

    with open(raw_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    processor = PROCESSORS.get(source_name)
    if not processor:
        print(f"No processor registered for source '{source_name}'")
        print(f"Available: {', '.join(PROCESSORS.keys())}")
        return None

    print(f"Processing {source_name}...")
    bundle = processor(raw_data)

    # Add metadata
    from datetime import datetime
    bundle["meta"]["processed_at"] = datetime.now().isoformat()

    if dry_run:
        print(f"  [DRY RUN] Would create bundle with:")
        print(f"    {len(bundle['ingredients'])} ingredients")
        print(f"    {len(bundle['ratings'])} ratings")
        print(f"    {len(bundle['synonyms'])} synonyms")
        print(f"    {len(bundle['sources'])} source URLs")
        print(f"    {len(bundle['skin_type_notes'])} skin type notes")
        return bundle

    os.makedirs(BUNDLES_DIR, exist_ok=True)
    bundle_path = BUNDLES_DIR / f"{source_name}.json"
    with open(bundle_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2, ensure_ascii=False)

    print(f"  Saved bundle to {bundle_path}")
    return bundle


def main():
    parser = argparse.ArgumentParser(description="Process raw source data into DB bundles")
    parser.add_argument("--source", help="Process specific source only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change")
    args = parser.parse_args()

    if args.source:
        process_source(args.source, dry_run=args.dry_run)
    else:
        # Process all available sources
        for source_file in sorted(SOURCES_DIR.glob("*.json")):
            source_name = source_file.stem
            process_source(source_name, dry_run=args.dry_run)
            print()

    if not args.dry_run:
        print("\nNext steps:")
        print("  1. Review bundles in data/bundles/")
        print("  2. Import into DB:")
        print("     python scripts/import-data.py --import data/bundles/<source>.json")


if __name__ == "__main__":
    main()
