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
    return <div className="text-sm text-gray-500">Loading sources...</div>;
  }

  const getTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      reference: { text: 'Reference', color: 'bg-blue-100 text-blue-800' },
      regulatory: { text: 'Regulatory', color: 'bg-green-100 text-green-800' },
      study: { text: 'Study', color: 'bg-purple-100 text-purple-800' },
      github: { text: 'Open Data', color: 'bg-gray-100 text-gray-800' },
    };
    return labels[type] || { text: type, color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Data Sources</h3>
      <p className="text-sm text-gray-600">
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
              className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                      {typeInfo.text}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{source.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{source.managedBy}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
        <p className="font-medium text-blue-900 mb-1">EU Regulatory Status</p>
        <p className="text-blue-800">
          We track EU Cosmetics Regulation (EC) No 1223/2009 banned and restricted ingredients 
          from Annexes II, III, V, and VI. This helps identify ingredients that are prohibited 
          or have concentration limits in the European Union.
        </p>
      </div>
    </div>
  );
}
