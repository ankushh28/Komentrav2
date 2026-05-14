import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'ReplyPilot — Instagram Comment Automation',
  description: 'Auto-reply to Instagram comments and send DMs based on trigger keywords.',
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
