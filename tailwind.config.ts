import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        tank: {
          black: '#0a0a0b',
          dark: '#111113',
          gray: '#1a1a1f',
          light: '#2a2a32',
          accent: '#00ff88',
          secondary: '#7c3aed',
          glow: '#00ff8840',
        },
      },
      animation: {
        'spin': 'spin 1s linear infinite',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
