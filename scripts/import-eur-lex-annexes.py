#!/usr/bin/env python3
"""
Import EU Cosmetics Regulation Annexes from EUR-Lex consolidated PDF.

Downloads the consolidated Regulation (EC) No 1223/2009 PDF from EUR-Lex
and extracts all substances from Annexes II, III, IV, V, and VI into the
regulatory_status SQLite table.

Usage:
    python scripts/import-eur-lex-annexes.py

Requires: pdfplumber (install: uv pip install pdfplumber)
"""

import json
import os
import re
import sqlite3
import sys

import pdfplumber

# Configuration
PDF_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32009R1223"
PDF_PATH = "/tmp/regulation.pdf"
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ingredients.db")


def download_pdf():
    """Download the EUR-Lex PDF if not already cached."""
    if os.path.exists(PDF_PATH):
        print(f"Using cached PDF: {PDF_PATH}")
        return

    print(f"Downloading {PDF_URL}...")
    import urllib.request

    urllib.request.urlretrieve(PDF_URL, PDF_PATH)
    print(f"Saved to {PDF_PATH}")


def find_annex_pages(pdf, start_marker, end_marker):
    """Find start and end page numbers for an annex."""
    start_page = None
    end_page = None

    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        if not text:
            continue

        if start_page is None and start_marker in text:
            if re.search(r"\d+\s+\w+", text):
                start_page = i
                print(f"  {start_marker} starts at page {i + 1}")

        if start_page is not None and end_page is None:
            if end_marker in text:
                end_page = i
                print(f"  {start_marker} ends at page {i}")
                break

    return start_page, end_page


def is_garbage_name(name):
    """Check if an extracted name is garbage (header/footer fragments, not a real substance)."""
    if not name or len(name) < 3:
        return True
    garbage_patterns = [
        r"Moved\s+or\s+deleted",
        r"Reference\s+number",
        r"Reference\s+Wording",
        r"Wordingofconditionsof",
        r"Maximumconcentrationin",
        r"readyforusepreparation",
        r"IngredientsGlossary",
        r"Substanceidentification",
        r"NameofCommon",
        r"number\s+Nameof",
        r"^\d+\s+Nameof",
        r"Conditions\s+of\s+use",
        r"Product\s+type",
        r"^%\s+",
        r"^\d+\s+%\s+",
        r"agents\s+for\s+hair\s+dye",
        r"hydrogen\s+peroxide",
        r"the\s+2,5-dienylid",
        r"substance\s+must\s+be\s+indicated",
        r"list\s+of\s+ingredients",
        r"^For\s+the\s+purposes",
        r"^All\s+finished\s+products",
        r"^When\s+mixed\s+with",
        r"^Other\s+than",
        r"^Not\s+to\s+be\s+used",
        r"^Wear\s+suitable",
        r"^Keep\s+out\s+of\s+reach",
        r"^Contains\s+thioglycolate",
        r"^Follow\s+the\s+instructions",
        r"^Professional\s+use",
        r"^Ready\s+for\s+use",
        r"^Rinse-off",
        r"^Leave-on",
    ]
    name_lower = name.lower()
    for pattern in garbage_patterns:
        if re.search(pattern, name, re.IGNORECASE):
            return True
    # If name is absurdly long, it's merged with footnotes/conditions
    if len(name) > 300:
        return True
    # If name is mostly numbers and short words, it's probably garbage
    words = name.split()
    if len(words) < 2 and len(name) < 15:
        return True
    # Check if name ends with garbage fragments
    trailing_garbage = [
        "Reference", "Maximum", "number", "Body", "concentration",
        "parts", "preparation", "Nameof", "Colourindex", "ditionsofuse",
    ]
    last_words = [w.strip(".,;:-") for w in words[-3:]]
    if any(g.lower() in [w.lower() for w in last_words] for g in trailing_garbage):
        # It's probably a real substance with garbage appended, not pure garbage
        return False
    return False


def is_header_line(line):
    """Check if a line is a header/footer line to skip."""
    skip_patterns = [
        r"^Official\s*Journal",
        r"^L\d+/",
        r"^EN\s*$",
        r"^Substance\s*identification",
        r"^Reference\s*number",
        r"^Chemical\s*name",
        r"^CAS\s*number",
        r"^EC\s*number",
        r"^Colour\s*index",
        r"^Maximum\s*concentration",
        r"^Wording\s*of",
        r"^Conditions\s*of",
        r"^Product\s*type",
        r"^a\s+b\s+c\s+d",
        r"^\d{1,2}\.\d{1,2}\.\d{4}",
        r"^ANNEX\s*[IVX]+",
        r"^LIST\s*OF",
        r"^Preamble",
        r"^Without\s*prejudice",
        r"^For\s*the\s*purposes",
        r"^'Salts'\s*is\s*taken",
        r"^'Esters'\s*is\s*taken",
        r"^All\s*finished\s*products",
        r"^S\s*a\s*$",
        r"^be\s*n\s*$",
        r"^N\s*C\s*$",
        r"^e\s*$",
        r"^b\s*c\s*$",
        r"^o\s*$",
        r"^l\s*$",
        r"^a\s*$",
    ]
    for pattern in skip_patterns:
        if re.match(pattern, line, re.IGNORECASE):
            return True
    return False


def clean_name(name):
    """Clean extracted substance name by removing embedded column headers and footers."""
    if not name:
        return name
    # Remove common header/footer fragments that leak into names
    clean_patterns = [
        (r"\s+Reference\s+number\s*", " "),
        (r"\s+Reference\s+Colourindex\s*", " "),
        (r"\s+Colourindex\s*", " "),
        (r"\s+Maximumconcentrationin\s*", " "),
        (r"\s+Maximumcon[-\s]*", " "),
        (r"\s+ditionsofuse\s*", " "),
        (r"\s+Conditionsofuse\s*", " "),
        (r"\s+Wordingofconditionsof\s*", " "),
        (r"\s+Substanceidentification\s*", " "),
        (r"\s+NameofCommon\s*", " "),
        (r"\s+readyforusepreparation\s*", " "),
        (r"\s+IngredientsGlossary\s*", " "),
        (r"\s+number\s+Nameof\s*", " "),
        (r"\s+Number/Name\s*", " "),
        (r"\s+Producttype,\s*", " "),
        (r"\s+centrationin\s*", " "),
        (r"\s+Conditions\s+ditionsofuse\s*", " "),
        (r"\s+Su\s+stanceidentifi\s+ation\s*", " "),
        (r"\s+agents\s+for\s+hair\s+dye[­-]?\s*", " "),
        (r"\s+hydrogen\s+peroxide\s+the\s*", " "),
        (r"\s+the\s+gic\s+reac\s*", " "),
        (r"\s+substance\s+must\s+be\s+indicated\s*", " "),
        (r"\s+list\s+of\s+ingredients\s+refe\s*", " "),
        (r"\s+and\s+its\s+in\s*", " "),
        (r"\s+and\s+its\s+insoluble\s+ba\s*", " "),
    ]
    for pattern, replacement in clean_patterns:
        name = re.sub(pattern, replacement, name, flags=re.IGNORECASE)
    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name).strip()
    # Remove trailing partial words that are clearly headers
    name = re.sub(r"\s+(?:Reference|Colourindex|Maximumcon|ditionsofuse|Conditions|Wording|Substanceidentification|NameofCommon|readyforuse|IngredientsGlossary|Producttype|centrationin|Su|stanceidentifi|ation)$", "", name, flags=re.IGNORECASE)
    # Also strip trailing standalone garbage words
    name = re.sub(r"\s+(?:Reference|number|Body|concentration|parts|preparation|Nameof|ditionsofuse)$", "", name, flags=re.IGNORECASE)
    # Strip everything from known header fragments to end (handles truncated words like "concentrationi")
    for trigger in ["Reference Maximum", "Reference number", "Body concentration", "Maximum number", "Nameof Common"]:
        idx = name.lower().find(trigger.lower())
        if idx > 0:
            name = name[:idx].strip()
    return name.strip()


def parse_substance_line(line):
    """
    Parse a single line into a substance entry.
    Handles various formats across annexes.
    """
    line = line.strip()
    if not line or is_header_line(line):
        return None

    # Try standard pattern: ref name CAS EC
    # More flexible: allow missing EC, missing CAS
    match = re.match(
        r"^(\d+)\.?\s+(.+?)\s+((?:\d{1,7}-\d{2}-\d|N/A|n/a|-))\s+((?:\d{1,3}-\d{1,3}-\d|N/A|n/a|-))\s*$",
        line,
    )
    if match:
        return {
            "ref": match.group(1),
            "name": clean_name(match.group(2).strip()),
            "cas": match.group(3) if match.group(3) not in ("N/A", "n/a", "-") else None,
            "ec": match.group(4) if match.group(4) not in ("N/A", "n/a", "-") else None,
            "conditions": "",
        }

    # Try missing EC: "1 Name CAS"
    match = re.match(
        r"^(\d+)\.?\s+(.+?)\s+((?:\d{1,7}-\d{2}-\d))\s*$",
        line,
    )
    if match:
        return {
            "ref": match.group(1),
            "name": clean_name(match.group(2).strip()),
            "cas": match.group(3),
            "ec": None,
            "conditions": "",
        }

    # Try no CAS/EC: "345. Name"
    match = re.match(r"^(\d+)\.?\s+(.+)$", line)
    if match:
        name = clean_name(match.group(2).strip())
        if len(name) > 5 and not re.match(r"^(Reference|Chemical|CAS|EC|a\s+b)", name):
            return {
                "ref": match.group(1),
                "name": name,
                "cas": None,
                "ec": None,
                "conditions": "",
            }

    return None


def parse_annex2(pdf, start_page, end_page):
    """Parse Annex II (banned substances)."""
    entries = []
    current = None

    for page_num in range(start_page, end_page):
        page = pdf.pages[page_num]
        text = page.extract_text()
        if not text:
            continue

        lines = text.split("\n")
        for line in lines:
            stripped = line.strip()
            if is_header_line(stripped):
                continue

            parsed = parse_substance_line(stripped)
            if parsed:
                if current:
                    entries.append(current)
                current = parsed
            elif current and stripped:
                # Continuation line
                if not re.match(r"^\d+\.?\s", stripped):
                    current["name"] += " " + stripped
                    current["name"] = clean_name(current["name"])
                else:
                    # New entry that might have wrapped
                    if current:
                        entries.append(current)
                    current = None

    if current:
        entries.append(current)

    return entries


def parse_annex_with_conditions(pdf, start_page, end_page, annex_name):
    """
    Parse Annexes III-VI which have conditions of use.
    These have more complex layouts with multi-line entries.
    """
    entries = []
    current = None
    collecting_conditions = False

    for page_num in range(start_page, end_page):
        page = pdf.pages[page_num]
        text = page.extract_text()
        if not text:
            continue

        lines = text.split("\n")
        for line in lines:
            stripped = line.strip()
            if is_header_line(stripped):
                continue

            # Try to match a new entry
            # Pattern: ref number, then name, then CAS/EC, then conditions
            # Conditions can include: product type, concentration, warnings
            match = re.match(
                r"^(\d+)\.?\s+(.+?)\s+((?:\d{1,7}-\d{2}-\d|N/A|n/a|-))\s+((?:\d{1,3}-\d{1,3}-\d|N/A|n/a|-))\s+(.+)$",
                stripped,
            )
            if match:
                if current:
                    entries.append(current)
                current = {
                    "ref": match.group(1),
                    "name": clean_name(match.group(2).strip()),
                    "cas": match.group(3) if match.group(3) not in ("N/A", "n/a", "-") else None,
                    "ec": match.group(4) if match.group(4) not in ("N/A", "n/a", "-") else None,
                    "conditions": match.group(5).strip(),
                }
                collecting_conditions = True
                continue

            # Try without CAS/EC but with conditions
            match = re.match(
                r"^(\d+)\.?\s+(.+?)\s+((?:\d{1,7}-\d{2}-\d))\s+(.+)$",
                stripped,
            )
            if match:
                if current:
                    entries.append(current)
                current = {
                    "ref": match.group(1),
                    "name": clean_name(match.group(2).strip()),
                    "cas": match.group(3),
                    "ec": None,
                    "conditions": match.group(4).strip(),
                }
                collecting_conditions = True
                continue

            # Try just ref + name + conditions (no CAS/EC)
            match = re.match(r"^(\d+)\.?\s+(.+)$", stripped)
            if match:
                name = clean_name(match.group(2).strip())
                if len(name) > 5 and not re.match(r"^(Reference|Chemical|CAS|EC)", name):
                    if current:
                        entries.append(current)
                    current = {
                        "ref": match.group(1),
                        "name": name,
                        "cas": None,
                        "ec": None,
                        "conditions": "",
                    }
                    collecting_conditions = True
                    continue

            # If we have a current entry and this line doesn't start with a number,
            # it's either a name continuation or a conditions continuation
            if current and stripped:
                if not re.match(r"^\d+\.?\s", stripped):
                    if collecting_conditions and (
                        "Not to be" in stripped
                        or "%" in stripped
                        or "products" in stripped.lower()
                        or "Rinse-off" in stripped
                        or "Leave-on" in stripped
                        or "Purity" in stripped
                        or "free from" in stripped.lower()
                        or "Professional" in stripped
                        or "Avoid" in stripped
                        or "Wear" in stripped
                        or "Keep out" in stripped
                        or "For professional" in stripped
                        or "above" in stripped.lower()
                        or "more than" in stripped.lower()
                    ):
                        current["conditions"] += " " + stripped
                    else:
                        # Name continuation
                        current["name"] += " " + stripped
                        current["name"] = clean_name(current["name"])
                else:
                    # Line starts with number but didn't match above patterns
                    # Could be a new entry with very short name
                    pass

    if current:
        entries.append(current)

    return entries


def clean_conditions(conditions):
    """Clean and normalize conditions text."""
    if not conditions:
        return ""

    # Remove line breaks and extra spaces
    conditions = re.sub(r"\s+", " ", conditions).strip()

    # Remove trailing punctuation
    conditions = conditions.rstrip(".,;")

    return conditions


def import_to_database(all_entries):
    """Import extracted entries into the SQLite database."""
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        print("Run 'pnpm build:db' first to create the database.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Clear existing regulatory data
    print("\nClearing existing regulatory_status entries...")
    cursor.execute("DELETE FROM regulatory_status")

    # Insert new entries
    inserted = 0
    skipped = 0

    for entry in all_entries:
        status = entry.get("_status", "banned")
        annex = entry.get("_annex", "II")
        name = entry["name"]
        cas = entry.get("cas") or ""
        ec = entry.get("ec") or ""
        conditions = clean_conditions(entry.get("conditions", ""))

        # Skip garbage entries
        if is_garbage_name(name):
            skipped += 1
            continue

        # Build restriction details
        parts = [f"Annex {annex} — {status} substance"]
        if cas:
            parts.append(f"CAS: {cas}")
        if ec:
            parts.append(f"EC: {ec}")
        if conditions:
            parts.append(f"Conditions: {conditions}")

        restriction = "; ".join(parts)

        try:
            cursor.execute(
                """
                INSERT OR IGNORE INTO regulatory_status (inci_name, status, annex, restriction_details, conditions, regulation_source, effective_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    status,
                    annex,
                    restriction,
                    conditions,
                    "EU Cosmetics Regulation (EC) No 1223/2009",
                    "2013-07-11",
                ),
            )
            if cursor.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"Error inserting {name}: {e}")
            skipped += 1

    conn.commit()

    # Post-import cleanup: strip condition fragments that leaked into names
    print("\nRunning post-import name cleanup...")
    cleanup_count = 0
    cursor.execute("SELECT id, inci_name, conditions FROM regulatory_status")
    for row in cursor.fetchall():
        name = row[1]
        conditions = row[2] or ""
        cleaned = name
        # Strip everything from condition-like fragments in the name
        condition_fragments = [
            "Rinse-off products", "Leave-on products", "Not to be used",
            "Not to be applied", "Purity criteria", "For professional",
            "Ready for use", "Wear suitable", "Keep out of reach",
            "Contains thioglycolate", "Follow the instructions",
            "When mixed with", "Other than", "Except",
            "applied on mucous", "in the finished product",
            "soluble barium", "soluble strontium", "soluble",
            "number of CommonIngredients Glossary",
        ]
        for frag in condition_fragments:
            idx = cleaned.lower().find(frag.lower())
            if idx > 10:  # Only strip if it's not at the very start
                cleaned = cleaned[:idx].strip()
        # Strip trailing CAS/EC numbers that leaked in
        cleaned = re.sub(r"\s+\d{1,7}-\d{2}-\d\s*$", "", cleaned)
        cleaned = re.sub(r"\s+\d{1,3}-\d{1,3}-\d\s*$", "", cleaned)
        # Strip trailing color names that are conditions
        cleaned = re.sub(r"\s+(?:Red|Green|Blue|Black|Brown|Orange|White|Yellow)\s*$", "", cleaned)
        if cleaned != name:
            cursor.execute("UPDATE regulatory_status SET inci_name = ? WHERE id = ?", (cleaned, row[0]))
            cleanup_count += 1

    conn.commit()
    conn.close()

    print(f"Cleaned up {cleanup_count} names")
    print(f"Inserted {inserted} new entries")
    if skipped:
        print(f"Skipped {skipped} duplicates")


def main():
    print("=" * 60)
    print("EUR-Lex Annex Importer (All Annexes)")
    print("=" * 60)

    download_pdf()

    all_entries = []

    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"\nPDF has {len(pdf.pages)} pages")

        # Annex II - Banned
        print(f"\n{'=' * 60}")
        print("Processing Annex II (banned)")
        print(f"{'=' * 60}")
        start, end = find_annex_pages(pdf, "ANNEX II", "ANNEX III")
        if start is not None:
            if end is None:
                end = min(start + 80, len(pdf.pages))
            entries = parse_annex2(pdf, start, end)
            for e in entries:
                e["_status"] = "banned"
                e["_annex"] = "II"
            all_entries.extend(entries)
            print(f"  Extracted {len(entries)} entries")

        # Annex III - Restricted
        print(f"\n{'=' * 60}")
        print("Processing Annex III (restricted)")
        print(f"{'=' * 60}")
        start, end = find_annex_pages(pdf, "ANNEX III", "ANNEX IV")
        if start is not None:
            if end is None:
                end = min(start + 80, len(pdf.pages))
            entries = parse_annex_with_conditions(pdf, start, end, "III")
            for e in entries:
                e["_status"] = "restricted"
                e["_annex"] = "III"
            all_entries.extend(entries)
            print(f"  Extracted {len(entries)} entries")

        # Annex IV - Colorants (allowed with conditions)
        print(f"\n{'=' * 60}")
        print("Processing Annex IV (colorants - allowed with conditions)")
        print(f"{'=' * 60}")
        start, end = find_annex_pages(pdf, "ANNEX IV", "ANNEX V")
        if start is not None:
            if end is None:
                end = min(start + 40, len(pdf.pages))
            entries = parse_annex_with_conditions(pdf, start, end, "IV")
            for e in entries:
                e["_status"] = "restricted"
                e["_annex"] = "IV"
            all_entries.extend(entries)
            print(f"  Extracted {len(entries)} entries")

        # Annex V - Preservatives
        print(f"\n{'=' * 60}")
        print("Processing Annex V (preservatives - allowed with conditions)")
        print(f"{'=' * 60}")
        start, end = find_annex_pages(pdf, "ANNEX V", "ANNEX VI")
        if start is not None:
            if end is None:
                end = min(start + 40, len(pdf.pages))
            entries = parse_annex_with_conditions(pdf, start, end, "V")
            for e in entries:
                e["_status"] = "restricted"
                e["_annex"] = "V"
            all_entries.extend(entries)
            print(f"  Extracted {len(entries)} entries")

        # Annex VI - UV Filters
        print(f"\n{'=' * 60}")
        print("Processing Annex VI (UV filters - allowed with conditions)")
        print(f"{'=' * 60}")
        start, end = find_annex_pages(pdf, "ANNEX VI", "ANNEX VII")
        if start is not None:
            if end is None:
                end = len(pdf.pages)
            entries = parse_annex_with_conditions(pdf, start, end, "VI")
            for e in entries:
                e["_status"] = "restricted"
                e["_annex"] = "VI"
            all_entries.extend(entries)
            print(f"  Extracted {len(entries)} entries")

    print(f"\n{'=' * 60}")
    print(f"TOTAL: {len(all_entries)} entries across all annexes")
    print(f"{'=' * 60}")

    # Show samples from each annex
    for annex in ["II", "III", "IV", "V", "VI"]:
        annex_entries = [e for e in all_entries if e.get("_annex") == annex]
        if annex_entries:
            print(f"\nAnnex {annex} sample ({len(annex_entries)} total):")
            for e in annex_entries[:3]:
                cas = e.get("cas") or "N/A"
                ec = e.get("ec") or "N/A"
                cond = e.get("conditions", "")[:60]
                print(f"  Ref {e['ref']}: {e['name'][:50]}... CAS:{cas} EC:{ec}")
                if cond:
                    print(f"    Conditions: {cond}")

    # Save to JSON
    json_path = "/tmp/eur-lex-annexes.json"
    with open(json_path, "w") as f:
        json.dump(
            {
                "source": "EUR-Lex: Regulation (EC) No 1223/2009",
                "total_entries": len(all_entries),
                "entries": all_entries,
            },
            f,
            indent=2,
        )
    print(f"\nSaved to {json_path}")

    # Import to database
    import_to_database(all_entries)

    print("\nDone! Run 'pnpm build' to verify the app works with the new data.")


if __name__ == "__main__":
    main()
