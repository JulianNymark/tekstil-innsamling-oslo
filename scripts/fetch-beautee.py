#!/usr/bin/env python3
"""
Fetch BEAUTEE Cosmetic Ingredients Dataset from GitHub and save raw data.

Source: https://github.com/beauteeru/cosmetic-ingredients-dataset
License: MIT

Usage:
    python scripts/fetch-beautee.py
    python scripts/fetch-beautee.py --refresh  # force re-download
"""
import argparse
import csv
import json
import os
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
CACHE_DIR = PROJECT_DIR / "data" / "cache"
OUTPUT_DIR = PROJECT_DIR / "data" / "sources"

# BEAUTEE raw CSV URL
CSV_URL = "https://raw.githubusercontent.com/beauteeru/cosmetic-ingredients-dataset/main/cosmetic_ingredients.csv"
CACHE_PATH = CACHE_DIR / "beautee.csv"


def fetch(refresh: bool = False):
    """Download BEAUTEE CSV if not cached."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if CACHE_PATH.exists() and not refresh:
        print(f"Using cached: {CACHE_PATH}")
        return

    print(f"Downloading {CSV_URL}...")
    response = requests.get(CSV_URL, timeout=60)
    response.raise_for_status()
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        f.write(response.text)
    print(f"Saved {len(response.text)} bytes to {CACHE_PATH}")


def process():
    """Convert raw CSV to our normalized source format."""
    if not CACHE_PATH.exists():
        print("No cached data. Run without --refresh first.")
        return

    print("Processing BEAUTEE data...")

    ingredients = []
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # BEAUTEE columns: INCI_name, CAS, EC, PubChem, etc.
            inci = row.get("INCI_name", "").strip()
            if not inci:
                continue

            # Create URL-safe ID
            id_slug = inci.lower().replace(" ", "-").replace(",", "")
            id_slug = "".join(c for c in id_slug if c.isalnum() or c == "-").strip("-")

            ingredients.append({
                "id": id_slug,
                "inci_name": inci,
                "cas": row.get("CAS", "").strip() or None,
                "ec": row.get("EC", "").strip() or None,
                "pubchem": row.get("PubChem", "").strip() or None,
            })

    output = {
        "meta": {
            "source": "beautee",
            "source_url": "https://github.com/beauteeru/cosmetic-ingredients-dataset",
            "license": "MIT",
            "fetched_at": None,  # filled below
            "total_rows": len(ingredients),
            "columns": list(reader.fieldnames) if 'reader' in dir() else [],
        },
        "ingredients": ingredients,
    }

    output_path = OUTPUT_DIR / "beautee.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(ingredients)} ingredients to {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Force re-download")
    args = parser.parse_args()

    fetch(refresh=args.refresh)
    process()


if __name__ == "__main__":
    main()
