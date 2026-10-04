import { ImageResponse } from "next/og";

import { getPublishedPlaybookBySlug } from "@/server/queries/playbooks";
import { formatEvidenceHeadline, formatEvidenceSampleSize, toOutcomeStats } from "@/lib/stats/format";

/**
 * The OG image: the title, and the evidence line beneath it.
 *
 * The evidence line is rendered by the *same* formatter the cards use, so a
 * percentage cannot appear on a share image at 9 reports when it would not
 * appear on the page. That is the whole reason this is a component rather than
 * a designer-made PNG: a static social card goes stale the moment a report
 * lands, and a stale one keeps claiming whatever it claimed when it was made.
 *
 * No star rating, no score out of five. Same reason as the JSON-LD.
 */
export const alt = "Playbook title and evidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#faf9f6",
            color: "#1c1b19",
            fontSize: 48,
          }}
        >
          Playbook not found
        </div>
      ),
      size,
    );
  }

  const stats = toOutcomeStats(playbook);
  const headline = formatEvidenceHeadline(stats);
  const sample = formatEvidenceSampleSize(stats);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#faf9f6",
          color: "#1c1b19",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 28, color: "#6b675f" }}>A Playbook Hunt playbook</div>
          <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.1 }}>
            {playbook.title}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 36, color: "#16a34a", fontWeight: 600 }}>
            {headline}
            {sample ? ` ${sample}` : ""}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#6b675f" }}>
            {playbook.category.name} · {playbook.promise.slice(0, 120)}
          </div>
        </div>
      </div>
    ),
    size,
  );
}