# Tekstilinnsamling i Oslo

En oversikt over innsamlingspunkter for klær og tekstiler i Oslo.

## Oppdatering av data

Følg disse stegene for å oppdatere lokasjonene:

1.  Last ned den nyeste `.txt`-filen med lokasjoner fra [Oslo kommune](https://www.oslo.kommune.no/avfall-og-gjenvinning/hvordan-kildesortere-i-oslo/#klar-og-tekstiler).
2.  Kjør scriptet `scripts/geocode.mjs` for å behandle og geokode lokasjonene.
3.  Deploy appen på nytt.

## Utvikling

```bash
pnpm dev
```