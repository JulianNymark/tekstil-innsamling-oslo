#!/usr/bin/env python3
"""
Fetch Comedogenic Ingredients dataset from GitHub.

Source: https://github.com/e-zob/comedogenic-ingredients
License: Open source

Usage:
    python scripts/fetch-comedogenic-ingredients.py
    python scripts/fetch-comedogenic-ingredients.py --refresh
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

REPO_URLS = [
    "https://raw.githubusercontent.com/e-zob/comedogenic-ingredients/main/ingredients.json",
    "https://raw.githubusercontent.com/e-zob/comedogenic-ingredients/master/ingredients.json",
    "https://raw.githubusercontent.com/e-zob/comedogenic-ingredients/main/data/ingredients.json",
]
CACHE_PATH = CACHE_DIR / "comedogenic-ingredients.json"


def fetch(refresh: bool = False):
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if CACHE_PATH.exists() and not refresh:
        print(f"Using cached: {CACHE_PATH}")
        return

    for url in REPO_URLS:
        try:
            print(f"Trying {url}...")
            response = requests.get(url, timeout=60)
            if response.status_code == 200:
                with open(CACHE_PATH, "w", encoding="utf-8") as f:
                    f.write(response.text)
                print(f"Saved {len(response.text)} bytes to {CACHE_PATH}")
                return
        except Exception as e:
            print(f"  Failed: {e}")
            continue

    print("Could not fetch from any known URL. Please add the raw URL manually.")
    print("You can also place the JSON file at:", CACHE_PATH)


def process():
    if not CACHE_PATH.exists():
        print("No cached data. Run without --refresh first.")
        return

    print("Processing Comedogenic Ingredients data...")

    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "ingredients" in data:
        items = data["ingredients"]
    elif isinstance(data, list):
        items = data
    else:
        print("Unknown data structure")
        return

    ingredients = []
    for item in items:
        if not isinstance(item, dict):
            continue
        inci = item.get("name") or item.get("inciName") or ""
        if not inci:
            continue

        ingredients.append({
            "id": item.get("id") or inci.lower().replace(" ", "-").replace(",", ""),
            "inci_name": inci,
            "rating": item.get("rating"),
            "category": item.get("category"),
            "description": item.get("description"),
            "raw": item,
        })

    output = {
        "meta": {
            "source": "comedogenic-ingredients",
            "source_url": "https://github.com/e-zob/comedogenic-ingredients",
            "license": "Open source",
            "total_rows": len(ingredients),
        },
        "ingredients": ingredients,
    }

    output_path = OUTPUT_DIR / "comedogenic-ingredients.json"
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
