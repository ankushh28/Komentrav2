import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata = buildNoIndexMetadata('Dashboard | Komentra', '/dashboard');

export default function DashboardLayout({ children }) {
  return children;
}
