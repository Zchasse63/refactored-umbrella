import type { Config } from "tailwindcss";

/**
 * Token system per DESIGN_GUIDE §5. Components reference ONLY semantic aliases
 * (Layer 2). Register (storefront/cockpit) + theme remap the underlying values
 * via data-attributes / classes in globals.css — never re-map a hue identity:
 * Target is always indigo, Partner always violet.
 */
const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['variant', '&:is(.dark[data-register="cockpit"] *)'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        background: hsl("--background"),
        foreground: hsl("--foreground"),
        muted: { DEFAULT: hsl("--muted"), foreground: hsl("--muted-fg") },
        card: { DEFAULT: hsl("--card"), foreground: hsl("--foreground") },
        border: { DEFAULT: hsl("--border"), strong: hsl("--border-strong") },
        input: hsl("--input"),
        ring: hsl("--ring"),
        primary: { DEFAULT: hsl("--primary"), foreground: hsl("--primary-fg") },
        secondary: { DEFAULT: hsl("--secondary"), foreground: hsl("--secondary-fg") },
        // semantic economics hues (meaning, never decoration)
        target: { DEFAULT: hsl("--target"), foreground: hsl("--target-fg"), muted: hsl("--target-muted"), "muted-foreground": hsl("--target-muted-fg") },
        quoted: { DEFAULT: hsl("--quoted"), foreground: hsl("--quoted-fg"), muted: hsl("--quoted-muted"), "muted-foreground": hsl("--quoted-muted-fg") },
        actual: { DEFAULT: hsl("--actual"), foreground: hsl("--actual-fg"), muted: hsl("--actual-muted") },
        pass: { DEFAULT: hsl("--pass"), foreground: hsl("--pass-fg"), muted: hsl("--pass-muted"), "muted-foreground": hsl("--pass-muted-fg") },
        fail: { DEFAULT: hsl("--fail"), foreground: hsl("--fail-fg"), muted: hsl("--fail-muted"), "muted-foreground": hsl("--fail-muted-fg") },
        partner: { DEFAULT: hsl("--partner"), foreground: hsl("--partner-fg"), muted: hsl("--partner-muted"), "muted-foreground": hsl("--partner-muted-fg") },
        "needs-photo": { DEFAULT: hsl("--needs-photo"), foreground: hsl("--needs-photo-fg") },
        "accent-owner": hsl("--accent-owner"),
        "accent-partner": hsl("--accent-partner"),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "card-hover": "0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)",
      },
      keyframes: {
        "lamp-pulse": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--pass) / 0.45)" },
          "100%": { boxShadow: "0 0 0 8px hsl(var(--pass) / 0)" },
        },
        "value-roll": { "0%": { opacity: "0.4" }, "100%": { opacity: "1" } },
      },
      animation: {
        "lamp-pulse": "lamp-pulse 600ms ease-out 1",
        "value-roll": "value-roll 150ms ease-out 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
