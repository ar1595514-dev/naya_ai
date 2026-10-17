import type { Config } from "tailwindcss";

/**
 * NyayaAI design tokens.
 * Restrained navy + saffron accents on neutral surfaces, tuned for accessible contrast.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f2f5fa",
          100: "#e2e9f3",
          200: "#c3d0e6",
          300: "#96abce",
          400: "#6480ae",
          500: "#446193",
          600: "#334c78",
          700: "#2b3e61",
          800: "#263451",
          900: "#1c2740",
          950: "#121a2c",
        },
        saffron: {
          50: "#fff8ed",
          100: "#ffefd4",
          200: "#ffdba8",
          300: "#ffc071",
          400: "#ff9c37",
          500: "#ff7d10",
          600: "#f05f06",
          700: "#c74607",
          800: "#9e370e",
          900: "#7f300f",
          950: "#451605",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f7f8fa",
          border: "#e5e7eb",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        hindi: ["var(--font-hindi)", "Noto Sans Devanagari", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
