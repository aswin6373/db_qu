/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        forest: "#17645a",
        coral: "#d96545",
        steel: "#557086",
        mist: "#eef3f4",
        paper: "#fbfcfc",
        line: "#d9e2e4",
        navy: "#22313d",
        amber: "#c48a2c"
      }
    }
  },
  plugins: []
};
