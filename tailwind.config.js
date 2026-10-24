/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbffe9', 100: '#efffc1', 200: '#e3ff91', 300: '#d9ff68', 400: '#d4ff4d',
          500: '#c2ee42', 600: '#a7d336', 700: '#89ad2c', 800: '#668221', 900: '#455b18',
        },
        'brand-green': '#d4ff4d',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
