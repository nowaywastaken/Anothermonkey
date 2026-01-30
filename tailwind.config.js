/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        dark: {
          bg: {
            primary: '#18181b', // zinc-950
            secondary: '#27272a', // zinc-900
            tertiary: '#3f3f46', // zinc-700
          },
          text: {
            primary: '#f4f4f5', // zinc-100
            secondary: '#a1a1aa', // zinc-400
            muted: '#71717a', // zinc-500
          },
          border: {
            primary: '#3f3f46', // zinc-700
            secondary: '#52525b', // zinc-600
          },
        }
      }
    },
  },
  plugins: [],
}