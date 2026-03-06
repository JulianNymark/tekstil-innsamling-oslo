# Tekstilinnsamling i Oslo

En oversikt over innsamlingspunkter for klær og tekstiler i Oslo.

## Komme i gang

For å kjøre prosjektet lokalt:

1.  Installer avhengigheter:
    ```bash
    pnpm install
    ```
2.  Start utviklingsserveren:
    ```bash
    pnpm dev
    ```
3.  Åpne [http://localhost:3000](http://localhost:3000) i nettleseren.

## Oppdatering av data

Hvis du vil oppdatere kartet med de nyeste lokasjonene fra kommunen:

1.  Gå til [Oslo kommune](https://www.oslo.kommune.no/avfall-og-gjenvinning/hvordan-kildesortere-i-oslo/#klar-og-tekstiler) og åpne listen over innsamlingspunkter (PDF).
2.  Bruk "ctrl+a" (eller "cmd+a") i PDF-leseren for å markere alt og kopier teksten.
3.  Lim innholdet inn i `data/locations.txt` (overskriv eksisterende innhold).
4.  Kjør scriptet for å behandle og geokode lokasjonene (dette lager en ny `public/locations.json`):
    ```bash
    pnpm geocode
    ```
5.  Bygg og deploy appen på nytt for å se endringene.

## Distribusjon

For å bygge appen for produksjon:

```bash
pnpm build
pnpm start
```