/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          pink: '#fa233b',
          red: '#ff2d55',
          dark: '#161618',
          card: 'rgba(255, 255, 255, 0.05)',
          glass: 'rgba(30, 30, 35, 0.75)',
          border: 'rgba(255, 255, 255, 0.08)',
        }
      },
      backdropBlur: {
        xs: '2px',
        md: '12px',
        xl: '24px',
        '2xl': '40px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
