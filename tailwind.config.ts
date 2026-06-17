import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Kleen Resorts huisstijl (voorlopig, pas later aan op de echte kleuren)
        brand: {
          DEFAULT: "#1f7a5a",
          dark: "#155843",
          light: "#e6f2ed",
        },
        ink: "#0f1c18",
        muted: "#6b7c75",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
