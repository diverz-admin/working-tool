import { BRIEF_TONE, type BriefStat } from "@/lib/meeting-brief";

/**
 * 회의록 요약을 PNG 한 장으로 그린다. 카카오톡으로 넘기기 위한 것이다.
 *
 * 왜 캔버스로 직접 그리나 —
 * 화면을 그대로 캡처하면(html2canvas 류) 회의록 편집 UI가 통째로 딸려온다.
 * 입력창 테두리·버튼·접힘 화살표는 받는 사람에게 아무 의미가 없고, 세로로 길어져
 * 카톡 미리보기에서 글씨가 뭉갠다. 공유용은 화면과 다른 물건이라 따로 그린다.
 *
 * 담는 것: 팀·회의 이름 / 자동 집계 세 수치 / 축별 이번 기간·다음 기간 / 기타 메모.
 * 빼는 것: 지난 기간 칸. 직전 회의에서 넘어온 기록이라 공유 카드에서는 중복이다.
 */

// 카카오톡 채팅방 미리보기에서 뭉개지지 않는 가로폭
const W = 1080;
const PAD = 64;
const SCALE = 2;          // 레티나·고DPI 화면에서 글씨가 흐려지지 않게
const INNER = W - PAD * 2;

const COLOR = {
  ink:   "#191F28",
  body:  "#333D4B",
  muted: "#6B7684",
  faint: "#8B95A1",
  line:  "#E5E8EB",
  soft:  "#F7F8FA",
  bg:    "#FFFFFF",
};

const FONT = `"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`;
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

export interface MeetingImageAxis {
  label: string;
  /** 이번 기간 현황 (금주 / 당월) */
  current: string;
  /** 다음 기간 계획 (차주 / 익월) */
  next: string;
}

export interface MeetingImageInput {
  team: string;
  /** "8월 3주차 주간회의" */
  title: string;
  /** "2026년 · 캠페인 시작일 기준" 같은 부연 */
  caption: string;
  nowLabel: string;
  nextLabel: string;
  stats: BriefStat[];
  axes: MeetingImageAxis[];
  memo: string;
}

/** 한 축에서 칸마다 잘라내는 줄 수. 넘치면 …로 끊는다 — 공유 카드는 요약이지 회의록 전문이 아니다. */
const MAX_LINES = 6;

/** 캔버스에는 자동 줄바꿈이 없다. 글자 폭을 재서 직접 끊는다. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, f: string): string[] {
  ctx.font = f;
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    // 한국어는 공백 없이 이어지는 구간이 길어 단어 단위로만 끊으면 넘친다. 글자 단위로 내려간다.
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxW && line) { out.push(line); line = ch; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}

function clamp(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  cut[max - 1] = `${cut[max - 1].slice(0, -1)}…`;
  return cut;
}

/** 그리기 명령 하나. 높이를 먼저 재야 캔버스 크기를 정할 수 있어 2단계로 나눈다. */
type Op = { h: number; draw: (ctx: CanvasRenderingContext2D, y: number) => void };

function textOp(ctx: CanvasRenderingContext2D, text: string, f: string, color: string, lh: number, maxLines?: number): Op {
  const lines = maxLines ? clamp(wrap(ctx, text, INNER, f), maxLines) : wrap(ctx, text, INNER, f);
  return {
    h: lines.length * lh,
    draw: (c, y) => {
      c.font = f;
      c.fillStyle = color;
      lines.forEach((ln, i) => c.fillText(ln, PAD, y + lh * (i + 0.75)));
    },
  };
}

const gap = (h: number): Op => ({ h, draw: () => {} });

const rule = (): Op => ({
  h: 1,
  draw: (c, y) => { c.fillStyle = COLOR.line; c.fillRect(PAD, y, INNER, 1); },
});

/** 자동 집계 세 칸을 가로로 나눠 그린다. 라벨은 지표 색, 금액은 크고 검게. */
function statsOp(ctx: CanvasRenderingContext2D, stats: BriefStat[]): Op {
  const colW = INNER / stats.length;
  return {
    h: 108,
    draw: (c, y) => {
      c.fillStyle = COLOR.soft;
      c.fillRect(PAD, y, INNER, 108);
      stats.forEach((s, i) => {
        const x = PAD + colW * i + 20;
        c.font = font(700, 21);
        c.fillStyle = BRIEF_TONE[s.tone].fg;
        c.fillText(s.label, x, y + 34);
        c.font = font(800, 32);
        c.fillStyle = s.dim ? COLOR.faint : COLOR.ink;
        c.fillText(s.value, x, y + 72);
        if (s.sub) {
          c.font = font(500, 19);
          c.fillStyle = COLOR.faint;
          c.fillText(s.sub, x, y + 97);
        }
      });
    },
  };
}

/** 축 안의 한 칸 — "금주" 같은 머리말 + 본문 */
function partOps(ctx: CanvasRenderingContext2D, label: string, body: string): Op[] {
  if (!body.trim()) return [];
  return [
    textOp(ctx, label, font(700, 20), COLOR.muted, 28),
    gap(4),
    textOp(ctx, body.trim(), font(500, 25), COLOR.body, 38, MAX_LINES),
    gap(16),
  ];
}

export async function renderMeetingImage(input: MeetingImageInput): Promise<Blob> {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("캔버스를 쓸 수 없습니다.");

  /**
   * 서체를 먼저 받아야 한다.
   * Pretendard는 자모 구간별 서브셋이라 브라우저가 "쓰인 글자"를 알아야 해당 파일을 받는다.
   * 이걸 건너뛰면 폭을 시스템 폰트로 재고 나서 그릴 때 서체가 바뀌어 줄이 어긋난다.
   */
  const allText = [
    input.team, input.title, input.caption, input.memo,
    ...input.stats.flatMap(s => [s.label, s.value, s.sub ?? ""]),
    ...input.axes.flatMap(a => [a.label, a.current, a.next]),
  ].join(" ");
  try {
    await Promise.all([400, 500, 700, 800].map(w => document.fonts.load(font(w, 32), allText)));
  } catch { /* 서체를 못 받아도 폴백으로 그린다 — 카드가 안 나오는 것보다 낫다 */ }

  const ops: Op[] = [
    gap(PAD),
    textOp(measure, input.team, font(700, 22), COLOR.muted, 30),
    gap(6),
    textOp(measure, input.title, font(800, 44), COLOR.ink, 56),
    gap(6),
    textOp(measure, input.caption, font(500, 20), COLOR.faint, 28),
    gap(28),
  ];

  if (input.stats.length) ops.push(statsOp(measure, input.stats), gap(36));

  for (const axis of input.axes) {
    const parts = [
      ...partOps(measure, input.nowLabel, axis.current),
      ...partOps(measure, `${input.nextLabel} 계획`, axis.next),
    ];
    if (!parts.length) continue;   // 빈 축은 카드에 싣지 않는다
    ops.push(
      rule(), gap(24),
      textOp(measure, axis.label, font(800, 29), COLOR.ink, 40),
      gap(14),
      ...parts,
      gap(12),
    );
  }

  if (input.memo.trim()) {
    ops.push(
      rule(), gap(24),
      textOp(measure, "기타 논의 · 메모", font(800, 29), COLOR.ink, 40),
      gap(14),
      textOp(measure, input.memo.trim(), font(500, 25), COLOR.body, 38, MAX_LINES),
      gap(12),
    );
  }

  ops.push(gap(20), textOp(measure, "DIVERZ Work", font(700, 19), COLOR.faint, 26), gap(PAD));

  const H = Math.ceil(ops.reduce((sum, o) => sum + o.h, 0));

  const canvas = document.createElement("canvas");
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 쓸 수 없습니다.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);

  let y = 0;
  for (const op of ops) { op.draw(ctx, y); y += op.h; }

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했습니다."))), "image/png");
  });
}
