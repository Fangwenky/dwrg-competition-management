import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", paper: "var(--paper)", parchment: "var(--parchment)",
        plum: "var(--plum)", gold: "var(--gold)", danger: "var(--danger)", line: "var(--line)"
      },
      boxShadow: { dossier: "0 18px 50px rgba(12, 13, 17, .18)" },
      fontFamily: {
        sans: ["var(--font-sans)", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        display: ["var(--font-display)", "Songti SC", "serif"],
        data: ["var(--font-data)", "Arial Narrow", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
