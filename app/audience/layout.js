import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata = buildNoIndexMetadata('Audience | Komentra', '/audience');

export default function AudienceLayout({ children }) {
  return children;
}
