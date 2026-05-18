import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BrandLogo } from '@/components/brand-logo';
import { HomeRedirect } from '@/components/home-redirect';
import {
  Zap, MessageSquare, Send, Sparkles, ShieldCheck, BarChart3,
  Hash, UserCheck, ArrowRight, CheckCircle2, Instagram, Bot,
  Gift, ShoppingBag, CalendarCheck, Trophy, Users, Layers,
} from 'lucide-react';
import {
  buildMetadata,
  faqItems,
  faqJsonLd,
  organizationJsonLd,
  productJsonLd,
  routeMetadata,
  softwareJsonLd,
  websiteJsonLd,
} from '@/lib/seo';

export const metadata = buildMetadata(routeMetadata.home);

const features = [
  { icon: Zap, title: 'Multi-keyword triggers', desc: 'Add multiple trigger words per post and choose contains, exact, or starts-with matching.', color: 'from-amber-400 to-orange-500' },
  { icon: MessageSquare, title: 'Public reply variants', desc: 'Rotate up to 3 public replies so your comment automation feels natural instead of repetitive.', color: 'from-rose-400 to-fuchsia-500' },
  { icon: Send, title: 'DMs with link buttons', desc: 'Send a private message with up to 3 links for products, bookings, offers, lead magnets, or content.', color: 'from-indigo-400 to-violet-500' },
  { icon: UserCheck, title: 'Follow-gated delivery', desc: 'Ask people to follow first and verify the follow before sending the main DM.', color: 'from-emerald-400 to-teal-500' },
  { icon: BarChart3, title: 'Audience and analytics', desc: 'Track triggers, DMs, top keywords, audience members, and per-automation performance.', color: 'from-cyan-400 to-blue-500' },
  { icon: ShieldCheck, title: 'Meta-aware workflow', desc: 'Built around Instagram Business and Creator account flows, webhook delivery, and platform limits.', color: 'from-violet-400 to-purple-600' },
];

const useCases = [
  { icon: Gift, title: 'Lead magnets', desc: 'Ask followers to comment GUIDE, CHECKLIST, or TEMPLATE, then deliver the resource by DM.' },
  { icon: ShoppingBag, title: 'Product links', desc: 'Turn comments like price, link, or shop into instant product DMs with button links.' },
  { icon: CalendarCheck, title: 'Bookings', desc: 'Send appointment, consultation, or demo links when a prospect comments with buying intent.' },
  { icon: Trophy, title: 'Giveaways', desc: 'Confirm entries, explain rules, and route participants into a tracked audience list.' },
  { icon: Users, title: 'Creator campaigns', desc: 'Share affiliate, sponsor, or newsletter links without manually replying to every comment.' },
];

const comparisons = [
  'Simpler setup than broad chatbot builders when the goal is comment to DM.',
  'Focused keyword, reply, link, follow-gate, audience, and analytics controls.',
  'Positioned for creators, brands, and agencies that want fast Instagram lead capture without extra routing complexity.',
];

const jsonLd = [
  organizationJsonLd(),
  websiteJsonLd(),
  softwareJsonLd(),
  productJsonLd(),
  faqJsonLd(),
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-violet-50/30 to-fuchsia-50/30">
      <HomeRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-3 px-4 py-3">
          <BrandLogo href="/" className="max-w-[54%]" />
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" className="px-3">
              <Link href="/auth?mode=login">Sign in</Link>
            </Button>
            <Button asChild className="bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-violet-500/30">
              <Link href="/auth?mode=signup">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="px-4 pb-20 pt-14 md:pb-24 md:pt-16">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-700">
            <Sparkles className="h-4 w-4" /> Built for creators, brands, and agencies
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-950 md:text-7xl">
            Instagram comment to DM automation for links, leads, and followers.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Komentra turns Instagram comments into public replies, smart DMs, link buttons, follow-gated delivery, and measurable audience growth.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 text-base shadow-xl shadow-violet-500/30">
              <Link href="/auth?mode=signup">
                Start free <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-8 text-base">
              <Link href="/auth?mode=login">I have an account</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Instagram Business and Creator accounts</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No credit card</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Setup in minutes</span>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <h2 className="mb-3 text-center text-3xl font-bold md:text-4xl">Everything your Instagram comment funnel needs</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          Build comment auto-reply and Instagram DM automation around the workflows people already use: comment a keyword, get the link, become a trackable lead.
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-0 shadow-md transition-shadow hover:shadow-xl">
              <CardContent className="p-6">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-md`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y bg-white/65 py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="mb-3 text-center text-3xl font-bold md:text-4xl">Use cases that rank because buyers search for them</h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
            Komentra is built for high-intent Instagram comments: people asking for a link, price, guide, booking slot, giveaway rule, or product detail.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {useCases.map((item) => (
              <div key={item.title} className="rounded-lg border bg-white p-4 shadow-sm">
                <item.icon className="mb-3 h-5 w-5 text-violet-600" />
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            <Layers className="h-4 w-4" /> ManyChat, LinkDM, and Chatfuel alternative
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">Focused Instagram automation without the heavyweight builder feel</h2>
          <p className="mt-4 text-muted-foreground">
            ManyChat, LinkDM, and Chatfuel have taught the market to search for comment-to-DM automation. Komentra keeps the core workflow direct: choose the post, add keywords, write replies, send the DM, and measure what happened.
          </p>
        </div>
        <Card className="border-0 bg-white/90 shadow-xl">
          <CardContent className="p-6">
            <div className="space-y-4">
              {comparisons.map((item) => (
                <div key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <p className="text-sm text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="bg-white/65 py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="mb-3 text-center text-3xl font-bold md:text-4xl">How it works</h2>
          <p className="mb-14 text-center text-muted-foreground">From signup to your first comment-to-DM automation in minutes.</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            {[
              { step: '01', title: 'Sign up', desc: 'Create an account with email verification.', icon: Bot },
              { step: '02', title: 'Connect Instagram', desc: 'Connect your Instagram Business or Creator account.', icon: Instagram },
              { step: '03', title: 'Build automation', desc: 'Pick a post, add keywords, write replies, and add DM links.', icon: Zap },
              { step: '04', title: 'Measure results', desc: 'Track triggers, top keywords, DMs, audience, and conversion flow.', icon: BarChart3 },
            ].map((step) => (
              <div key={step.step}>
                <div className="mb-2 text-5xl font-extrabold text-violet-200">{step.step}</div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-md">
                  <step.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-1 font-bold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto max-w-4xl px-4 py-20">
        <h2 className="mb-3 text-center text-3xl font-bold md:text-4xl">Instagram DM automation FAQ</h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground">
          Clear answers for Google, AI search engines, and people comparing Instagram comment automation tools.
        </p>
        <div className="space-y-3">
          {faqItems.map((item) => (
            <Card key={item.question} className="border-0 bg-white/90 shadow-sm">
              <CardContent className="p-5">
                <h3 className="font-semibold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto max-w-3xl px-4 py-20 pt-0 text-center">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-2xl">
          <CardContent className="p-8 md:p-12">
            <Hash className="mx-auto mb-4 h-12 w-12 opacity-80" />
            <h2 className="mb-3 text-3xl font-bold">Ready to convert comments into DMs?</h2>
            <p className="mx-auto mb-8 max-w-xl opacity-90">Sign up free, connect Instagram, and launch your first keyword automation.</p>
            <Button asChild size="lg" variant="secondary" className="px-8 text-base shadow-lg">
              <Link href="/auth?mode=signup">
                Get started free <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span>&copy; 2026 Komentra. Built for creators.</span>
          <Link href="/privacy" className="text-violet-600 hover:underline">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
