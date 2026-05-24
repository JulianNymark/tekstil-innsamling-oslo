"use client";

import { useState } from "react";

type Tab = "map" | "porechecker";

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "map", label: "Sorter Klær" },
    { id: "porechecker", label: "Pore-vakten" },
  ];

  return (
    <div className="flex gap-1 p-1 bg-[var(--ds-color-surface-tinted)] rounded-xl border border-[var(--ds-color-border-default)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === tab.id
              ? "bg-[var(--ds-color-surface-default)] text-[var(--ds-color-text-default)] shadow-sm border border-[var(--ds-color-border-subtle)]"
              : "text-[var(--ds-color-text-subtle)] hover:text-[var(--ds-color-text-default)] hover:bg-[var(--ds-color-surface-hover)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
