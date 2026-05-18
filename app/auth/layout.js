import { buildNoIndexMetadata } from '@/lib/seo';

export const metadata = buildNoIndexMetadata('Sign in | Komentra', '/auth');

export default function AuthLayout({ children }) {
  return children;
}
