import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata = buildNoIndexMetadata('Analytics | Komentra', '/analytics');

export default function AnalyticsLayout({ children }) {
  return children;
}
