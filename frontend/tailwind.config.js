/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Source Serif 4", "Georgia", "ui-serif", "serif"]
      },
      colors: {
        /* Pitch black base — definition comes from hairline borders, not
           grey surfaces. Neutral (no blue tint) so nothing reads grey. */
        side: "#000000",
        canvas: "#000000",
        raise: "#0d0d0f",
        surface: "#141416",
        sand: {
          DEFAULT: "#161619",
          dark: "#242429"
        },
        ink: "#ececee",
        "ink-soft": "#a6a9b0",
        "ink-faint": "#71757e",
        line: "rgba(255,255,255,0.07)",
        "line-strong": "rgba(255,255,255,0.15)",
        brand: {
          50: "#12312e",
          100: "#17403c",
          200: "#1e514c",
          300: "#7fd4cc",
          400: "#52aaa2",
          500: "#38a29a",
          600: "#2f9e97",
          700: "#27877f",
          800: "#1f6b65",
          900: "#17544f"
        },
        navy: {
          DEFAULT: "#0d0d0f",
          soft: "#a6a9b0"
        },
        cream: "#0d0d0f",
        teal: {
          DEFAULT: "#2f9e97",
          dark: "#7fd4cc",
          soft: "#17403c"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.35)",
        lift: "0 14px 40px -12px rgba(0,0,0,0.55)",
        composer: "0 4px 18px rgba(0,0,0,0.35)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
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
        "fade-up": "fade-up 0.3s ease-out both",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        caret: "caret 1.1s step-end infinite"
      }
    }
  },
  plugins: []
};
