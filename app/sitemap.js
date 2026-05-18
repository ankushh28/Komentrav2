import { absoluteUrl } from '@/lib/seo';

export default function sitemap() {
  return [
    {
      url: absoluteUrl('/'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified: new Date('2026-05-15'),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];
}
