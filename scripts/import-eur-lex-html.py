#!/usr/bin/env python3
"""
Import EU Cosmetics Regulation annexes from EUR-Lex HTML.
Extracts both chemical names and glossary names for better ingredient matching.
"""
import os
import sys
import re
import sqlite3
import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "data", "ingredients.db")
HTML_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009R1223"
HTML_PATH = "/tmp/regulation.html"


def download_html():
    """Download the EUR-Lex HTML if not cached."""
    if os.path.exists(HTML_PATH):
        print(f"Using cached HTML: {HTML_PATH}")
        return
    print(f"Downloading {HTML_URL}...")
    response = requests.get(HTML_URL, timeout=120)
    response.raise_for_status()
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(response.text)
    print(f"Saved to {HTML_PATH} ({len(response.text)} bytes)")


def clean_text(text):
    """Clean extracted text: normalize whitespace, strip."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    # Remove zero-width spaces and soft hyphens
    text = text.replace("\u00ad", "").replace("\u200b", "")
    return text


def split_glossary_names(glossary_text):
    """Split glossary names like 'Benzoic acid, Sodium Benzoate' into individual names."""
    if not glossary_text:
        return []
    # The HTML sometimes concatenates names without commas
    # e.g., "Benzoic acidSodium Benzoate" -> need to split by camelCase
    # First try comma split
    if "," in glossary_text:
        return [clean_text(n) for n in glossary_text.split(",") if clean_text(n)]
    # Try to detect concatenated names by looking for word boundaries
    # where a lowercase letter is DIRECTLY followed by uppercase + lowercase (no space)
    # e.g., "acidSodium" -> "acid" + "Sodium", but NOT "Sodium Benzoate"
    parts = re.split(r"(?<=[a-z])(?=[A-Z][a-z])", glossary_text)
    if len(parts) > 1:
        return [clean_text(p) for p in parts if clean_text(p)]
    return [clean_text(glossary_text)]


def is_garbage_name(name):
    """Check if an extracted name is garbage."""
    if not name or len(name) < 3:
        return True
    if len(name) > 300:
        return True
    garbage_patterns = [
        r"^\d+$",
        r"^\d+\.\s*$",
        r"^—\s*$",
        r"^\s*$",
        r"Moved\s+or\s+deleted",
        r"^For\s+the\s+purposes",
        r"^All\s+finished\s+products",
        r"^'Salts'\s+is\s+taken",
        r"^'Esters'\s+is\s+taken",
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
        r"^Purity\s+criteria",
        r"^Maximum\s+concentration",
        r"^Wording\s+of",
        r"^Conditions\s+of",
        r"^Product\s+type",
        r"^Substance\s+identification",
        r"^Name\s+of\s+Common",
        r"^Chemical\s+name",
        r"^CAS\s+number",
        r"^EC\s+number",
        r"^Colour\s+index",
        r"^Reference\s+number",
    ]
    for pattern in garbage_patterns:
        if re.search(pattern, name, re.IGNORECASE):
            return True
    return False


def find_data_tables(soup):
    """Find all data tables by looking for tables with substance entries."""
    tables = soup.find_all("table")
    data_tables = []
    
    for table in tables:
        text = table.get_text()
        
        # Check if this looks like an annex table
        text_upper = text.upper()
        has_ref = "REFERENCE NUMBER" in text_upper
        has_chemical = "CHEMICAL NAME" in text_upper or "CHEMICAL NAME/INN" in text_upper
        
        # Count rows with actual data
        rows = table.find_all("tr")
        data_rows = 0
        for row in rows:
            cells = row.find_all(["th", "td"])
            if len(cells) >= 3:
                ref_text = clean_text(cells[0].get_text())
                if re.match(r"^\d+[a-z]?$", ref_text):
                    data_rows += 1
        
        if has_ref and has_chemical and data_rows > 5:
            # Determine which annex this is
            text_lower = text.lower()
            if "mercury" in text_lower and "lead" in text_lower and "arsenic" in text_lower:
                annex = ("II", "banned")
            elif "hydroquinone" in text_lower and "formaldehyde" in text_lower:
                annex = ("III", "restricted")
            elif "list of colorants" in text_lower or ("ci " in text_lower and "red" in text_lower):
                annex = ("IV", "restricted")
            elif "benzoic acid" in text_lower and "sodium benzoate" in text_lower:
                annex = ("V", "restricted")
            elif "uv" in text_lower or "oxybenzone" in text_lower or "avobenzone" in text_lower:
                annex = ("VI", "restricted")
            else:
                annex = ("?", "restricted")
            
            data_tables.append((annex[0], annex[1], table))
            print(f"  Found Annex {annex[0]} table with {data_rows} data rows")
    
    return data_tables


def parse_annex2_table(table):
    """Parse Annex II (banned substances) simple table."""
    entries = []
    rows = table.find_all("tr")
    
    for row in rows:
        cells = row.find_all(["th", "td"])
        if len(cells) < 3:
            continue
        
        ref = clean_text(cells[0].get_text())
        chemical = clean_text(cells[1].get_text())
        cas = clean_text(cells[2].get_text()) if len(cells) > 2 else ""
        ec = clean_text(cells[3].get_text()) if len(cells) > 3 else ""
        
        # Skip header rows
        if not re.match(r"^\d+[a-z]?$", ref):
            continue
        if not chemical or is_garbage_name(chemical):
            continue
        
        entries.append({
            "ref": ref,
            "chemical_name": chemical,
            "glossary_names": [],
            "cas": cas if cas and cas not in ("N/A", "n/a", "-", "") else None,
            "ec": ec if ec and ec not in ("N/A", "n/a", "-", "") else None,
            "conditions": "",
        })
    
    return entries


def parse_complex_table(table):
    """Parse Annex III-VI tables with rowspan/colspan structure."""
    entries = []
    rows = table.find_all("tr")
    current_entry = None
    current_condition_group = None
    
    for row in rows:
        cells = row.find_all(["th", "td"])
        if not cells:
            continue
        
        # Skip header rows
        first_text = clean_text(cells[0].get_text())
        if first_text in ["Reference number", "a", "—", "", "Chemical name/INN", "Name of Common Ingredients Glossary", 
                          "Chemical name", "Name of Common Ingredients Glossary", "CAS number", "EC number"]:
            continue
        
        # Check if this is a new entry (has ref number in first cell)
        if re.match(r"^\d+[a-z]?$", first_text):
            # New entry
            ref = first_text
            
            # Get all cell texts
            cell_texts = [clean_text(c.get_text()) for c in cells]
            
            # Extract fields by position
            chemical = cell_texts[1] if len(cell_texts) > 1 else ""
            glossary = cell_texts[2] if len(cell_texts) > 2 else ""
            cas = cell_texts[3] if len(cell_texts) > 3 else ""
            ec = cell_texts[4] if len(cell_texts) > 4 else ""
            
            if not chemical or is_garbage_name(chemical):
                continue
            
            # Parse glossary names
            glossary_names = split_glossary_names(glossary)
            
            # Extract conditions from first row (for annexes like VI where conditions are in first row)
            # Skip empty cells and cells with just letters like "a", "b", "c"
            conditions_parts = []
            seen = set()
            for text in cell_texts[5:]:
                if text and text not in ("—", "", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"):
                    # Clean up condition text
                    text = re.sub(r"^\([a-z]\)", "", text).strip()
                    if text and text.lower() not in seen:
                        conditions_parts.append(text)
                        seen.add(text.lower())
            
            current_entry = {
                "ref": ref,
                "chemical_name": chemical,
                "glossary_names": glossary_names,
                "cas": cas if cas and cas not in ("N/A", "n/a", "-", "") else None,
                "ec": ec if ec and ec not in ("N/A", "n/a", "-", "") else None,
                "conditions": "; ".join(conditions_parts) if conditions_parts else "",
                "_seen_conditions": seen,
            }
            current_condition_group = None
            entries.append(current_entry)
            
        elif current_entry is not None and len(cells) >= 2:
            # Continuation row - add conditions, avoiding duplicates
            cell_texts = [clean_text(c.get_text()) for c in cells]
            
            # Check if first cell is a condition group marker like (a), (b), etc.
            first = cell_texts[0]
            second = cell_texts[1] if len(cell_texts) > 1 else ""
            
            def add_condition(text, sep="; "):
                """Add condition if not already seen (case-insensitive)."""
                norm = text.lower().strip()
                if norm and norm not in current_entry["_seen_conditions"]:
                    if current_entry["conditions"]:
                        current_entry["conditions"] += f"{sep}{text}"
                    else:
                        current_entry["conditions"] = text
                    current_entry["_seen_conditions"].add(norm)
            
            if re.match(r"^\([a-z]\)$", first):
                # New condition group
                current_condition_group = first
                if second and second not in ("—", ""):
                    # Add product type as new group
                    add_condition(second, " | ")
            elif first and first not in ("—", ""):
                # Additional condition data
                add_condition(first)
            
            # Check remaining cells
            for text in cell_texts[2:]:
                if text and text not in ("—", ""):
                    add_condition(text)
    
    return entries


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

    inserted = 0
    skipped = 0

    for entry in all_entries:
        status = entry["status"]
        annex = entry["annex"]
        chemical = entry["chemical_name"]
        glossary_list = entry.get("glossary_names", [])
        cas = entry.get("cas") or ""
        ec = entry.get("ec") or ""
        conditions = entry.get("conditions", "")
        ref = entry.get("ref", "")

        # Use first glossary name as primary inci_name, fallback to chemical name
        primary_name = glossary_list[0] if glossary_list else chemical
        
        # Build restriction details (summary only, not conditions)
        parts = [f"Annex {annex} — {status} substance"]
        if ref:
            parts.append(f"Ref: {ref}")
        if cas:
            parts.append(f"CAS: {cas}")
        if ec:
            parts.append(f"EC: {ec}")

        restriction = "; ".join(parts)
        
        # Store all glossary names as comma-separated
        glossary_str = ", ".join(glossary_list) if glossary_list else None

        try:
            cursor.execute(
                """
                INSERT OR IGNORE INTO regulatory_status 
                (inci_name, chemical_name, glossary_name, status, annex, restriction_details, conditions, regulation_source, effective_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    primary_name,
                    chemical,
                    glossary_str,
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
            print(f"Error inserting {primary_name}: {e}")
            skipped += 1

    conn.commit()
    conn.close()

    print(f"\nInserted {inserted} new entries")
    if skipped:
        print(f"Skipped {skipped} duplicates")


def main():
    print("=" * 60)
    print("EUR-Lex HTML Annex Importer")
    print("=" * 60)

    download_html()

    with open(HTML_PATH, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    print(f"\nParsed HTML document")

    # Find data tables
    print("\nSearching for annex tables...")
    data_tables = find_data_tables(soup)
    print(f"Found {len(data_tables)} annex tables")

    all_entries = []

    for annex_name, status, table in data_tables:
        print(f"\n{'=' * 60}")
        print(f"Processing Annex {annex_name} ({status})")
        print(f"{'=' * 60}")
        
        if annex_name == "II":
            entries = parse_annex2_table(table)
        else:
            entries = parse_complex_table(table)
        
        print(f"Extracted {len(entries)} entries")
        
        # Show sample
        for entry in entries[:3]:
            print(f"  Ref {entry.get('ref', 'N/A')}: {entry['chemical_name'][:60]}")
            if entry.get('glossary_names'):
                print(f"    Glossary: {', '.join(entry['glossary_names'])[:80]}")
            if entry.get('conditions'):
                print(f"    Conditions: {entry['conditions'][:80]}")
        
        # Add status and annex to each entry
        for entry in entries:
            entry["status"] = status
            entry["annex"] = annex_name
        
        all_entries.extend(entries)

    print(f"\n{'=' * 60}")
    print(f"Total entries extracted: {len(all_entries)}")
    print(f"{'=' * 60}")

    # Clean up internal fields before saving
    for entry in all_entries:
        entry.pop("_seen_conditions", None)

    # Save to JSON for inspection
    import json
    with open("/tmp/eur-lex-html-entries.json", "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    print("Saved to /tmp/eur-lex-html-entries.json")

    import_to_database(all_entries)

    print("\nDone! Run 'pnpm build' to verify the app works with the new data.")


if __name__ == "__main__":
    main()
