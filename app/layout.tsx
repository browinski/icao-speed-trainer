import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegister from './service-worker-register';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ICAO Speed Trainer',
  description: 'Szybki trening alfabetu lotniczego ICAO: czytanie, słuch i sekwencje.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}<ServiceWorkerRegister /></body></html>;
}
