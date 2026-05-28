/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./templates/**/*.html', './static/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#0a0a0a',
        primaryHover: '#262626',
        secondary: '#737373',
        accent: '#a3a3a3',
        darkBg: '#0a0a0a',
        luxuryGold: '#c5a880',
        success: '#059669',
        danger: '#dc2626',
        warning: '#d97706',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
