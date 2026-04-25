import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Aptos", "ui-sans-serif", "system-ui"],
        display: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
