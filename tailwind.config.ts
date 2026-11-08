import type { Config } from "tailwindcss";

// Design tokens are RGB triplets in CSS variables (see src/index.css) so every
// color supports Tailwind opacity modifiers, e.g. bg-surface/60, border-cyan/30.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1240px" } },
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        border: token("border"),
        text: token("text"),
        muted: token("muted"),
        cyan: token("cyan"),
        violet: token("violet"),
        "on-accent": token("on-accent"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
      },
      borderRadius: {
        lg: "12px",
        xl: "14px",   // inputs, buttons
        "2xl": "18px", // cards, menus
        "3xl": "24px", // hero / feature panels, drawers
      },
      boxShadow: {
        soft: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.45)",
        premium: "0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 24px 60px -24px rgb(0 0 0 / 0.6), 0 2px 6px -2px rgb(0 0 0 / 0.3)",
        glow: "0 0 0 1px rgb(var(--cyan) / 0.28), 0 12px 40px -12px rgb(var(--cyan) / 0.35)",
        "glow-violet": "0 0 0 1px rgb(var(--violet) / 0.28), 0 12px 40px -12px rgb(var(--violet) / 0.3)",
        focus: "0 0 0 4px rgb(var(--cyan) / 0.18)",
      },
      transitionDuration: { 200: "200ms", 450: "450ms" },
      transitionTimingFunction: { premium: "cubic-bezier(0.22, 1, 0.36, 1)" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "grid-pan": { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "48px 48px" } },
        aurora: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(4%,-3%,0) scale(1.08)" },
        },
        "pulse-ring": { "0%": { boxShadow: "0 0 0 0 rgb(var(--cyan) / .45)" }, "100%": { boxShadow: "0 0 0 10px rgb(var(--cyan) / 0)" } },
        indeterminate: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(250%)" } },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "grid-pan": "grid-pan 12s linear infinite",
        aurora: "aurora 14s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        indeterminate: "indeterminate 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
