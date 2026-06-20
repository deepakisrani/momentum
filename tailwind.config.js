/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdff', 100: '#d0f7fe', 200: '#a6effd', 300: '#6fe2fb', 400: '#2fcdf3',
          500: '#09b9ee', 600: '#0c89c4', 700: '#0c6aa6', 800: '#0f5285', 900: '#123f63',
        },
        'brand-green': '#10c9a8',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
