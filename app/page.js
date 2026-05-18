import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Inbox,
  Instagram,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/public-footer';
import { HomeAuthRedirect } from './home-auth-redirect';
import logoImage from '@/logo.png';

export const metadata = {
  title: {
    absolute: 'Komentra | Instagram Comment and DM Automation for Creators',
  },
  description:
    'Turn Instagram comments into public replies, smart DMs, link delivery, and audience insights with Komentra.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Komentra | Instagram Comment and DM Automation',
    description:
      'Automate Instagram comment replies and DMs for creators, brands, and agencies without losing the human feel.',
    url: '/',
    siteName: 'Komentra',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Komentra | Instagram Comment and DM Automation',
    description: 'Instagram comment and DM automation built for creators, brands, and agencies.',
  },
};

const features = [
  {
    icon: MessageSquare,
    title: 'Comment-triggered replies',
    text: 'Listen for keywords on selected posts and publish a clean public reply without sitting in comments all day.',
  },
  {
    icon: Inbox,
    title: 'Smart DM follow-up',
    text: 'Send the right message, link, or button when someone asks for price, details, guide, catalog, or booking info.',
  },
  {
    icon: Workflow,
    title: 'Creator-friendly setup',
    text: 'Choose a workspace, connect Instagram, pick a post, add keywords, and launch the automation in minutes.',
  },
  {
    icon: ShieldCheck,
    title: 'Instagram data boundaries',
    text: 'Use Instagram data only for the automation you configure, with clear deletion and privacy controls.',
  },
  {
    icon: BarChart3,
    title: 'Audience and analytics',
    text: 'See triggers, DMs, top keywords, recent matches, and the people engaging with each workspace.',
  },
  {
    icon: Users,
    title: 'Agency workspace flow',
    text: 'Keep accounts and automations organized by workspace so client campaigns do not get mixed together.',
  },
];

const steps = [
  ['01', 'Connect Instagram', 'Use Meta login to connect an eligible Business or Creator account.'],
  ['02', 'Create the automation', 'Pick a post, add trigger keywords, write reply variants, and add DM buttons.'],
  ['03', 'Publish and monitor', 'Turn it on, watch matches appear, and improve campaigns from analytics.'],
];

const useCases = [
  'Send a product link when someone comments "price".',
  'Deliver a free guide from comments without manual inbox work.',
  'Route campaign leads from reels into DMs with button links.',
  'Track which keywords and posts create the most replies.',
];

const faqs = [
  {
    question: 'Who is Komentra for?',
    answer:
      'Komentra is built for Instagram creators, small brands, coaches, and agencies that use comments and DMs to collect leads or deliver links.',
  },
  {
    question: 'Do I need an Instagram Business or Creator account?',
    answer:
      'Yes. Instagram automation features require an eligible Instagram Business or Creator account connected through Meta permissions.',
  },
  {
    question: 'Can I use different keywords for one post?',
    answer:
      'Yes. You can add multiple trigger keywords and choose how matching should work for a comment or DM automation.',
  },
  {
    question: 'Does Komentra sell Instagram data?',
    answer:
      'No. Komentra uses connected Instagram data to provide the automation, analytics, and support features you request.',
  },
  {
    question: 'How do I request help or data deletion?',
    answer:
      'Use the contact page or email admin@komentra.tech from the email address used for your Komentra account.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <HomeAuthRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src={logoImage} alt="Komentra" priority className="h-11 w-auto object-contain" />
            <span className="text-lg font-semibold tracking-tight">Komentra</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="#features" className="hover:text-slate-950">Features</Link>
            <Link href="#how-it-works" className="hover:text-slate-950">How it works</Link>
            <Link href="#faq" className="hover:text-slate-950">FAQ</Link>
            <Link href="/contact" className="hover:text-slate-950">Contact</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/auth?mode=login">Sign in</Link>
            </Button>
            <Button asChild className="bg-slate-950 hover:bg-slate-800">
              <Link href="/auth?mode=signup">
                Get started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_72%)]">
        <div className="container mx-auto grid min-h-[calc(100vh-76px)] items-center gap-10 px-4 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Built for creators, brands, and agencies
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Turn Instagram comments into replies, DMs, and real leads.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Komentra helps you respond faster when people ask for links, prices, guides, or details. Build keyword automations, send useful DMs, and understand what is converting.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-slate-950 hover:bg-slate-800">
                <Link href="/auth?mode=signup">
                  Start free <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Talk to us</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              {['No credit card needed', 'Meta-based connection', 'Workspace-ready'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <p className="text-sm font-semibold">Campaign automation</p>
                  <p className="text-xs text-slate-500">Product launch reel</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Live</span>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">When someone comments</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['price', 'details', 'link'].map((word) => (
                      <span key={word} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <MessageSquare className="h-5 w-5 text-sky-600" />
                    <p className="mt-3 text-sm font-semibold">Public reply</p>
                    <p className="mt-1 text-sm text-slate-500">"Sent the details to your inbox."</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 shadow-sm">
                    <Inbox className="h-5 w-5 text-rose-600" />
                    <p className="mt-3 text-sm font-semibold">Direct message</p>
                    <p className="mt-1 text-sm text-slate-500">Message plus link buttons.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['128', 'Triggers'],
                    ['116', 'Replies'],
                    ['94', 'DMs sent'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-lg bg-white p-4 text-center shadow-sm">
                      <p className="text-2xl font-semibold">{value}</p>
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Everything needed for a cleaner Instagram lead flow.</h2>
          <p className="mt-4 text-slate-600">
            Komentra keeps the core workflow simple: trigger, reply, DM, measure, improve.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <feature.icon className="h-5 w-5 text-slate-950" />
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
        <div className="container mx-auto px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Launch the automation without rebuilding your workflow.</h2>
              <p className="mt-4 text-slate-600">
                The current app flow stays focused: workspaces, Instagram accounts, automations, analytics, and audience.
              </p>
            </div>
            <div className="grid gap-4">
              {steps.map(([number, title, text]) => (
                <article key={number} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[64px_1fr]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                    {number}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="use-cases" className="container mx-auto grid gap-10 px-4 py-20 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Use cases</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Useful for campaigns where timing matters.</h2>
          <p className="mt-4 text-slate-600">
            People often ask while attention is high. Komentra helps you answer while the post is still fresh.
          </p>
        </div>
        <div className="grid gap-3">
          {useCases.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 text-white">
        <div className="container mx-auto grid gap-8 px-4 py-16 md:grid-cols-3">
          {[
            ['Privacy aware', 'Clear contact and deletion paths, with Instagram data used only for configured automation.'],
            ['Operationally simple', 'Workspace-based account management for creators, brands, and agency client work.'],
            ['Built around action', 'Replies, DMs, link buttons, and analytics sit in one practical flow.'],
          ].map(([title, text]) => (
            <div key={title}>
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Questions before you connect Instagram?</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {faqs.map((faq) => (
              <details key={faq.question} className="group p-5">
                <summary className="cursor-pointer list-none text-base font-semibold">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center sm:p-10">
          <Instagram className="mx-auto h-8 w-8 text-slate-950" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Ready to make Instagram follow-up easier?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Create your account, connect Instagram, and build your first comment-to-DM automation.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-slate-950 hover:bg-slate-800">
              <Link href="/auth?mode=signup">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Contact support</Link>
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
