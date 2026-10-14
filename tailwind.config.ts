import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      colors: {
        brown: {
          50: '#fcf8f6',
          100: '#f7eee9',
          200: '#eedcd2',
          300: '#dfc2b2',
          400: '#c59a82',
          500: '#a87558',
          600: '#8e5b40',
          700: '#734630',
          800: '#5c3726',
          900: '#4a2c1f',
          950: '#2b170e',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
