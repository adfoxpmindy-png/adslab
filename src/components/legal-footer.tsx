import Link from "next/link";

export function LegalFooter() {
  return (
    <p className="mt-4 text-center text-xs text-muted-foreground">
      <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
      {" · "}
      <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
      {" · "}
      <Link href="/data-deletion" className="underline-offset-4 hover:underline">Data deletion</Link>
    </p>
  );
}
