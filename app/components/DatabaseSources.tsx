'use client';

import { useState, useEffect } from 'react';

interface Source {
  name: string;
  description: string;
  managedBy: string;
  url: string;
  type: string;
}

export default function DatabaseSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sources')
      .then(res => res.json())
      .then(data => {
        setSources(data.sources);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-[var(--ds-color-text-subtle)]">Loading sources...</div>;
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      reference: { text: 'Reference', color: 'bg-[var(--ds-color-info-surface-tinted)] text-[var(--ds-color-info-text-default)]' },
      regulatory: { text: 'Regulatory', color: 'bg-[var(--ds-color-success-surface-tinted)] text-[var(--ds-color-success-text-default)]' },
      study: { text: 'Study', color: 'bg-[var(--ds-color-accent-surface-tinted)] text-[var(--ds-color-accent-text-default)]' },
      github: { text: 'Open Data', color: 'bg-[var(--ds-color-neutral-surface-tinted)] text-[var(--ds-color-neutral-text-default)]' },
    };
    return labels[type] || { text: type, color: 'bg-[var(--ds-color-neutral-surface-tinted)] text-[var(--ds-color-neutral-text-default)]' };
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Data Sources</h3>
      <p className="text-sm text-[var(--ds-color-text-subtle)]">
        Our ingredient database combines multiple authoritative sources:
      </p>
      
      <div className="grid gap-3">
        {sources.map((source) => {
          const typeInfo = getTypeLabel(source.type);
          return (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg border border-[var(--ds-color-border-default)] hover:border-[var(--ds-color-border-strong)] hover:bg-[var(--ds-color-surface-hover)] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                      {typeInfo.text}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ds-color-text-subtle)]">{source.description}</p>
                  <p className="text-xs text-[var(--ds-color-text-subtle)] mt-1">{source.managedBy}</p>
                </div>
                <svg className="w-4 h-4 text-[var(--ds-color-text-subtle)] mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-[var(--ds-color-info-surface-tinted)] rounded-lg text-sm">
        <p className="font-medium text-[var(--ds-color-info-text-default)] mb-1">EU Regulatory Status</p>
        <p className="text-[var(--ds-color-info-text-subtle)]">
          We track EU Cosmetics Regulation (EC) No 1223/2009 banned and restricted ingredients 
          from Annexes II, III, V, and VI. This helps identify ingredients that are prohibited 
          or have concentration limits in the European Union.
        </p>
      </div>
    </div>
  );
}
