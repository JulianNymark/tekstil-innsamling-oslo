#!/usr/bin/env python3
"""
Fetch Emmanuel.Skin dataset from GitHub.

Source: https://github.com/VincentEmmanuel/emmanuel.skin
License: MIT

Usage:
    python scripts/fetch-emmanuel.py
    python scripts/fetch-emmanuel.py --refresh
"""
import argparse
import json
import os
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
CACHE_DIR = PROJECT_DIR / "data" / "cache"
OUTPUT_DIR = PROJECT_DIR / "data" / "sources"

RAW_URL = "https://raw.githubusercontent.com/VincentEmmanuel/emmanuel.skin/main/src/data/ingredients.json"
CACHE_PATH = CACHE_DIR / "emmanuel.json"


def fetch(refresh: bool = False):
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if CACHE_PATH.exists() and not refresh:
        print(f"Using cached: {CACHE_PATH}")
        return

    print(f"Downloading {RAW_URL}...")
    response = requests.get(RAW_URL, timeout=60)
    response.raise_for_status()
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        f.write(response.text)
    print(f"Saved {len(response.text)} bytes to {CACHE_PATH}")


def process():
    if not CACHE_PATH.exists():
        print("No cached data. Run without --refresh first.")
        return

    print("Processing Emmanuel.Skin data...")

    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Emmanuel data structure varies - normalize to our format
    ingredients = []
    for item in data:
        if isinstance(item, dict):
            inci = item.get("name") or item.get("inciName") or ""
            if not inci:
                continue

            id_slug = inci.lower().replace(" ", "-").replace(",", "")
            id_slug = "".join(c for c in id_slug if c.isalnum() or c == "-").strip("-")

            ingredients.append({
                "id": id_slug,
                "inci_name": inci,
                "rating": item.get("rating"),
                "category": item.get("category"),
                "description": item.get("description"),
                "raw": item,  # keep original for re-processing
            })

    output = {
        "meta": {
            "source": "emmanuel",
            "source_url": "https://github.com/VincentEmmanuel/emmanuel.skin",
            "license": "MIT",
            "total_rows": len(ingredients),
        },
        "ingredients": ingredients,
    }

    output_path = OUTPUT_DIR / "emmanuel.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(ingredients)} ingredients to {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    fetch(refresh=args.refresh)
    process()


if __name__ == "__main__":
    main()
