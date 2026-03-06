import fs from "fs";
import path from "path";

const LOCATIONS_FILE = path.join(process.cwd(), "app", "locations.txt");
const OUTPUT_FILE = path.join(process.cwd(), "public", "locations.json");

async function geocode(address, postnr) {
  const query = `${address}, ${postnr} Oslo, Norway`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OsloTextileCollectionApp/1.0",
      },
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
  } catch (error) {
    console.error(`Error geocoding ${query}:`, error);
  }
  return null;
}

async function run() {
  const content = fs.readFileSync(LOCATIONS_FILE, "utf-8");
  const lines = content.split("\n");

  // Find the starting line (after header)
  const dataLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.toLowerCase().startsWith("gateadresse");
  }); // .slice(0, 10) LIMIT TO 10 FOR TESTING

  const results = [];

  for (const line of dataLines) {
    // Regex to handle optional "Number: " prefix, then Address, then 4-digit postnr, then optional description
    const match = line.match(/^(?:\d+:\s+)?(.+?)\s+(\d{4})(?:\s+(.*))?$/);
    if (match) {
      const [, address, postnr, description] = match;
      console.log(`Geocoding: ${address} ${postnr}...`);
      const coords = await geocode(address, postnr);

      if (coords) {
        results.push({
          address: address.trim(),
          postnr: postnr.trim(),
          description: description?.trim() || "",
          ...coords,
        });
      } else {
        console.warn(`Could not geocode: ${address} ${postnr}`);
      }

      // Respect Nominatim's rate limit
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Finished! Saved ${results.length} locations to ${OUTPUT_FILE}`);
}

run();
