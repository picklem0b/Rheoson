import type { Metadata, Viewport } from 'next';

import Providers from './providers';
import './globals.css';

/** App metadata — the honest positioning, and the installable-app surface. */
export const metadata: Metadata = {
  title: 'Rheoson',
  description:
    'Self-hosted music streaming with real downloads: stream your library, keep your files, read honest errors when something breaks.',
  applicationName: 'Rheoson',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Rheoson', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#080809',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
