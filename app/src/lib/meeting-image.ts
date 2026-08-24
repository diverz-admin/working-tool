import { BRIEF_TONE, wonExact, type BriefStat, type BriefProgress } from "@/lib/meeting-brief";

/**
 * 회의록 요약을 PNG 한 장으로 그린다. 카카오톡으로 넘기기 위한 것이다.
 *
 * 왜 캔버스로 직접 그리나 —
 * 화면을 그대로 캡처하면(html2canvas 류) 회의록 편집 UI가 통째로 딸려온다.
 * 입력창 테두리·버튼·접힘 화살표는 받는 사람에게 아무 의미가 없고, 세로로 길어져
 * 카톡 미리보기에서 글씨가 뭉갠다. 공유용은 화면과 다른 물건이라 따로 그린다.
 *
 * 담는 것: 팀·회의 이름 / 매출현황(수치·KPI 달성·월별 추이) /
 *          축별 지난 기간·이번 기간·다음 기간 / 기타 메모.
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
  /** 지난 기간 (전주 / 전월) */
  prev: string;
  /** 이번 기간 현황 (금주 / 당월) */
  current: string;
  /** 다음 기간 계획 (차주 / 익월) */
  next: string;
}

/** 올해 월별 매출 추이 */
export interface MeetingImageTrend {
  year: number;
  /** 1월부터 12월까지. 실적이 없는 달은 0 */
  values: number[];
  /** 진하게 칠할 달 (1~12) */
  highlight: number;
}

export interface MeetingImageInput {
  team: string;
  /** "8월 3주차 주간회의" */
  title: string;
  /** "2026년 · 캠페인 시작일 기준" 같은 부연 */
  caption: string;
  prevLabel: string;
  nowLabel: string;
  nextLabel: string;
  stats: BriefStat[];
  /** 목표 대비 진척. KPI가 없으면 null */
  kpi: BriefProgress | null;
  /** 월별 추이. 집계를 못 받았으면 null */
  trend: MeetingImageTrend | null;
  axes: MeetingImageAxis[];
  memo: string;
}

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

/** 그리기 명령 하나. 높이를 먼저 재야 캔버스 크기를 정할 수 있어 2단계로 나눈다. */
type Op = { h: number; draw: (ctx: CanvasRenderingContext2D, y: number) => void };

function textOp(ctx: CanvasRenderingContext2D, text: string, f: string, color: string, lh: number): Op {
  const lines = wrap(ctx, text, INNER, f);
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

/** 캔버스에는 둥근 사각형이 없다. 막대 끝을 둥글게 하려면 경로를 직접 그려야 한다. */
function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y,     x + w, y + h, rr);
  c.arcTo(x + w, y + h, x,     y + h, rr);
  c.arcTo(x,     y + h, x,     y,     rr);
  c.arcTo(x,     y,     x + w, y,     rr);
  c.closePath();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundRectPath(c, x, y, w, h, r);
  c.fill();
}

/**
 * 목표 대비 어디까지 왔는지 막대 하나로.
 * 숫자만 늘어놓으면 33%가 많은 건지 적은 건지 한눈에 안 온다. 남은 칸이 그걸 대신 말해준다.
 */
function kpiOp(p: BriefProgress): Op {
  const done = p.rate >= 100;
  const fill = done ? BRIEF_TONE.forecast.fg : BRIEF_TONE.actual.fg;
  const barY = 34, barH = 20;
  return {
    h: barY + barH + 34,
    draw: (c, y) => {
      c.font = font(700, 21);
      c.fillStyle = COLOR.muted;
      c.fillText(`KPI 달성 · ${p.label}`, PAD, y + 20);

      c.font = font(800, 25);
      c.fillStyle = fill;
      c.textAlign = "right";
      c.fillText(`${Math.round(p.rate)}%`, PAD + INNER, y + 21);
      c.textAlign = "left";

      c.fillStyle = COLOR.line;
      roundRect(c, PAD, y + barY, INNER, barH, barH / 2);
      // 100%를 넘어도 막대는 끝까지만 찬다. 아주 적은 값도 점처럼은 보이게 최소 폭을 준다.
      const w = Math.min(1, Math.max(0, p.rate / 100)) * INNER;
      if (w > 0) {
        c.fillStyle = fill;
        roundRect(c, PAD, y + barY, Math.max(w, barH), barH, barH / 2);
      }

      c.font = font(500, 19);
      c.fillStyle = COLOR.faint;
      c.fillText(p.remaining > 0 ? `목표까지 ${wonExact(p.remaining)}` : "목표 달성", PAD, y + barY + barH + 24);
    },
  };
}

/**
 * 올해 월별 매출 막대.
 *
 * 막대 위에 금액을 적지 않는다. 열두 칸에 들어갈 만큼 줄이려면 만원 단위로 끊어야 하는데,
 * 그러면 위 자동 집계와 자릿수가 어긋나 어느 쪽이 맞는지 헷갈린다.
 * 그래프는 흐름만 보여주고 정확한 금액은 위 세 칸이 맡는다. 축척은 최고액 한 줄로 밝힌다.
 */
function trendOp(t: MeetingImageTrend): Op | null {
  const max = Math.max(...t.values);
  if (!(max > 0)) return null;   // 실적이 하나도 없으면 빈 격자만 남는다

  const titleH = 34, chartH = 150, labelH = 32;
  const slot = INNER / 12;
  const barW = Math.round(slot * 0.54);
  const peak = t.values.indexOf(max) + 1;

  return {
    h: titleH + chartH + labelH,
    draw: (c, y) => {
      c.font = font(700, 21);
      c.fillStyle = COLOR.muted;
      c.fillText(`월별 매출 · ${t.year}년`, PAD, y + 20);

      c.font = font(500, 19);
      c.fillStyle = COLOR.faint;
      c.textAlign = "right";
      c.fillText(`최고 ${wonExact(max)} · ${peak}월`, PAD + INNER, y + 20);
      c.textAlign = "left";

      const base = y + titleH + chartH;
      c.fillStyle = COLOR.line;
      c.fillRect(PAD, base, INNER, 1);

      t.values.forEach((v, i) => {
        const m = i + 1;
        const on = m === t.highlight;
        const x = PAD + slot * i + (slot - barW) / 2;
        // 실적이 없는 달도 자리는 남긴다 — 빈칸이 곧 "그 달은 없었다"는 정보다
        const h = v > 0 ? Math.max(4, Math.round((v / max) * (chartH - 8))) : 3;
        c.fillStyle = v > 0 ? (on ? BRIEF_TONE.actual.fg : "#C7DBF2") : COLOR.line;
        roundRect(c, x, base - h, barW, h, 5);

        c.font = font(on ? 800 : 500, 19);
        c.fillStyle = on ? COLOR.ink : COLOR.faint;
        c.textAlign = "center";
        c.fillText(String(m), PAD + slot * i + slot / 2, base + 24);
        c.textAlign = "left";
      });
    },
  };
}

/**
 * 축 안의 한 칸 — "금주" 같은 머리말 + 본문을 카드 하나로 묶는다.
 *
 * 화면 편집 UI에서는 전주·금주·차주가 각각 테두리 있는 칸(Field)으로 나뉘어 있어
 * 어디까지가 한 기간인지 눈에 바로 들어온다. 이전 버전은 라벨+본문을 그냥 위아래로
 * 이어 붙였는데, 그러면 기간 경계가 문단 구분과 구별이 안 갔다. 배경과 테두리로
 * 박스를 둘러 화면과 같은 방식으로 구분한다.
 */
function partOp(ctx: CanvasRenderingContext2D, label: string, body: string): Op | null {
  if (!body.trim()) return null;
  const padX = 24, padTop = 18, padBottom = 20, labelH = 30, bodyLH = 36;
  const bodyFont = font(500, 24);
  const lines = wrap(ctx, body.trim(), INNER - padX * 2, bodyFont);
  const h = padTop + labelH + lines.length * bodyLH + padBottom;
  return {
    h,
    draw: (c, y) => {
      c.fillStyle = COLOR.soft;
      roundRect(c, PAD, y, INNER, h, 14);
      c.strokeStyle = COLOR.line;
      c.lineWidth = 1;
      roundRectPath(c, PAD + 0.5, y + 0.5, INNER - 1, h - 1, 14);
      c.stroke();

      c.font = font(700, 19);
      c.fillStyle = COLOR.muted;
      c.fillText(label, PAD + padX, y + padTop + 18);

      c.font = bodyFont;
      c.fillStyle = COLOR.body;
      lines.forEach((ln, i) => c.fillText(ln, PAD + padX, y + padTop + labelH + bodyLH * (i + 0.72)));
    },
  };
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
    "매출현황 기타 논의 메모 KPI 달성 목표까지 월별 매출 최고 년 월 원 DIVERZ Work",
    ...input.stats.flatMap(s => [s.label, s.value, s.sub ?? ""]),
    input.prevLabel, input.nowLabel, input.nextLabel,
    ...input.axes.flatMap(a => [a.label, a.prev, a.current, a.next]),
    input.kpi ? `${input.kpi.label}${wonExact(input.kpi.remaining)}` : "",
    input.trend ? String(input.trend.year) + input.trend.values.map(wonExact).join("") : "",
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

  const trend = input.trend ? trendOp(input.trend) : null;
  if (input.stats.length || input.kpi || trend) {
    ops.push(
      rule(), gap(24),
      textOp(measure, "매출현황", font(800, 29), COLOR.ink, 40),
      gap(14),
    );
    if (input.stats.length) ops.push(statsOp(measure, input.stats), gap(24));
    if (input.kpi)          ops.push(kpiOp(input.kpi), gap(20));
    if (trend)              ops.push(trend, gap(8));
    ops.push(gap(12));
  }

  for (const axis of input.axes) {
    const parts = [
      partOp(measure, input.prevLabel, axis.prev),
      partOp(measure, input.nowLabel, axis.current),
      partOp(measure, `${input.nextLabel} 계획`, axis.next),
    ].filter((p): p is Op => p !== null);
    if (!parts.length) continue;   // 빈 축은 카드에 싣지 않는다
    ops.push(
      rule(), gap(24),
      textOp(measure, axis.label, font(800, 29), COLOR.ink, 40),
      gap(14),
    );
    parts.forEach((p, i) => { ops.push(p); if (i < parts.length - 1) ops.push(gap(14)); });
    ops.push(gap(20));
  }

  if (input.memo.trim()) {
    ops.push(
      rule(), gap(24),
      textOp(measure, "기타 논의 · 메모", font(800, 29), COLOR.ink, 40),
      gap(14),
      textOp(measure, input.memo.trim(), font(500, 25), COLOR.body, 38),
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
