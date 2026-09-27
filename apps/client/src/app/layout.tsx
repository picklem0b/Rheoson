import type { Metadata, Viewport } from 'next';

import './globals.css';

/** App metadata — same honest positioning as the current site. */
export const metadata: Metadata = {
  title: 'Rheoson',
  description:
    'Self-hosted music streaming with real downloads: stream your library, keep your files, read honest errors when something breaks.',
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
      <body>{children}</body>
    </html>
  );
}
