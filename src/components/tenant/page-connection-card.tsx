import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PageConnectionData = {
  metaUserName: string;
  status: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  pageCount: number;
} | null;

type Props = {
  tenantSlug: string;
  role: string;
  data: PageConnectionData;
  flashSuccess?: boolean;
};

export function PageConnectionCard({ tenantSlug, role, data, flashSuccess }: Props) {
  const canConnect = role === "OWNER";

  if (!data) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-sm font-medium">ยังไม่ได้เชื่อม Page Management</p>
        <p className="text-xs text-muted-foreground">
          แอป Meta แยกจากการเชื่อมโฆษณา — ต้อง authorize เพิ่มถ้าจะใช้ฟีเจอร์ตั้งเวลาโพสต์เพจ
        </p>
        {canConnect ? (
          <Link
            href={`/api/meta/page-oauth/start?tenantSlug=${tenantSlug}`}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
          >
            <FileText className="size-3.5" />
            เชื่อม Page Management
          </Link>
        ) : (
          <p className="text-[11px] text-muted-foreground">เฉพาะ OWNER เชื่อมต่อได้</p>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      {flashSuccess && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" />
          เชื่อม Page Management สำเร็จ
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">เชื่อมเป็น {data.metaUserName}</p>
          <p className="text-xs text-muted-foreground">
            จัดการ {data.pageCount} เพจ · เชื่อมเมื่อ{" "}
            {new Date(data.connectedAt).toLocaleDateString("th-TH")}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            data.status === "ACTIVE"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {data.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/t/${tenantSlug}/posts`}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
        >
          <FileText className="size-3.5" />
          ไปที่ &quot;โพสต์เพจ&quot;
        </Link>
        {canConnect && (
          <Link
            href={`/api/meta/page-oauth/start?tenantSlug=${tenantSlug}`}
            className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
          >
            re-authorize
          </Link>
        )}
      </div>
    </Card>
  );
}
