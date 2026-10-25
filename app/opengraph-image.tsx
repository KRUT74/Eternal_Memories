import { ImageResponse } from "next/og"
import { SITE_DESCRIPTION } from "@/lib/site"

export const alt = "Eternal Memories: an AI companion that remembers, shown as a constellation of stars"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// A fixed little constellation: each star is a memory, gold ones shaped the last reply.
const STARS = [
  { x: 760, y: 170, r: 9, color: "#f2c46d" },
  { x: 880, y: 250, r: 7, color: "#8a93b0" },
  { x: 1010, y: 190, r: 10, color: "#f2c46d" },
  { x: 950, y: 360, r: 8, color: "#6fc3b8" },
  { x: 1080, y: 420, r: 7, color: "#8a93b0" },
  { x: 820, y: 440, r: 9, color: "#f2c46d" },
]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "radial-gradient(900px 500px at 80% 0%, #18234a 0%, #0b1020 65%)",
          color: "#e7e9f0",
          fontFamily: "serif",
        }}
      >
        <svg width="1200" height="630" style={{ position: "absolute", inset: 0 }}>
          {STARS.slice(1).map((s, i) => (
            <line key={i} x1={STARS[i].x} y1={STARS[i].y} x2={s.x} y2={s.y} stroke="#2e3b63" strokeWidth="3" />
          ))}
          {STARS.map((s, i) => (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={s.r * 3} fill={s.color} opacity="0.18" />
              <circle cx={s.x} cy={s.y} r={s.r} fill={s.color} />
            </g>
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 700 }}>
          <div style={{ fontSize: 30, color: "#f2c46d", letterSpacing: 4, fontFamily: "monospace" }}>ETERNAL MEMORIES</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 24 }}>Every conversation leaves a star.</div>
          <div style={{ fontSize: 28, lineHeight: 1.4, marginTop: 28, color: "#9aa2b9", fontFamily: "sans-serif" }}>
            {`${SITE_DESCRIPTION.split(". Built")[0]}.`}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
