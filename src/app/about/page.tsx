'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AboutTrans } from '@/components/AboutTrans'

const CURRENT_YEAR = new Date().getFullYear()

const techStack = [
  {
    name: 'Next.js 14',
    category: 'Framework',
    description: 'Server-side rendering, App Router, API routes, and React Server Components deliver sub-second page loads and seamless client-side navigation.',
    color: 'from-white to-gray-400',
  },
  {
    name: 'React 18',
    category: 'UI Library',
    description: 'Concurrent rendering, Suspense boundaries, and streaming SSR power a fluid, interactive experience across every screen.',
    color: 'from-cyan-400 to-blue-500',
  },
  {
    name: 'TypeScript',
    category: 'Language',
    description: 'End-to-end type safety from database schema to UI components catches errors at compile time and accelerates team velocity.',
    color: 'from-blue-400 to-blue-600',
  },
  {
    name: 'PostgreSQL + Prisma',
    category: 'Database',
    description: 'Azure Flexible Server PostgreSQL paired with Prisma ORM provides type-safe queries, automatic migrations, and production-grade reliability.',
    color: 'from-indigo-400 to-purple-500',
  },
  {
    name: 'Tailwind CSS',
    category: 'Styling',
    description: 'Utility-first CSS with a custom design system ensures pixel-perfect, responsive layouts that stay consistent across devices.',
    color: 'from-teal-400 to-cyan-500',
  },
  {
    name: 'NextAuth.js',
    category: 'Authentication',
    description: 'Multi-provider authentication supporting credentials, Microsoft Entra ID, Google, Facebook, and Apple — with session management and email verification.',
    color: 'from-green-400 to-emerald-500',
  },
]

const azureServices = [
  {
    name: 'Azure App Service',
    role: 'Web Hosting',
    detail: 'Runs the Next.js standalone build on a scalable B2 plan with automatic SSL, custom domain support, and deployment slots for zero-downtime releases.',
  },
  {
    name: 'Azure Blob Storage',
    role: 'Media Assets',
    detail: 'Stores all uploaded videos, images, and music files with SAS-token secured access, thumbnail generation, and multi-resolution delivery.',
  },
  {
    name: 'Azure PostgreSQL Flexible Server',
    role: 'Primary Database',
    detail: 'Handles all structured data — user profiles, media metadata, transactions, messages, and admin settings — with automated backups and high availability.',
  },
  {
    name: 'Azure Functions',
    role: 'Background Processing',
    detail: 'Executes scheduled jobs, video transcoding pipelines, content cleanup, and policy-based automation without blocking the main application.',
  },
  {
    name: 'Azure Communication Services',
    role: 'Email & SMS',
    detail: 'Sends transactional emails (verification, notifications, receipts) and SMS messages through Azure\'s managed communication infrastructure.',
  },
]

const features = [
  { icon: '🎬', title: 'Video Publishing', desc: 'Upload, transcode, and stream AI-generated or real-world video content with multi-resolution support and adaptive playback.' },
  { icon: '🖼️', title: 'Image Gallery', desc: 'Showcase AI artwork and photography in a curated gallery with high-resolution previews, zoom, and metadata display.' },
  { icon: '🎵', title: 'Music Hosting', desc: 'Share AI-composed tracks and real recordings with built-in audio players, waveform visualization, and download options.' },
  { icon: '💰', title: 'Creator Marketplace', desc: 'Set your own prices and sell directly to collectors. Stripe handles secure checkout, payouts, and subscription billing.' },
  { icon: '💬', title: 'Real-Time Messaging', desc: 'Connect with fellow creators through instant chat, media messaging, and threaded conversations — all within the platform.' },
  { icon: '🎴', title: 'Celebration Cards', desc: 'Create and send personalized digital celebration cards powered by AI — birthdays, holidays, achievements, and more.' },
  { icon: '⭐', title: 'Ratings & Reviews', desc: 'Build credibility through community ratings. Honest metrics keep discovery fair and help quality content surface.' },
  { icon: '#️⃣', title: 'Smart Discovery', desc: 'Hashtags, categories, and intelligent filtering help audiences find exactly the content they are looking for.' },
  { icon: '👤', title: 'Creator Profiles', desc: 'Customizable portfolio pages with bio, social links, media showcase, and transaction history — your professional presence.' },
  { icon: '🔔', title: 'Live Notifications', desc: 'Stay updated on sales, comments, follows, and platform activity with real-time push and in-app notifications.' },
  { icon: '🔖', title: 'Save & Bookmark', desc: 'Curate your favorite content into personal collections for quick access and future reference.' },
  { icon: '📱', title: 'Progressive Web App', desc: 'Install AI Media Tank (AiM) on any device. Offline-capable, home screen icon, push notifications — native app experience.' },
  { icon: '🔐', title: 'Enterprise Security', desc: 'Azure-backed cloud storage, encrypted transfers, SAS-token authentication, and role-based access control protect every asset.' },
  { icon: '🎞️', title: 'Video Processing', desc: 'Automated multi-resolution transcoding via Azure Functions ensures smooth playback across bandwidth conditions.' },
  { icon: '🎮', title: 'Interactive Games', desc: 'Built-in retro games — Pac-Man, Tetris, and more — give the community a fun, social break between creating.' },
  { icon: '🛡️', title: 'Admin Controls', desc: 'Full admin panel with badge management, navbar customization, content moderation, and platform configuration.' },
]

const plans = [
  { name: 'Viewer', price: 'Free', period: 'Forever', features: ['Browse all content', 'Purchase media', '5 free uploads', 'Basic profile', 'Community access'], popular: false },
  { name: 'Basic', price: '$2', period: '/month', features: ['Everything in Viewer', '5 free uploads/month', '$1 per additional upload', 'Sell your content', 'Creator badge'], popular: false },
  { name: 'Advanced', price: '$5', period: '/month', features: ['Everything in Basic', '5 free uploads/month', '$0.50 per additional upload', 'Priority support', 'Analytics dashboard'], popular: true },
  { name: 'Premium', price: '$8', period: '/month', features: ['Everything in Advanced', 'Unlimited free uploads', 'Featured placement', 'Premium creator badge', 'Early access to features'], popular: false },
]

export default function AboutPage() {
  const [expandedArch, setExpandedArch] = useState(false)

  return (
    <div className="min-h-screen bg-tank-dark text-white pb-[500px]">

      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-tank-accent/10 via-transparent to-purple-600/10" />
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <span className="inline-block px-5 py-2 bg-tank-accent/10 border border-tank-accent/30 rounded-full text-tank-accent text-sm font-semibold mb-8 tracking-wide">
            <AboutTrans text="Where AI Creativity Meets Professional Community" />
          </span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-6 leading-tight">
            <span className="text-gradient">
              <AboutTrans text="AI Media Tank (AiM)" />
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-6 leading-relaxed">
            <AboutTrans text="The premier platform for artists, producers, technologists, and creators to publish, discover, and monetize AI-generated and real-world media — video, images, and music — in one unified, professional ecosystem." />
          </p>
          <p className="text-base text-gray-500 max-w-2xl mx-auto mb-12">
            <AboutTrans text="Built by creators, for creators. Powered entirely by Microsoft Azure cloud infrastructure, engineered with Cursor AI-assisted development, and designed for the professionals shaping the future of media." />
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="px-8 py-4 bg-tank-accent text-tank-black font-bold rounded-xl hover:bg-tank-accent/90 hover:shadow-lg hover:shadow-tank-accent/20 transition-all"
            >
              <AboutTrans text="Explore the Platform" />
            </Link>
            <Link
              href="/register"
              className="px-8 py-4 border-2 border-tank-accent text-tank-accent font-bold rounded-xl hover:bg-tank-accent hover:text-tank-black transition-all"
            >
              <AboutTrans text="Create Your Account" />
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-10 md:gap-16 mt-20">
            {[
              { value: '3', label: 'Media Types', sub: 'Video · Image · Music' },
              { value: '∞', label: 'Creative Possibilities', sub: 'AI + Real World' },
              { value: '$0', label: 'To Start Creating', sub: 'Free tier included' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl md:text-5xl font-extrabold text-tank-accent">{stat.value}</div>
                <div className="text-gray-300 font-medium mt-1">
                  <AboutTrans text={stat.label} />
                </div>
                <div className="text-gray-600 text-xs mt-0.5">
                  <AboutTrans text={stat.sub} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          OUR STORY — NARRATIVE
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-4xl mx-auto">
          <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
            <AboutTrans text="Our Story" />
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-8">
            <AboutTrans text="Why We Built AI Media Tank (AiM)" />
          </h2>

          <div className="space-y-6 text-gray-300 leading-relaxed text-base md:text-lg">
            <p>
              <AboutTrans text="The generative AI revolution is transforming how media is created. Every day, millions of artists, filmmakers, musicians, and technologists use tools like Midjourney, Runway, DALL-E, Suno, and Stable Diffusion to produce stunning visuals, cinematic video, and original music. Yet these creators have nowhere purpose-built to call home." />
            </p>
            <p>
              <AboutTrans text="Traditional platforms were designed for a different era. They scatter AI-generated content across generic feeds, offer limited monetization pathways, and make it difficult for professionals to build a credible portfolio. The result is that exceptional work gets lost in the noise, and creators are left without the tools they need to grow." />
            </p>
            <p>
              <AboutTrans text="AI Media Tank (AiM) was founded to change that. We set out to build a dedicated, professional-grade platform that treats AI-generated media with the same respect and infrastructure as any creative discipline — while also welcoming real-world content creators who want to stand alongside the AI frontier. The result is a unified marketplace and community where every creator, from emerging artists to seasoned producers and forward-thinking technologists, can publish, showcase, and sell their work with confidence." />
            </p>
            <p>
              <AboutTrans text="Whether you are a visual artist exploring generative aesthetics, a music producer experimenting with AI composition, a filmmaker blending AI with live-action footage, or a futurist documenting the evolution of creative technology — AI Media Tank (AiM) is the professional space where your work belongs." />
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          WHO IT'S FOR — PROFESSIONAL AUDIENCE FOCUS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Built For Professionals" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Who Thrives on AI Media Tank (AiM)" />
            </h2>
            <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
              <AboutTrans text="We designed every feature with working professionals in mind — the people who push creative boundaries and need a platform that keeps pace with their ambition." />
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '🎨',
                title: 'AI Artists & Illustrators',
                desc: 'Publish AI-generated artwork, document your prompts and tools, build a portfolio that galleries, agencies, and collectors take seriously.',
              },
              {
                icon: '🎬',
                title: 'Filmmakers & Video Producers',
                desc: 'Upload AI-generated or hybrid video content with multi-resolution transcoding. Showcase reels, behind-the-scenes, and experimental films.',
              },
              {
                icon: '🎵',
                title: 'Musicians & Audio Producers',
                desc: 'Share AI-composed tracks, ambient soundscapes, and experimental audio. Built-in players and waveform visualization present your work professionally.',
              },
              {
                icon: '🔬',
                title: 'Technologists & Researchers',
                desc: 'Document AI tool comparisons, model outputs, and technical experiments. Contribute to a knowledge base that advances the entire community.',
              },
              {
                icon: '🚀',
                title: 'Futurists & Thought Leaders',
                desc: 'Share forward-looking content that explores where AI creativity is heading. Engage with an audience that values innovation and vision.',
              },
              {
                icon: '📸',
                title: 'Real-World Creators',
                desc: 'Photographers, videographers, and content producers — showcase traditional craft alongside AI work in a unified discovery experience.',
              },
            ].map((persona, i) => (
              <div key={i} className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-tank-accent/40 transition-all group">
                <div className="w-14 h-14 bg-tank-accent/10 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:bg-tank-accent/20 transition-colors">
                  {persona.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">
                  <AboutTrans text={persona.title} />
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  <AboutTrans text={persona.desc} />
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 bg-gradient-to-r from-tank-accent/5 to-purple-500/5 border border-tank-light rounded-2xl p-6 md:p-8">
            <h3 className="text-lg font-bold mb-3 text-white">
              <AboutTrans text="For General Audiences Too" />
            </h3>
            <p className="text-gray-400 leading-relaxed">
              <AboutTrans text="You do not need to be a professional to enjoy AI Media Tank (AiM). Enthusiasts, collectors, and curious minds are equally welcome. Browse and discover stunning AI-generated content, purchase unique media, and connect with the creators behind the work. The free Viewer tier gives you full access to explore the platform with zero commitment." />
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          PLATFORM FEATURES — DETAILED
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Platform Capabilities" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Everything You Need to Create, Share & Earn" />
            </h2>
            <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
              <AboutTrans text="A comprehensive feature set designed for professionals who demand reliability, flexibility, and polish in every interaction." />
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <div key={i} className="bg-tank-dark border border-tank-light rounded-xl p-5 hover:border-tank-accent/40 hover:shadow-lg hover:shadow-tank-accent/5 transition-all group">
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h4 className="font-bold text-sm mb-1.5">
                  <AboutTrans text={feature.title} />
                </h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  <AboutTrans text={feature.desc} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          HOW IT WORKS — CREATOR WORKFLOW
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Creator Workflow" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="How AI Media Tank (AiM) Works" />
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Create an Account', desc: 'Join free with email or social login (Google, Microsoft, Facebook, Apple). Set up your creator profile in minutes.' },
              { step: '02', title: 'Upload Your Media', desc: 'Use the streamlined upload form to publish videos, images, or music. Tag AI tools, real devices, and set pricing.' },
              { step: '03', title: 'Get Discovered', desc: 'Your content appears in the feed with professional badges, hashtags, and metadata. The community rates, comments, and shares.' },
              { step: '04', title: 'Earn & Grow', desc: 'Sell your work directly through Stripe-powered checkout. Build your reputation, grow your audience, and scale your creative business.' },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-6xl font-extrabold text-tank-accent/10 mb-2">{item.step}</div>
                <h3 className="text-lg font-bold mb-2">
                  <AboutTrans text={item.title} />
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  <AboutTrans text={item.desc} />
                </p>
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 -right-3 text-tank-light text-2xl">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          MARKETPLACE & MONETIZATION
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
                <AboutTrans text="Monetization" />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                <AboutTrans text="Built-In Marketplace, Powered by Stripe" />
              </h2>
              <p className="text-gray-300 leading-relaxed mb-6">
                <AboutTrans text="AI Media Tank (AiM) is not just a gallery — it is a fully integrated marketplace. Every creator can set prices on their uploads and sell directly to collectors and buyers. There is no need for external payment tools, third-party storefronts, or complicated integrations." />
              </p>
              <div className="space-y-4">
                {[
                  { label: 'Secure Checkout', desc: 'Stripe-powered payment processing with PCI-compliant security for every transaction.' },
                  { label: 'Flexible Pricing', desc: 'Set your own price per upload, offer free content, or use subscription-based access.' },
                  { label: 'Purchase Management', desc: 'Buyers access downloads from their profile. Sold badges and status updates display automatically.' },
                  { label: 'Subscription Billing', desc: 'Membership plans (Basic, Advanced, Premium) are billed through Stripe with portal management.' },
                  { label: 'Batch Checkout', desc: 'Collect multiple items and purchase in a single Stripe session — smooth for buyers, efficient for creators.' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-tank-accent mt-0.5 flex-shrink-0">✓</span>
                    <div>
                      <span className="text-white font-semibold text-sm">
                        <AboutTrans text={item.label} />
                      </span>
                      <p className="text-gray-500 text-xs mt-0.5">
                        <AboutTrans text={item.desc} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-tank-dark border border-tank-light rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center text-lg">💳</div>
                <div>
                  <div className="font-bold text-sm">
                    <AboutTrans text="Stripe Integration" />
                  </div>
                  <div className="text-gray-500 text-xs">
                    <AboutTrans text="Industry-leading payment infrastructure" />
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  'Checkout Sessions',
                  'Subscription Management',
                  'Webhook Event Processing',
                  'Customer Portal',
                  'Upload Payment Flow',
                  'Batch Checkout Sessions',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-tank-gray rounded-lg border border-tank-light">
                    <span className="w-2 h-2 bg-tank-accent rounded-full flex-shrink-0" />
                    <AboutTrans text={item} className="text-gray-300" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TECHNOLOGY & ARCHITECTURE — DEEP DIVE
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Under the Hood" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Enterprise-Grade Technology Stack" />
            </h2>
            <p className="text-gray-400 mt-3 max-w-3xl mx-auto">
              <AboutTrans text="AI Media Tank (AiM) is built on a modern, scalable architecture designed for production reliability. Every technology choice prioritizes performance, security, and developer experience." />
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
            {techStack.map((tech, i) => (
              <div key={i} className="bg-tank-gray border border-tank-light rounded-xl p-6 hover:border-tank-accent/40 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gradient-to-r ${tech.color} text-tank-black`}>
                    <AboutTrans text={tech.category} />
                  </span>
                </div>
                <h4 className="font-bold text-lg mb-2">
                  <AboutTrans text={tech.name} />
                </h4>
                <p className="text-gray-400 text-sm leading-relaxed">
                  <AboutTrans text={tech.description} />
                </p>
              </div>
            ))}
          </div>

          {/* Cursor AI Highlight */}
          <div className="bg-gradient-to-br from-purple-500/10 via-tank-dark to-tank-accent/10 border border-purple-500/30 rounded-2xl p-8 md:p-10 mb-16">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                ⚡
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-3">
                  <AboutTrans text="Developed with Cursor AI" />
                </h3>
                <p className="text-gray-300 leading-relaxed mb-4">
                  <AboutTrans text="AI Media Tank (AiM) is proudly built using Cursor, the AI-powered code editor that represents the next generation of software development. Cursor's AI-assisted coding capabilities have been instrumental in accelerating development velocity, maintaining code quality, and enabling rapid iteration across the entire codebase." />
                </p>
                <p className="text-gray-300 leading-relaxed mb-4">
                  <AboutTrans text="From designing complex database schemas and API routes to building responsive UI components and optimizing Azure integrations, Cursor AI has served as a collaborative development partner — suggesting improvements, catching bugs early, and helping implement best practices across TypeScript, React, Next.js, and Prisma." />
                </p>
                <p className="text-gray-400 text-sm leading-relaxed">
                  <AboutTrans text="This is what modern AI-assisted software engineering looks like: human creativity and architectural vision amplified by AI precision and speed. Every feature on this platform has been shaped by that partnership." />
                </p>
              </div>
            </div>
          </div>

          {/* System Architecture Diagram */}
          <div className="mb-6">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold">
                <AboutTrans text="System Architecture" />
              </h3>
              <p className="text-gray-400 mt-2 max-w-2xl mx-auto text-sm">
                <AboutTrans text="A production-grade architecture where every request flows through Azure infrastructure — from browser to backend to storage and external services." />
              </p>
            </div>
          </div>

          <div className="bg-tank-dark border border-tank-light rounded-2xl p-6 md:p-8 overflow-x-auto">
            <div className="flex flex-col gap-5 min-w-[340px]">
              {/* Layer 1: Client */}
              <div className="flex justify-center">
                <div className="px-8 py-4 rounded-xl bg-cyan-500/15 border-2 border-cyan-400/40 text-center">
                  <div className="text-sm text-cyan-300 font-bold">
                    <AboutTrans text="Client Layer" />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    <AboutTrans text="Browser · PWA · Mobile" />
                  </div>
                </div>
              </div>
              <div className="flex justify-center"><div className="w-0.5 h-5 bg-tank-light rounded-full" /></div>

              {/* Layer 2: Application */}
              <div className="flex justify-center">
                <div className="px-8 py-5 rounded-xl bg-tank-accent/15 border-2 border-tank-accent text-center max-w-lg w-full">
                  <div className="text-tank-accent font-bold text-lg">
                    <AboutTrans text="Next.js 14 Application" />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    <AboutTrans text="Azure App Service · Standalone Build · SSL" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 mt-3 text-xs">
                    <span className="px-2.5 py-1 bg-tank-gray rounded-md border border-tank-light">
                      <AboutTrans text="App Router" />
                    </span>
                    <span className="px-2.5 py-1 bg-tank-gray rounded-md border border-tank-light">
                      <AboutTrans text="API Routes" />
                    </span>
                    <span className="px-2.5 py-1 bg-tank-gray rounded-md border border-tank-light">
                      <AboutTrans text="NextAuth" />
                    </span>
                    <span className="px-2.5 py-1 bg-tank-gray rounded-md border border-tank-light">
                      <AboutTrans text="React SSR" />
                    </span>
                    <span className="px-2.5 py-1 bg-tank-gray rounded-md border border-tank-light">
                      <AboutTrans text="Prisma ORM" />
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center"><div className="w-0.5 h-5 bg-tank-light rounded-full" /></div>

              {/* Layer 3: Azure Services */}
              <div>
                <div className="text-center text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                  <AboutTrans text="Azure Infrastructure" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { icon: '🗄️', name: 'PostgreSQL', sub: 'Flexible Server', sub2: 'Prisma ORM' },
                    { icon: '☁️', name: 'Blob Storage', sub: 'Media Assets', sub2: 'SAS Tokens' },
                    { icon: '⏱️', name: 'Functions', sub: 'Background Jobs', sub2: 'Video Processing' },
                    { icon: '📧', name: 'Communication', sub: 'Email & SMS', sub2: 'Transactional' },
                    { icon: '🔐', name: 'Entra ID', sub: 'OAuth Providers', sub2: 'Social Login' },
                  ].map((svc, i) => (
                    <div key={i} className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                      <div className="text-lg mb-1">{svc.icon}</div>
                      <div className="text-xs font-bold text-white">
                        <AboutTrans text={svc.name} />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        <AboutTrans text={svc.sub} />
                      </div>
                      <div className="text-[10px] text-gray-600">
                        <AboutTrans text={svc.sub2} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center"><div className="w-0.5 h-5 bg-tank-light rounded-full" /></div>

              {/* Layer 4: External Services */}
              <div>
                <div className="text-center text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                  <AboutTrans text="External Services & DevOps" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: '💳', name: 'Stripe', sub: 'Payments · Subscriptions · Webhooks' },
                    { icon: '🔄', name: 'GitHub Actions', sub: 'CI/CD · Staging · Production' },
                    { icon: '📢', name: 'Google AdSense', sub: 'Monetization · Ad Display' },
                    { icon: '🤖', name: 'Cursor AI', sub: 'AI-Assisted Development' },
                  ].map((svc, i) => (
                    <div key={i} className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                      <div className="text-lg mb-1">{svc.icon}</div>
                      <div className="text-xs font-bold text-white">
                        <AboutTrans text={svc.name} />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        <AboutTrans text={svc.sub} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Expand for Architecture Details */}
          <div className="mt-6">
            <button
              onClick={() => setExpandedArch(!expandedArch)}
              className="text-tank-accent text-sm font-semibold hover:underline flex items-center gap-2"
            >
              {expandedArch ? '▾ ' : '▸ '}
              <AboutTrans text={expandedArch ? 'Hide Architecture Details' : 'Show Architecture Details'} />
            </button>
            {expandedArch && (
              <div className="mt-4 bg-tank-gray border border-tank-light rounded-xl p-6 space-y-4 text-sm text-gray-400 leading-relaxed">
                <p>
                  <AboutTrans text="Request Flow: Users interact with the platform through a modern browser or installed PWA. All requests are served by a Next.js 14 application running in standalone mode on Azure App Service. The App Router handles both server-rendered pages and API routes, while NextAuth manages authentication sessions." />
                </p>
                <p>
                  <AboutTrans text="Data Layer: Prisma ORM communicates with Azure PostgreSQL Flexible Server for all structured data — users, media metadata, transactions, messages, and admin configuration. Media files (video, images, music) are stored in Azure Blob Storage with SAS-token secured access for uploads and downloads." />
                </p>
                <p>
                  <AboutTrans text="Background Processing: Azure Functions handle asynchronous workloads including video transcoding, scheduled cleanup, and policy-based automation. These functions operate independently from the main application, ensuring heavy processing never impacts user-facing performance." />
                </p>
                <p>
                  <AboutTrans text="DevOps Pipeline: GitHub Actions automates the entire deployment lifecycle. Code pushed to the main branch triggers production deployment to Azure App Service, while feature branches deploy to a staging environment for validation before merge." />
                </p>
                <p>
                  <AboutTrans text="Payments: Stripe handles all financial transactions through dedicated API routes for checkout sessions, subscription management, webhook processing, and customer portal access. This separation ensures PCI compliance and secure payment handling." />
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FULLY POWERED BY AZURE
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Cloud Infrastructure" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Fully Powered by Microsoft Azure" />
            </h2>
            <p className="text-gray-400 mt-3 max-w-3xl mx-auto">
              <AboutTrans text="Every aspect of AI Media Tank (AiM) runs on Azure cloud infrastructure — from web hosting and database management to media storage, background processing, and communications. This is not a multi-cloud patchwork; it is a deliberate, end-to-end Azure architecture built for reliability and scale." />
            </p>
          </div>

          <div className="space-y-4">
            {azureServices.map((service, i) => (
              <div key={i} className="bg-tank-dark border border-tank-light rounded-xl p-5 md:p-6 hover:border-blue-500/30 transition-all">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-center gap-3 md:w-72 flex-shrink-0">
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full flex-shrink-0" />
                    <div>
                      <div className="font-bold text-sm text-white">
                        <AboutTrans text={service.name} />
                      </div>
                      <div className="text-xs text-blue-400">
                        <AboutTrans text={service.role} />
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    <AboutTrans text={service.detail} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          GITHUB DEVOPS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
                <AboutTrans text="DevOps" />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                <AboutTrans text="GitHub-Powered Development Pipeline" />
              </h2>
              <p className="text-gray-300 leading-relaxed mb-6">
                <AboutTrans text="AI Media Tank (AiM) follows modern DevOps practices with GitHub at the center of the development workflow. Source control, code review, automated testing, and continuous deployment are all managed through GitHub — ensuring every change is tracked, reviewed, and deployed with confidence." />
              </p>
              <div className="space-y-4">
                {[
                  { label: 'Continuous Deployment', desc: 'Pushes to main automatically deploy to Azure App Service production environment.' },
                  { label: 'Staging Environment', desc: 'Feature branches deploy to a staging slot for validation before merging to production.' },
                  { label: 'Branch Sync', desc: 'Automated workflows keep development and release branches synchronized.' },
                  { label: 'Version Control', desc: 'Full commit history, pull request reviews, and issue tracking for complete project traceability.' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-tank-accent mt-0.5 flex-shrink-0">✓</span>
                    <div>
                      <span className="text-white font-semibold text-sm">
                        <AboutTrans text={item.label} />
                      </span>
                      <p className="text-gray-500 text-xs mt-0.5">
                        <AboutTrans text={item.desc} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6">
              <div className="text-xs text-gray-500 font-mono mb-4 uppercase tracking-wider">
                <AboutTrans text="Deployment Pipeline" />
              </div>
              <div className="space-y-3">
                {[
                  { step: 'git push', env: 'Developer', color: 'bg-gray-500' },
                  { step: 'GitHub Actions', env: 'CI/CD', color: 'bg-purple-500' },
                  { step: 'Build & Test', env: 'Automation', color: 'bg-blue-500' },
                  { step: 'Deploy to Staging', env: 'Validation', color: 'bg-yellow-500' },
                  { step: 'Deploy to Production', env: 'Azure App Service', color: 'bg-tank-accent' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                    <div className="flex-1 px-3 py-2 bg-tank-dark rounded-lg border border-tank-light">
                      <span className="text-white text-xs font-semibold font-mono">
                        <AboutTrans text={item.step} />
                      </span>
                      <span className="text-gray-600 text-[10px] ml-2">
                        <AboutTrans text={item.env} />
                      </span>
                    </div>
                    {i < 4 && <div className="text-gray-600 text-xs hidden md:block">↓</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TRUST & TRANSPARENCY
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Integrity" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Trust & Transparency" />
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '🏷️',
                title: 'AI & Real Badges',
                desc: 'Every piece of media is clearly labeled as AI-generated or real-world content based on creator-provided metadata. Audiences always know what they are viewing — no ambiguity, no deception.',
              },
              {
                icon: '📊',
                title: 'Honest Metrics',
                desc: 'View counts, community ratings, and engagement metrics are displayed transparently. Discovery is driven by authentic interaction, not manipulation or hidden algorithms.',
              },
              {
                icon: '⚙️',
                title: 'Configurable Controls',
                desc: 'Platform administrators can toggle badge visibility, navbar items, and UI elements without redeploying code. This gives operators fine-grained control over the user experience.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-tank-dark border border-tank-light rounded-2xl p-6 hover:border-tank-accent/30 transition-all">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-bold mb-2">
                  <AboutTrans text={item.title} />
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  <AboutTrans text={item.desc} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          MARKET OPPORTUNITY
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
                <AboutTrans text="Market Context" />
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                <AboutTrans text="The AI Content Revolution" />
              </h2>
              <p className="text-gray-300 leading-relaxed mb-6">
                <AboutTrans text="The generative AI market is one of the fastest-growing sectors in technology. As AI tools become more accessible and powerful, millions of creators are producing content daily — and they need a dedicated platform to share and monetize their work. AI Media Tank (AiM) is positioned at the intersection of this massive opportunity." />
              </p>
              <ul className="space-y-3">
                {[
                  '100M+ users of AI image generation tools worldwide',
                  'AI video tools reaching mainstream adoption across industries',
                  'Music AI reshaping production, licensing, and distribution',
                  'Growing institutional demand for AI art marketplaces and licensing platforms',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-300">
                    <span className="text-tank-accent mt-1 flex-shrink-0">✦</span>
                    <AboutTrans text={item} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: '$110B', label: 'Generative AI Market by 2030' },
                { value: '40%', label: 'Compound Annual Growth Rate' },
                { value: '15M+', label: 'AI Images Created Daily' },
                { value: 'First', label: 'Dedicated AI Media Marketplace' },
              ].map((stat, i) => (
                <div key={i} className="bg-tank-gray border border-tank-light rounded-xl p-6 text-center hover:border-purple-500/30 transition-all">
                  <div className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-gray-500 text-xs mt-2">
                    <AboutTrans text={stat.label} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          PRICING
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">
              <AboutTrans text="Membership Plans" />
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              <AboutTrans text="Transparent, Flexible Pricing" />
            </h2>
            <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
              <AboutTrans text="Start for free and scale as you grow. Every plan includes access to the full community, marketplace, and discovery features." />
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {plans.map((plan, i) => (
              <div key={i} className={`relative bg-tank-dark border rounded-2xl p-6 text-center transition-all hover:shadow-lg ${
                plan.popular 
                  ? 'border-tank-accent hover:shadow-tank-accent/10' 
                  : 'border-tank-light hover:border-tank-accent/40'
              }`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-tank-accent text-tank-black text-xs font-bold rounded-full whitespace-nowrap">
                    <AboutTrans text="Most Popular" />
                  </span>
                )}
                <h3 className="text-xl font-bold mb-1">
                  <AboutTrans text={plan.name} />
                </h3>
                <div className="text-3xl font-extrabold text-tank-accent mb-0.5">
                  <AboutTrans text={plan.price} />
                </div>
                <div className="text-gray-500 text-sm mb-5">
                  <AboutTrans text={plan.period} />
                </div>
                <ul className="text-left space-y-2 mb-6">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="text-gray-400 text-sm flex items-start gap-2">
                      <span className="text-tank-accent mt-0.5 flex-shrink-0">✓</span>
                      <AboutTrans text={feature} />
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`block w-full py-2.5 rounded-lg font-semibold transition-all text-sm ${
                    plan.popular
                      ? 'bg-tank-accent text-tank-black hover:bg-tank-accent/90'
                      : 'bg-tank-light text-white hover:bg-tank-accent hover:text-tank-black'
                  }`}
                >
                  <AboutTrans text="Get Started" />
                </Link>
              </div>
            ))}
          </div>

          <article
            className="mt-16 pt-16 border-t border-tank-light w-full text-left space-y-5 text-gray-300 leading-relaxed"
            aria-labelledby="about-press-release-title"
          >
            <header className="mb-10 space-y-2 text-left">
              <p className="text-tank-accent text-xs font-semibold tracking-widest uppercase">
                <AboutTrans text="Press release" />
              </p>
              <h2
                id="about-press-release-title"
                className="text-2xl md:text-3xl font-bold text-white leading-tight"
              >
                <AboutTrans text="AiMediaTank.com — Born with AI, Living in the Cloud" />
              </h2>
            </header>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="About AiMediaTank.com" />
              </h3>
              <p>
                <AboutTrans text="We are excited to introduce AiMediaTank.com, a platform designed for AI content creators and digital enthusiasts." />
              </p>
              <p>
                <AboutTrans text="AiMediaTank.com is also a closed-loop social media platform where members can share their thoughts through Open Chat, communicate privately through Private Chat, and create celebration cards to share with family and friends." />
              </p>
              <p>
                <AboutTrans text="Members can distribute AiMediaTank.com free media and their own content across major social platforms including LinkedIn, TikTok, X, Facebook, WhatsApp, and Reddit, allowing them to amplify their ideas beyond the platform." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="Born with AI" />
              </h3>
              <p>
                <AboutTrans text="What makes AiMediaTank.com unique is that it was not built by humans alone." />
              </p>
              <p>
                <AboutTrans text="The platform was created through a human–AI collaboration. The human team acted primarily as project coordinators, while Cursor AI played a major role in generating and implementing the software." />
              </p>
              <p>
                <AboutTrans text="Our human team members have deep experience in platform architecture and system design, but they are not traditional software programmers. Meanwhile, Cursor AI had no prior knowledge about the AiMediaTank project but possessed powerful code-generation capabilities." />
              </p>
              <p>
                <AboutTrans text="This combination revealed something powerful: humans provide vision, direction, and problem-solving, while AI provides the ability to rapidly generate and implement code." />
              </p>
              <p>
                <AboutTrans text="Together, the partnership made it possible to build a complex platform that would have otherwise required a large development team." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="Living in the Cloud" />
              </h3>
              <p>
                <AboutTrans text="To ensure scalability and operational simplicity, AiMediaTank.com was designed to run entirely in the cloud using Microsoft Azure." />
              </p>
              <p>
                <AboutTrans text="During development, we used a broad range of Azure services including virtual machines, storage, databases, networking, functions, app services, and communication services." />
              </p>
              <p>
                <AboutTrans text="AI-generated code proved highly effective across the entire stack — from front-end interfaces to back-end systems and system integrations." />
              </p>
              <p>
                <AboutTrans text="However, some of the most difficult parts of the project involved integrating third-party services such as:" />
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-300">
                <li>
                  <AboutTrans text="Stripe for payment processing" />
                </li>
                <li>
                  <AboutTrans text="Wix for domain and website services" />
                </li>
                <li>
                  <AboutTrans text="GitHub for DevOps and version control" />
                </li>
              </ul>
              <p>
                <AboutTrans text="Debugging integration issues sometimes required significant effort, but tools such as Azure log streams, embedded test code generated by AI, and agent-based code reviews helped identify root causes and resolve problems." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="The Reality of Working with AI" />
              </h3>
              <p>
                <AboutTrans text="Working with AI is powerful, but it is not always smooth." />
              </p>
              <p>
                <AboutTrans text="During the development of AiMediaTank.com, AI software engineering agents sometimes produced incorrect actions, became stuck mid-process, or generated inconsistent results. These challenges required human coordination, troubleshooting, and iteration." />
              </p>
              <p>
                <AboutTrans text="Despite these difficulties, the overall experience demonstrated that AI coding tools have extraordinary potential to accelerate software development." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="AI Is a Partner, Not a Competitor" />
              </h3>
              <p>
                <AboutTrans text="This project reinforced an important lesson:" />
              </p>
              <p>
                <AboutTrans text="AI should not be viewed as a competitor but as a powerful collaborator." />
              </p>
              <p>
                <AboutTrans text="AI tools amplify human creativity and productivity, allowing people with strong ideas to build systems that previously required large engineering teams." />
              </p>
              <p>
                <AboutTrans text="Whether people resist or embrace AI, its capabilities are expanding rapidly and its role in society will continue to grow." />
              </p>
              <p>
                <AboutTrans text="In many ways, this moment resembles the early days of personal computers. Decades later, it is clear that those who embraced computers benefited the most, while those who resisted them struggled to adapt." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="How to Work Successfully with AI" />
              </h3>
              <p>
                <AboutTrans text="To collaborate effectively with AI, it helps to think of it as a contract engineer, coworker, consultant, or partner." />
              </p>
              <p>
                <AboutTrans text="AI executes instructions quickly and works continuously, but the quality of its output depends heavily on the clarity of human instructions." />
              </p>
              <p>
                <AboutTrans text="If the human vision is clear, AI can execute effectively. If the instructions are unclear, the results will also be unclear." />
              </p>
              <p>
                <AboutTrans text="In many cases, humans and AI must work together iteratively to refine both the requirements and the implementation." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="The Importance of a Strong Project Coordinator" />
              </h3>
              <p>
                <AboutTrans text="Successful AI collaboration requires at least one strong project coordinator who understands the project end-to-end." />
              </p>
              <p>
                <AboutTrans text="This person must be able to make quick decisions during development, including difficult ones — such as discarding large amounts of work and reverting to an earlier version of the system when a development path reaches a dead end." />
              </p>
              <p>
                <AboutTrans text="Clear leadership and decisive problem-solving are essential when coordinating both human contributors and AI development tools." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="Patience Is Part of AI Collaboration" />
              </h3>
              <p>
                <AboutTrans text="Working with AI also requires patience." />
              </p>
              <p>
                <AboutTrans text="At times, the process can feel similar to working with a human engineer who misunderstands instructions or produces unexpected results. The difference is that AI has no emotions, yet the interaction can still feel surprisingly human." />
              </p>
              <p>
                <AboutTrans text="Maintaining patience and persistence is critical for successful AI collaboration." />
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="A New Era for Builders" />
              </h3>
              <p>
                <AboutTrans text="Building AiMediaTank.com demonstrated that AI collaboration can dramatically change how software is created." />
              </p>
              <p>
                <AboutTrans text="People with strong ideas can now work directly with AI tools to turn those ideas into real platforms and products. What once required large teams of developers can increasingly be accomplished by much smaller teams — or even individuals." />
              </p>
              <p>
                <AboutTrans text="This represents the beginning of a new era for builders, creators, and entrepreneurs." />
              </p>
            </div>

            <div className="pt-2">
              <h3 className="text-lg font-bold text-white mb-3">
                <AboutTrans text="Closing" />
              </h3>
              <p>
                <AboutTrans text="We hope that sharing our experience building AiMediaTank.com will help others understand the potential of human-AI collaboration." />
              </p>
              <p>
                <AboutTrans text="You can explore the platform and see the results of this collaboration by visiting AiMediaTank.com." />
              </p>
              <p>
                <AboutTrans text="We believe you will enjoy the experience." />
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          QUICK LINKS & RESOURCES
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-xl font-bold mb-8">
            <AboutTrans text="Explore the Platform" />
          </h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <h4 className="text-tank-accent text-xs font-semibold uppercase tracking-widest mb-3">
                <AboutTrans text="Discover" />
              </h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/" className="hover:text-white transition-colors">
                    <AboutTrans text="Home" />
                  </Link>
                </li>
                <li>
                  <Link href="/?type=VIDEO" className="hover:text-white transition-colors">
                    <AboutTrans text="Videos" />
                  </Link>
                </li>
                <li>
                  <Link href="/?type=IMAGE" className="hover:text-white transition-colors">
                    <AboutTrans text="Images" />
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-white transition-colors">
                    <AboutTrans text="Membership Plans" />
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-tank-accent text-xs font-semibold uppercase tracking-widest mb-3">
                <AboutTrans text="Community" />
              </h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/notifications" className="hover:text-white transition-colors">
                    <AboutTrans text="Notifications" />
                  </Link>
                </li>
                <li>
                  <Link href="/?openChat=1" className="hover:text-white transition-colors">
                    <AboutTrans text="Chat" />
                  </Link>
                </li>
                <li>
                  <Link href="/ecard" className="hover:text-white transition-colors">
                    <AboutTrans text="Celebration Cards" />
                  </Link>
                </li>
                <li>
                  <Link href="/game" className="hover:text-white transition-colors">
                    <AboutTrans text="Games" />
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-tank-accent text-xs font-semibold uppercase tracking-widest mb-3">
                <AboutTrans text="Account" />
              </h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/login" className="hover:text-white transition-colors">
                    <AboutTrans text="Log in" />
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-white transition-colors">
                    <AboutTrans text="Create Account" />
                  </Link>
                </li>
                <li>
                  <Link href="/upload" className="hover:text-white transition-colors">
                    <AboutTrans text="Upload Media" />
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-tank-accent text-xs font-semibold uppercase tracking-widest mb-3">
                <AboutTrans text="Legal & Support" />
              </h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/policy" className="hover:text-white transition-colors">
                    <AboutTrans text="Policy" />
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    <AboutTrans text="Terms of Service" />
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    <AboutTrans text="Privacy Policy" />
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="hover:text-white transition-colors">
                    <AboutTrans text="Support" />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CTA
      ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 bg-gradient-to-br from-tank-accent/15 via-tank-dark to-purple-600/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6">
            <AboutTrans text="Ready to Shape the Future of Media?" />
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            <AboutTrans text="Whether you are an AI artist, a filmmaker exploring generative tools, a music producer pushing sonic boundaries, or a technologist building the future — AI Media Tank (AiM) is the professional platform where your work gets the audience it deserves." />
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Link
              href="/register"
              className="px-8 py-4 bg-tank-accent text-tank-black font-bold rounded-xl hover:bg-tank-accent/90 hover:shadow-lg hover:shadow-tank-accent/20 transition-all"
            >
              <AboutTrans text="Get Started Free" />
            </Link>
            <a
              href="mailto:hello@aimediatank.com"
              className="px-8 py-4 border-2 border-tank-accent text-tank-accent font-bold rounded-xl hover:bg-tank-accent hover:text-tank-black transition-all"
            >
              <AboutTrans text="Contact Us" />
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-8">
            {[
              { icon: '🌐', label: 'Website', value: 'aimediatank.com' },
              { icon: '📧', label: 'Email', value: 'hello@aimediatank.com' },
              { icon: '📍', label: 'Headquarters', value: 'United States' },
            ].map((contact, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-tank-accent/10 rounded-full flex items-center justify-center text-xl">
                  {contact.icon}
                </div>
                <div className="text-left">
                  <div className="text-gray-500 text-xs">
                    <AboutTrans text={contact.label} />
                  </div>
                  <div className="font-medium text-sm">{contact.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════ */}
      <footer className="py-8 px-4 border-t border-tank-light">
        <div className="max-w-6xl mx-auto text-center text-gray-500 text-sm">
          <p>
            <AboutTrans text={`© ${CURRENT_YEAR} AI Media Tank (AiM). All rights reserved.`} />
          </p>
          <p className="mt-2">
            <AboutTrans text="Built with Cursor AI · Powered by Microsoft Azure · Payments by Stripe" />
          </p>
        </div>
      </footer>
    </div>
  )
}
