import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'ICAO Speed Trainer', short_name: 'ICAO Trainer', description: 'Szybki trening alfabetu lotniczego ICAO.', start_url: '/', display: 'standalone', background_color: '#f4f7fa', theme_color: '#102a43', lang: 'pl', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
