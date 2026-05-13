"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Heart,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Search,
  ShoppingBag,
  Smartphone,
  Target,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { SmartNameField } from "@/components/tenant/smart-name-field";
import { cn } from "@/lib/utils";

type AdAccount = { id: string; name: string; currency: string; business: string | null };
type Page = { id: string; name: string; category: string | null; pictureUrl: string | null };

type GeoTarget = {
  key: string;
  name: string;
  type: "country" | "region" | "city" | "zip" | "geo_market";
  included: boolean;
};

type Interest = {
  id: string;
  name: string;
  /** Audience size estimate (mid-point of Meta's lower/upper bound). */
  audienceSize?: number;
  /** Hierarchy path from Meta, e.g. ["Interests", "Beauty", "Cosmetics"] */
  path?: string[];
};

type Props = {
  tenantSlug: string;
  adAccounts: AdAccount[];
  pages: Page[];
  canEdit: boolean;
};

type Audience = {
  id: string;
  name: string;
  subtype: string;
  approximateCount: number | null;
};

type Objective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

// Meta ODAX hierarchy. Main objective + sub-options (= optimization_goal).
// Sub-options ordered by popularity per Thai agency workflow.
type LucideIcon = React.ComponentType<{ className?: string }>;
type SubOption = { value: string; label: string; description?: string };

const OBJECTIVE_TREE: Record<
  Objective,
  { label: string; sublabel: string; icon: LucideIcon; subs: SubOption[] }
> = {
  OUTCOME_SALES: {
    label: "Sales",
    sublabel: "ขายของ / Conversion",
    icon: ShoppingBag,
    subs: [
      { value: "LINK_CLICKS", label: "Link Clicks", description: "ส่งคนไปเว็บ (post ต้องมี link)" },
      { value: "CONVERSATIONS", label: "Messages", description: "ขายผ่านแชท Page" },
      { value: "OFFSITE_CONVERSIONS", label: "Conversions (Pixel)", description: "Optimize ตาม event บนเว็บ — ต้องตั้ง Pixel ก่อน" },
      { value: "VALUE", label: "Value (Pixel)", description: "Optimize ตามมูลค่าซื้อ (ต้อง Pixel + value events)" },
    ],
  },
  OUTCOME_LEADS: {
    label: "Leads",
    sublabel: "เก็บ Lead / Inbox",
    icon: Target,
    subs: [
      // LEAD_GENERATION / QUALITY_LEAD need Lead Forms — defer to Stage 4
      // when we add form management UI.
      { value: "CONVERSATIONS", label: "Messages", description: "ส่งคนมาแชท Page" },
    ],
  },
  OUTCOME_ENGAGEMENT: {
    label: "Engagement",
    sublabel: "มีส่วนร่วม (video / chat)",
    icon: Heart,
    subs: [
      // OUTCOME_ENGAGEMENT in v23 ODAX has strict account-level allowed
      // pairs that don't match Meta's published docs. Verified working:
      //   - THRUPLAY for video posts
      //   - CONVERSATIONS for messaging Page
      // POST_ENGAGEMENT / PAGE_LIKES are deprecated in many accounts.
      { value: "THRUPLAY", label: "Video Views", description: "ดูวิดีโอจบ ≥15s (post ต้องเป็น video)" },
      { value: "CONVERSATIONS", label: "Messages", description: "ส่งคนมาแชท Page" },
    ],
  },
  OUTCOME_TRAFFIC: {
    label: "Traffic",
    sublabel: "เข้าเว็บ / Link Clicks",
    icon: MousePointerClick,
    subs: [
      { value: "LINK_CLICKS", label: "Link Clicks", description: "เน้นจำนวนคลิก" },
      { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views", description: "คลิก + เปิดหน้า web จริง" },
    ],
  },
  OUTCOME_AWARENESS: {
    label: "Awareness",
    sublabel: "สร้างการรับรู้",
    icon: Eye,
    subs: [
      { value: "REACH", label: "Reach", description: "คนเห็นโฆษณามากที่สุด" },
      { value: "IMPRESSIONS", label: "Impressions", description: "ครั้งที่โฆษณาแสดง" },
      { value: "THRUPLAY", label: "Video Views (Thruplay)", description: "ดูวิดีโอจบ ≥15s" },
    ],
  },
  OUTCOME_APP_PROMOTION: {
    label: "App Promotion",
    sublabel: "ติดตั้งแอป",
    icon: Smartphone,
    subs: [
      // App promotion needs application_id + store URL setup — defer.
      // For now redirect users to Meta Ads Manager via warning text.
      { value: "REACH", label: "Reach", description: "⚠ App-specific optimization ต้องตั้งค่า app ก่อน — ใช้ Reach แทน" },
    ],
  },
};

const OBJECTIVE_ORDER: Objective[] = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
  "OUTCOME_APP_PROMOTION",
];

// CTA recommended per objective — narrows the choices users have to make
const SUGGESTED_CTA: Record<Objective, string> = {
  OUTCOME_SALES: "SHOP_NOW",
  OUTCOME_AWARENESS: "LEARN_MORE",
  OUTCOME_ENGAGEMENT: "LEARN_MORE",
  OUTCOME_TRAFFIC: "LEARN_MORE",
  OUTCOME_LEADS: "SIGN_UP",
  OUTCOME_APP_PROMOTION: "DOWNLOAD",
};

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "MESSAGE_PAGE", label: "Message Us" },
  { value: "ORDER_NOW", label: "Order Now" },
];

// Pixel standard events Meta accepts for OFFSITE_CONVERSIONS / VALUE.
// Ordered by Thai e-commerce usage. Custom events (CUSTOM_<NAME>) need
// the pixel to have actually fired them — leave that for advanced users.
const PIXEL_EVENTS = [
  { value: "PURCHASE", label: "Purchase — ซื้อสำเร็จ" },
  { value: "ADD_TO_CART", label: "Add to Cart — ใส่ตะกร้า" },
  { value: "INITIATE_CHECKOUT", label: "Initiate Checkout — เริ่ม checkout" },
  { value: "LEAD", label: "Lead — กรอกฟอร์ม" },
  { value: "COMPLETE_REGISTRATION", label: "Complete Registration — สมัครสมาชิก" },
  { value: "ADD_PAYMENT_INFO", label: "Add Payment Info — กรอกข้อมูลจ่าย" },
  { value: "VIEW_CONTENT", label: "View Content — ดูสินค้า" },
  { value: "SEARCH", label: "Search — ค้นหา" },
  { value: "SUBSCRIBE", label: "Subscribe — สมัครรับข้อมูล" },
  { value: "CONTACT", label: "Contact — ติดต่อ" },
];

const DRAFT_KEY_PREFIX = "adslab:campaign-draft:";

export function CampaignBuilderForm({ tenantSlug, adAccounts, pages, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const draftKey = `${DRAFT_KEY_PREFIX}${tenantSlug}`;

  // === ESSENTIAL FIELDS (Simple Mode) ===
  const [metaAccountId, setMetaAccountId] = useState(adAccounts[0]?.id ?? "");
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<Objective>("OUTCOME_SALES");
  const [optimizationGoal, setOptimizationGoal] = useState<string>(
    OBJECTIVE_TREE.OUTCOME_SALES.subs[0].value,
  );
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [dailyBudgetThb, setDailyBudgetThb] = useState("300");
  const [lifetimeBudgetThb, setLifetimeBudgetThb] = useState("3000");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [primaryText, setPrimaryText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // === Pixel (only for conversion goals) ===
  // The event source is either a standard event type (PURCHASE/LEAD/...)
  // or a custom-conversion id. Mutually exclusive in Meta's API.
  const [pixelId, setPixelId] = useState("");
  const [eventSource, setEventSource] = useState<"standard" | "custom">("standard");
  const [customEventType, setCustomEventType] = useState("PURCHASE");
  const [customConversionId, setCustomConversionId] = useState("");
  const [pixelOptions, setPixelOptions] = useState<{ id: string; name: string }[]>([]);
  const [conversionOptions, setConversionOptions] = useState<
    { id: string; name: string; pixelId: string | null; customEventType: string | null }[]
  >([]);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [loadingConversions, setLoadingConversions] = useState(false);

  // === ADVANCED (hidden by default) ===
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [budgetMode, setBudgetMode] = useState<"CBO" | "ABO">("CBO");
  const [specialAdCategory, setSpecialAdCategory] = useState("NONE");
  const [customAdSetName, setCustomAdSetName] = useState("");
  const [customAdName, setCustomAdName] = useState("");
  // Geo targeting state — each entry has type (country/region/city) + key
  // (Meta's ID) + name + included (false = exclude). Default = TH country.
  const [geoTargets, setGeoTargets] = useState<GeoTarget[]>([
    { key: "TH", name: "Thailand", type: "country", included: true },
  ]);
  // Default 20 because Meta now requires age_min ≥ 20 when targeting Thailand
  // (policy effective 2024). 18 will be rejected for TH-targeted ads.
  const [ageMin, setAgeMin] = useState(20);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [selectedAudiences, setSelectedAudiences] = useState<Audience[]>([]);
  const [audienceLibrary, setAudienceLibrary] = useState<Audience[]>([]);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  // Interest targeting (Meta detailed targeting → interests)
  const [selectedInterests, setSelectedInterests] = useState<Interest[]>([]);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [callToAction, setCallToAction] = useState("SHOP_NOW");

  // Creative source — default "new_image" (uploading is simpler than picking)
  const [creativeKind, setCreativeKind] = useState<"new_image" | "existing_post">("new_image");
  const [postId, setPostId] = useState("");
  const [manualPostId, setManualPostId] = useState("");
  const [pagePosts, setPagePosts] = useState<{ id: string; message: string; thumbnailUrl: string | null }[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingPages, setRefreshingPages] = useState(false);
  // Preview modal state — opened from validate, holds the prepared payload
  const [previewOpen, setPreviewOpen] = useState(false);

  // When user picks a new main objective, default the sub-option to the
  // first one in that group (= the most common per the ordering above)
  // and update the CTA recommendation.
  useEffect(() => {
    setCallToAction(SUGGESTED_CTA[objective]);
    setOptimizationGoal(OBJECTIVE_TREE[objective].subs[0].value);
  }, [objective]);

  // === Draft persistence ===
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.metaAccountId) setMetaAccountId(d.metaAccountId);
      if (d.campaignName) setCampaignName(d.campaignName);
      if (d.objective) setObjective(d.objective);
      if (d.dailyBudgetThb) setDailyBudgetThb(d.dailyBudgetThb);
      if (d.primaryText) setPrimaryText(d.primaryText);
      if (d.linkUrl) setLinkUrl(d.linkUrl);
      if (d.headline) setHeadline(d.headline);
    } catch {}
  }, [draftKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          metaAccountId, campaignName, objective, dailyBudgetThb,
          primaryText, linkUrl, headline,
        }),
      );
    }, 500);
    return () => clearTimeout(id);
  }, [draftKey, metaAccountId, campaignName, objective, dailyBudgetThb, primaryText, linkUrl, headline]);

  // === Pixel + Custom Conversion fetch — only when conversion goal selected ===
  // Pixel is required for OFFSITE_CONVERSIONS / VALUE optimization. We
  // fetch on demand so accounts without conversion goals avoid the call.
  const isConversionGoal =
    optimizationGoal === "OFFSITE_CONVERSIONS" || optimizationGoal === "VALUE";
  useEffect(() => {
    if (!isConversionGoal || !metaAccountId) return;
    let cancelled = false;
    setLoadingPixels(true);
    setLoadingConversions(true);
    setPixelId("");
    setCustomConversionId("");

    fetch(`/api/meta/pixels?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPixelOptions(d.pixels ?? []);
        if (d.pixels?.length === 1) setPixelId(d.pixels[0].id);
      })
      .catch(() => {
        if (!cancelled) setPixelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPixels(false);
      });

    fetch(`/api/meta/custom-conversions?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setConversionOptions(d.conversions ?? []);
      })
      .catch(() => {
        if (!cancelled) setConversionOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingConversions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, metaAccountId, isConversionGoal]);

  // === Audience fetch — only when advanced opened ===
  useEffect(() => {
    if (!showAdvanced || !metaAccountId) return;
    if (audienceLibrary.length > 0) return; // already loaded
    setLoadingAudiences(true);
    fetch(`/api/meta/audiences?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`)
      .then((r) => r.json())
      .then((d) => setAudienceLibrary(d.audiences ?? []))
      .catch(() => setAudienceLibrary([]))
      .finally(() => setLoadingAudiences(false));
  }, [showAdvanced, tenantSlug, metaAccountId, audienceLibrary.length]);

  // === Page posts fetch — re-runs whenever pageId or mode changes ===
  useEffect(() => {
    if (creativeKind !== "existing_post" || !pageId) {
      setPagePosts([]);
      setPostsError(null);
      return;
    }
    setLoadingPosts(true);
    setPagePosts([]);
    setPostId("");
    setPostsError(null);
    fetch(`/api/meta/pages/${pageId}/posts?tenantSlug=${tenantSlug}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Meta API error");
        }
        return data;
      })
      .then((d) => setPagePosts(d.posts ?? []))
      .catch((err: Error) => {
        setPagePosts([]);
        setPostsError(err.message);
      })
      .finally(() => setLoadingPosts(false));
  }, [tenantSlug, pageId, creativeKind]);

  // === Image upload ===
  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    setImagePreviewUrl(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/meta/upload-image?tenantSlug=${tenantSlug}&metaAccountId=${metaAccountId}`,
        { method: "POST", body: form },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setImageHash(data.hash);
      toast.success("✓ อัพโหลด image แล้ว", { duration: 2500 });
    } catch (err) {
      setImageHash(null);
      setImagePreviewUrl(null);
      toast.error(err instanceof Error ? err.message : "Upload failed", { duration: 5000 });
    } finally {
      setUploadingImage(false);
    }
  }

  // === Refresh Pages on demand ===
  async function refreshPages() {
    setRefreshingPages(true);
    try {
      const res = await fetch(`/api/meta/pages?tenantSlug=${tenantSlug}&refresh=true`);
      if (!res.ok) throw new Error("Refresh failed");
      toast.success("✓ Sync Pages แล้ว — refresh หน้าเพื่อเห็น list ใหม่", { duration: 4000 });
      router.refresh();
    } catch {
      toast.error("Sync Pages ไม่สำเร็จ");
    } finally {
      setRefreshingPages(false);
    }
  }

  // === Build Meta targeting ===
  const targeting = useMemo(() => {
    // Bucket geo targets by type, separated into include vs exclude.
    // Meta shape: targeting.geo_locations.{countries, regions, cities}
    //             targeting.excluded_geo_locations.{...}
    const groupByType = (items: GeoTarget[]) => {
      const out: Record<string, (string | { key: string })[]> = {};
      for (const g of items) {
        const bucket =
          g.type === "country" ? "countries"
          : g.type === "region" ? "regions"
          : g.type === "city" ? "cities"
          : "countries";
        if (!out[bucket]) out[bucket] = [];
        if (bucket === "countries") {
          out[bucket].push(g.key);
        } else {
          out[bucket].push({ key: g.key });
        }
      }
      return out;
    };

    const t: Record<string, unknown> = {
      geo_locations: groupByType(geoTargets.filter((g) => g.included)),
      age_min: ageMin,
      age_max: ageMax,
    };
    const excluded = geoTargets.filter((g) => !g.included);
    if (excluded.length > 0) {
      t.excluded_geo_locations = groupByType(excluded);
    }
    if (gender === "male") t.genders = [1];
    if (gender === "female") t.genders = [2];
    if (selectedAudiences.length > 0) {
      t.custom_audiences = selectedAudiences.map((a) => ({ id: a.id, name: a.name }));
    }
    if (selectedInterests.length > 0) {
      // Meta's detailed targeting uses `flexible_spec` for combinations, but
      // for a simple OR of interests the top-level `interests` array works.
      t.interests = selectedInterests.map((i) => ({ id: i.id, name: i.name }));
    }
    return t;
  }, [geoTargets, ageMin, ageMax, gender, selectedAudiences, selectedInterests]);

  // === Step 1: validate → open preview (no API call yet) ===
  function openPreview() {
    if (!campaignName.trim()) return toast.error("กรอกชื่อ campaign");
    if (!pageId) return toast.error("เลือก Facebook Page");
    const budgetRaw = budgetType === "daily" ? dailyBudgetThb : lifetimeBudgetThb;
    const budget = Number(budgetRaw);
    if (!Number.isFinite(budget) || budget < 20) {
      return toast.error(
        budgetType === "daily" ? "Budget ต่อวันขั้นต่ำ ฿20" : "Lifetime budget ขั้นต่ำ ฿20",
      );
    }
    if (budgetType === "lifetime" && (!scheduleStart || !scheduleEnd)) {
      return toast.error("Lifetime budget ต้องระบุ start + end");
    }
    if (creativeKind === "new_image" && !imageHash) return toast.error("อัพโหลด image ก่อน");
    if (creativeKind === "existing_post" && !postId) return toast.error("เลือก post");
    if (creativeKind === "new_image" && !linkUrl.trim()) return toast.error("กรอก URL");
    if (creativeKind === "new_image" && !primaryText.trim()) return toast.error("กรอกข้อความ");
    if (isConversionGoal && !pixelId) return toast.error("เลือก Pixel สำหรับ Conversion goal");
    if (isConversionGoal && eventSource === "standard" && !customEventType) {
      return toast.error("เลือก event ที่จะ optimize");
    }
    if (isConversionGoal && eventSource === "custom" && !customConversionId) {
      return toast.error("เลือก Custom Conversion");
    }
    setPreviewOpen(true);
  }

  // === Step 2: actual publish — called from preview modal ===
  async function publish(initialStatus: "PAUSED" | "ACTIVE") {
    const budgetRaw = budgetType === "daily" ? dailyBudgetThb : lifetimeBudgetThb;
    const budget = Number(budgetRaw);
    setSubmitting(true);
    setPreviewOpen(false);
    const toastId = toast.loading(
      initialStatus === "ACTIVE"
        ? "กำลังเผยแพร่ campaign..."
        : "กำลังบันทึก draft (PAUSED)...",
    );

    const adSetName = customAdSetName.trim() || `${campaignName} - Ad Set`;
    const adName = customAdName.trim() || `${campaignName} - Ad`;
    const body: Record<string, unknown> = {
      metaAccountId,
      campaignName: campaignName.trim(),
      objective,
      specialAdCategories: [specialAdCategory],
      budgetMode,
      adSetName,
      targeting,
      optimizationGoal,
      billingEvent: "IMPRESSIONS",
      adName,
      pageId,
      ...(isConversionGoal && {
        pixelId,
        ...(eventSource === "custom"
          ? { customConversionId }
          : { customEventType }),
      }),
      initialStatus,
      creative:
        creativeKind === "existing_post"
          ? { kind: "existing_post", postId }
          : {
              kind: "new_image",
              imageHash,
              primaryText: primaryText.trim(),
              headline: headline.trim() || undefined,
              description: description.trim() || undefined,
              linkUrl: linkUrl.trim(),
              callToAction,
            },
    };
    // budget: daily vs lifetime applies to either campaign (CBO) or ad set (ABO)
    const budgetField =
      budgetMode === "CBO"
        ? budgetType === "daily" ? "campaignDailyBudget" : "campaignLifetimeBudget"
        : budgetType === "daily" ? "adSetDailyBudget" : "adSetLifetimeBudget";
    body[budgetField] = budget;
    if (budgetType === "lifetime") {
      body.startTime = new Date(scheduleStart).toISOString();
      body.endTime = new Date(scheduleEnd).toISOString();
    }

    try {
      const res = await fetch(`/api/meta/campaigns/create?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const where = data.failedAt ? ` (${data.failedAt})` : "";
        throw new Error(`${data.error}${where}`);
      }
      const verb = initialStatus === "ACTIVE" ? "เผยแพร่" : "บันทึก draft";
      toast.success(`✓ ${verb} "${data.campaign.name}" สำเร็จ`, {
        id: toastId,
        duration: 4000,
      });
      localStorage.removeItem(draftKey);
      // Redirect with highlight so the new campaign is easy to find
      // among hundreds. The /campaigns page reads ?highlight=<id> and
      // scrolls + flashes the matching row.
      router.push(
        `/t/${tenantSlug}/campaigns?highlight=${data.campaign.internalId}`,
      );
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างไม่สำเร็จ", {
        id: toastId,
        duration: 8000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* === SIMPLE MODE === */}
      <Card className="space-y-3 p-5">
        <Field label="ชื่อ Campaign" required>
          <SmartNameField
            tenantSlug={tenantSlug}
            value={campaignName}
            onChange={setCampaignName}
            placeholder="เช่น Summer Sale 2026"
          />
        </Field>

        <Field label="วัตถุประสงค์" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OBJECTIVE_ORDER.map((key) => {
              const o = OBJECTIVE_TREE[key];
              const Icon = o.icon;
              const selected = objective === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setObjective(key)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">{o.label}</span>
                  <span className="text-[10px] text-muted-foreground">{o.sublabel}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="วิธีเพิ่มประสิทธิภาพ" required>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {OBJECTIVE_TREE[objective].subs.map((s) => {
              const selected = optimizationGoal === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setOptimizationGoal(s.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span className="text-xs font-medium">{s.label}</span>
                  {s.description && (
                    <span className="text-[10px] text-muted-foreground">{s.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </Field>

        {isConversionGoal && (
          <Field label="Pixel + Conversion" required>
            {loadingPixels ? (
              <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                กำลังโหลด Pixels...
              </div>
            ) : pixelOptions.length === 0 ? (
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
                ⚠ ไม่มี Pixel ใน Ad Account นี้ — ไปที่{" "}
                <a
                  href={`/t/${tenantSlug}/audiences`}
                  target="_blank"
                  rel="noopener"
                  className="font-medium underline"
                >
                  Audiences → tab Pixels
                </a>{" "}
                เพื่อสร้างก่อน
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">-- เลือก Pixel --</option>
                  {pixelOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <RadioPill
                    checked={eventSource === "standard"}
                    onClick={() => setEventSource("standard")}
                    label="Standard event"
                  />
                  <RadioPill
                    checked={eventSource === "custom"}
                    onClick={() => setEventSource("custom")}
                    label="Custom Conversion (URL rule)"
                  />
                </div>

                {eventSource === "standard" ? (
                  <select
                    value={customEventType}
                    onChange={(e) => setCustomEventType(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {PIXEL_EVENTS.map((ev) => (
                      <option key={ev.value} value={ev.value}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                ) : loadingConversions ? (
                  <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    กำลังโหลด Custom Conversions...
                  </div>
                ) : conversionOptions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠ ไม่มี Custom Conversion — สร้างที่{" "}
                    <a
                      href={`/t/${tenantSlug}/audiences`}
                      target="_blank"
                      rel="noopener"
                      className="font-medium underline"
                    >
                      Audiences → tab Custom Conversions
                    </a>
                  </div>
                ) : (
                  <select
                    value={customConversionId}
                    onChange={(e) => setCustomConversionId(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="">-- เลือก Custom Conversion --</option>
                    {conversionOptions
                      // Filter to those tied to the selected Pixel (or no pixel filter if pixel not picked yet)
                      .filter((c) => !pixelId || !c.pixelId || c.pixelId === pixelId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.customEventType && ` (${c.customEventType})`}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {eventSource === "custom"
                ? "Custom Conversion = map URL pattern → event โดยไม่ต้องเขียน event code บนเว็บ"
                : "Meta จะ optimize ส่งโฆษณาให้คนที่มีโอกาส trigger event นี้สูง — Pixel ต้องยิง event ~50/สัปดาห์ถึงจะ optimize ดี"}
            </p>
          </Field>
        )}

        <Field label="Budget" required>
          <div className="mb-2 flex gap-2">
            <RadioPill
              checked={budgetType === "daily"}
              onClick={() => setBudgetType("daily")}
              label="ต่อวัน"
            />
            <RadioPill
              checked={budgetType === "lifetime"}
              onClick={() => setBudgetType("lifetime")}
              label="ตลอดอายุ campaign"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min="20"
              value={budgetType === "daily" ? dailyBudgetThb : lifetimeBudgetThb}
              onChange={(e) =>
                budgetType === "daily"
                  ? setDailyBudgetThb(e.target.value)
                  : setLifetimeBudgetThb(e.target.value)
              }
              placeholder="฿"
            />
            {adAccounts.length === 1 ? (
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-2 text-xs text-muted-foreground">
                {adAccounts[0].name}
              </div>
            ) : (
              <select
                value={metaAccountId}
                onChange={(e) => setMetaAccountId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            )}
          </div>
          {budgetType === "lifetime" && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">เริ่ม</label>
                <DatePicker
                  value={scheduleStart}
                  onChange={setScheduleStart}
                  placeholder="เลือกวัน + เวลาเริ่ม"
                  min={new Date().toISOString().slice(0, 10)}
                  showTime
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">สิ้นสุด</label>
                <DatePicker
                  value={scheduleEnd}
                  onChange={setScheduleEnd}
                  placeholder="เลือกวัน + เวลาสิ้นสุด"
                  min={scheduleStart ? scheduleStart.slice(0, 10) : new Date().toISOString().slice(0, 10)}
                  showTime
                />
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground">
                ระบุวันและเวลาทั้ง 2 ช่อง — เวลาประเทศไทย (UTC+7)
              </p>
            </div>
          )}
        </Field>

        <Field label="Facebook Page" required>
          <div className="space-y-2">
            <PagePicker pages={pages} selectedId={pageId} onSelect={setPageId} />
            <button
              type="button"
              onClick={refreshPages}
              disabled={refreshingPages}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {refreshingPages ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  กำลัง sync Pages...
                </>
              ) : (
                <>↻ ดึง Pages ใหม่จาก Meta (ถ้าไม่เจอ Page ที่ต้องการ)</>
              )}
            </button>
          </div>
        </Field>
      </Card>

      {/* === CREATIVE === */}
      <Card className="space-y-3 p-5">
        <h3 className="border-b border-border pb-2 text-sm font-semibold">โฆษณา + รูป/โพสต์</h3>

        <Field label="แหล่งที่มาของโฆษณา">
          <div className="flex gap-2">
            <RadioPill
              checked={creativeKind === "new_image"}
              onClick={() => setCreativeKind("new_image")}
              label="📷 อัพโหลดรูปใหม่"
            />
            <RadioPill
              checked={creativeKind === "existing_post"}
              onClick={() => setCreativeKind("existing_post")}
              label="📝 ใช้โพสต์ที่มี"
            />
          </div>
        </Field>

        {creativeKind === "new_image" ? (
          <>
            <Field label="รูปภาพ" required>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-5 hover:bg-muted/20">
                {imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreviewUrl} alt="preview" className="max-h-40 rounded" />
                ) : (
                  <ImageIcon className="size-8 text-muted-foreground" />
                )}
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {uploadingImage ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> กำลังอัพโหลด...
                    </>
                  ) : imageHash ? (
                    <>✓ อัพโหลดแล้ว — กดเพื่อเปลี่ยน</>
                  ) : (
                    <>
                      <Upload className="size-3" /> เลือกไฟล์ JPG/PNG (≤ 8MB)
                    </>
                  )}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                  }}
                />
              </label>
            </Field>
            <Field label={`ข้อความโฆษณา (${primaryText.length}/125)`} required>
              <textarea
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value.slice(0, 125))}
                className="w-full rounded-md border border-border bg-background p-2 text-sm"
                rows={3}
                placeholder="ข้อความหลักที่จะแสดงเหนือรูปภาพ"
              />
            </Field>
            <Field label="ลิงก์ปลายทาง" required>
              <Input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com/landing"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                URL ที่ user จะไปเมื่อกดบนโฆษณา (จำเป็นสำหรับ image ad ที่มี Call to Action)
                — ถ้าไม่ต้องการ CTA ให้ใช้ &ldquo;ใช้โพสต์ที่มี&rdquo; โดยเลือก post ที่ไม่มี link
              </p>
            </Field>
          </>
        ) : (
          <Field label={`เลือกโพสต์ ${loadingPosts ? "(loading...)" : `(${pagePosts.length} โพสต์)`}`} required>
            <div className="space-y-2">
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                {loadingPosts ? (
                  <p className="p-3 text-xs text-muted-foreground">กำลังโหลด...</p>
                ) : postsError ? (
                  <div className="space-y-1 p-3 text-xs">
                    <p className="font-medium text-rose-600 dark:text-rose-300">
                      ⚠ ดึงโพสต์ไม่สำเร็จ
                    </p>
                    <p className="text-muted-foreground">{postsError}</p>
                  </div>
                ) : pagePosts.length === 0 ? (
                  <div className="space-y-1 p-3 text-xs">
                    <p className="font-medium">ไม่มี promotable post ใน Page นี้</p>
                    <p className="text-muted-foreground">
                      Meta คืน 0 โพสต์ — อาจเพราะ Page ยังไม่ได้โพสต์อะไร หรือ
                      โพสต์เก่ามาก (Meta จำกัด ~3 เดือนล่าสุด) ลองใส่ post ID ด้านล่าง
                    </p>
                  </div>
                ) : (
                  pagePosts.map((p) => {
                    const checked = postId === p.id;
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 px-3 py-2 text-xs hover:bg-muted/30",
                          checked && "bg-primary/5",
                        )}
                      >
                        <input
                          type="radio"
                          name="post"
                          checked={checked}
                          onChange={() => {
                            setPostId(p.id);
                            setManualPostId("");
                          }}
                          className="mt-1 size-3.5"
                        />
                        {p.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnailUrl} alt="" className="size-12 shrink-0 rounded object-cover" />
                        )}
                        <span className="line-clamp-2">{p.message || "(no text)"}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="rounded-md border border-dashed border-border p-2">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  หรือใส่ Post ID / URL ของ Facebook โพสต์โดยตรง
                </label>
                <Input
                  value={manualPostId}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setManualPostId(v);
                    // Accept 4 formats:
                    //   <pageid>_<postid>        canonical
                    //   <postid>                 digit-only, prepend pageId
                    //   pfbid...                 Facebook URL id; server will resolve
                    //   facebook.com/.../posts/<id>  extract id from URL
                    if (!v) {
                      setPostId("");
                      return;
                    }
                    const canonical = v.match(/(\d+)_(\d+)/);
                    if (canonical) {
                      setPostId(`${canonical[1]}_${canonical[2]}`);
                      return;
                    }
                    const pfbidMatch = v.match(/(pfbid[A-Za-z0-9]+)/);
                    if (pfbidMatch) {
                      setPostId(pfbidMatch[1]);
                      return;
                    }
                    const urlPostId = v.match(/posts\/(\d+)/);
                    if (urlPostId) {
                      setPostId(`${pageId}_${urlPostId[1]}`);
                      return;
                    }
                    if (/^\d+$/.test(v)) {
                      setPostId(`${pageId}_${v}`);
                      return;
                    }
                    setPostId("");
                  }}
                  placeholder="วาง URL หรือ Post ID (รองรับ pfbid... และ <pageid>_<postid>)"
                  className="h-8 text-xs"
                />
                {manualPostId && postId && (
                  <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-300">
                    ✓ จะใช้: <code className="break-all">{postId}</code>
                    {postId.startsWith("pfbid") && (
                      <span className="ml-1 text-muted-foreground">(server จะ resolve เป็น canonical ID ตอนสร้าง)</span>
                    )}
                  </p>
                )}
                {manualPostId && !postId && (
                  <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-300">
                    ⚠ จับ format ไม่ได้ — ลอง paste URL เต็มๆ หรือเลขล้วน
                  </p>
                )}
              </div>
            </div>
          </Field>
        )}
      </Card>

      {/* === ADVANCED (collapsed by default) === */}
      <Card className="p-0">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/30"
        >
          <span>
            ⚙️ ตัวเลือกขั้นสูง{" "}
            <span className="font-normal text-muted-foreground">
              (targeting / audience / headline / CTA / etc.)
            </span>
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 border-t border-border p-5">
            <Field label="ตำแหน่งที่ตั้ง">
              <GeoPicker
                tenantSlug={tenantSlug}
                targets={geoTargets}
                onChange={setGeoTargets}
              />
            </Field>
            <Field label="เพศ">
              <div className="flex gap-1.5">
                <RadioPill checked={gender === "all"} onClick={() => setGender("all")} label="ทุกเพศ" />
                <RadioPill checked={gender === "male"} onClick={() => setGender("male")} label="ชาย" />
                <RadioPill checked={gender === "female"} onClick={() => setGender("female")} label="หญิง" />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="อายุต่ำสุด">
                <Input type="number" min="20" max="65" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} />
              </Field>
              <Field label="อายุสูงสุด">
                <Input type="number" min="20" max="65" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} />
              </Field>
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              ⚠ Meta บังคับ <strong>age ≥ 20</strong> สำหรับโฆษณาที่ target ไทย — น้อยกว่านั้น Meta จะปฏิเสธ
            </p>

            <Field label="ความสนใจ (Interests)">
              <InterestPicker
                tenantSlug={tenantSlug}
                selected={selectedInterests}
                onChange={setSelectedInterests}
              />
            </Field>

            <Field
              label={`Custom Audience (${loadingAudiences ? "loading..." : `${audienceLibrary.length} ตัวใน account`})`}
            >
              <div className="max-h-32 overflow-y-auto rounded-md border border-border">
                {loadingAudiences ? (
                  <p className="p-3 text-xs text-muted-foreground">กำลังโหลด...</p>
                ) : audienceLibrary.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    ไม่มี — สร้างใน Meta Ads Manager หรือรอ Stage 4 (audience builder)
                  </p>
                ) : (
                  audienceLibrary.map((a) => {
                    const checked = selectedAudiences.some((s) => s.id === a.id);
                    return (
                      <label
                        key={a.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30",
                          checked && "bg-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedAudiences((prev) =>
                              checked ? prev.filter((s) => s.id !== a.id) : [...prev, a],
                            )
                          }
                          className="size-3.5"
                        />
                        <span className="truncate">{a.name}</span>
                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                          {a.subtype}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Budget mode">
                <div className="flex gap-2">
                  <RadioPill checked={budgetMode === "CBO"} onClick={() => setBudgetMode("CBO")} label="CBO" />
                  <RadioPill checked={budgetMode === "ABO"} onClick={() => setBudgetMode("ABO")} label="ABO" />
                </div>
              </Field>
              <Field label="Special Ad Category">
                <select
                  value={specialAdCategory}
                  onChange={(e) => setSpecialAdCategory(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="NONE">ไม่ใช่</option>
                  <option value="HOUSING">Housing</option>
                  <option value="EMPLOYMENT">Employment</option>
                  <option value="CREDIT">Credit</option>
                  <option value="ISSUES_ELECTIONS_POLITICS">Politics</option>
                </select>
              </Field>
            </div>

            {creativeKind === "new_image" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Headline (${headline.length}/40)`}>
                    <Input value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 40))} placeholder="หัวข้อสั้น" />
                  </Field>
                  <Field label={`Description (${description.length}/30)`}>
                    <Input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 30))} placeholder="คำอธิบาย" />
                  </Field>
                </div>
                <Field label="Call To Action">
                  <select
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {CTA_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ Ad Set (เว้นว่าง=auto)">
                <NameInputWithCounter
                  value={customAdSetName}
                  onChange={setCustomAdSetName}
                  placeholder={`${campaignName || "Campaign"} - Ad Set`}
                />
              </Field>
              <Field label="ชื่อ Ad (เว้นว่าง=auto)">
                <NameInputWithCounter
                  value={customAdName}
                  onChange={setCustomAdName}
                  placeholder={`${campaignName || "Campaign"} - Ad`}
                />
              </Field>
            </div>
          </div>
        )}
      </Card>

      {/* === SUBMIT === */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("ล้าง draft และเริ่มใหม่?")) {
              localStorage.removeItem(draftKey);
              window.location.reload();
            }
          }}
        >
          ล้าง draft
        </Button>
        <Button
          onClick={openPreview}
          disabled={submitting || !canEdit}
          className="min-w-[200px] gap-2"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              กำลังสร้าง...
            </>
          ) : (
            <>ดูตัวอย่างก่อนสร้าง →</>
          )}
        </Button>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <PreviewModal
          page={pages.find((p) => p.id === pageId) ?? null}
          campaignName={campaignName}
          objectiveLabel={OBJECTIVE_TREE[objective].label}
          subOptimizationLabel={
            OBJECTIVE_TREE[objective].subs.find((s) => s.value === optimizationGoal)?.label ??
            optimizationGoal
          }
          budgetType={budgetType}
          budgetThb={Number(budgetType === "daily" ? dailyBudgetThb : lifetimeBudgetThb)}
          geoTargets={geoTargets}
          ageMin={ageMin}
          ageMax={ageMax}
          gender={gender}
          creativeKind={creativeKind}
          imagePreviewUrl={imagePreviewUrl}
          primaryText={primaryText}
          headline={headline}
          linkUrl={linkUrl}
          callToAction={callToAction}
          interests={selectedInterests}
          existingPost={
            creativeKind === "existing_post"
              ? pagePosts.find((p) => p.id === postId) ?? null
              : null
          }
          submitting={submitting}
          onClose={() => setPreviewOpen(false)}
          onPublishDraft={() => publish("PAUSED")}
          onPublishActive={() => publish("ACTIVE")}
        />
      )}
    </div>
  );
}

// ---- Subcomponents ---------------------------------------------------

// ---- Preview Modal ----------------------------------------------------

function PreviewModal({
  page,
  campaignName,
  objectiveLabel,
  subOptimizationLabel,
  budgetType,
  budgetThb,
  geoTargets,
  ageMin,
  ageMax,
  gender,
  creativeKind,
  imagePreviewUrl,
  primaryText,
  headline,
  linkUrl,
  callToAction,
  interests,
  existingPost,
  submitting,
  onClose,
  onPublishDraft,
  onPublishActive,
}: {
  page: Page | null;
  campaignName: string;
  objectiveLabel: string;
  subOptimizationLabel: string;
  budgetType: "daily" | "lifetime";
  budgetThb: number;
  geoTargets: GeoTarget[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  creativeKind: "new_image" | "existing_post";
  imagePreviewUrl: string | null;
  primaryText: string;
  headline: string;
  linkUrl: string;
  callToAction: string;
  interests: Interest[];
  existingPost: { id: string; message: string; thumbnailUrl: string | null } | null;
  submitting: boolean;
  onClose: () => void;
  onPublishDraft: () => void;
  onPublishActive: () => void;
}) {
  const includedGeos = geoTargets.filter((g) => g.included);
  const excludedGeos = geoTargets.filter((g) => !g.included);
  const ctaLabel =
    CTA_OPTIONS.find((c) => c.value === callToAction)?.label ?? callToAction;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-[92vh] w-full max-w-4xl grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">ดูตัวอย่างก่อนสร้าง Campaign</h2>
            <p className="text-[11px] text-muted-foreground">
              ตรวจให้แน่ใจก่อนกดเผยแพร่ — Meta จะเริ่มคิดเงินทันทีถ้าเลือก ACTIVE
            </p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Body — split into ad preview + settings summary */}
        <div className="grid gap-0 overflow-hidden md:grid-cols-[1fr_1.1fr]">
          {/* Left: ad preview */}
          <div className="overflow-y-auto border-r border-border bg-muted/20 p-5">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              ตัวอย่างโฆษณา
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
              {/* Page header */}
              <div className="flex items-center gap-2 px-3 py-2">
                {page?.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.pictureUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {(page?.name ?? "?").charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{page?.name ?? "(no page)"}</p>
                  <p className="text-[10px] text-muted-foreground">Sponsored · 🌐</p>
                </div>
              </div>
              {/* Primary text — for new image OR existing post body */}
              {creativeKind === "new_image" && primaryText && (
                <p className="px-3 pb-2 text-xs leading-relaxed">
                  {truncateForPreview(primaryText, 240)}
                </p>
              )}
              {creativeKind === "existing_post" && existingPost?.message && (
                <p className="px-3 pb-2 text-xs leading-relaxed">
                  {truncateForPreview(existingPost.message, 240)}
                </p>
              )}
              {/* Image */}
              {creativeKind === "new_image" && imagePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreviewUrl} alt="" className="aspect-square w-full bg-muted object-cover" />
              ) : creativeKind === "existing_post" && existingPost?.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={existingPost.thumbnailUrl} alt="" className="aspect-square w-full bg-muted object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  {creativeKind === "existing_post" ? "(post นี้ไม่มีรูปภาพ)" : "(image)"}
                </div>
              )}
              {/* Footer CTA bar (only for new_image with link) */}
              {creativeKind === "new_image" && linkUrl && (
                <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {new URL(linkUrl || "https://x").hostname.replace(/^www\./, "")}
                    </p>
                    {headline && <p className="truncate text-xs font-semibold">{headline}</p>}
                  </div>
                  <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    {ctaLabel}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: settings summary */}
          <div className="overflow-y-auto p-5 text-sm">
            <SummaryRow label="Campaign name" value={campaignName} />
            <SummaryRow label="Objective" value={`${objectiveLabel} → ${subOptimizationLabel}`} />
            <SummaryRow
              label="Budget"
              value={`฿${budgetThb.toLocaleString("th-TH")}${budgetType === "daily" ? "/วัน" : " ตลอด lifetime"}`}
            />
            <SummaryRow
              label="Targeting"
              value={
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">รวม:</span>{" "}
                    {includedGeos.length > 0
                      ? includedGeos.map((g) => g.name).join(", ")
                      : "ทั้งโลก (ไม่ filter)"}
                  </div>
                  {excludedGeos.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">ไม่รวม:</span>{" "}
                      {excludedGeos.map((g) => g.name).join(", ")}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">อายุ:</span> {ageMin}-{ageMax} ·{" "}
                    <span className="text-muted-foreground">เพศ:</span>{" "}
                    {gender === "all" ? "ทุกเพศ" : gender === "male" ? "ชาย" : "หญิง"}
                  </div>
                  {interests.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">ความสนใจ:</span>{" "}
                      {interests.map((i) => i.name).join(", ")}
                    </div>
                  )}
                </div>
              }
            />
            <SummaryRow
              label="Creative"
              value={
                creativeKind === "new_image"
                  ? `Image + ${linkUrl ? "link" : "no link"}`
                  : "Existing post"
              }
            />
            <SummaryRow
              label="Page"
              value={page?.name ?? "—"}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            ← กลับไปแก้
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPublishDraft}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              บันทึก draft (PAUSED)
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    "เผยแพร่ทันที = Meta จะเริ่มคิดเงิน + เริ่ม run โฆษณาทันที — ยืนยัน?",
                  )
                ) {
                  onPublishActive();
                }
              }}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              🚀 เผยแพร่ทันที (ACTIVE)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Truncate text for the ad preview pane. We replace newlines with
 * spaces to keep the visual height predictable — CSS line-clamp on
 * `whitespace-pre-wrap` text was leaking the 7th line through the
 * clamp boundary because line-height didn't match.
 */
function truncateForPreview(text: string, maxLen: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return flat.slice(0, maxLen - 1).trimEnd() + "…";
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-border/50 py-2 last:border-b-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function PagePicker({
  pages,
  selectedId,
  onSelect,
}: {
  pages: Page[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (pages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        ไม่พบ Page — กดปุ่ม &ldquo;ดึง Pages ใหม่&rdquo; ด้านล่าง
      </p>
    );
  }

  // 1 page → just show it
  if (pages.length === 1) {
    const p = pages[0];
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <PageAvatar page={p} />
        <span className="truncate font-medium">{p.name}</span>
        {p.category && (
          <span className="ml-auto text-[11px] text-muted-foreground">{p.category}</span>
        )}
      </div>
    );
  }

  const selected = pages.find((p) => p.id === selectedId);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? pages.filter((p) => p.name.toLowerCase().includes(q))
    : pages;

  // Collapsed view: just the selected page + "Change" button
  if (!expanded && selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
        <PageAvatar page={selected} />
        <span className="truncate text-sm font-medium">{selected.name}</span>
        {selected.category && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {selected.category}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-2 shrink-0 text-[11px] text-primary hover:underline"
        >
          เปลี่ยน
        </button>
      </div>
    );
  }

  // Expanded picker — search + scrollable grid
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`ค้นหา Page (มี ${pages.length} Pages)...`}
          className="h-8 pl-7 text-xs"
          autoFocus
        />
        {selected && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="ยกเลิก"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            ไม่พบ &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
            {filtered.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setExpanded(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-left transition-colors",
                    isSelected ? "bg-primary/10" : "bg-background hover:bg-muted",
                  )}
                  title={p.name}
                >
                  <PageAvatar page={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{p.name}</span>
                    {p.category && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {p.category}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InterestPicker({
  tenantSlug,
  selected,
  onChange,
}: {
  tenantSlug: string;
  selected: Interest[];
  onChange: (next: Interest[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Interest[]>([]);
  const [loading, setLoading] = useState(false);
  // Meta "Suggestions" — related interests based on what user picked.
  const [suggestions, setSuggestions] = useState<Interest[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Debounced search via /api/meta/targeting-search?type=interest
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/meta/targeting-search?tenantSlug=${tenantSlug}&type=interest&q=${encodeURIComponent(q)}`,
      )
        .then((r) => r.json())
        .then((d) => setResults(d.matches ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [tenantSlug, query]);

  // Seeded suggestions — refetch when the selected set changes. Server
  // caches by sorted seed names so equivalent sets share results.
  useEffect(() => {
    if (selected.length === 0) {
      setSuggestions([]);
      return;
    }
    const seedsParam = selected.map((s) => s.name).join(",");
    setLoadingSuggestions(true);
    fetch(
      `/api/meta/targeting-search?tenantSlug=${tenantSlug}&type=interest-suggestion&seeds=${encodeURIComponent(seedsParam)}`,
    )
      .then((r) => r.json())
      .then((d) => setSuggestions(d.matches ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [tenantSlug, selected]);

  function add(i: Interest) {
    if (selected.some((s) => s.id === i.id)) return;
    onChange([...selected, i]);
    setQuery("");
    setResults([]);
  }
  function remove(id: string) {
    onChange(selected.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((i) => (
            <span
              key={i.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              title={i.path?.join(" > ")}
            >
              {i.name}
              {i.audienceSize && (
                <span className="text-[9px] opacity-70">
                  ~{(i.audienceSize / 1_000_000).toFixed(1)}M
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(i.id)}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาความสนใจ (เช่น 'fashion', 'cooking', 'gaming', 'travel')"
          className="h-8 pl-7 text-xs"
        />
      </div>
      {loading && <p className="text-[11px] text-muted-foreground">กำลังค้นหา...</p>}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border">
          {results
            .filter((r) => !selected.some((s) => s.id === r.id))
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => add(r)}
                className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-xs hover:bg-muted/30 last:border-b-0"
              >
                <span className="flex-1 truncate">
                  {r.name}
                  {r.path && r.path.length > 1 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      · {r.path.slice(0, -1).join(" > ")}
                    </span>
                  )}
                </span>
                {r.audienceSize && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    ~{(r.audienceSize / 1_000_000).toFixed(1)}M
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
      {/* Suggestions row — like Facebook Ads Manager "Suggestions" */}
      {selected.length > 0 && (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-2">
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            💡 ความสนใจที่เกี่ยวข้อง
            {loadingSuggestions && <Loader2 className="size-2.5 animate-spin" />}
          </p>
          {suggestions.length === 0 && !loadingSuggestions ? (
            <p className="text-[10px] text-muted-foreground">
              Meta ไม่มีคำแนะนำสำหรับชุดที่เลือก — ลองเพิ่ม interest อื่นเป็น seed
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {suggestions
                .filter((s) => !selected.some((sel) => sel.id === s.id))
                .slice(0, 15)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => add(s)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-0.5 text-xs hover:bg-primary/10"
                    title={s.path?.join(" > ")}
                  >
                    <span>+ {s.name}</span>
                    {s.audienceSize && (
                      <span className="text-[9px] text-muted-foreground">
                        ~{(s.audienceSize / 1_000_000).toFixed(1)}M
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {selected.length === 0 && query.length < 2 && (
        <p className="text-[10px] text-muted-foreground">
          ไม่ใส่ก็ได้ — Meta จะใช้ broad targeting (ทุกคนที่ตรง location + age + gender)
        </p>
      )}
    </div>
  );
}

function GeoPicker({
  tenantSlug,
  targets,
  onChange,
}: {
  tenantSlug: string;
  targets: GeoTarget[];
  onChange: (next: GeoTarget[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { key: string; name: string; type: string; countryName?: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      setLoading(true);
      fetch(`/api/meta/geo-search?tenantSlug=${tenantSlug}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(d.matches ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(id);
  }, [tenantSlug, query]);

  function addTarget(r: { key: string; name: string; type: string }, included: boolean) {
    if (targets.some((t) => t.key === r.key && t.included === included)) return;
    onChange([
      ...targets,
      { key: r.key, name: r.name, type: r.type as GeoTarget["type"], included },
    ]);
    setQuery("");
    setResults([]);
  }

  function removeTarget(key: string, included: boolean) {
    onChange(targets.filter((t) => !(t.key === key && t.included === included)));
  }

  return (
    <div className="space-y-2">
      {/* Current targets */}
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <span
              key={`${t.key}-${t.included}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                t.included
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
              )}
            >
              {t.included ? "+" : "−"} {t.name}
              <span className="text-[9px] uppercase opacity-60">{t.type}</span>
              <button
                type="button"
                onClick={() => removeTarget(t.key, t.included)}
                className="ml-0.5 hover:opacity-100 opacity-60"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา ประเทศ / จังหวัด / เมือง (เช่น 'Bangkok', 'เชียงใหม่', 'Asia')"
          className="h-8 pl-7 text-xs"
        />
      </div>
      {/* Results */}
      {loading && <p className="text-[11px] text-muted-foreground">กำลังค้นหา...</p>}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border">
          {results.map((r) => (
            <div
              key={r.key}
              className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5 text-xs last:border-b-0"
            >
              <span className="flex-1 truncate">
                {r.name}
                {r.countryName && r.type !== "country" && (
                  <span className="ml-1 text-muted-foreground">· {r.countryName}</span>
                )}
                <span className="ml-1 text-[9px] uppercase text-muted-foreground/70">
                  {r.type}
                </span>
              </span>
              <button
                type="button"
                onClick={() => addTarget(r, true)}
                className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                + รวม
              </button>
              <button
                type="button"
                onClick={() => addTarget(r, false)}
                className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
              >
                − ไม่รวม
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PageAvatar({ page }: { page: Page }) {
  if (page.pictureUrl) {
    return (
      // Use plain img — Meta CDN URLs aren't whitelisted in Next image config
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={page.pictureUrl}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
    );
  }
  // Fallback: initial letter
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
      {page.name.charAt(0).toUpperCase()}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function RadioPill({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

// Meta limit for Campaign/AdSet/Ad name is 400 chars; we mirror the
// counter UX from SmartNameField but without the template-matching
// machinery — used for the lighter-weight Ad Set / Ad name inputs.
const META_NAME_MAX_LITE = 400;

function NameInputWithCounter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const len = value.length;
  const nearLimit = len > META_NAME_MAX_LITE - 50;
  const overTruncate = len > 40;
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, META_NAME_MAX_LITE))}
        placeholder={placeholder}
        maxLength={META_NAME_MAX_LITE}
        className="pr-16"
      />
      <span
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] tabular-nums",
          nearLimit
            ? "text-rose-600 dark:text-rose-400"
            : overTruncate
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {len}/{META_NAME_MAX_LITE}
      </span>
    </div>
  );
}
