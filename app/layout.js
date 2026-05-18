import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { buildMetadata, routeMetadata, siteConfig } from '@/lib/seo';

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  ...buildMetadata(routeMetadata.home),
  title: {
    default: routeMetadata.home.title,
    template: `%s | ${siteConfig.name}`,
  },
  applicationName: siteConfig.name,
  category: 'SaaS',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo-mark-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
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
