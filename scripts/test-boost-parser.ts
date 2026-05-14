/**
 * Smoke test boost-parser against:
 *   1. The founder's exact real prompt (no KPI/purpose — expect nulls)
 *   2. Variant with explicit KPI ("ให้ได้ 50,000 views")
 *   3. Variant with total budget
 *   4. Variant with purpose ("เพื่อ launch product")
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { parseBoostPrompt } from "../src/lib/ai/boost-parser";

const PROMPTS = [
  {
    label: "Real client request (no KPI/purpose)",
    text: `บูสต์วีดีโอให้หน่อยครัย เป็น Views โพสละ 1250 บาท ให้จบพรุ่งนี้ 10.00 น.

https://www.facebook.com/share/v/1AtdSLKovS/
https://www.facebook.com/reel/2046794962859921
https://www.facebook.com/reel/1002568998876934
https://www.facebook.com/reel/994832796325634`,
  },
  {
    label: "Explicit KPI + purpose",
    text: `บูสต์ reel นี้ให้ผมหน่อย งบ 5000 ทั้งหมด ให้ได้ 30,000 views อย่างต่ำ
ทำเพื่อ launch สินค้าใหม่ ให้จบ 20 พค 5 ทุ่ม
https://facebook.com/reel/2046794962859921`,
  },
  {
    label: "Engagement objective + CPV cap",
    text: `บูสต์ engagement โพสนี้ CPV ไม่เกิน 0.5 บาท งบ 3000 ภายในวันนี้ 23:59
https://facebook.com/reel/1002568998876934`,
  },
  {
    label: "Ambiguous (no objective, no time)",
    text: `ช่วย boost ให้หน่อย 2000
https://facebook.com/reel/994832796325634`,
  },
];

async function main() {
  for (const p of PROMPTS) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`▸ ${p.label}`);
    console.log("=".repeat(70));
    console.log(`Input:\n${p.text.split("\n").map((l) => "  " + l).join("\n")}\n`);

    const result = await parseBoostPrompt(p.text);
    if (!result.ok) {
      console.log(`✗ Failed: ${result.error}`);
      if (result.rawJson) console.log(`  Raw: ${result.rawJson.slice(0, 200)}`);
      continue;
    }
    console.log(`✓ Parsed:`);
    console.log(`  budgetMode:       ${result.intent.budgetMode}`);
    console.log(`  budgetThb:        ${result.intent.budgetThb}`);
    console.log(`  objectiveHint:    ${result.intent.objectiveHint}`);
    console.log(`  scheduleStartIso: ${result.intent.scheduleStartIso}`);
    console.log(`  scheduleEndIso:   ${result.intent.scheduleEndIso}`);
    console.log(`  kpi:              ${result.intent.kpi ? JSON.stringify(result.intent.kpi) : "null"}`);
    console.log(`  purpose:          ${result.intent.purpose ?? "null"}`);
    console.log(`  assumptions:      ${JSON.stringify(result.intent.assumptions)}`);
    console.log(`  notes:            ${result.intent.notes}`);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
