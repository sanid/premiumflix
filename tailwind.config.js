/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        premiumflix: {
          red: '#E50914',
          'red-hover': '#F40612',
          dark: '#141414',
          surface: '#181818',
          card: '#2F2F2F',
          muted: '#B3B3B3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Netflix Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(to bottom, transparent 60%, #141414 100%), linear-gradient(to right, #141414 0%, transparent 60%)',
        'card-gradient': 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      aspectRatio: {
        poster: '2 / 3',
        backdrop: '16 / 9',
      },
    },
  },
  plugins: [],
}
