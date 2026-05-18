export const siteConfig = {
  name: 'Komentra',
  url: 'https://komentra.tech',
  title: 'Instagram Comment to DM Automation | Komentra',
  description:
    'Komentra turns Instagram comments into auto-replies, smart DMs, link buttons, follow-gated delivery, audience tracking, and analytics for creators, brands, and agencies.',
  ogImage: '/og-image.png',
  logo: '/logo-mark-256.png',
  keywords: [
    'Instagram comment automation',
    'Instagram comment to DM',
    'Instagram auto reply comments',
    'Instagram DM automation',
    'send link in DM from Instagram comment',
    'keyword trigger Instagram DM',
    'comment reply automation',
    'Instagram lead capture automation',
    'ManyChat alternative',
    'LinkDM alternative',
    'Chatfuel alternative',
  ],
};

export const routeMetadata = {
  home: {
    title: siteConfig.title,
    description: siteConfig.description,
    path: '/',
  },
  privacy: {
    title: 'Privacy Policy | Komentra',
    description:
      'Read how Komentra collects, uses, protects, and deletes account, Instagram, automation, and analytics data.',
    path: '/privacy',
  },
};

export const noIndexMetadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export function buildNoIndexMetadata(title, path) {
  return buildMetadata({
    title,
    description: `${siteConfig.name} account area. Sign in to manage Instagram comment automation, DMs, audience, and analytics.`,
    path,
    noIndex: true,
  });
}

export function absoluteUrl(path = '/') {
  if (path.startsWith('http')) return path;
  return `${siteConfig.url}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildMetadata({ title, description, path = '/', noIndex = false }) {
  const url = absoluteUrl(path);
  const image = absoluteUrl(siteConfig.ogImage);

  return {
    title: {
      absolute: title,
    },
    description,
    keywords: siteConfig.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      siteName: siteConfig.name,
      title,
      description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} Instagram comment automation`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    ...(noIndex ? noIndexMetadata : {}),
  };
}

export const faqItems = [
  {
    question: 'What does Komentra automate on Instagram?',
    answer:
      'Komentra watches selected Instagram posts for matching comment keywords, posts a public reply, and sends a configured DM with text and link buttons.',
  },
  {
    question: 'Can I send a link when someone comments a keyword?',
    answer:
      'Yes. You can create keyword triggers such as price, link, guide, or deal, then send a DM with up to three buttons that point to your offer, booking page, product, or lead magnet.',
  },
  {
    question: 'Does Komentra support follow-gated DMs?',
    answer:
      'Yes. Komentra can ask people to follow first and verify the follow before sending the main DM, which helps creators and brands turn comment demand into audience growth.',
  },
  {
    question: 'How is Komentra different from ManyChat, LinkDM, or Chatfuel?',
    answer:
      'Komentra focuses on a simple Instagram comment-to-DM workflow with multi-keyword triggers, reply variants, follow-gated delivery, audience tracking, and analytics without forcing every user into a broad chatbot builder.',
  },
  {
    question: 'Do I need a credit card to start?',
    answer:
      'No. The current Komentra onboarding lets you start free, connect an Instagram Business or Creator account, and create your first automation.',
  },
];

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl(siteConfig.logo),
    description: siteConfig.description,
    email: 'privacy@komentra.tech',
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: 'en',
  };
}

export function softwareJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteConfig.url,
    image: absoluteUrl(siteConfig.ogImage),
    description: siteConfig.description,
    offers: {
      '@type': 'Offer',
      url: siteConfig.url,
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}

export function productJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: siteConfig.name,
    brand: {
      '@type': 'Brand',
      name: siteConfig.name,
    },
    image: absoluteUrl(siteConfig.logo),
    description: siteConfig.description,
    offers: {
      '@type': 'Offer',
      url: siteConfig.url,
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
