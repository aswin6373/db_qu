/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        forest: "#17645a",
        coral: "#db6b4d",
        steel: "#557086",
        mist: "#eef3f4"
      }
    }
  },
  plugins: []
};
