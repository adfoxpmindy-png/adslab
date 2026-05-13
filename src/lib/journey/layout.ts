import type { JourneyEdge, JourneyNode } from "./types";

/**
 * Radial / archipelago layout — conversion islands sit at the center,
 * posts orbit around each one in a circular arrangement. Multiple
 * conversion islands are spread horizontally so each gets its own
 * "continent".
 *
 * This gives the user the Tower-War vibe: a goal island in the middle,
 * supporting islands radiating outward, beams flowing inward toward
 * the prize.
 *
 * dagre's strict-rank LR layout collapses fan-in shapes (50 posts → 1
 * conversion) into a single stacked column — useless. Hand-rolled
 * polar positioning sidesteps that entirely.
 */

type Positioned = { id: string; x: number; y: number };

const CONTINENT_W = 1000; // horizontal width per conversion island's world
const POST_RADIUS_MIN = 240; // closest orbit
const POST_RADIUS_STEP = 90; // grow per ring when posts > 12
const POST_PER_RING = 12;

export function layoutGraph(
  nodes: JourneyNode[],
  edges: JourneyEdge[],
): Positioned[] {
  // Index nodes by id for quick lookup
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Group posts by their target conversion id (via edges)
  const postsByConversion = new Map<string, JourneyNode[]>();
  const orphanPosts: JourneyNode[] = [];

  for (const e of edges) {
    const target = byId.get(e.target);
    const source = byId.get(e.source);
    if (!target || !source) continue;
    if (target.kind !== "conversion") continue;
    if (source.kind !== "post" && source.kind !== "brand") continue;
    const arr = postsByConversion.get(target.id) ?? [];
    arr.push(source);
    postsByConversion.set(target.id, arr);
  }

  // Find conversions in node list (and posts that aren't pointing at one)
  const conversions = nodes.filter((n) => n.kind === "conversion");
  const referencedSourceIds = new Set<string>();
  for (const arr of postsByConversion.values()) {
    for (const p of arr) referencedSourceIds.add(p.id);
  }
  for (const n of nodes) {
    if (
      (n.kind === "post" || n.kind === "brand") &&
      !referencedSourceIds.has(n.id)
    ) {
      orphanPosts.push(n);
    }
  }

  const positions: Positioned[] = [];

  // 1) Place each conversion island at a continent center, spread
  //    horizontally with even spacing.
  const continentCount = Math.max(conversions.length, 1);
  conversions.forEach((conv, idx) => {
    const x = idx * CONTINENT_W;
    const y = 0;
    positions.push({ id: conv.id, x, y });

    // 2) Orbit posts around this conversion in concentric rings.
    const orbiters = postsByConversion.get(conv.id) ?? [];
    orbiters.forEach((post, postIdx) => {
      const ring = Math.floor(postIdx / POST_PER_RING);
      const slot = postIdx % POST_PER_RING;
      const radius = POST_RADIUS_MIN + ring * POST_RADIUS_STEP;
      // Stagger rings so posts in inner ring don't perfectly hide outer.
      const angleOffset = ring * (Math.PI / POST_PER_RING);
      const slotsInThisRing = Math.min(POST_PER_RING, orbiters.length - ring * POST_PER_RING);
      const angle = (slot / slotsInThisRing) * Math.PI * 2 + angleOffset;
      positions.push({
        id: post.id,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      });
    });
  });

  // 3) Place orphan posts in a row beneath the continents.
  orphanPosts.forEach((p, idx) => {
    positions.push({
      id: p.id,
      x: (idx % 8) * 220 - 200,
      y: 500 + Math.floor(idx / 8) * 140,
    });
  });

  // Center each entire node by subtracting half-size so React Flow's
  // top-left positioning matches what we computed as the node's center.
  const SIZE: Record<string, { w: number; h: number }> = {
    post: { w: 200, h: 110 },
    brand: { w: 130, h: 130 },
    conversion: { w: 240, h: 240 },
    campaign: { w: 180, h: 90 },
  };
  return positions.map((p) => {
    const node = byId.get(p.id);
    const size = SIZE[node?.kind ?? "post"] ?? { w: 200, h: 110 };
    return { id: p.id, x: p.x - size.w / 2, y: p.y - size.h / 2 };
  });
}
