import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://komentra.tech'),
  title: {
    default: 'Komentra | Instagram Comment and DM Automation',
    template: '%s | Komentra',
  },
  description: 'Turn Instagram comments into replies, DMs, links, and audience insights with simple keyword automations.',
  applicationName: 'Komentra',
  keywords: [
    'Instagram automation',
    'Instagram comment automation',
    'Instagram DM automation',
    'creator automation',
    'agency Instagram tools',
  ],
  openGraph: {
    siteName: 'Komentra',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
