/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Azure App Service
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
}

module.exports = nextConfig
