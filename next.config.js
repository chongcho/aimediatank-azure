/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Azure App Service
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
      {
        key: 'Cache-Control',
        value: 'public, max-age=0, must-revalidate',
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
        source: '/:path*',
        headers: securityHeaders,
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
