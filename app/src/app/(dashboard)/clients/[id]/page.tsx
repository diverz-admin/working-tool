"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import { TEAMS, isKnownTeam } from "@/lib/teams";

type Status = "리드" | "진행" | "종료";

interface FormData {
  status: Status;
  companyName: string;
  industry: string;
  advertiserName: string;
  advertiserContact: string;
  contactEmail: string;
  businessNumber: string;
  category: string;
  products: string[];
  monthlyAvg: string;
  inboundDate: string;
  inboundRoute: string;
  endDate: string;
  endReason: string;
  assignedTeam: string;
  assignedPerson: string;
  notes: string;
}

interface ClientRes {
  status: Status;
  companyName: string;
  industry: string | null;
  advertiserName: string | null;
  advertiserContact: string | null;
  contactEmail: string | null;
  businessNumber: string | null;
  category: string | null;
  products: string[] | null;
  monthlyAvg: number | null;
  inboundDate: string | null;
  inboundRoute: string | null;
  endDate: string | null;
  endReason: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  notes: string | null;
}

interface AccountRow {
  localId: number;
  platform: string;
  username: string;
  password: string;
  showPassword: boolean;
}

const PRODUCT_OPTIONS = [
  "[플레이스] 상위노출 보장형", "[플레이스] 상위노출 관리형", "[플레이스] 12개월 패키지",
  "[플레이스] 6개월 패키지", "[쇼핑] 상위노출", "IMC 마케팅",
];
const INBOUND_ROUTES = ["지인 소개", "SNS", "블로그", "네이버 검색", "전화", "직접 방문", "기타"];

let _lid = 0;
const nid = () => ++_lid;

const inputCls = "w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
const labelCls = "block text-xs font-semibold mb-1";
const labelStyle = { color: "#64748B" };

const STATUS_STYLE: Record<Status, { bg: string; color: string; label: string }> = {
  리드: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6", label: "리드" },
  진행: { bg: "rgba(49,130,246,0.1)", color: "#3182F6", label: "진행중" },
  종료: { bg: "#F1F5F9", color: "#64748B", label: "종료" },
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [form, setForm] = useState<FormData>({
    status: "리드", companyName: "", industry: "", advertiserName: "",
    advertiserContact: "", contactEmail: "", businessNumber: "", category: "",
    products: [], monthlyAvg: "", inboundDate: "", inboundRoute: "",
    endDate: "", endReason: "", assignedTeam: "", assignedPerson: "", notes: "",
  });
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 실패를 빈 폼으로 바꾸지 않는다 — 빈 값으로 덮어쓰기 저장되는 사고를 막기 위해 오류로 표시
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchJson<{ client?: ClientRes | null }>(`/api/clients/${id}`),
      fetchJson<{ accounts?: Record<string, string>[] }>(`/api/clients/${id}/accounts`),
    ])
      .then(([{ client }, { accounts: rows }]) => {
        if (client) {
          setForm({
            status: client.status,
            companyName: client.companyName,
            industry: client.industry ?? "",
            advertiserName: client.advertiserName ?? "",
            advertiserContact: client.advertiserContact ?? "",
            contactEmail: client.contactEmail ?? "",
            businessNumber: client.businessNumber ?? "",
            category: client.category ?? "",
            products: client.products ?? [],
            monthlyAvg: client.monthlyAvg ? String(client.monthlyAvg) : "",
            inboundDate: client.inboundDate ?? "",
            inboundRoute: client.inboundRoute ?? "",
            endDate: client.endDate ?? "",
            endReason: client.endReason ?? "",
            assignedTeam: client.assignedTeam ?? "",
            assignedPerson: client.assignedPerson ?? "",
            notes: client.notes ?? "",
          });
        }
        setAccounts(
          (rows ?? []).map((r: Record<string, string>) => ({
            localId: nid(), platform: r.platform ?? "", username: r.username ?? "",
            password: r.password ?? "", showPassword: false,
          }))
        );
      })
      .catch((e: Error) => { setLoadError(e.message); setAccounts([]); })
      .finally(() => setLoading(false));
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function setField(f: keyof FormData, v: string | string[]) {
    setForm((p) => ({ ...p, [f]: v }));
  }

  function toggleProduct(p: string) {
    setField("products", form.products.includes(p) ? form.products.filter((x) => x !== p) : [...form.products, p]);
  }

  function updateAccount(localId: number, field: keyof Omit<AccountRow, "localId">, value: string | boolean) {
    setAccounts((p) => p.map((a) => (a.localId === localId ? { ...a, [field]: value } : a)));
  }

  async function handleSave() {
    if (!form.companyName.trim()) { setError("플레이스/스토어명은 필수입니다."); return; }
    setSaving(true); setError(null);
    const body = { ...form, monthlyAvg: form.monthlyAvg ? parseInt(form.monthlyAvg.replace(/,/g, ""), 10) : undefined };
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) { setSaving(false); setError("저장에 실패했습니다."); return; }
    await fetch(`/api/clients/${id}/accounts`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: accounts.filter((a) => a.platform.trim()).map(({ platform, username, password }) => ({ platform, username, password })),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    router.push("/clients");
  }

  if (loading) {
    return <div className="py-32 text-center text-sm" style={{ color: "#94A3B8" }}>데이터를 불러오는 중...</div>;
  }

  if (loadError) {
    return (
      <div className="py-32 flex flex-col items-center gap-3">
        <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>{loadError}</p>
        <p className="text-xs" style={{ color: "#94A3B8" }}>데이터가 없는 것으로 잘못 보이지 않도록 표시를 중단했습니다.</p>
        <button onClick={load} className="px-4 py-1.5 text-sm font-semibold rounded-lg" style={{ background: "#3182F6", color: "#fff" }}>다시 시도</button>
      </div>
    );
  }

  const s = STATUS_STYLE[form.status];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/clients")}
          className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
          style={{ color: "#64748B" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          고객사 목록
        </button>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs mr-1" style={{ color: "#94A3B8" }}>정말 삭제할까요?</span>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
                취소
              </button>
              <button onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white" style={{ background: "#EF4444" }}>
                삭제 확인
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border-2 transition-all hover:bg-red-50"
              style={{ borderColor: "#EF4444", color: "#EF4444" }}>
              삭제
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: saved ? "#10B981" : "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
            {saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
          </button>
        </div>
      </div>

      {/* 타이틀 */}
      <div style={{ borderBottom: "1px solid #E9EBEF", paddingBottom: "16px" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: "#191F28" }}>
            {form.companyName || "고객사"}
          </h1>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>
            {s.label}
          </span>
        </div>
      </div>

      {/* 폼 */}
      <div className="rounded-2xl p-6 space-y-5" style={{ background: "#FFFFFF", border: "1px solid #E9EBEF" }}>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>상태</label>
            <select value={form.status} onChange={(e) => setField("status", e.target.value)} className={inputCls} style={inputStyle}>
              <option value="리드">리드</option>
              <option value="진행">진행중</option>
              <option value="종료">종료</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>분류</label>
            <select value={form.category} onChange={(e) => setField("category", e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">선택 안 함</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>플레이스/스토어명 *</label>
            <input type="text" value={form.companyName} onChange={(e) => setField("companyName", e.target.value)} placeholder="플레이스/스토어명 입력" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>업종</label>
            <input type="text" value={form.industry} onChange={(e) => setField("industry", e.target.value)} placeholder="예: 음식점, 뷰티" className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>담당자명</label>
            <input type="text" value={form.advertiserName} onChange={(e) => setField("advertiserName", e.target.value)} placeholder="담당자명" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>연락처</label>
            <input type="text" value={form.advertiserContact} onChange={(e) => setField("advertiserContact", e.target.value)} placeholder="010-0000-0000" className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>이메일</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} placeholder="email@example.com" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>사업자번호</label>
            <input type="text" value={form.businessNumber} onChange={(e) => setField("businessNumber", e.target.value)} placeholder="000-00-00000" className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>상품 종류</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {PRODUCT_OPTIONS.map((p) => {
              const on = form.products.includes(p);
              return (
                <button key={p} type="button" onClick={() => toggleProduct(p)}
                  className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all"
                  style={{ background: on ? "rgba(49,130,246,0.1)" : "#F8FAFC", color: on ? "#3182F6" : "#94A3B8", borderColor: on ? "#3182F6" : "#E9EBEF" }}>
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>인입 날짜</label>
            <input type="date" value={form.inboundDate} onChange={(e) => setField("inboundDate", e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>인입 경로</label>
            <select value={form.inboundRoute} onChange={(e) => setField("inboundRoute", e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">선택</option>
              {INBOUND_ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>담당팀</label>
            <select value={form.assignedTeam} onChange={(e) => setField("assignedTeam", e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">선택 안 함</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              {form.assignedTeam && !isKnownTeam(form.assignedTeam) && (
                <option value={form.assignedTeam}>{form.assignedTeam}</option>
              )}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>담당자</label>
            <input type="text" value={form.assignedPerson} onChange={(e) => setField("assignedPerson", e.target.value)} placeholder="예: 홍길동" className={inputCls} style={inputStyle} />
          </div>
        </div>

        {form.status === "종료" && (
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl" style={{ background: "#F8FAFC" }}>
            <div>
              <label className={labelCls} style={labelStyle}>종료 날짜</label>
              <input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>종료 사유</label>
              <input type="text" value={form.endReason} onChange={(e) => setField("endReason", e.target.value)} placeholder="예: 예산 종료, 계약 만료" className={inputCls} style={inputStyle} />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls} style={labelStyle}>메모</label>
          <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="특이사항, 히스토리 등 자유 메모" rows={3} className={`${inputCls} resize-none`} style={inputStyle} />
        </div>

        {/* 거래처 계정정보 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
            <span className="text-xs font-bold px-2" style={{ color: "#94A3B8" }}>거래처 계정정보</span>
            <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
          </div>

          {accounts.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="grid gap-2 px-1" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                {["플랫폼", "아이디", "비밀번호", ""].map((h) => (
                  <span key={h} className="text-xs font-semibold" style={{ color: "#94A3B8" }}>{h}</span>
                ))}
              </div>
              {accounts.map((a) => (
                <div key={a.localId} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                  <input type="text" value={a.platform} onChange={(e) => updateAccount(a.localId, "platform", e.target.value)} placeholder="네이버, 인스타 등" className={inputCls} style={inputStyle} />
                  <input type="text" value={a.username} onChange={(e) => updateAccount(a.localId, "username", e.target.value)} placeholder="아이디" className={inputCls} style={inputStyle} />
                  <div className="relative">
                    <input type={a.showPassword ? "text" : "password"} value={a.password} onChange={(e) => updateAccount(a.localId, "password", e.target.value)} placeholder="비밀번호" className={`${inputCls} pr-9`} style={inputStyle} />
                    <button type="button" onClick={() => updateAccount(a.localId, "showPassword", !a.showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2" tabIndex={-1}>
                      {a.showPassword ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  <button type="button" onClick={() => setAccounts((p) => p.filter((x) => x.localId !== a.localId))} className="p-1.5 rounded-lg" style={{ color: "#EF4444" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => setAccounts((p) => [...p, { localId: nid(), platform: "", username: "", password: "", showPassword: false }])}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#E9EBEF", color: "#64748B", borderStyle: "dashed" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            계정 추가
          </button>
        </div>

        {error && <p className="text-xs text-center" style={{ color: "#EF4444" }}>{error}</p>}
      </div>
    </div>
  );
}
