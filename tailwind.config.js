/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Onest', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      // The upper layers, named (DESIGN.md "Layers"). z-10..z-40 stay the numeric utilities for
      // sticky rows, raised toolbars, the top bar and popovers; an arbitrary z-[...] is a defect.
      zIndex: {
        drawer: '50',
        floating: '60',
        overlay: '80',
        dialog: '100',
        picker: '200',
        toast: '300',
        critical: '400',
      },
      colors: {
        brand: {
          DEFAULT: '#ff5a00',
          light: '#ff7a30',
          dark: '#cc4800',
        }
      }
    },
  },
  plugins: [],
}
