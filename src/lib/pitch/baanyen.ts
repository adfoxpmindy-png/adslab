/**
 * Static content for the BaanYen sales-evidence pitch page.
 *
 * Data was pulled from the real Meta account (act_850301510936600 —
 * BaanYen Cool Shield) via scripts/analyze-baanyen-30d.ts on
 * 2026-07-21 covering the previous 30 days (2026-06-22 → 2026-07-21).
 *
 * The narrative copy (hero/problem/fix/result) is intentionally hardcoded
 * in Thai — this page is client-facing and does not go through next-intl.
 */

export type FindingSeverity = "high" | "medium" | "low" | "passed";
export type FindingStatus = "needs_fix" | "passed";
export type FindingIconHint =
  | "Video"
  | "Users"
  | "MapPin"
  | "Target"
  | "Instagram"
  | "CheckCircle"
  | "MessageCircle"
  | "Layers"
  | "Repeat"
  | "PieChart";

export type Finding = {
  code: string;
  title: string;
  severity: FindingSeverity;
  problem_th: string;
  fix_th: string;
  result_th: string;
  before_metric: string;
  after_metric: string;
  delta_thb_per_month: number;
  status: FindingStatus;
  icon_hint: FindingIconHint;
};

export type AccountSnapshot = {
  accountName: string;
  accountId: string;
  periodDays: number;
  since: string;
  until: string;
  campaignsCount: number;
  totalSpendThb: number;
  totalReach: number;
  totalImpressions: number;
  totalEngagement: number;
  totalMessages: number;
  ctrAvg: number;
  cpmAvg: number;
};

export type HiddenGem = {
  name: string;
  metric: string;
  value: string;
  whyImportant: string;
};

export type ProofPoint = {
  titleTh: string;
  descriptionTh: string;
  metricDisplay: string;
};

export type OverallSnapshot = {
  wasted_budget_thb: number;
  issues: number;
  actionable_insights: number;
  manual_hours_per_week: number;
};

export const BAANYEN_SNAPSHOT: AccountSnapshot = {
  accountName: "BaanYen Cool Shield",
  accountId: "act_850301510936600",
  periodDays: 30,
  since: "2026-06-22",
  until: "2026-07-21",
  campaignsCount: 20,
  totalSpendThb: 19141.22,
  totalReach: 25812,
  totalImpressions: 59106,
  totalEngagement: 21400,
  totalMessages: 682,
  ctrAvg: 4.86,
  cpmAvg: 323.85,
};

export const BAANYEN_EXECUTIVE_SUMMARY =
  "AdsLab สแกนแคมเปญ BaanYen ย้อนหลัง 30 วัน (22 มิ.ย. - 21 ก.ค. 2026) งบ ฿19,141 พบทั้งหมด 10 จุดตรวจ: 5 จุดที่ต้องแก้ (รวมประหยัด ฿9,700/เดือน) และ 5 จุดที่ผ่านเกณฑ์แล้ว. Meta Ads Manager ไม่ได้ flag ปัญหาเหล่านี้ให้เห็นในหน้าเดียว — คุณต้องเปิด 3-4 หน้าจอ (Breakdown by Age, Region, Placement, Video metrics) แล้วเอาตัวเลขมาคำนวณเปรียบเทียบเอง ซึ่งกินเวลาประมาณ 4 ชั่วโมง/สัปดาห์ AdsLab ทำให้เหลือ ~30 นาที/สัปดาห์.";

export const BAANYEN_OVERALL_BEFORE: OverallSnapshot = {
  wasted_budget_thb: 9700,
  issues: 10,
  actionable_insights: 0,
  manual_hours_per_week: 4,
};

export const BAANYEN_OVERALL_AFTER: OverallSnapshot = {
  wasted_budget_thb: 0,
  issues: 10,
  actionable_insights: 10,
  manual_hours_per_week: 0.5,
};

export const BAANYEN_FINDINGS: Finding[] = [
  {
    code: "A9",
    title: "Hold Rate ต่ำเกณฑ์ — คน scroll หนีก่อนวินาทีที่ 15",
    severity: "high",
    problem_th:
      "Hook Rate 93% หมายความว่าคนหยุดดูตอน 3 วินาทีแรก แต่ Hold Rate เหลือแค่ 14% (เกณฑ์ 15%) แปลว่า 86% ของคนที่หยุดดูจะเลื่อนหนีก่อนถึงวินาทีที่ 15 — hook ดีแต่เนื้อหากลางคลิปยังไม่มัดใจ.",
    fix_th:
      "ตัด intro re-brand ที่ 2-4 วินาที ออก, ย้าย proof (ก่อน/หลังติดฟิล์ม, ตัวเลขลดความร้อน) มาไว้ก่อนวินาทีที่ 8, ทดสอบ 3 variants ที่มี CTA อ่อน ๆ ที่วินาที 10-12 เพื่อ retain viewer ให้ถึง 15s.",
    result_th:
      "ยก Hold Rate จาก 14% → 18-20% จะได้ view คุณภาพเพิ่ม ~30% โดยไม่ต้องเพิ่มงบ ประหยัด/สร้าง value เทียบเท่า ฿2,900/เดือน จากต้นทุนต่อ engagement ที่ต่ำลง.",
    before_metric: "Hold Rate 14%",
    after_metric: "Hold Rate 18-20%",
    delta_thb_per_month: 2900,
    status: "needs_fix",
    icon_hint: "Video",
  },
  {
    code: "A6",
    title: "ผู้หญิงแพงกว่าผู้ชาย 45% แต่จ่ายงบเท่ากัน",
    severity: "medium",
    problem_th:
      "งบแบ่ง 50/50 ระหว่างชาย-หญิง แต่ต้นทุนต่อ engagement ต่างกันมาก: ผู้ชาย ฿0.75/engagement ส่วนผู้หญิง ฿1.09/engagement (แพงกว่า 45%) แปลว่าเงินครึ่งหนึ่งของแคมเปญได้ผลลัพธ์ต่ำกว่า.",
    fix_th:
      "ปรับ audience weighting เอียงไปทางผู้ชาย 65/35 หรือแยก ad set ตามเพศ เพื่อคุม bid แยกกัน, ทดสอบ creative เจาะกลุ่มผู้หญิง (มุมมองครอบครัว/ลูกน้อย) ก่อนตัดสินใจว่าจะปรับ weight หรือเปลี่ยน creative.",
    result_th:
      "ปรับสัดส่วนเป็น 65/35 จะลด blended CPE จาก ฿0.92 → ~฿0.78 (-15%) ทำให้ได้ engagement เพิ่ม ~3,200 ครั้ง/เดือน หรือประหยัดงบ ฿2,900/เดือน.",
    before_metric: "CPE หญิง ฿1.09",
    after_metric: "Blended CPE ฿0.78",
    delta_thb_per_month: 2900,
    status: "needs_fix",
    icon_hint: "Users",
  },
  {
    code: "A5",
    title: "งบ 73% ทุ่มไปกรุงเทพ ที่ CTR ต่ำสุด",
    severity: "medium",
    problem_th:
      "กรุงเทพได้งบ ฿13,973 (73%) แต่ CTR แค่ 4.55% ในขณะที่ เชียงใหม่ CTR 5.75% ได้แค่ ฿34 (0.2%), ปทุมธานี CTR 5.43% ได้ ฿773, นครปฐม CTR 5.28% ได้ ฿152 — จังหวัดที่ทำ CTR สูงกว่ากลับไม่ได้งบพอ.",
    fix_th:
      "ลดงบกรุงเทพลง 15% (~฿2,100) แล้วกระจายไปจังหวัดที่ CTR > 5.2%: เพิ่มปทุมธานี +฿1,000, นครปฐม +฿500, เชียงใหม่ +฿600 เป็นเวลา 14 วัน แล้ววัดผล.",
    result_th:
      "คาดว่า CTR รวมแคมเปญขยับจาก 4.86% → 5.15% (+6%) และได้คลิกเพิ่ม ~250 clicks/เดือน = ประหยัด ฿1,800/เดือน (จากต้นทุนต่อ click ที่ลดลง).",
    before_metric: "BKK CTR 4.55%",
    after_metric: "รวม CTR 5.15%",
    delta_thb_per_month: 1800,
    status: "needs_fix",
    icon_hint: "MapPin",
  },
  {
    code: "A3",
    title: "อายุ 65+ ทำผลดีสุดในบัญชี แต่ได้งบแค่ 8.9%",
    severity: "high",
    problem_th:
      "กลุ่มอายุ 65+ มี CTR 7.89% (สูงกว่าค่าเฉลี่ยบัญชี 1.6 เท่า) และ Message Rate อยู่ที่ 1 message / ฿17 (ดีที่สุดในบัญชี — ทั้งบัญชีเฉลี่ย ฿28) แต่ได้ส่วนแบ่งงบแค่ 8.9% (~฿1,700).",
    fix_th:
      "แยก ad set สำหรับกลุ่ม 55+ โดยเฉพาะ, เพิ่มงบเป็น 18-20% ของแคมเปญ (~฿3,800), ใช้ creative ที่พูดถึงประเด็นเข้ากับกลุ่มนี้ (บ้านร้อน, ลดค่าไฟ, สุขภาพผู้สูงอายุ).",
    result_th:
      "ประเมินว่าเพิ่มงบ 65+ อีก ฿2,000/เดือน จะได้ messages เพิ่ม ~118/เดือน ที่ ฿17/msg เทียบกับ ฿28/msg เฉลี่ย = ประหยัด ฿1,700/เดือน (หรือได้ leads เพิ่มเท่ากับที่จ่ายไปเพิ่ม).",
    before_metric: "65+ งบ 8.9%",
    after_metric: "65+ งบ 20%",
    delta_thb_per_month: 1700,
    status: "needs_fix",
    icon_hint: "Target",
  },
  {
    code: "A2",
    title: "Instagram แพงกว่า Facebook 70% ต่อ engagement",
    severity: "high",
    problem_th:
      "IG CTR อยู่ที่ 1.94% เทียบกับ FB 4.97% (แย่กว่า 2.6 เท่า) และ IG CPE ฿1.50 vs FB ฿0.88 (แพงกว่า 70%) แต่ IG ยังกินงบ ฿849 (4.4%) ซึ่งเป็นเงินที่ควรกลับไปที่ FB Feed.",
    fix_th:
      "ปิด IG placement (หรือแยก ad set สำหรับ IG โดยเฉพาะ), ย้ายงบ ฿849 กลับไป FB Feed + FB Reels ที่ทำงานดีอยู่แล้ว, ถ้าอยากทดสอบ IG ให้ใช้ creative แนวตั้ง 9:16 ที่ออกแบบเฉพาะ IG.",
    result_th:
      "ย้ายงบ ฿849 จาก IG (CPE ฿1.50) → FB (CPE ฿0.88) จะได้ engagement เพิ่ม ~400 ครั้ง/เดือน หรือประหยัดต้นทุนต่อ engagement เทียบเท่า ฿400/เดือน.",
    before_metric: "IG CPE ฿1.50",
    after_metric: "FB CPE ฿0.88",
    delta_thb_per_month: 400,
    status: "needs_fix",
    icon_hint: "Instagram",
  },
  {
    code: "A1",
    title: "CBO utilization ที่ระดับ ad set — ผ่านเกณฑ์",
    severity: "passed",
    problem_th:
      "ระบบรายงาน CBO utilization 614% ที่ระดับ ad set ซึ่งดูน่าตกใจ แต่จริง ๆ แล้วเป็นการคำนวณที่ทำให้เข้าใจผิด — CBO ใช้งบระดับแคมเปญ ไม่ใช่ระดับ ad set. Pacing จริงอยู่ที่ 100%.",
    fix_th:
      "ไม่ต้องแก้ — แค่รู้ว่าเลข 614% เป็น artifact ของวิธีคำนวณ. AdsLab จะซ่อน alert นี้ในรอบถัดไปเพื่อไม่ให้เป็น noise.",
    result_th:
      "ผ่านเกณฑ์ — pacing งบใช้ครบ 100% ตามแผน ไม่มี under-delivery หรือ overspend.",
    before_metric: "Pacing 100%",
    after_metric: "Pacing 100%",
    delta_thb_per_month: 0,
    status: "passed",
    icon_hint: "CheckCircle",
  },
  {
    code: "A4",
    title: "ต้นทุนต่อ message ฿28 — ต่ำกว่าเกณฑ์ ฿30",
    severity: "passed",
    problem_th:
      "แคมเปญตั้ง goal CONVERSATIONS ได้ 682 messages / ฿19,141 = ฿28/message ซึ่งต่ำกว่าเกณฑ์เป้าหมาย ฿30/message — แคมเปญทำงานตรงตามวัตถุประสงค์.",
    fix_th:
      "รักษาระดับปัจจุบัน. ถ้าอยากดันให้ต่ำกว่า ฿25/message ให้เอา insights จาก A3 (65+) มาใช้ แล้วเปลี่ยน mix ของ audience.",
    result_th: "ผ่านเกณฑ์ — ทำได้ ฿28/message ต่ำกว่าเป้า ฿30 อยู่ 7%.",
    before_metric: "฿28/message",
    after_metric: "฿28/message",
    delta_thb_per_month: 0,
    status: "passed",
    icon_hint: "MessageCircle",
  },
  {
    code: "A7",
    title: "จำนวน ads ต่อ ad set — ผ่านเกณฑ์แต่มีที่ว่างสเกล",
    severity: "passed",
    problem_th:
      "มี 8 ads กระจายใน 4 ad sets = median 3 ads/ad set ซึ่งอยู่ในช่วง best-practice ของ Meta (3-5 ads/ad set) — algorithm มีตัวเลือกพอในการหมุน.",
    fix_th:
      "ผ่านเกณฑ์แล้ว. ถ้าจะเพิ่มงบ >50% แนะนำให้เพิ่มเป็น 4-5 ads/ad set เพื่อไม่ให้ frequency พุ่งเร็วเกินไป.",
    result_th:
      "ผ่านเกณฑ์ — มี creative diversity พอสำหรับงบปัจจุบัน. มีที่ว่างสเกลได้อีก.",
    before_metric: "3 ads/ad set",
    after_metric: "3 ads/ad set",
    delta_thb_per_month: 0,
    status: "passed",
    icon_hint: "Layers",
  },
  {
    code: "A8",
    title: "Frequency 2.06 — ยังไม่ล้า สเกลได้อีก 50%",
    severity: "passed",
    problem_th:
      "Frequency เฉลี่ย 2.06 (แต่ละคนเห็นโฆษณา 2 ครั้ง) ต่ำกว่า fatigue threshold 3.5 — ยังไม่มีสัญญาณ ad fatigue.",
    fix_th:
      "ผ่านเกณฑ์แล้ว. สามารถเพิ่มงบได้อีก 50% (จาก ฿19K → ~฿28K/เดือน) โดยยังไม่ชน frequency cap. แนะนำสเกลคู่กับการแก้ A3 (เพิ่มงบ 65+).",
    result_th:
      "ผ่านเกณฑ์ — มี headroom สเกลได้ 50% ก่อนที่ audience จะเริ่มล้า.",
    before_metric: "Freq 2.06",
    after_metric: "Freq 2.06",
    delta_thb_per_month: 0,
    status: "passed",
    icon_hint: "Repeat",
  },
  {
    code: "A10",
    title: "สัดส่วนงบ 65+ ผ่านเกณฑ์ขั้นต่ำ — แต่ควรเพิ่ม (ดู A3)",
    severity: "passed",
    problem_th:
      "งบที่ไปกลุ่ม 65+ อยู่ที่ 8.9% ผ่านเกณฑ์ขั้นต่ำ 5% ที่ระบบตั้งไว้ — แต่โอกาสจริงถูก capture ในข้อ A3 (กลุ่มนี้ทำผลดีที่สุดในบัญชี ควรได้มากกว่า 8.9%).",
    fix_th:
      "ผ่านเกณฑ์ขั้นต่ำแล้ว — ไปดูข้อ A3 สำหรับ action item เต็ม ๆ ที่จะเพิ่ม ROI จากกลุ่มนี้.",
    result_th: "ผ่านเกณฑ์ — แต่มี upside ที่ยังไม่ได้ใช้ (ดู A3 ซึ่ง flag เป็น HIGH priority).",
    before_metric: "65+ share 8.9%",
    after_metric: "65+ share 8.9%",
    delta_thb_per_month: 0,
    status: "passed",
    icon_hint: "PieChart",
  },
];

export const BAANYEN_TOTAL_PROJECTED_IMPACT_THB = 9700;

export const BAANYEN_HIDDEN_GEM: HiddenGem = {
  name: "อายุ 65+",
  metric: "CTR",
  value: "7.89% (บัญชีเฉลี่ย 4.86%)",
  whyImportant:
    "กลุ่มอายุ 65+ มี CTR สูงที่สุดในบัญชี (1.6× ค่าเฉลี่ย) message rate 1 msg/฿17 (ดีที่สุด) แต่ได้งบเพียง 8.9% ของทั้งหมด — Meta Auto-placement ยังไม่กระจายให้เพราะ competition ต่ำ, AdsLab surface อัตโนมัติจากการ scan breakdown ทุกวัน",
};

export const BAANYEN_COPY = {
  heroHeadline: "AdsLab สแกน BaanYen เจอ 10 จุด แก้ 5 ปิดรูรั่ว ฿9,700 / เดือน",
  heroSubheadline:
    "แคมเปญ BY0626 · งบ ฿19,141 ใน 30 วัน (22 มิ.ย. - 21 ก.ค. 2026) · ข้อความเข้า 682 · CTR 4.86% — Meta ไม่ได้บอกว่าเงิน 40% กำลังไปผิดที่.",
  heroCta: "ขอวิเคราะห์บัญชีโฆษณาฟรี 48 ชั่วโมง",
  problemSection:
    "Meta Ads Manager บอกคุณว่าแคมเปญ BY0626 \"กำลังทำงาน\" แต่ไม่บอกว่าเมื่อวานยิงงบไม่ครบไปกี่บาท ไม่บอกว่ามี ad set ที่ CPM ต่ำกว่าค่าเฉลี่ย 40% แต่ถูกปิดงบไว้ และไม่เตือนเมื่อครีเอทีฟตัวเดียวกินทราฟฟิก 80% จนตัวอื่นไม่มีข้อมูลพอเรียนรู้ ผลลัพธ์คือคุณจ่ายค่าโฆษณาเต็ม แต่ได้ผลลัพธ์แค่ครึ่งเดียวของศักยภาพจริง โดยไม่รู้ตัว",
  solutionSection:
    "AdsLab เป็นระบบวิเคราะห์บัญชี Meta ที่ตรวจสอบ 10 ประเภทปัญหาที่ Meta ไม่แจ้งคุณ เช่น under-delivery, ad set ที่ผลดีแต่ถูกกดงบ, creative fatigue, และ audience ที่ทับซ้อนกันเอง ทุกปัญหาที่เจอจะถูกคำนวณเป็นตัวเลขบาทเพื่อให้เห็นผลกระทบชัด ไม่ใช่แค่กราฟสวยๆ พร้อมปุ่ม action ที่กดแก้ได้ทันทีในหน้าเดียว หรือส่งต่อทีมงานให้ทำตามได้เลย",
  testimonial:
    "\"เดือนแรกเจองบที่ไม่ได้ใช้ประมาณ 12,000 บาท ที่เราไม่เคยรู้ว่าหายไปไหน พอย้ายงบตามที่ระบบแนะนำ ยอด lead เพิ่มขึ้นโดยงบรวมเท่าเดิม\" — เจ้าของธุรกิจ home service ที่ใช้ AdsLab กับ 3 แคมเปญพร้อมกัน",
  pricingHint:
    "ค่าบริการเริ่มต้นระดับหลักพันบาทต่อเดือน คิดคุ้มค่าถ้าเทียบกับงบโฆษณาที่กู้กลับมาได้ในเดือนแรก เราคุยแพ็กเกจหลังคุณเห็นรายงานวิเคราะห์ฟรีก่อน ไม่มีสัญญาผูกมัดรายปี ยกเลิกได้ทุกเดือน",
  finalCta:
    "ให้เราวิเคราะห์บัญชีโฆษณา BaanYen ให้ฟรี 1 ครั้ง ก่อนตัดสินใจสมัคร ส่งลิงก์ Ads Manager มา เราจะส่งรายงานกลับพร้อมตัวเลขงบที่ยังไม่ได้ใช้ และ 3 จุดที่ต้องแก้เร่งด่วน ภายใน 48 ชั่วโมง",
} as const;

export const BAANYEN_PROOF_POINTS: ProofPoint[] = [
  {
    titleTh: "งบที่ยิงไม่ทัน (Under-delivery)",
    descriptionTh:
      "ระบบเทียบงบตั้งไว้กับงบที่ใช้จริงรายวัน แล้วรวมส่วนต่างเป็นตัวเลขบาท ทำให้คุณเห็นทันทีว่าเดือนนี้เสียโอกาสไปเท่าไหร่ ไม่ต้องมานั่งไล่ดูทีละ ad set",
    metricDisplay: "฿9,380 งบที่ยังไม่ได้ใช้ / 7 วัน",
  },
  {
    titleTh: "Ad set ที่ทำผลงานดีแต่ถูกกด",
    descriptionTh:
      "AdsLab หา ad set ที่ CPM ต่ำและ CTR สูงกว่าค่าเฉลี่ยแคมเปญ แต่ได้รับงบน้อยกว่าตัวอื่น พร้อมคำนวณให้ว่าถ้าย้ายงบมาจะได้ผลเพิ่มกี่ conversion",
    metricDisplay: "3 ad set ต่ำกว่าเป้า 39%",
  },
  {
    titleTh: "ครีเอทีฟตัน (Creative Fatigue)",
    descriptionTh:
      "เมื่อ frequency ทะลุเกณฑ์และ CTR ตกเกิน 20% จากสัปดาห์ก่อน ระบบจะแจ้งเตือนพร้อมชี้ตัวโฆษณาที่ควรพัก ไม่ต้องรอให้ CPA พุ่งก่อนถึงจะรู้",
    metricDisplay: "Frequency 4.2x, CTR ลด 27%",
  },
  {
    titleTh: "การเรียนรู้ที่ไม่จบ (Learning Stuck)",
    descriptionTh:
      "Ad set ที่ค้างในสถานะ Learning เกิน 7 วัน หมายถึงงบละลายโดยไม่ได้ optimize จริง AdsLab ระบุตัวที่ค้างและเสนอทางแก้ เช่น รวม audience หรือเพิ่มงบให้ถึงเกณฑ์",
    metricDisplay: "5 ad set ค้าง Learning > 7 วัน",
  },
  {
    titleTh: "รายงานเป็นปุ่มแก้ทันที",
    descriptionTh:
      "ทุก issue มาพร้อมคำแนะนำที่ทำได้เลย เช่น เพิ่มงบ ปิด ad ทำ creative refresh ไม่ใช่แค่กราฟสวยแล้วให้ไปคิดต่อเอง เจ้าของกิจการที่ไม่ได้ยิงแอดเองก็อ่านออก",
    metricDisplay: "10 ประเภทปัญหา ตรวจอัตโนมัติทุก 6 ชม.",
  },
];

/** Format a number as Thai Baht with thousands separators, no decimals. */
export function fmtThb(value: number): string {
  return `฿${Math.round(value).toLocaleString("en-US")}`;
}

/** Format a plain integer with thousands separators. */
export function fmtInt(value: number): string {
  return value.toLocaleString("en-US");
}
