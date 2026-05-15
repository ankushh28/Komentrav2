import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'Komentra - Instagram Comment Automation',
  description: 'Turn Instagram comments into replies and DMs with simple keyword automations.',
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
