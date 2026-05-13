"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Default to `light` (not `system`). The previous `system` default caused
 * two reported problems:
 *   - Theme flickering on navigation when the user's OS preference was
 *     "dark" but the SSR HTML rendered light, then snapped to dark.
 *   - The app silently switching to dark and "getting stuck" whenever
 *     macOS / iOS auto-toggled appearance overnight.
 *
 * Users can still pick `system` from the theme menu — we just don't
 * make it the default. `disableTransitionOnChange` prevents the slow
 * fade between modes that compounded the flicker perception.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="adslab-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
