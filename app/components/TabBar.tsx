"use client";

import { useState } from "react";

type Tab = "map" | "porechecker";

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "map", label: "Kart" },
    { id: "porechecker", label: "Pore Clogging Checker" },
  ];

  return (
    <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === tab.id
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm border border-zinc-200 dark:border-zinc-700"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
