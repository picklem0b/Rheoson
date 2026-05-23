import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        base:    '#0A0A0A',
        surface: '#111111',
        elevated:'#1A1A1A',
        overlay: '#222222',
        border:  '#2A2A2A',

        // Red accent spectrum
        red: {
          50:  '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E5193A',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
        },

        // Text
        primary:   '#FFFFFF',
        secondary: '#A3A3A3',
        muted:     '#525252',
      },

      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },

      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      boxShadow: {
        'glow-red': '0 0 20px rgba(229, 25, 58, 0.4)',
        'glow-sm':  '0 0 10px rgba(229, 25, 58, 0.25)',
        'glass':    '0 8px 32px rgba(0, 0, 0, 0.6)',
        'elevated': '0 4px 24px rgba(0, 0, 0, 0.8)',
      },

      backdropBlur: {
        xs: '4px',
      },

      animation: {
        'fade-in':     'fadeIn 0.2s ease-out',
        'slide-up':    'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-down':  'slideDown 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-left':  'slideLeft 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in':    'scaleIn 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-red':   'pulseRed 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':   'spin 3s linear infinite',
        'equalizer':   'equalizer 1.2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        slideLeft: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',     opacity: '1' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        pulseRed: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        equalizer: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%':      { transform: 'scaleY(1.0)' },
        },
      },

      transitionTimingFunction: {
        'ios': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      spacing: {
        'player': '5rem',        // 80px — PlayerBar height
        'nav':    '4rem',        // 64px — BottomNav height  
        'sidebar':'15rem',       // 240px — Sidebar width
      },
    },
  },
  plugins: [],
} satisfies Config