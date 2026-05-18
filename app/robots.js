import { absoluteUrl, siteConfig } from '@/lib/seo';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy'],
        disallow: ['/api/', '/auth', '/dashboard', '/analytics', '/audience'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteConfig.url,
  };
}
