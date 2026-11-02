"use client";

/**
 * 회의록 ④ 프로젝트 일정 — 끝나는 캠페인이 곧 연장 영업 대상이다.
 *
 *   숫자 줄       — 운영중 · 이번 주 종료 · 연장 확정 · 다음 주 종료 · 지난주 연장률
 *   이번 주 종료  — 한 건씩 협의 전 / 협의중 / 연장 / 종료를 고른다. 누르는 즉시 저장
 *   다음 주 종료  — 미리 연장 제안할 건. 상태는 같은 방식
 *   지난주 종료   — 같은 광고주에 이어지는 프로젝트가 있는지로 자동 판정
 *   간트          — 회의 주 월요일부터 월말까지, 종료일 순. 막대 색 = 담당자
 */

import { useState, useEffect, useRef } from "react";
import { fetchJson, saveErrorMessage } from "@/lib/fetch-json";
import {
  C, TONE, SectionCard, Panel, KpiRow, Flag, Empty, Avatar, personColor,
  addDays, daysBetween, md, DOW, man, ymd,
  type BoardContext, type Tone,
} from "./shared";

// ─── 타입 ─────────────────────────────────────────────────────
const STATUSES = ["협의 전", "협의중", "연장", "종료"] as const;
type RenewalStatus = (typeof STATUSES)[number];

interface Campaign {
  id: string; name: string; client: string | null; person: string | null;
  start: string | null; end: string | null; type: string | null; amount: number;
}
interface Ending extends Campaign { status: RenewalStatus | null }
interface Ended extends Campaign { renewal: { id: string; name: string; start: string; end: string | null } | null }
interface Range { from: string; to: string }

interface ScheduleData {
  asOf: string; weekStart: string; monthEnd: string; renewalsAvailable: boolean;
  ranges: { thisWeek: Range; nextWeek: Range; lastWeek: Range };
  active: Campaign[]; thisWeek: Ending[]; nextWeek: Ending[]; lastWeek: Ended[];
}

const KEEP: React.CSSProperties = { wordBreak: "keep-all" };
const sumAmt = (list: Campaign[]) => list.reduce((s, a) => s + (a.amount || 0), 0);
const range = (r: Range) => `${md(r.from)} – ${md(r.to)}`;
const dow = (iso: string) => DOW[new Date(`${iso}T00:00:00`).getDay()];

// ─── 본문 ─────────────────────────────────────────────────────
export default function ScheduleSection({ ctx, onBadge }: { ctx: BoardContext; onBadge?: (text: string) => void }) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string[]>([]);

  // 다시 불러오기 버튼이 올리는 번호 — 회의가 바뀌면 이전 응답은 버린다
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey(k => k + 1);

  useEffect(() => {
    let stale = false;
    const q = new URLSearchParams({ year: String(ctx.year), month: String(ctx.month), asOf: ctx.asOf, weekStart: ctx.weekStart });
    fetchJson<ScheduleData>(`/api/meeting-board/schedule?${q}`).then(
      next => { if (!stale) { setData(next); setError(null); } },
      e => { if (!stale) setError(e instanceof Error ? e.message : "프로젝트 일정을 불러오지 못했습니다."); },
    );
    return () => { stale = true; };
  }, [ctx.year, ctx.month, ctx.asOf, ctx.weekStart, reloadKey]);

  useEffect(() => {
    if (data) onBadge?.(`종료 ${data.thisWeek.length}건`);
  }, [data, onBadge]);

  // 저장이 겹쳐도 마지막으로 누른 값이 화면에 남도록 요청 순번을 둔다
  const seq = useRef<Record<string, number>>({});

  async function setStatus(id: string, next: RenewalStatus | null) {
    if (!data) return;
    const prev = [...data.thisWeek, ...data.nextWeek].find(a => a.id === id)?.status ?? null;
    const apply = (s: RenewalStatus | null) => setData(d => d && ({
      ...d,
      thisWeek: d.thisWeek.map(a => a.id === id ? { ...a, status: s } : a),
      nextWeek: d.nextWeek.map(a => a.id === id ? { ...a, status: s } : a),
    }));
    apply(next);
    setSaveError(null);
    const n = (seq.current[id] = (seq.current[id] ?? 0) + 1);
    setSaving(s => [...s, id]);
    try {
      const res = await fetch("/api/campaign-renewals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, status: next, updatedBy: ctx.userName || undefined }),
      });
      if (!res.ok) throw new Error(await saveErrorMessage(res, "연장 상태를 저장하지 못했습니다."));
    } catch (e) {
      if (seq.current[id] === n) apply(prev);
      setSaveError(e instanceof Error ? e.message : "연장 상태를 저장하지 못했습니다.");
    } finally {
      setSaving(s => { const i = s.indexOf(id); return i < 0 ? s : [...s.slice(0, i), ...s.slice(i + 1)]; });
    }
  }

  const card = (body: React.ReactNode) => (
    <SectionCard id="s-schedule" no={4} title="프로젝트 일정" hint="끝나는 캠페인이 곧 연장 영업 대상입니다. 한 건씩 연장 여부를 정합니다">
      {body}
    </SectionCard>
  );

  if (error && !data) {
    return card(
      <div className="rounded-xl" style={{ border: `1px solid ${C.line}` }}>
        <Empty><span style={{ color: C.bad }}>{error}</span></Empty>
        <div className="pb-4 text-center">
          <button type="button" onClick={load} className="text-[13px] font-medium rounded-lg px-3 py-1.5 hover:bg-[#F2F4F6]" style={{ color: C.accent }}>
            다시 불러오기
          </button>
        </div>
      </div>,
    );
  }
  if (!data) return card(<div className="rounded-xl" style={{ border: `1px solid ${C.line}` }}><Empty>프로젝트 일정을 불러오는 중…</Empty></div>);

  const { active, thisWeek, nextWeek, lastWeek, ranges } = data;
  const kept = thisWeek.filter(a => a.status === "연장");
  const decided = thisWeek.filter(a => a.status === "연장" || a.status === "종료").length;
  const renewed = lastWeek.filter(l => l.renewal).length;
  const isG = (a: Campaign) => a.type === "보장형";

  return card(
    <div className="grid gap-3.5" style={KEEP}>
      <KpiRow items={[
        { label: "운영중", value: `${active.length}건`, sub: `보장형 ${active.filter(isG).length} · 관리형 ${active.filter(a => !isG(a)).length}` },
        { label: "이번 주 종료", value: `${thisWeek.length}건`, sub: `계약 ${man(sumAmt(thisWeek))}원 걸려 있음`, color: thisWeek.length ? C.warn : undefined },
        { label: "연장 확정", value: `${kept.length}건`, sub: `${man(sumAmt(kept))}원 확보`, color: kept.length ? C.good : undefined },
        { label: "다음 주 종료", value: `${nextWeek.length}건`, sub: `계약 ${man(sumAmt(nextWeek))}원` },
        {
          label: "지난주 연장률",
          value: lastWeek.length ? `${Math.round((renewed / lastWeek.length) * 100)}%` : "–",
          sub: lastWeek.length ? `${lastWeek.length}건 중 ${renewed}건 재계약` : "지난주 종료 없음",
        },
      ]} />

      {!data.renewalsAvailable && (
        <p className="text-[12px] rounded-lg px-3 py-2" style={{ color: C.warn, background: C.warnSoft }}>
          연장 상태 저장소가 아직 준비되지 않아 협의 상태를 고를 수 없습니다. 목록과 일정은 그대로 볼 수 있습니다.
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-[12px] rounded-lg px-3 py-2" style={{ color: C.bad, background: C.badSoft }}>{saveError}</p>
      )}

      <div className="grid gap-3.5 items-start xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title="이번 주 종료 예정"
          sub={`${range(ranges.thisWeek)} · ${thisWeek.length}건`}
          right={thisWeek.length ? <Progress label="결정" n={decided} total={thisWeek.length} /> : undefined}>
          {thisWeek.length
            ? <div className="divide-y divide-[#F0F2F4]">{thisWeek.map(a => (
                <EndingRow key={a.id} a={a} asOf={data.asOf} disabled={!data.renewalsAvailable}
                  saving={saving.includes(a.id)} onPick={s => setStatus(a.id, s)} />
              ))}</div>
            : <Empty>이번 주에 끝나는 캠페인이 없습니다</Empty>}
        </Panel>

        <div className="grid gap-3.5 min-w-0">
          <NextWeek list={nextWeek} r={ranges.nextWeek} asOf={data.asOf} disabled={!data.renewalsAvailable}
            saving={saving} onPick={setStatus} />
          <LastWeek list={lastWeek} r={ranges.lastWeek} renewed={renewed} />
        </div>
      </div>

      <Gantt active={active} ctx={ctx} thisWeekEnd={ranges.thisWeek.to} />
    </div>,
  );
}

// ─── 목록 부품 ────────────────────────────────────────────────

function Progress({ label, n, total }: { label: string; n: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums" style={{ color: C.muted }}>
      {label} {n}/{total}
      <span className="inline-block w-[52px] h-1.5 rounded-full overflow-hidden" style={{ background: C.track }}>
        <span className="block h-full rounded-full" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: C.good }} />
      </span>
    </span>
  );
}

function DDay({ end, asOf }: { end: string; asOf: string }) {
  const d = daysBetween(asOf, end);
  const urgent = d <= 1;
  const text = d === 0 ? "오늘" : d > 0 ? `D-${d}` : `D+${-d}`;
  return (
    <div className="w-11 shrink-0 text-center leading-tight">
      <b className="block text-[12px] font-semibold rounded-md py-0.5 tabular-nums"
        style={{ background: urgent ? C.badSoft : C.soft, color: urgent ? C.bad : C.body }}>{text}</b>
      <span className="text-[10px] tabular-nums" style={{ color: C.faint }}>{md(end)} {dow(end)}</span>
    </div>
  );
}

function Owner({ name }: { name: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium" style={{ color: C.muted }}>
      <i className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: personColor(name) }} />
      {name ?? "담당 없음"}
    </span>
  );
}

function TypeTag({ type }: { type: string | null }) {
  if (!type) return null;
  const g = type === "보장형";
  return (
    <span className="text-[10px] font-semibold rounded px-1 py-px"
      style={g ? { color: "#1971C2", background: "#EBF5FF" } : { color: "#7048E8", background: "#F5F2FF" }}>
      {g ? "보장" : "관리"}
    </span>
  );
}

function CampaignName({ a }: { a: Campaign }) {
  const showClient = a.client && a.client !== a.name;
  return (
    <div className="min-w-0 flex-1 basis-[180px]">
      <b className="block text-[13px] font-semibold" style={{ color: C.ink, ...KEEP }}>{a.name}</b>
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] mt-px" style={{ color: C.faint }}>
        <TypeTag type={a.type} />
        {showClient && <span style={KEEP}>{a.client}</span>}
        <Owner name={a.person} />
        {a.amount > 0 && <span className="tabular-nums">{man(a.amount)}원</span>}
      </span>
    </div>
  );
}

const SEG_ON: Record<RenewalStatus, React.CSSProperties> = {
  "협의 전": { background: "#FFFFFF", color: C.body, boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  "협의중":  { background: "#FFFFFF", color: C.warn, boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  "연장":    { background: C.good, color: "#FFFFFF" },
  "종료":    { background: C.bad, color: "#FFFFFF" },
};

function Segmented({ value, onPick, label, disabled, saving }: {
  value: RenewalStatus | null; onPick: (s: RenewalStatus | null) => void; label: string; disabled?: boolean; saving?: boolean;
}) {
  return (
    <div role="group" aria-label={`${label} 연장 여부`} aria-busy={saving || undefined}
      className="inline-flex shrink-0 gap-0.5 rounded-[9px] p-0.5 ml-auto" style={{ background: C.soft, opacity: disabled ? 0.5 : 1 }}>
      {STATUSES.map(s => {
        const on = value === s;
        return (
          <button key={s} type="button" aria-pressed={on} disabled={disabled}
            onClick={() => onPick(on ? null : s)}
            className="text-[11px] font-semibold rounded-[7px] px-2 py-1 whitespace-nowrap transition-colors disabled:cursor-not-allowed"
            style={on ? SEG_ON[s] : { color: C.faint }}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

function EndingRow({ a, asOf, disabled, saving, onPick }: {
  a: Ending; asOf: string; disabled?: boolean; saving?: boolean; onPick: (s: RenewalStatus | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      <DDay end={a.end!} asOf={asOf} />
      <CampaignName a={a} />
      <Segmented value={a.status} onPick={onPick} label={a.name} disabled={disabled} saving={saving} />
    </div>
  );
}

function NextWeek({ list, r, asOf, disabled, saving, onPick }: {
  list: Ending[]; r: Range; asOf: string; disabled?: boolean; saving: string[];
  onPick: (id: string, s: RenewalStatus | null) => void;
}) {
  const SHOW = 6;
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, SHOW);
  return (
    <Panel title="다음 주 종료 예정" sub={`${range(r)} · ${list.length}건 · 미리 연장 제안`}>
      {list.length
        ? <div className="divide-y divide-[#F0F2F4]">{shown.map(a => (
            <EndingRow key={a.id} a={a} asOf={asOf} disabled={disabled} saving={saving.includes(a.id)} onPick={s => onPick(a.id, s)} />
          ))}</div>
        : <Empty>다음 주에 끝나는 캠페인이 없습니다</Empty>}
      {list.length > SHOW && (
        <button type="button" onClick={() => setAll(v => !v)}
          className="w-full text-left text-[12px] font-semibold px-3.5 py-2.5 hover:bg-[#F7F8FA]"
          style={{ color: C.accent, borderTop: `1px solid ${C.lineSoft}` }}>
          {all ? "접기" : `${list.length - SHOW}건 더 보기`}
        </button>
      )}
    </Panel>
  );
}

function LastWeek({ list, r, renewed }: { list: Ended[]; r: Range; renewed: number }) {
  return (
    <Panel title="지난주 종료 결과" sub={`${range(r)} · 같은 광고주의 다음 프로젝트로 자동 판정`}
      right={list.length ? <Progress label="연장" n={renewed} total={list.length} /> : undefined}>
      {list.length ? (
        <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
          {list.map(l => {
            const tone: Tone = l.renewal ? TONE.good : TONE.bad;
            const tip = l.renewal
              ? `이어진 프로젝트: ${l.renewal.name} (${md(l.renewal.start)} 시작)`
              : `${l.end ? md(l.end) : ""} 종료 · 같은 광고주의 다음 프로젝트 없음`;
            return (
              <span key={l.id} title={tip}
                className="inline-flex items-center gap-1.5 rounded-[9px] pl-1 pr-2 py-1 text-[12px] font-medium"
                style={{ border: `1px solid ${C.line}`, color: C.body, ...KEEP }}>
                <Flag tone={tone}>{l.renewal ? "연장됨" : "미연장"}</Flag>
                {l.name}
                <span style={{ color: C.faint }}>{l.person ?? ""}</span>
              </span>
            );
          })}
        </div>
      ) : <Empty>지난주에 끝난 캠페인이 없습니다</Empty>}
    </Panel>
  );
}

// ─── 간트 ─────────────────────────────────────────────────────

const LABEL_W = 168;
const DAY_W = 24;
const ROW_H = 30;

function Gantt({ active, ctx, thisWeekEnd }: { active: Campaign[]; ctx: BoardContext; thisWeekEnd: string }) {
  // 회의 주 월요일부터 그 달 말일까지 — 월말 회의라도 3주는 보이게 한다
  const monthEnd = ymd(new Date(ctx.year, ctx.month, 0));
  const minEnd = addDays(ctx.weekStart, 20);
  const last = monthEnd > minEnd ? monthEnd : minEnd;
  const N = daysBetween(ctx.weekStart, last) + 1;
  const days = Array.from({ length: N }, (_, i) => addDays(ctx.weekStart, i));
  const todayIdx = daysBetween(ctx.weekStart, ctx.asOf);

  const rows = [...active].sort((a, b) => (a.end ?? "9999").localeCompare(b.end ?? "9999") || a.name.localeCompare(b.name, "ko"));
  const people = [...new Set(rows.map(r => r.person ?? ""))].sort((a, b) => a.localeCompare(b, "ko"));
  const pct = (i: number) => `${(i / N) * 100}%`;
  const dayOf = (iso: string) => new Date(`${iso}T00:00:00`).getDay();

  const cols = `${LABEL_W}px minmax(0, 1fr)`;

  return (
    <Panel title="진행중 캠페인 일정" sub={`${md(days[0])} – ${md(last)} · 종료일 순 · 막대 색은 담당자`}>
      {rows.length === 0 ? <Empty>진행중인 캠페인이 없습니다</Empty> : (
        <div className="overflow-auto max-h-[560px]" style={{ overscrollBehaviorX: "contain" }}>
          <div style={{ minWidth: LABEL_W + N * DAY_W }} className="text-[12px]">
            {/* 날짜 축 */}
            <div className="grid sticky top-0 z-20 bg-white" style={{ gridTemplateColumns: cols, borderBottom: `1px solid ${C.line}` }}>
              <div className="sticky left-0 z-10 bg-white px-3.5 py-1.5 text-[11px] font-semibold" style={{ color: C.muted }}>
                캠페인 {rows.length}건
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
                {days.map((d, i) => {
                  const w = dayOf(d);
                  const now = i === todayIdx;
                  return (
                    <span key={d} className="text-center text-[10px] pt-1.5 pb-1 tabular-nums"
                      style={{ color: now ? "#FFFFFF" : w === 0 ? C.bad : C.faint, borderLeft: w === 1 && i > 0 ? `1px solid ${C.line}` : undefined }}>
                      {now
                        ? <b className="font-semibold rounded px-1" style={{ background: C.bad }}>{Number(d.slice(8))}</b>
                        : Number(d.slice(8)) === 1 ? `${Number(d.slice(5, 7))}/1` : Number(d.slice(8))}
                    </span>
                  );
                })}
              </div>
            </div>

            {rows.map(a => {
              const rawS = a.start ? daysBetween(ctx.weekStart, a.start) : 0;
              const rawE = a.end ? daysBetween(ctx.weekStart, a.end) : N;
              const s = Math.max(0, rawS), e = Math.min(N - 1, rawE);
              const endingNow = !!a.end && a.end <= thisWeekEnd;
              const color = personColor(a.person);
              const label = rawE >= N ? (a.end ? `${md(a.end)}까지 →` : "종료일 없음 →") : `${md(a.end!)} 종료`;
              return (
                <div key={a.id} className="grid" style={{ gridTemplateColumns: cols, height: ROW_H, borderTop: `1px solid ${C.lineSoft}` }}>
                  <div className="sticky left-0 z-10 bg-white flex items-center gap-1.5 px-3.5 min-w-0" title={`${a.name} · ${a.person ?? "담당 없음"}`}>
                    <i className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="truncate font-medium" style={{ color: endingNow ? C.warn : C.body }}>{a.name}</span>
                  </div>
                  <div className="relative">
                    {/* 주말·주 경계 */}
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
                      {days.map((d, i) => {
                        const w = dayOf(d);
                        return <span key={d} style={{
                          background: w === 0 || w === 6 ? C.soft : undefined,
                          borderLeft: w === 1 && i > 0 ? `1px solid ${C.lineSoft}` : undefined,
                        }} />;
                      })}
                    </div>
                    <div className="absolute top-[5px] bottom-[5px] rounded-md flex items-center px-1.5 text-[10px] font-semibold whitespace-nowrap overflow-hidden"
                      style={{
                        left: `calc(${pct(s)} + 2px)`, width: `calc(${pct(e - s + 1)} - 4px)`,
                        ...(endingNow
                          ? { background: C.warn, color: "#FFFFFF" }
                          : { background: `${color}1F`, color, boxShadow: `inset 3px 0 0 ${color}` }),
                      }}>
                      {label}
                    </div>
                    {todayIdx >= 0 && todayIdx < N && (
                      <span className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
                        style={{ left: `calc(${pct(todayIdx + 0.5)} - 1px)`, background: C.bad, opacity: 0.6 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 text-[12px]" style={{ color: C.muted, borderTop: `1px solid ${C.line}` }}>
        {people.map(p => (
          <span key={p || "none"} className="inline-flex items-center gap-1.5">
            {p ? <Avatar name={p} size={16} /> : <i className="inline-block w-3.5 h-2 rounded-sm" style={{ background: C.faint }} />}
            {p || "담당 없음"}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3.5 h-2 rounded-sm" style={{ background: C.warn }} />이번 주 종료</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-0.5 h-3" style={{ background: C.bad }} />오늘</span>
      </div>
    </Panel>
  );
}
