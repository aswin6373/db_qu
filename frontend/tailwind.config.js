/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      colors: {
        brand: {
          50: "#e9f5f4",
          100: "#d3ebe9",
          200: "#a9d8d4",
          300: "#7cc2bc",
          400: "#52aaa2",
          500: "#38a29a",
          600: "#2f9e97",
          700: "#27877f",
          800: "#1f6b65",
          900: "#17544f"
        },
        canvas: "#f7f4ec",
        cream: "#f7f4ec",
        navy: {
          DEFAULT: "#16324f",
          soft: "#41586e"
        },
        teal: {
          DEFAULT: "#2f9e97",
          dark: "#27877f",
          soft: "#e3f2f0"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.08)",
        lift: "0 10px 30px -12px rgba(15,23,42,0.18)",
        sidebar: "inset -1px 0 0 rgba(148,163,184,0.12)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(var(--tw-rotate))" },
          "50%": { transform: "translateY(-14px) rotate(var(--tw-rotate))" }
        },
        caret: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        caret: "caret 1.1s step-end infinite"
      }
    }
  },
  plugins: []
};
