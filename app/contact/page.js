import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, Clock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/public-footer';
import logoImage from '@/logo.png';
import { ContactForm } from './contact-form';

export const metadata = {
  title: 'Contact Komentra',
  description:
    'Contact Komentra for support, privacy requests, partnership questions, or help with Instagram comment and DM automation.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Komentra',
    description: 'Get help with Komentra Instagram comment and DM automation.',
    url: '/contact',
    siteName: 'Komentra',
    type: 'website',
  },
};

export default function ContactPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src={logoImage} alt="Komentra" priority className="h-11 w-auto object-contain" />
            <span className="text-lg font-semibold tracking-tight">Komentra</span>
          </Link>
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Home
            </Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 border-b border-slate-200 bg-slate-50">
        <div className="container mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700">
              <Mail className="h-4 w-4 text-sky-700" />
              Contact Komentra
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Get help from the Komentra team.</h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Send support questions, privacy requests, product feedback, or partnership notes. We route everything through admin@komentra.tech.
            </p>

            <div className="mt-8 grid gap-3">
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <h2 className="font-semibold">What to include</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Share the workspace, Instagram handle, campaign, or error message if your request is about an active automation.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                <div>
                  <h2 className="font-semibold">Privacy requests</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    For deletion or access requests, use the email address tied to your Komentra account so we can verify ownership.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading contact form...</div>}>
            <ContactForm />
          </Suspense>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
