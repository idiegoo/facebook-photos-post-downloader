import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Facebook Post Photo Downloader in ZIP (Multithreaded)',
  description:
    'Download all photos from any Facebook post in original maximum resolution into a ZIP archive with asynchronous multithreaded acceleration.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
