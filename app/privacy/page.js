import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Database,
  Instagram,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/public-footer';
import logoImage from '@/logo.png';

export const metadata = {
  title: 'Privacy Policy',
  description:
    'How Komentra collects, uses, protects, and deletes account, Instagram, automation, workspace, and analytics data.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy | Komentra',
    description: 'Privacy and data use details for Komentra Instagram comment and DM automation.',
    url: '/privacy',
    siteName: 'Komentra',
    type: 'article',
  },
};

const updatedAt = 'May 18, 2026';

const sections = [
  {
    icon: Database,
    title: 'Data We Collect',
    body: [
      'Account details you provide, such as name or username, email address, password hash, verification status, and account timestamps.',
      'Workspace data, including workspace names, selected Instagram account records, connected account status, and workspace-level settings.',
      'Instagram data needed to run the product, such as account ID, username, account type, access token, token expiry, eligible media, comments, messages, webhook events, and automation activity.',
      'Automation and analytics data, including keywords, match type, reply variants, DM text, link buttons, follow-gating settings, trigger counts, recent matches, and audience records.',
      'Basic technical records such as request timestamps, error logs, browser details, and IP-related security information used to operate and protect the service.',
    ],
  },
  {
    icon: Instagram,
    title: 'How Instagram Data Is Used',
    body: [
      'Komentra uses Instagram data to connect your Business or Creator account, display eligible posts, monitor selected comments or DMs, send configured replies, send configured messages, and show analytics.',
      'We do not sell Instagram data, use it for unrelated advertising, or build unrelated profiles from connected account data.',
      'Access tokens are used only to perform actions that you configure or request inside Komentra.',
    ],
  },
  {
    icon: UserCheck,
    title: 'Account And Service Messages',
    body: [
      'Your email address is used for account verification, login support, password reset messages, important security notices, and direct support replies.',
      'We may use your submitted contact form details to understand and respond to the request you sent.',
      'We do not sell your email address or share it with advertisers.',
    ],
  },
  {
    icon: LockKeyhole,
    title: 'Security And Retention',
    body: [
      'Komentra uses HTTPS for browser communication and stores passwords as hashes instead of plain text.',
      'Production data access is limited to people or systems that need it to operate, support, secure, or maintain the service.',
      'We keep operational and analytics records while they are useful for the product, support, security, or legal obligations, unless deletion is requested and no limited retention reason applies.',
    ],
  },
  {
    icon: Trash2,
    title: 'Deletion And Your Choices',
    body: [
      'You can disconnect an Instagram account from the dashboard. Disconnecting removes that linked account from active use and removes related active automations.',
      'You can request account deletion or Instagram data deletion by emailing admin@komentra.tech from the email address used for your Komentra account.',
      'After a valid request, we will delete or anonymize account, workspace, connected Instagram, automation, and related analytics data unless limited records must be kept for security, fraud prevention, legal, or dispute reasons.',
    ],
  },
];

export default function PrivacyPage() {
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

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="container mx-auto max-w-5xl px-4 py-14">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Privacy and data use
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">Komentra Privacy Policy</h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              This policy explains what Komentra collects, why we collect it, how Instagram data is used, and how you can request deletion.
            </p>
            <p className="mt-4 text-sm text-slate-500">Last updated: {updatedAt}</p>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Plain-language summary</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>We collect the data needed to create your account, connect Instagram, run automations, and show analytics.</p>
              <p>Instagram data is used for the automation features you configure. It is not sold.</p>
              <p>For privacy questions or deletion requests, contact us at admin@komentra.tech.</p>
            </div>
            <Button asChild className="mt-5 w-full bg-slate-950 hover:bg-slate-800">
              <Link href="/contact?topic=privacy">Contact privacy support</Link>
            </Button>
          </div>
        </aside>

        <div className="space-y-5">
          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">About this policy</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
              <p>
                Komentra is an Instagram comment and DM automation service for users who connect their own Instagram Business or Creator accounts.
              </p>
              <p>
                If you use Komentra or connect an Instagram account, you agree to the data practices described here. If you do not agree, do not connect your Instagram account or use the service.
              </p>
            </div>
          </article>

          {sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <section.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                    {section.body.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}

          <article className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-slate-950 shadow-sm">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Contact</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  For privacy questions, data access requests, or deletion requests, email{' '}
                  <a href="mailto:admin@komentra.tech" className="font-semibold text-slate-950 underline underline-offset-4">
                    admin@komentra.tech
                  </a>
                  .
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
