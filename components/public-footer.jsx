import Link from 'next/link';
import Image from 'next/image';
import { Instagram, Mail } from 'lucide-react';
import logoImage from '@/logo.png';

const productLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#use-cases', label: 'Use cases' },
  { href: '/#faq', label: 'FAQ' },
];

const companyLinks = [
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/auth?mode=login', label: 'Sign in' },
  { href: '/auth?mode=signup', label: 'Get started' },
];

export function PublicFooter({ compact = false }) {
  const year = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="border-t bg-white">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {year} Komentra. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/contact" className="hover:text-slate-950">Contact</Link>
            <Link href="/privacy" className="hover:text-slate-950">Privacy</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t bg-slate-950 text-white">
      <div className="container mx-auto grid gap-10 px-4 py-12 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
        <div className="max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src={logoImage} alt="Komentra" className="h-11 w-auto object-contain brightness-0 invert" />
            <span className="text-lg font-semibold tracking-tight">Komentra</span>
          </Link>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Comment and DM automation for Instagram creators, brands, and agencies that want cleaner lead capture without manual follow-up.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <a href="mailto:admin@komentra.tech" className="inline-flex items-center gap-2 hover:text-white">
              <Mail className="h-4 w-4" />
              admin@komentra.tech
            </a>
            <span className="inline-flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Instagram automation
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">Product</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            {productLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-white">Company</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            {companyLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright {year} Komentra. All rights reserved.</p>
          <p>Not affiliated with Instagram or Meta. Use requires your own eligible Instagram account.</p>
        </div>
      </div>
    </footer>
  );
}
