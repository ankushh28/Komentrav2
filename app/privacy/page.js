import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Mail, Database, Instagram, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';
import { buildMetadata, routeMetadata } from '@/lib/seo';

export const metadata = buildMetadata(routeMetadata.privacy);

const sections = [
  {
    icon: Database,
    title: 'Information We Collect',
    body: [
      'Account information such as your name, email address, password hash, and email verification status.',
      'Instagram account information you choose to connect, including username, account ID, account type, access token, token expiry, media selected for automation, comments, messages, webhook events, and automation activity.',
      'Automation settings such as keywords, public replies, direct message text, link buttons, follow-gating settings, and analytics generated from automation runs.',
      'Basic technical information such as request logs, error logs, IP address, browser details, and timestamps needed to operate and secure the service.',
    ],
  },
  {
    icon: Instagram,
    title: 'How We Use Instagram Data',
    body: [
      'Komentra uses Instagram data only to provide the features you request, including connecting your Instagram Business or Creator account, showing eligible posts, monitoring selected comments, sending configured replies, sending configured DMs, and showing automation analytics.',
      'We do not sell Instagram data. We do not use Instagram data for unrelated advertising, profiling, or resale.',
      'We only request permissions needed for comment automation, messaging automation, account connection, webhook delivery, and related analytics.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'How We Protect Data',
    body: [
      'We use HTTPS for data transmitted between your browser and Komentra.',
      'Passwords are stored as hashes, not plain text.',
      'Access to production systems and databases is limited to authorized operators.',
      'Instagram access tokens are used only to perform actions you configure inside Komentra.',
    ],
  },
  {
    icon: Mail,
    title: 'Email And Service Messages',
    body: [
      'We use your email address for account verification, login support, security messages, and service-related updates.',
      'We do not sell your email address or share it with advertisers.',
    ],
  },
  {
    icon: Trash2,
    title: 'Data Deletion',
    body: [
      'You can disconnect an Instagram account inside the Komentra dashboard. Disconnecting removes the linked account record and related automations from active use.',
      'You can request full account deletion by emailing privacy@komentra.tech from the email address used for your Komentra account.',
      'After receiving a valid deletion request, we will delete or anonymize your account data, connected Instagram account data, automations, and related analytics unless we are required to keep limited records for legal, security, or fraud-prevention reasons.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-violet-50/30 to-fuchsia-50/30">
      <nav className="border-b bg-white/70 backdrop-blur-md sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <BrandLogo href="/" className="max-w-[58%]" />
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Home
            </Link>
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-14 max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium mb-5">
            <ShieldCheck className="w-4 h-4" />
            Privacy and data use
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-950">
            Komentra Privacy Policy
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            This policy explains what we collect, why we collect it, and how you can request deletion of your data.
          </p>
          <p className="text-sm text-muted-foreground mt-3">Last updated: May 15, 2026</p>
        </div>

        <Card className="border-0 shadow-xl bg-white/85 backdrop-blur-sm mb-6">
          <CardContent className="p-6 md:p-8 space-y-4 text-sm md:text-base text-slate-700 leading-7">
            <p>
              Komentra is an Instagram comment and DM automation service operated for users who connect their own Instagram Business or Creator accounts. By using Komentra, you agree to the collection and use of information described in this Privacy Policy.
            </p>
            <p>
              If you do not agree with this policy, please do not use Komentra or connect your Instagram account.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {sections.map((section) => (
            <Card key={section.title} className="border-0 shadow-md bg-white/90">
              <CardContent className="p-6 md:p-7">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-violet-500/20 flex-shrink-0">
                    <section.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold mb-3">{section.title}</h2>
                    <ul className="space-y-2 text-sm md:text-base text-muted-foreground leading-7">
                      {section.body.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white mt-8">
          <CardContent className="p-7 md:p-8">
            <h2 className="text-2xl font-bold mb-3">Contact Us</h2>
            <p className="opacity-90 leading-7">
              For privacy questions, data access requests, or deletion requests, contact us at{' '}
              <a href="mailto:privacy@komentra.tech" className="font-semibold underline underline-offset-4">
                privacy@komentra.tech
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
