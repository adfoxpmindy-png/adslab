# AdsLab — Design System Reference

> Design north star: **[dub.co](https://dub.co)**
> Vibe: Premium • Clean • Data-forward • Professional but approachable

---

## 1. Design Principles

1. **Whitespace is a feature** — ห้ามแน่น ใช้ padding/margin เยอะ
2. **Data > Decoration** — ตัวเลข, dashboard, real data จับใจมากกว่ารูปประดับ
3. **Minimal motion, big impact** — animation นิดเดียวที่จุดสำคัญ ไม่ต้องเยอะ
4. **One accent color only** — สีเด่นมีตัวเดียว (teal/cyan) ที่เหลือเป็น grayscale
5. **Trust through clarity** — ข้อความตรง, ไม่ใช้ marketing fluff, แสดง product ของจริง

---

## 2. Color Palette

### Light Mode (default)
| ตำแหน่ง | สี | ค่า |
|---------|-----|-----|
| Background (page) | White / near-white | `#FFFFFF` |
| Background (subtle) | Off-white | `#FAFAFA` |
| Text (primary) | Near-black | `#0A0A0A` |
| Text (secondary) | Muted gray | `#52525B` |
| Border | Light gray | `#E4E4E7` |
| **Accent (primary)** | **Teal/Cyan** | **`#06B6D4`** (Tailwind cyan-500) |
| Accent (hover) | Darker teal | `#0891B2` (Tailwind cyan-600) |
| Success | Green | `#10B981` |
| Warning | Yellow/Amber | `#F59E0B` |
| Danger | Red | `#EF4444` |

### Dark Mode (toggle)
| ตำแหน่ง | สี | ค่า |
|---------|-----|-----|
| Background (page) | Near-black | `#0A0A0A` |
| Background (subtle) | Slightly lighter | `#18181B` |
| Text (primary) | Near-white | `#FAFAFA` |
| Text (secondary) | Muted | `#A1A1AA` |
| Border | Dark gray | `#27272A` |
| Accent | Same teal | `#06B6D4` |

> **กฎ:** ใช้ shadcn/ui CSS variables (`--background`, `--foreground`, `--primary`, ฯลฯ) เป็นหลัก — ค่าข้างบนคือ guideline สำหรับการ map

---

## 3. Typography

- **Font:** `Inter` (Google Fonts) เป็น default — modern sans-serif
- **Fallback:** `system-ui, -apple-system, sans-serif`
- **ภาษาไทย:** `IBM Plex Sans Thai` (ใช้คู่กับ Inter อ่านง่าย เข้ากับ Inter เพราะออกแบบโดยทีมเดียวกัน)

### Type Scale (Tailwind default)
| Class | Size | Use |
|-------|------|-----|
| `text-xs` | 12px | Labels, meta, badges |
| `text-sm` | 14px | Body secondary, captions |
| `text-base` | 16px | Body (default) |
| `text-lg` | 18px | Large body, lead paragraphs |
| `text-xl` | 20px | Small headings |
| `text-2xl` | 24px | Card titles |
| `text-3xl` | 30px | Section headings |
| `text-4xl` | 36px | Page hero |
| `text-5xl` | 48px | Marketing hero |
| `text-6xl` | 60px | Big marketing hero |

### Weights
- `font-normal` (400) — body
- `font-medium` (500) — emphasized body, buttons
- `font-semibold` (600) — headings
- `font-bold` (700) — sparingly, only for big numbers in dashboards

---

## 4. Spacing & Layout

- **Section gap:** 64-96px ระหว่าง major sections (`py-16` ถึง `py-24`)
- **Container max-width:** 1200px (`max-w-6xl`) สำหรับ marketing pages, 1440px (`max-w-screen-2xl`) สำหรับ dashboard
- **Card padding:** 24px (`p-6`) ภายในเสมอ
- **Element gap:** 8/12/16/24px (`gap-2`, `gap-3`, `gap-4`, `gap-6`) — ไม่ใช้ค่าระหว่าง

---

## 5. Components

### Buttons (shadcn/ui)
- **Primary:** solid teal/cyan, white text, `rounded-md` (6px)
- **Secondary:** outline gray, dark text
- **Ghost:** ไม่มี border, hover เป็น `bg-muted`
- **Size:** `h-9` (default), `h-10` (cta), `h-8` (small)

### Cards
- **Border:** 1px ของ `border` color
- **Radius:** `rounded-lg` (8px)
- **Shadow:** flat (no shadow) หรือ `shadow-sm` มาก่อน อย่าใส่ shadow ใหญ่
- **Padding:** 24px inside

### Inputs (shadcn/ui)
- **Height:** 40px (`h-10`)
- **Border:** 1px gray, focus เป็น cyan
- **Radius:** `rounded-md` (6px)

### Data Display (สำคัญสำหรับ dashboard)
- **Big numbers:** `text-3xl font-bold` หรือใหญ่กว่า
- **Number labels:** `text-sm text-muted-foreground uppercase tracking-wide`
- **Delta indicators:** สีเขียวสำหรับ +, แดงสำหรับ -, มี arrow icon
- **KPI cards:** white bg, border, ตัวเลขใหญ่กลาง, label เล็กบน, delta เล็กล่าง

### Navigation
- **Sidebar:** 240px width, ฝั่งซ้าย, white/dark bg, ไม่มี shadow
- **Topbar:** 56-64px height, มี logo, tenant switcher, theme toggle, avatar
- **Mobile:** sidebar กลายเป็น hamburger drawer

---

## 6. Iconography

- **Library:** `lucide-react` (ติดตั้งแล้วจาก shadcn)
- **Style:** Line-based, stroke 2px
- **Size:** default 16px (`size-4`), 20px (`size-5`) สำหรับ touch targets
- **Color:** inherit จาก parent text color เป็นหลัก

---

## 7. Motion

- **Default transition:** `transition-colors duration-150` สำหรับ hover
- **Slide/fade:** ใช้ `tw-animate-css` (ติดตั้งแล้ว) ที่ shadcn ติดมาด้วย
- **กฎ:** อย่าใส่ animation บนทุกอย่าง — เก็บไว้สำหรับจุดที่ delight matter (เช่น toast, modal, KPI card hover)

---

## 8. Anti-Patterns (เลี่ยง)

- ❌ ใช้สี accent หลายตัวพร้อมกัน (เช่น cyan + purple + pink) — เลือกตัวเดียว
- ❌ Shadow ใหญ่หนา (`shadow-2xl`) — ทำให้ดูเก่า
- ❌ Border radius เกิน 12px (ยกเว้น avatar/badge ที่ใช้ `rounded-full`)
- ❌ Gradient รุนแรง (rainbow, sunset) — ใช้แค่ subtle ถ้าจำเป็น
- ❌ Stock photo — ใช้ product screenshot จริง, illustration ลายเส้น, หรือ data visualization แทน
- ❌ Marketing fluff (เช่น "Revolutionary!", "Game-changing!") — บอกตัวเลขและประโยชน์ที่จับต้องได้

---

## 9. ตัวอย่าง Component พื้นฐาน (Mental Models)

### KPI Card
```
┌─────────────────────────────┐
│ TOTAL SPEND  (text-sm gray) │
│                             │
│ ฿284,720    (text-3xl bold) │
│                             │
│ ↑ 12.4% vs last week (green)│
└─────────────────────────────┘
```

### Dashboard Section
```
┌──────────────────────────────────────┐
│ Daily Performance      [date picker] │
│ ───────────────────────────────────  │
│ [KPI] [KPI] [KPI] [KPI]              │
│                                      │
│ [─── chart ───────────────]          │
│                                      │
└──────────────────────────────────────┘
```

---

## 10. References

- **Primary inspiration:** https://dub.co
- **Component library:** https://ui.shadcn.com
- **Icons:** https://lucide.dev
- **Charts (future):** Recharts or Tremor
- **Fonts:** https://fonts.google.com/specimen/Inter, https://fonts.google.com/specimen/IBM+Plex+Sans+Thai
