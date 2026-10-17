/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        brand: {
          50: "#eef4ff", 100: "#dbe6ff", 200: "#bfd2ff", 300: "#93b4ff", 400: "#608bfd",
          500: "#3b63f8", 600: "#2543ed", 700: "#1d31da", 800: "#1e2bb0", 900: "#1e2b8b",
        },
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)" },
      keyframes: {
        fadeIn: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { fadeIn: "fadeIn .25s ease-out" },
    },
  },
  plugins: [],
};
