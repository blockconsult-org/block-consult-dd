import type { Config } from "tailwindcss";

/**
 * App-UI Tailwind config. Tokens mirror the Block Consult brand site
 * (near-monochrome dark palette + a single logo-blue accent, Geist type).
 *
 * The *report* output does NOT use Tailwind — it uses the self-contained CSS
 * design system (src/report/design-system.ts) so the HTML and PDF render
 * identically and on-brand regardless of the app theme.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/report/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bc-bg) / <alpha-value>)",
        surface: "rgb(var(--bc-surface) / <alpha-value>)",
        elevated: "rgb(var(--bc-elevated) / <alpha-value>)",
        fg: "rgb(var(--bc-fg) / <alpha-value>)",
        muted: "rgb(var(--bc-muted) / <alpha-value>)",
        faint: "rgb(var(--bc-faint) / <alpha-value>)",
        line: "rgb(var(--bc-line) / <alpha-value>)",
        "line-strong": "rgb(var(--bc-line-strong) / <alpha-value>)",
        control: "rgb(var(--bc-control) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--bc-accent) / <alpha-value>)",
          dim: "rgb(var(--bc-accent-dim) / <alpha-value>)",
          fg: "#fff",
        },
        link: "rgb(var(--bc-link) / <alpha-value>)",
        success: "rgb(var(--bc-success) / <alpha-value>)",
        warning: "rgb(var(--bc-warning) / <alpha-value>)",
        danger: "rgb(var(--bc-danger) / <alpha-value>)",
        "danger-solid": "rgb(var(--bc-danger-solid) / <alpha-value>)",
        info: "rgb(var(--bc-info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SF Mono", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.22, 1, 0.36, 1)",
        standard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        160: "160ms",
      },
    },
  },
  plugins: [],
};

export default config;
