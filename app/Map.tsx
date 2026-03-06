'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';

// Fix for default marker icons in Leaflet
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Location {
  address: string;
  postnr: string;
  description: string;
  lat: number;
  lon: number;
}

interface MapProps {
  locations: Location[];
}

export default function Map({ locations }: MapProps) {
  const osloCenter: [number, number] = [59.9139, 10.7522];

  return (
    <div className="h-[600px] w-full rounded-xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800">
      <MapContainer 
        center={osloCenter} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((loc, i) => (
          <Marker 
            key={i} 
            position={[loc.lat, loc.lon]} 
            icon={icon}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-lg">{loc.address}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{loc.postnr} Oslo</p>
                {loc.description && (
                  <p className="mt-2 text-xs italic">{loc.description}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
