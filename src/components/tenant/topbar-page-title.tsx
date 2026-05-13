"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Topbar page-title context. Server components can't read the topbar
 * directly because it's rendered once in the layout. Instead, pages
 * render a client `<SetPageTitle>` component near the top, which writes
 * into this context and the topbar reads from it.
 *
 * Why not pass via props to the layout? Because layouts in Next.js
 * don't re-render on child route change unless they're client. We want
 * to keep the layout server-rendered.
 */

type Ctx = {
  title: string;
  subtitle?: string;
  setTitle: (title: string, subtitle?: string) => void;
};

const PageTitleContext = createContext<Ctx | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitleState] = useState("");
  const [subtitle, setSubtitleState] = useState<string | undefined>();

  const value = useMemo<Ctx>(
    () => ({
      title,
      subtitle,
      setTitle: (t, s) => {
        setTitleState(t);
        setSubtitleState(s);
      },
    }),
    [title, subtitle],
  );

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

/** Page component renders this near the top to set the topbar title. */
export function SetPageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    ctx?.setTitle(title, subtitle);
  }, [title, subtitle, ctx]);
  return null;
}

/** Topbar reads the current title/subtitle from context. */
export function TopbarPageTitle() {
  const ctx = useContext(PageTitleContext);
  if (!ctx?.title) return null;
  return (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{ctx.title}</h1>
      {ctx.subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{ctx.subtitle}</p>}
    </div>
  );
}
