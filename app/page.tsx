"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ToggleGroup } from "@digdir/designsystemet-react";
import PoreChecker from "./components/PoreChecker";

interface Location {
  address: string;
  postnr: string;
  description: string;
  lat: number;
  lon: number;
}

interface LocationsData {
  updatedAt: string;
  locations: Location[];
}

type Tab = "map" | "check" | "browse";

type PoreCheckerMode = "check" | "browse";

const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-full bg-[var(--ds-color-surface-tinted)] flex items-center justify-center text-[var(--ds-color-text-subtle)] rounded-xl">
      Loading map...
    </div>
  ),
});

function getInitialTab(): Tab {
  if (typeof window === "undefined") return "map";
  const hash = window.location.hash.replace("#", "");
  if (hash === "check" || hash === "browse" || hash === "map") {
    return hash;
  }
  if (hash === "porechecker") {
    return "check";
  }
  return "map";
}

export default function Home() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);

  // Update URL hash when tab changes
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    fetch("/locations.json")
      .then((res) => res.json())
      .then((data: LocationsData | Location[]) => {
        if ("locations" in data) {
          setLocations(data.locations);
          setUpdatedAt(data.updatedAt);
        } else {
          setLocations(data as Location[]);
        }
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ds-color-background-tinted)] font-sans p-4 sm:p-8">
      <main className="flex min-h-screen w-full max-w-5xl flex-col items-center gap-8 py-8 px-4">
        {/* Compact Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-color-text-default)] sm:text-3xl">
            Tekstilinnsamling + Pore-vakten
          </h1>
          <p className="max-w-lg text-sm text-[var(--ds-color-text-subtle)]">
            Finn innsamlingspunkt for tekstiler, eller sjekk om
            skjønnhetsproduktene dine tetter porene.
          </p>
        </div>

        {/* Tab Navigation */}

        <ToggleGroup
          data-toggle-group="Velg side"
          value={activeTab}
          onChange={(value) => handleTabChange(value as Tab)}
        >
          <ToggleGroup.Item value="map">Sorter Klær</ToggleGroup.Item>
          <ToggleGroup.Item value="check">Check Product</ToggleGroup.Item>
          <ToggleGroup.Item value="browse">Browse Database</ToggleGroup.Item>
        </ToggleGroup>

        {/* Tab Content */}
        {activeTab === "map" && (
          <>
            <div className="w-full">
              <Map locations={locations} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
              <div className="p-6 bg-[var(--ds-color-surface-tinted)] rounded-2xl border border-[var(--ds-color-border-subtle)]">
                <h2 className="text-xl font-bold mb-3">Hva kan leveres?</h2>
                <ul className="space-y-2 text-[var(--ds-color-text-subtle)]">
                  <li>• Hele og brukbare klær, tekstiler og sko</li>
                  <li>• Utslitte og ødelagte klær og tekstiler</li>
                  <li>• Alt må være rent og tørt</li>
                  <li>• Leveres i lukket pose med dobbeltknute</li>
                </ul>
              </div>
              <div className="p-6 bg-[var(--ds-color-surface-tinted)] rounded-2xl border border-[var(--ds-color-border-subtle)]">
                <h2 className="text-xl font-bold mb-3">
                  Hva skal i restavfall?
                </h2>
                <ul className="space-y-2 text-[var(--ds-color-text-subtle)]">
                  <li>• Vått, muggent eller svært skittent tøy</li>
                  <li>• Undertøy</li>
                  <li>• Ødelagte sko, vesker, belter og annet tilbehør</li>
                  <li>• Klær og sko fra Temu og Shein</li>
                </ul>
              </div>
            </div>
          </>
        )}

        {(activeTab === "check" || activeTab === "browse") && (
          <div className="w-full max-w-4xl px-4">
            <PoreChecker mode={activeTab as PoreCheckerMode} />
          </div>
        )}

        <div className="w-full max-w-4xl px-4 text-center space-y-2">
          <p className="text-sm text-[var(--ds-color-text-subtle)]">
            Ser du noe som ikke stemmer? en utdatert lokasjon?{" "}
            <a
              href="https://github.com/JulianNymark/tekstil-innsamling-oslo/issues/new/choose"
              className="underline hover:text-[var(--ds-color-text-default)] transition-colors"
            >
              Meld fra om hva som helst her
            </a>
            .
          </p>
          {updatedAt && (
            <p className="text-[10px] text-[var(--ds-color-text-subtle)] uppercase tracking-widest font-medium">
              Sist oppdatert:{" "}
              {new Intl.DateTimeFormat("nb-NO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(updatedAt))}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
