import type { Config } from "tailwindcss";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        border: token("border"),
        muted: token("muted"),
        "muted-foreground": token("muted-foreground"),
        primary: token("primary"),
        "primary-foreground": token("primary-foreground"),
        accent: token("accent"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
        ring: token("ring"),
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--primary) / 0.25), 0 8px 40px -12px hsl(var(--primary) / 0.45)",
        card: "0 1px 0 0 hsl(0 0% 100% / 0.04) inset, 0 10px 30px -15px hsl(0 0% 0% / 0.5)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "pulse-ring": { "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / .5)" }, "100%": { boxShadow: "0 0 0 10px hsl(var(--primary) / 0)" } },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        float: "float 6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
