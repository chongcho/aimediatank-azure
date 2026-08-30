const { execSync } = require('child_process')
const { version } = require('./package.json')

/** Short git SHA — same identifier in local dev, staging, and production builds. */
function resolveBuildId() {
  const fromEnv =
    process.env.NEXT_PUBLIC_BUILD_ID || process.env.BUILD_ID || process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Azure App Service
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_ID: resolveBuildId(),
  },
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static', 'ffprobe-static', 'dejavu-fonts-ttf'],
    outputFileTracingIncludes: {
      '/api/download/[mediaId]': [
        './node_modules/ffmpeg-static/**',
        './node_modules/ffprobe-static/**',
        './node_modules/dejavu-fonts-ttf/ttf/**',
        './public/fonts/**',
      ],
    },
    staleTimes: {
      dynamic: 300,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
    ],
    unoptimized: true,
  },
  // Security and performance headers
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        // camera/microphone=(self) allow getUserMedia on this origin (avatar photo, TalkChat voice calls).
        value: 'camera=(self), microphone=(self), geolocation=()',
      },
    ]
    // HSTS: enforce HTTPS for 1 year (production only; Azure serves HTTPS)
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      })
    }
    return [
      {
        // OG card-image — security only; Cache-Control is set by the route handler.
        source: '/media/:mediaId/card-image',
        headers: [...securityHeaders],
      },
      {
        // Exclude card-image — that route sets its own Cache-Control (see rule above).
        source: '/((?!media/[^/]+/card-image$).*)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        // Cache static assets longer
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache images
        source: '/:path*.(jpg|jpeg|png|gif|webp|svg|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ]
  },
  // Remove x-powered-by header
  poweredByHeader: false,
}

module.exports = nextConfig
