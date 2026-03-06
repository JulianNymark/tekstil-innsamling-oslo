'use client';

import dynamic from 'next/dynamic';

const Map = dynamic(() => import('./Map'), { 
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 rounded-xl">Loading map...</div>
});

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black p-4 sm:p-8">
      <main className="flex min-h-screen w-full max-w-5xl flex-col items-center gap-12 py-16 px-4 bg-white dark:bg-zinc-950 rounded-3xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Tekstilinnsamling i Oslo
          </h1>
          <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Finn ditt nærmeste innsamlingspunkt for klær og tekstiler.
          </p>
        </div>

        <div className="w-full">
          <Map />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
          <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <h2 className="text-xl font-bold mb-3">Hva kan leveres?</h2>
            <ul className="space-y-2 text-zinc-600 dark:text-zinc-400">
              <li>• Klær og sko</li>
              <li>• Sengetøy og gardiner</li>
              <li>• Håndklær og kluter</li>
              <li>• Duker og stoffrester</li>
            </ul>
          </div>
          <div className="p-6 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <h2 className="text-xl font-bold mb-3">Husk!</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Alt må være rent, tørt og pakket i tette plastposer før det legges i beholderen.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
