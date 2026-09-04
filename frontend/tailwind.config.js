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
        /* Dark surfaces — warm charcoal inspired by Claude/ChatGPT dark UIs,
           tinted to keep QueryMind's teal identity. */
        canvas: "#15171c",
        raise: "#1d2026",
        surface: "#242830",
        sand: {
          DEFAULT: "#2b3038",
          dark: "#3c434d"
        },
        /* Text + hairlines */
        ink: "#e8ebee",
        "ink-soft": "#9ba4b0",
        "ink-faint": "#6b7480",
        line: "rgba(255,255,255,0.08)",
        "line-strong": "rgba(255,255,255,0.16)",
        brand: {
          50: "#12312e",
          100: "#17403c",
          200: "#1e514c",
          300: "#6fcac1",
          400: "#52aaa2",
          500: "#38a29a",
          600: "#2f9e97",
          700: "#27877f",
          800: "#1f6b65",
          900: "#17544f"
        },
        navy: {
          DEFAULT: "#10141a",
          soft: "#9ba4b0"
        },
        cream: "#1d2026",
        teal: {
          DEFAULT: "#2f9e97",
          dark: "#6fcac1",
          soft: "#17403c"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.35)",
        lift: "0 10px 30px -12px rgba(0,0,0,0.65)",
        sidebar: "inset -1px 0 0 rgba(255,255,255,0.06)"
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
