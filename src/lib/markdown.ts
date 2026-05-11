/**
 * Minimal markdown → HTML converter sufficient for what our AI produces:
 *   ##/### headings, bullet lists (`- `), bold `**`, plain paragraphs.
 *
 * We deliberately avoid a heavy markdown library — Claude is prompted to
 * stay within this subset, and small surface = smaller deploy bundle.
 */

export type MdRenderOptions = {
  /** Inline styles (for email). When omitted we emit semantic HTML + class hooks. */
  emailStyles?: boolean;
};

export function renderMarkdown(md: string, options: MdRenderOptions = {}): string {
  const email = options.emailStyles ?? false;

  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const out: string[] = [];
  let inList = false;

  const close = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  const inlineFmt = (s: string) =>
    s.replace(
      /\*\*([^*]+)\*\*/g,
      email
        ? '<strong style="color:#0A0A0A;font-weight:600;">$1</strong>'
        : "<strong>$1</strong>",
    );

  for (const raw of lines) {
    const line = raw.trimEnd();

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      close();
      out.push(
        email
          ? `<h2 style="font-size:18px;font-weight:600;color:#0A0A0A;margin:24px 0 12px;letter-spacing:-0.01em;">${h2[1]}</h2>`
          : `<h2 class="text-lg font-semibold tracking-tight mt-6 mb-3">${h2[1]}</h2>`,
      );
      continue;
    }
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      close();
      out.push(
        email
          ? `<h3 style="font-size:15px;font-weight:600;color:#0A0A0A;margin:18px 0 8px;">${h3[1]}</h3>`
          : `<h3 class="text-base font-semibold tracking-tight mt-5 mb-2">${h3[1]}</h3>`,
      );
      continue;
    }

    const bullet = line.match(/^-\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push(
          email
            ? '<ul style="margin:0 0 12px 0;padding-left:20px;color:#52525B;font-size:14px;line-height:1.6;">'
            : '<ul class="list-disc pl-6 space-y-1.5 my-3 text-sm leading-relaxed text-foreground/90">',
        );
        inList = true;
      }
      out.push(
        email
          ? `<li style="margin-bottom:4px;">${inlineFmt(bullet[1])}</li>`
          : `<li>${inlineFmt(bullet[1])}</li>`,
      );
      continue;
    }

    if (line.trim() === "") {
      close();
      continue;
    }

    close();
    out.push(
      email
        ? `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#52525B;">${inlineFmt(line)}</p>`
        : `<p class="my-3 text-sm leading-relaxed text-foreground/90">${inlineFmt(line)}</p>`,
    );
  }
  close();

  return out.join("\n");
}
