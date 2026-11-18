import type { Config } from 'tailwindcss'

/**
 * Color strategy: the semantic palette lives in index.css as CSS variables
 * so light/dark and accent themes swap at the variable layer. Tailwind's
 * `theme()`-backed entries here read those variables, which keeps
 * opacity modifiers working (`bg-brand/20`) and means a theme change
 * never requires touching this file.
 *
 * Hardcoded hexes are limited to values that are theme-independent by
 * design (the star badge used by the GitHub button).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — resolve to the semantic variables. In light mode
        // these flip automatically via [data-surface='light'].
        base: 'rgb(var(--bg-base-rgb, 8 8 9) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface-rgb, 17 17 19) / <alpha-value>)',
        elevated: 'rgb(var(--bg-elevated-rgb, 26 26 30) / <alpha-value>)',
        overlay: 'rgb(var(--bg-overlay-rgb, 38 38 42) / <alpha-value>)',
        border: 'rgb(var(--border-strong-rgb, 255 255 255) / 0.14)',

        // Legacy accent spectrum kept for classes that reference a step
        // rather than the active accent. Steps are recalibrated to the
        // same sub-80% saturation discipline as the theme accents.
        red: {
          50: '#FDF2F3',
          100: '#FBE5E7',
          200: '#F6CBD0',
          300: '#F0A6AD',
          400: '#E87984',
          500: '#DF4E5D',
          600: '#E4253B',
          700: '#B92739',
          800: '#93212F',
          900: '#731D26',
        },

        // Text
        primary: 'rgb(var(--text-primary-rgb, 250 250 251) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary-rgb, 152 152 158) / <alpha-value>)',
        muted: 'rgb(var(--text-muted-rgb, 88 88 94) / <alpha-value>)',

        // Semantic aliases — the shared UI kit (components/New-Components)
        // is authored against these names, so they resolve to the same
        // semantic variables rather than a second palette.
        foreground: 'rgb(var(--text-primary-rgb, 250 250 251) / <alpha-value>)',
        card: 'rgb(var(--bg-surface-rgb, 17 17 19) / <alpha-value>)',
        popover: 'rgb(var(--bg-elevated-rgb, 26 26 30) / <alpha-value>)',
        accent: 'rgb(var(--bg-elevated-rgb, 26 26 30) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--text-secondary-rgb, 152 152 158) / <alpha-value>)',

        // The active theme accent, with alpha support.
        //
        // Expressed as RGB channels rather than a hex because Tailwind
        // cannot split an arbitrary var() into channels —
        // `bg-[var(--accent)]/20` generates no rule at all, while
        // `bg-brand/20` works. See index.css for the accent layers.
        brand: 'rgb(var(--accent-rgb) / <alpha-value>)',

        // Accent used by the GitHub star button
        star: '#EAB308',
        'star-glow': '#FACC15',
      },

      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        display: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
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
        // Tinted, ultra-diffuse elevation — depth of field, not outlines.
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        'glow-red': 'var(--shadow-glow)',
        'glow-sm': '0 0 10px rgb(var(--accent-rgb) / 0.16)',
        glass: 'var(--shadow-lg)',
        elevated: 'var(--shadow-md)',
      },

      backdropBlur: {
        xs: '4px',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-left': 'slideLeft 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-red': 'pulseRed 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        equalizer: 'equalizer 1.2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseRed: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        equalizer: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1.0)' },
        },
      },

      transitionTimingFunction: {
        ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      spacing: {
        player: '5rem', // 80px — PlayerBar height
        nav: '4rem', // 64px — BottomNav height
        sidebar: '15rem', // 240px — Sidebar width
      },
    },
  },
  plugins: [],
} satisfies Config
