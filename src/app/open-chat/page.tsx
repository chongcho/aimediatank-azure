import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteUrl } from '@/lib/siteUrl'

export const metadata: Metadata = {
  title: 'Open Chat (TalkChat) | AI Media Tank (AiM)',
  description:
    'Open Chat is the public TalkChat room on AI Media Tank: join the community conversation alongside AI and real creators.',
  alternates: {
    canonical: `${getSiteUrl()}/open-chat`,
  },
  openGraph: {
    title: 'Open Chat (TalkChat) | AI Media Tank (AiM)',
    description:
      'Join the public Open Chat room on AI Media Tank — TalkChat for creators and enthusiasts.',
    url: `${getSiteUrl()}/open-chat`,
    siteName: 'AI Media Tank, LLC (AiM)',
    type: 'website',
  },
}

export default function OpenChatPage() {
  return (
    <div className="min-h-[60vh] max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Open Chat (TalkChat)</h1>
      <p className="text-gray-400 mb-6">
        Open Chat is the public chat room in the app. Use the button below to go to the home page with TalkChat open
        (log in may be required to participate).
      </p>
      <Link
        href="/?openChat=1"
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-tank-accent text-tank-black font-semibold hover:opacity-90 transition-opacity"
      >
        Open TalkChat
      </Link>
      <p className="text-gray-500 text-sm mt-8">
        Tip: bookmark <span className="font-mono text-gray-400">/open-chat</span> for this page, or{' '}
        <span className="font-mono text-gray-400">/?openChat=1</span> to land on the feed with chat opening automatically.
      </p>
    </div>
  )
}
