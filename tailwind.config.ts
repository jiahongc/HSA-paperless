import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        base: "#f8f5ef",
        surface: "#f1e8dd",
        ink: "#1a1a1a",
        muted: "#6b645c",
        coral: "#d98b73",
        sage: "#7a9172",
        sky: "#6f8fb3"
      },
      fontFamily: {
        serif: ["Fraunces", "ui-serif", "serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 12px 30px rgba(28, 25, 23, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
