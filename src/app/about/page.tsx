'use client'

import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-tank-dark text-white pb-[500px]">
      {/* Hero Section */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-tank-accent/10 via-transparent to-cyan-500/10" />
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <span className="inline-block px-4 py-2 bg-tank-accent/10 border border-tank-accent/30 rounded-full text-tank-accent text-sm font-medium mb-6">
            🚀 The Future of AI Content Sharing
          </span>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="text-gradient">AI Media Tank</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            The premiere community platform for AI creators to share, discover, and monetize 
            AI-generated videos, images, and music.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="px-8 py-4 bg-tank-accent text-tank-black font-bold rounded-xl hover:bg-tank-accent/90 transition-all"
            >
              Explore Content
            </Link>
            <Link
              href="/register"
              className="px-8 py-4 border-2 border-tank-accent text-tank-accent font-bold rounded-xl hover:bg-tank-accent hover:text-tank-black transition-all"
            >
              Join Community
            </Link>
          </div>
          
          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-12 mt-16">
            <div className="text-center">
              <div className="text-4xl font-bold text-tank-accent">3</div>
              <div className="text-gray-400">Media Types</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-tank-accent">∞</div>
              <div className="text-gray-400">Creative Possibilities</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-tank-accent">$0</div>
              <div className="text-gray-400">To Start</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">The Challenge</span>
            <h2 className="text-4xl font-bold mt-2">AI Creators Need a Home</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-red-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center text-2xl mb-4">
                🚫
              </div>
              <h3 className="text-xl font-bold mb-2">No Dedicated Platform</h3>
              <p className="text-gray-400">
                AI-generated content is scattered across generic platforms that don't understand or support AI creators' unique needs.
              </p>
            </div>
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-orange-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-xl flex items-center justify-center text-2xl mb-4">
                💸
              </div>
              <h3 className="text-xl font-bold mb-2">Monetization Barriers</h3>
              <p className="text-gray-400">
                AI artists struggle to monetize their creations. Traditional platforms don't offer easy ways to sell AI-generated work.
              </p>
            </div>
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-yellow-500/50 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-yellow-500 to-amber-500 rounded-xl flex items-center justify-center text-2xl mb-4">
                🔍
              </div>
              <h3 className="text-xl font-bold mb-2">Hard to Discover</h3>
              <p className="text-gray-400">
                Amazing AI content gets lost in the noise. Creators can't easily find their audience or connect with fellow enthusiasts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Our Solution</span>
            <h2 className="text-4xl font-bold mt-2">Built for AI Creators, by AI Enthusiasts</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2 bg-gradient-to-br from-tank-accent/10 to-cyan-500/5 border border-tank-accent/30 rounded-2xl p-8">
              <div className="w-16 h-16 bg-tank-accent rounded-xl flex items-center justify-center text-3xl mb-4">
                🎨
              </div>
              <h3 className="text-2xl font-bold mb-3">All-in-One AI Media Hub</h3>
              <p className="text-gray-400 text-lg">
                Upload, share, and showcase your AI-generated videos, images, and music in one beautiful platform designed specifically for AI content. Our community celebrates and appreciates the art of AI creation.
              </p>
            </div>
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-tank-accent/50 transition-all">
              <div className="w-14 h-14 bg-tank-accent rounded-xl flex items-center justify-center text-2xl mb-4">
                💰
              </div>
              <h3 className="text-xl font-bold mb-2">Built-in Marketplace</h3>
              <p className="text-gray-400">
                Set your own prices and sell your AI creations directly to collectors. Secure payments powered by Stripe with instant payouts.
              </p>
            </div>
            <div className="bg-tank-gray border border-tank-light rounded-2xl p-6 hover:border-tank-accent/50 transition-all">
              <div className="w-14 h-14 bg-tank-accent rounded-xl flex items-center justify-center text-2xl mb-4">
                👥
              </div>
              <h3 className="text-xl font-bold mb-2">Vibrant Community</h3>
              <p className="text-gray-400">
                Connect with fellow AI creators through chat, comments, and ratings. Share prompts, techniques, and inspiration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Platform Features</span>
            <h2 className="text-4xl font-bold mt-2">Everything You Need to Create & Sell</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: '🎬', title: 'Video Support', desc: 'Upload AI-generated videos' },
              { emoji: '🖼️', title: 'Image Gallery', desc: 'Showcase your AI artwork' },
              { emoji: '🎵', title: 'Music Hosting', desc: 'Share AI-composed music' },
              { emoji: '🔐', title: 'Secure Uploads', desc: 'Azure cloud storage' },
              { emoji: '🎞️', title: 'Video Processing', desc: 'Multi-resolution transcoding' },
              { emoji: '💳', title: 'Stripe Payments', desc: 'Secure transactions' },
              { emoji: '💬', title: 'Real-time Chat', desc: 'Connect with creators' },
              { emoji: '⭐', title: 'Ratings & Reviews', desc: 'Build your reputation' },
              { emoji: '#️⃣', title: 'Hashtag Discovery', desc: 'Find content easily' },
              { emoji: '👤', title: 'Creator Profiles', desc: 'Customizable portfolio' },
              { emoji: '🔔', title: 'Notifications', desc: 'Stay updated' },
              { emoji: '🔖', title: 'Save & Bookmark', desc: 'Curate favorites' },
              { emoji: '📱', title: 'PWA Support', desc: 'Install as app' },
            ].map((feature, i) => (
              <div key={i} className="bg-tank-gray border border-tank-light rounded-xl p-4 text-center hover:border-tank-accent/50 hover:scale-105 transition-all">
                <div className="text-3xl mb-2">{feature.emoji}</div>
                <h4 className="font-bold text-sm">{feature.title}</h4>
                <p className="text-gray-500 text-xs mt-1">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Simple Pricing</span>
            <h2 className="text-4xl font-bold mt-2">Choose Your Creator Plan</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { name: 'Viewer', price: 'Free', period: 'Forever', features: ['Browse all content', 'Purchase media', '5 free uploads', 'Basic profile'], popular: false },
              { name: 'Basic', price: '$2', period: 'per month', features: ['Everything in Viewer', '5 free uploads', '$1 per additional upload', 'Sell your content'], popular: false },
              { name: 'Advanced', price: '$5', period: 'per month', features: ['Everything in Basic', '5 free uploads', '$0.50 per additional upload', 'Priority support'], popular: true },
              { name: 'Premium', price: '$8', period: 'per month', features: ['Everything in Advanced', 'Unlimited free uploads', 'Featured placement', 'Creator badge'], popular: false },
            ].map((plan, i) => (
              <div key={i} className={`relative bg-tank-gray border rounded-2xl p-6 text-center ${plan.popular ? 'border-tank-accent' : 'border-tank-light'} hover:border-tank-accent transition-all`}>
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-tank-accent text-tank-black text-xs font-bold rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <div className="text-3xl font-bold text-tank-accent mb-1">{plan.price}</div>
                <div className="text-gray-500 text-sm mb-4">{plan.period}</div>
                <ul className="text-left space-y-2 mb-6">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="text-gray-400 text-sm flex items-center gap-2">
                      <span className="text-tank-accent">✓</span> {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`block w-full py-2 rounded-lg font-semibold transition-all ${
                    plan.popular 
                      ? 'bg-tank-accent text-tank-black hover:bg-tank-accent/90' 
                      : 'bg-tank-light text-white hover:bg-tank-accent hover:text-tank-black'
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Market Opportunity */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Market Opportunity</span>
              <h2 className="text-4xl font-bold mt-2 mb-6">The AI Content Revolution</h2>
              <p className="text-gray-400 text-lg mb-6">
                The generative AI market is exploding. As AI tools become more accessible, 
                millions of creators are generating content daily. They need a dedicated 
                platform to share and monetize their work.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-lg">
                  <span className="text-tank-accent">✅</span> 100M+ users of AI image generators
                </li>
                <li className="flex items-center gap-3 text-lg">
                  <span className="text-tank-accent">✅</span> AI video tools going mainstream
                </li>
                <li className="flex items-center gap-3 text-lg">
                  <span className="text-tank-accent">✅</span> Music AI disrupting the industry
                </li>
                <li className="flex items-center gap-3 text-lg">
                  <span className="text-tank-accent">✅</span> Growing demand for AI art marketplace
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-tank-gray border border-tank-light rounded-xl p-6 text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">$110B</div>
                <div className="text-gray-500 text-sm mt-1">Gen AI Market by 2030</div>
              </div>
              <div className="bg-tank-gray border border-tank-light rounded-xl p-6 text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">40%</div>
                <div className="text-gray-500 text-sm mt-1">Annual Growth Rate</div>
              </div>
              <div className="bg-tank-gray border border-tank-light rounded-xl p-6 text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">15M+</div>
                <div className="text-gray-500 text-sm mt-1">AI Images Daily</div>
              </div>
              <div className="bg-tank-gray border border-tank-light rounded-xl p-6 text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">First</div>
                <div className="text-gray-500 text-sm mt-1">Mover Advantage</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Built to Scale</span>
            <h2 className="text-4xl font-bold mt-2">Enterprise-Grade Technology</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: '⚡', title: 'Next.js 14', desc: 'Modern React framework with App Router for blazing fast performance' },
              { emoji: '🗄️', title: 'PostgreSQL + Prisma', desc: 'Robust database with type-safe ORM for reliable data management' },
              { emoji: '☁️', title: 'Azure Cloud', desc: 'Microsoft Azure for hosting, storage, and CDN with global reach' },
              { emoji: '💳', title: 'Stripe', desc: 'Industry-leading payment processing for subscriptions and purchases' },
              { emoji: '🔒', title: 'NextAuth.js', desc: 'Secure authentication with email verification and session management' },
              { emoji: '🎨', title: 'Tailwind CSS', desc: 'Modern, responsive design system for beautiful UI across all devices' },
            ].map((tech, i) => (
              <div key={i} className="bg-tank-gray border border-tank-light rounded-xl p-6 hover:border-tank-accent/50 transition-all">
                <div className="text-3xl mb-3">{tech.emoji}</div>
                <h4 className="font-bold text-lg mb-2">{tech.title}</h4>
                <p className="text-gray-400 text-sm">{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="py-20 px-4 bg-tank-gray/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-tank-accent text-sm font-semibold tracking-widest uppercase">Development & Deployment</span>
            <h2 className="text-4xl font-bold mt-2">Architecture Overview</h2>
            <p className="text-gray-400 mt-2 max-w-2xl mx-auto">
              How the platform is built and deployed: from your browser to Azure and external services.
            </p>
          </div>
          <div className="bg-tank-dark border border-tank-light rounded-2xl p-6 md:p-8 overflow-x-auto">
            {/* Diagram: flow from client to backend to services */}
            <div className="flex flex-col gap-6 min-w-[320px]">
              {/* Row 1: Client */}
              <div className="flex justify-center">
                <div className="px-6 py-3 rounded-xl bg-cyan-500/20 border-2 border-cyan-400/50 text-center">
                  <div className="text-sm text-cyan-300 font-semibold">Users</div>
                  <div className="text-xs text-gray-400 mt-0.5">Browser / PWA</div>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="w-0.5 h-4 bg-tank-light rounded-full" aria-hidden />
              </div>
              {/* Row 2: Next.js App (Azure App Service) */}
              <div className="flex justify-center">
                <div className="px-6 py-4 rounded-xl bg-tank-accent/20 border-2 border-tank-accent text-center max-w-md">
                  <div className="text-tank-accent font-bold">Next.js 14 App</div>
                  <div className="text-xs text-gray-400 mt-1">Azure App Service (B2)</div>
                  <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs">
                    <span className="px-2 py-0.5 bg-tank-gray rounded">App Router</span>
                    <span className="px-2 py-0.5 bg-tank-gray rounded">API Routes</span>
                    <span className="px-2 py-0.5 bg-tank-gray rounded">NextAuth</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="w-0.5 h-4 bg-tank-light rounded-full" aria-hidden />
              </div>
              {/* Row 3: Backend services (horizontal) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                  <div className="text-lg mb-1">🗄️</div>
                  <div className="text-sm font-semibold text-white">PostgreSQL</div>
                  <div className="text-xs text-gray-500">Azure Flexible</div>
                  <div className="text-xs text-gray-500 mt-0.5">Prisma ORM</div>
                </div>
                <div className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                  <div className="text-lg mb-1">☁️</div>
                  <div className="text-sm font-semibold text-white">Blob Storage</div>
                  <div className="text-xs text-gray-500">Azure Storage</div>
                  <div className="text-xs text-gray-500 mt-0.5">Media & thumbnails</div>
                </div>
                <div className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                  <div className="text-lg mb-1">💳</div>
                  <div className="text-sm font-semibold text-white">Stripe</div>
                  <div className="text-xs text-gray-500">Payments & webhooks</div>
                </div>
                <div className="rounded-xl bg-tank-gray border border-tank-light p-3 text-center">
                  <div className="text-lg mb-1">⏱️</div>
                  <div className="text-sm font-semibold text-white">Azure Functions</div>
                  <div className="text-xs text-gray-500">Cron / video processing</div>
                </div>
              </div>
              {/* Row 4: CI/CD */}
              <div className="flex justify-center pt-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tank-gray border border-tank-light">
                  <span className="text-lg">🔄</span>
                  <span className="text-sm font-medium text-gray-300">GitHub Actions</span>
                  <span className="text-xs text-gray-500">→ Deploy to staging & production</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Home of AI Generated and Real Media — relocated from homepage */}
      <section className="py-20 px-4 border-t border-tank-light">
        <div className="max-w-6xl mx-auto w-full">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            The Home of AI Generated and Real Media
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            AiMediaTank is a professional community platform for AI media creators and real world content producers. It brings AI generated and real media together under one unified marketplace and social experience, enabling creators to publish, showcase, and monetize their work while offering audiences a trusted way to discover and support content they love.
          </p>
          <p className="text-gray-300 leading-relaxed mb-6">
            Whether you are building with the latest AI tools or capturing real world moments with your favorite device, AiMediaTank gives you a polished, production ready workflow and a community designed for creators and enthusiasts alike.
          </p>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Why AiMediaTank</h3>
          <ol className="list-decimal list-inside text-gray-300 space-y-4 mb-6">
            <li>
              <span className="font-semibold text-white">A Unified Creator Platform</span>
              <div className="mt-1">
                Most platforms treat AI and real media as separate worlds. AiMediaTank embraces both. You can tag AI generated content, document real world devices, and showcase media in a single, clean ecosystem that celebrates innovation and authenticity together.
              </div>
            </li>
            <li>
              <span className="font-semibold text-white">Built In Monetization</span>
              <div className="mt-1">
                AiMediaTank enables creators to publish media with a price or offer content for free. Paid uploads and purchase flows are built in, making it easy to monetize without external tools. Buyers can access and download their purchases from their profile while the media remains hosted, and the platform handles display logic such as sold status and badges.
              </div>
            </li>
            <li>
              <span className="font-semibold text-white">Trust and Transparency</span>
              <div className="mt-1">
                Media tiles clearly show AI and Real badges based on creator provided fields. Community metrics like views and reactions keep discovery honest and engaging. Admin controls allow platform owners to tune the visibility of key badges and UI elements without redeploying code.
              </div>
            </li>
          </ol>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Core Experience</h3>
          <div className="text-gray-300 space-y-4 mb-6">
            <div>
              <span className="font-semibold text-white">Upload and Publish</span>
              <p className="mt-1">
                Creators can upload media with a streamlined, modern form designed for clarity and speed. Titles, descriptions, AI tools used, and real device information are captured in a structured way, helping audiences understand the origins of each creation.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Edit and Manage</span>
              <p className="mt-1">
                Editing media is simple and professional. Update titles, descriptions, AI tool data, real device information, and pricing from a clean editing interface. The experience is optimized for creators who need to adjust metadata without friction.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Media Showcase</span>
              <p className="mt-1">
                Media tiles highlight key details with elegant badges, including AI and Real markers, price or sold status, view counts, post date, and community reactions. These badges are configurable via the Admin Panel for maximum flexibility.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Messaging and Community</span>
              <p className="mt-1">
                Built in chat and media messaging make community engagement direct and immediate. Creators and fans can communicate within the platform, growing relationships around shared content interests.
              </p>
            </div>
          </div>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Built for Azure</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
            <li>Azure App Service for scalable web hosting</li>
            <li>Azure Blob Storage for media assets</li>
            <li>PostgreSQL Flexible Server for structured media metadata</li>
            <li>Azure Functions for scheduled jobs and policy based cleanup</li>
            <li>GitHub Actions for staging first deployments</li>
          </ul>
          <p className="text-gray-300 leading-relaxed mb-6">
            This architecture ensures production reliability, secure storage, and high performance across the full media pipeline.
          </p>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Who It&apos;s For</h3>
          <div className="text-gray-300 space-y-4 mb-6">
            <div>
              <span className="font-semibold text-white">AI Creators</span>
              <p className="mt-1">
                Publish AI videos and images, document the tools used, and build a credible portfolio inside a creator first community.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Real World Creators</span>
              <p className="mt-1">
                Showcase camera based or real world content and stand alongside AI generated work in a unified discovery experience.
              </p>
            </div>
            <div>
              <span className="font-semibold text-white">Communities and Brands</span>
              <p className="mt-1">
                Use AiMediaTank as a trusted hub for AI and real media, with configurable controls, badge management, and professional presentation.
              </p>
            </div>
          </div>

          <hr className="border-tank-light my-6" />

          <h3 className="text-xl font-semibold text-white mb-3">Experience the Platform</h3>
          <p className="text-gray-300 leading-relaxed mb-2">
            AiMediaTank is the bridge between AI creativity and real world storytelling. It is designed to scale with creators, support monetization, and build a trustworthy media ecosystem that is clear, professional, and future ready.
          </p>
          <p className="text-gray-300 leading-relaxed mb-8">
            If you want a modern platform that respects both AI innovation and real creation, AiMediaTank is built for you.
          </p>

          <h3 className="text-lg font-semibold text-white mb-3">Quick links</h3>
          <ul className="space-y-1 text-sm text-gray-300">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li><Link href="/?type=VIDEO" className="hover:text-white">Videos</Link></li>
            <li><Link href="/?type=IMAGE" className="hover:text-white">Images</Link></li>
            <li><Link href="/notifications" className="hover:text-white">Notification</Link></li>
            <li><Link href="/?openChat=1" className="hover:text-white">Chat</Link></li>
            <li><Link href="/login" className="hover:text-white">Sign-In</Link></li>
            <li><Link href="/register" className="hover:text-white">Sign-Up</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Membership</Link></li>
            <li><Link href="/policy" className="hover:text-white">Policy</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
            <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
            <li><Link href="/support" className="hover:text-white">Support</Link></li>
          </ul>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-tank-accent/20 via-tank-dark to-cyan-500/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to <span className="text-gradient">Join the Future?</span>
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Whether you're an AI creator looking to share your work, or an enthusiast 
            wanting to discover amazing AI content, AI Media Tank is your home.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              href="/register"
              className="px-8 py-4 bg-tank-accent text-tank-black font-bold rounded-xl hover:bg-tank-accent/90 transition-all"
            >
              Get Started Free
            </Link>
            <a
              href="mailto:hello@aimediatank.com"
              className="px-8 py-4 border-2 border-tank-accent text-tank-accent font-bold rounded-xl hover:bg-tank-accent hover:text-tank-black transition-all"
            >
              Contact Us
            </a>
          </div>
          
          {/* Contact Info */}
          <div className="flex flex-wrap justify-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-tank-accent/10 rounded-full flex items-center justify-center text-xl">
                🌐
              </div>
              <div className="text-left">
                <div className="text-gray-500 text-xs">Website</div>
                <div className="font-medium">aimediatank.com</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-tank-accent/10 rounded-full flex items-center justify-center text-xl">
                📧
              </div>
              <div className="text-left">
                <div className="text-gray-500 text-xs">Email</div>
                <div className="font-medium">hello@aimediatank.com</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-tank-accent/10 rounded-full flex items-center justify-center text-xl">
                📍
              </div>
              <div className="text-left">
                <div className="text-gray-500 text-xs">Headquarters</div>
                <div className="font-medium">United States</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-tank-light">
        <div className="max-w-6xl mx-auto text-center text-gray-500">
          <p>© 2025 AI Media Tank. All rights reserved.</p>
          <p className="mt-2">
            Built with <span className="text-tank-accent">❤️</span> for AI Creators
          </p>
        </div>
      </footer>
    </div>
  )
}

