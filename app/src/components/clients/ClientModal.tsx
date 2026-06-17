"use client";

import { useState, useEffect, useRef } from "react";
import DeleteConfirmModal from "./DeleteConfirmModal";

type Status = "리드" | "진행" | "종료";

export interface ClientFormData {
  id?: string;
  status: Status;
  companyName: string;
  storeName: string;
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
  bizRegFileUrl?: string | null;
  bizRegFileName?: string | null;
}

export interface LinkedProject {
  id: string;
  status: string;
  campaignName: string;
  clientId: string | null;
  advertiser: string | null;
  product: string | null;
  assignedTeam: string | null;
  assignedPerson: string | null;
  contractAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  placeLink: string | null;
  notes: string | null;
  isExtended: boolean | null;
}

interface AccountRow {
  localId: number;
  platform: string;
  username: string;
  password: string;
  showPassword: boolean;
}

interface UrlRow {
  localId: number;
  label: string;
  url: string;
}

const PRODUCT_OPTIONS = [
  "[플레이스] 상위노출 보장형",
  "[플레이스] 상위노출 관리형",
  "[플레이스] 12개월 패키지",
  "[플레이스] 6개월 패키지",
  "[쇼핑] 상위노출",
  "IMC 마케팅",
];

const INBOUND_ROUTES = ["지인 소개", "SNS", "블로그", "네이버 검색", "전화", "직접 방문", "기타"];

let _localId = 0;
function nextId() { return ++_localId; }

function emptyAccount(): AccountRow {
  return { localId: nextId(), platform: "", username: "", password: "", showPassword: false };
}

function emptyUrl(): UrlRow {
  return { localId: nextId(), label: "", url: "" };
}

function emptyForm(): ClientFormData {
  return {
    status: "리드", companyName: "", storeName: "", industry: "", advertiserName: "",
    advertiserContact: "", contactEmail: "", businessNumber: "", category: "",
    products: [], monthlyAvg: "", inboundDate: "", inboundRoute: "",
    endDate: "", endReason: "", assignedTeam: "", assignedPerson: "", notes: "",
    bizRegFileUrl: null, bizRegFileName: null,
  };
}

interface Props {
  initial?: ClientFormData | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (id: string) => void;
  onViewProject?: (project: LinkedProject) => void;
}

export default function ClientModal({ initial, onClose, onSaved, onDelete, onViewProject }: Props) {
  const [form, setForm]                   = useState<ClientFormData>(initial ?? emptyForm());
  const [accounts, setAccounts]           = useState<AccountRow[]>([]);
  const [urls,     setUrls]               = useState<UrlRow[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([]);
  const [users, setUsers]                 = useState<{ id: string; name: string; team: string | null }[]>([]);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const backdropRef    = useRef<HTMLDivElement>(null);
  const bizRegInputRef = useRef<HTMLInputElement>(null);

  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, []);

  // 편집 모드일 때 계정·프로젝트·파일 정보를 1번 fetch로 처리 (기존: 3 cold start)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    if (isEdit && initial?.id) {
      fetch(`/api/clients/${initial.id}/detail`)
        .then((r) => r.json())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ client, accounts: rows, urls: urlRows, projects }) => {
          setAccounts(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (rows ?? []).map((r: any) => ({
              localId: nextId(),
              platform: r.platform ?? "",
              username: r.username ?? "",
              password: r.password ?? "",
              showPassword: false,
            }))
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setUrls((urlRows ?? []).map((u: any) => ({ localId: nextId(), label: u.label ?? "", url: u.url ?? "" })));
          setLinkedProjects(projects ?? []);
          if (client) {
            setForm((prev) => ({
              ...prev,
              bizRegFileUrl:  client.bizRegFileUrl  ?? null,
              bizRegFileName: client.bizRegFileName ?? null,
            }));
          }
        })
        .catch(() => {});
    }
    return () => { document.body.style.overflow = ""; };
  }, [isEdit, initial?.id]);

  function setField(field: keyof ClientFormData, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleProduct(p: string) {
    setField(
      "products",
      form.products.includes(p)
        ? form.products.filter((x) => x !== p)
        : [...form.products, p]
    );
  }

  function addAccount() {
    setAccounts((prev) => [...prev, emptyAccount()]);
  }

  function removeAccount(localId: number) {
    setAccounts((prev) => prev.filter((a) => a.localId !== localId));
  }

  function updateAccount(localId: number, field: keyof Omit<AccountRow, "localId">, value: string | boolean) {
    setAccounts((prev) =>
      prev.map((a) => a.localId === localId ? { ...a, [field]: value } : a)
    );
  }

  function handleBizRegFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        bizRegFileUrl:  reader.result as string,
        bizRegFileName: file.name,
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function clearBizReg() {
    setForm((prev) => ({ ...prev, bizRegFileUrl: null, bizRegFileName: null }));
  }

  function validateFields(): boolean {
    if (!form.advertiserContact.trim()) { setError("연락처는 필수입니다."); return false; }
    if (!form.contactEmail.trim()) { setError("이메일은 필수입니다."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      setError("이메일 형식이 올바르지 않습니다. (예: email@example.com)");
      return false;
    }
    if (!form.businessNumber.trim()) { setError("사업자번호는 필수입니다."); return false; }
    if (!/^\d{3}-\d{2}-\d{5}$/.test(form.businessNumber.trim())) {
      setError("사업자번호 형식이 올바르지 않습니다. (예: 000-00-00000)");
      return false;
    }
    if (!form.assignedTeam) { setError("담당팀은 필수입니다."); return false; }
    if (!form.assignedPerson.trim()) { setError("담당자는 필수입니다."); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim()) { setError("업체명은 필수입니다."); return; }
    if (!validateFields()) return;
    setSaving(true);
    setError(null);

    const body = {
      ...form,
      monthlyAvg: form.monthlyAvg ? parseInt(form.monthlyAvg.replace(/,/g, ""), 10) : undefined,
    };

    const url    = isEdit ? `/api/clients/${initial!.id}` : "/api/clients";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) { setSaving(false); setError("저장에 실패했습니다. 다시 시도해 주세요."); return; }

    // 계정 저장
    const { client } = await res.json();
    const clientId = isEdit ? initial!.id! : client.id;

    await Promise.all([
      fetch(`/api/clients/${clientId}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: accounts
            .filter((a) => a.platform.trim())
            .map(({ platform, username, password }) => ({ platform, username, password })),
        }),
      }),
      fetch(`/api/clients/${clientId}/urls`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: urls
            .filter((u) => u.url.trim())
            .map(({ label, url }) => ({ label, url })),
        }),
      }),
    ]);

    setSaving(false);
    onSaved();
  }

  const inputCls  = "w-full px-3 py-2 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]";
  const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
  const labelCls  = "block text-xs font-semibold mb-1";
  const labelStyle = { color: "#64748B" };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#F1F5F9" }}>
          <h2 className="text-base font-bold" style={{ color: "#191F28" }}>
            {isEdit ? "광고주 수정" : "광고주 추가"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* 상태 + 분류 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>상태 *</label>
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

          {/* 업체명 + 스토어명 + 업종 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>업체명 *</label>
              <input type="text" value={form.companyName} onChange={(e) => setField("companyName", e.target.value)} placeholder="업체명 입력" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>스토어명</label>
              <input type="text" value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} placeholder="스토어명 입력" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>업종</label>
              <input type="text" value={form.industry} onChange={(e) => setField("industry", e.target.value)} placeholder="예: 음식점, 뷰티" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* 광고주명 + 연락처 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>광고주명</label>
              <input type="text" value={form.advertiserName} onChange={(e) => setField("advertiserName", e.target.value)} placeholder="광고주명" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>연락처 *</label>
              <input type="text" value={form.advertiserContact} onChange={(e) => { setField("advertiserContact", e.target.value); setError(null); }} placeholder="010-0000-0000" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* 이메일 + 사업자번호 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>이메일 *</label>
              <input
                type="text"
                value={form.contactEmail}
                onChange={(e) => { setField("contactEmail", e.target.value); setError(null); }}
                placeholder="email@example.com"
                className={inputCls}
                style={{
                  ...inputStyle,
                  borderColor: form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()) ? "#EF4444" : inputStyle.borderColor,
                }}
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>사업자번호 *</label>
              <input
                type="text"
                value={form.businessNumber}
                onChange={(e) => { setField("businessNumber", e.target.value); setError(null); }}
                placeholder="000-00-00000"
                className={inputCls}
                style={{
                  ...inputStyle,
                  borderColor: form.businessNumber && !/^\d{3}-\d{2}-\d{5}$/.test(form.businessNumber.trim()) ? "#EF4444" : inputStyle.borderColor,
                }}
              />
            </div>
          </div>

          {/* 인입 날짜 + 인입 경로 */}
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

          {/* 상품 종류 */}
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

          {/* 담당팀 + 담당자 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={labelStyle}>담당팀 *</label>
              <select value={form.assignedTeam} onChange={(e) => { setField("assignedTeam", e.target.value); setError(null); }} className={inputCls} style={inputStyle}>
                <option value="">선택 안 함</option>
                <option value="영업 1팀">영업 1팀</option>
                <option value="영업 2팀">영업 2팀</option>
                <option value="경영팀">경영팀</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>담당자 *</label>
              <select
                value={form.assignedPerson}
                onChange={(e) => {
                  const name = e.target.value;
                  const user = users.find((u) => u.name === name);
                  setField("assignedPerson", name);
                  if (user?.team && !form.assignedTeam) setField("assignedTeam", user.team);
                  setError(null);
                }}
                className={inputCls}
                style={inputStyle}
              >
                <option value="">선택</option>
                {(form.assignedTeam
                  ? users.filter((u) => u.team === form.assignedTeam)
                  : users
                ).map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
                {form.assignedPerson && !users.some((u) => u.name === form.assignedPerson) && (
                  <option value={form.assignedPerson}>{form.assignedPerson}</option>
                )}
              </select>
            </div>
          </div>

          {/* 종료 시에만 */}
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

          {/* 메모 */}
          <div>
            <label className={labelCls} style={labelStyle}>메모</label>
            <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="특이사항, 히스토리 등 자유 메모" rows={3} className={`${inputCls} resize-none`} style={inputStyle} />
          </div>

          {/* 관련 URL */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
              <span className="text-xs font-bold px-2" style={{ color: "#94A3B8" }}>관련 URL</span>
              <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
            </div>

            {urls.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="grid gap-2 px-1" style={{ gridTemplateColumns: "120px 1fr auto auto" }}>
                  {["구분", "URL", "", ""].map((h, i) => (
                    <span key={i} className="text-xs font-semibold" style={{ color: "#94A3B8" }}>{h}</span>
                  ))}
                </div>
                {urls.map((u) => (
                  <div key={u.localId} className="grid gap-2 items-center" style={{ gridTemplateColumns: "120px 1fr auto auto" }}>
                    <input
                      type="text"
                      value={u.label}
                      onChange={(e) => setUrls((prev) => prev.map((r) => r.localId === u.localId ? { ...r, label: e.target.value } : r))}
                      placeholder="홈페이지, 인스타 등"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <input
                      type="url"
                      value={u.url}
                      onChange={(e) => setUrls((prev) => prev.map((r) => r.localId === u.localId ? { ...r, url: e.target.value } : r))}
                      placeholder="https://"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <a
                      href={u.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { if (!u.url.trim()) e.preventDefault(); }}
                      className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                      style={{ color: u.url.trim() ? "#3182F6" : "#CBD5E1", pointerEvents: u.url.trim() ? "auto" : "none" }}
                      title="새 탭에서 열기"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                    <button
                      type="button"
                      onClick={() => setUrls((prev) => prev.filter((r) => r.localId !== u.localId))}
                      className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                      style={{ color: "#EF4444" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setUrls((prev) => [...prev, emptyUrl()])}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors hover:bg-slate-50"
              style={{ borderColor: "#E9EBEF", color: "#64748B", borderStyle: "dashed" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              URL 추가
            </button>
          </div>

          {/* 사업자등록증 */}
          <div>
            <label className={labelCls} style={labelStyle}>사업자등록증</label>
            <input ref={bizRegInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleBizRegFile} />
            {form.bizRegFileUrl ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={{ background: "#F8FAFC", borderColor: "#E9EBEF" }}>
                {form.bizRegFileUrl.startsWith("data:image") && (
                  <img src={form.bizRegFileUrl} alt="사업자등록증" className="w-14 h-14 object-cover rounded-lg border flex-shrink-0" style={{ borderColor: "#E9EBEF" }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#191F28" }}>{form.bizRegFileName}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>첨부됨</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button type="button" onClick={() => bizRegInputRef.current?.click()}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-slate-50"
                    style={{ borderColor: "#E9EBEF", color: "#64748B" }}>변경</button>
                  <button type="button" onClick={clearBizReg}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: "rgba(239,68,68,0.3)", color: "#EF4444", background: "rgba(239,68,68,0.05)" }}>삭제</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => bizRegInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 transition-colors hover:bg-slate-50"
                style={{ borderColor: "#E9EBEF", borderStyle: "dashed", color: "#94A3B8" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="text-sm font-medium">사업자등록증 첨부</span>
              </button>
            )}
          </div>

          {/* ── 거래처 계정정보 ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
              <span className="text-xs font-bold px-2" style={{ color: "#94A3B8" }}>거래처 계정정보</span>
              <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
            </div>

            {accounts.length > 0 && (
              <div className="space-y-2 mb-3">
                {/* 헤더 */}
                <div className="grid gap-2 px-1" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                  {["플랫폼", "아이디", "비밀번호", ""].map((h) => (
                    <span key={h} className="text-xs font-semibold" style={{ color: "#94A3B8" }}>{h}</span>
                  ))}
                </div>

                {/* 행 */}
                {accounts.map((a) => (
                  <div key={a.localId} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                    <input
                      type="text"
                      value={a.platform}
                      onChange={(e) => updateAccount(a.localId, "platform", e.target.value)}
                      placeholder="네이버, 인스타 등"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={a.username}
                      onChange={(e) => updateAccount(a.localId, "username", e.target.value)}
                      placeholder="아이디"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <div className="relative">
                      <input
                        type={a.showPassword ? "text" : "password"}
                        value={a.password}
                        onChange={(e) => updateAccount(a.localId, "password", e.target.value)}
                        placeholder="비밀번호"
                        className={`${inputCls} pr-9`}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => updateAccount(a.localId, "showPassword", !a.showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2"
                        tabIndex={-1}
                      >
                        {a.showPassword ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAccount(a.localId)}
                      className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                      style={{ color: "#EF4444" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addAccount}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors hover:bg-slate-50"
              style={{ borderColor: "#E9EBEF", color: "#64748B", borderStyle: "dashed" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              계정 추가
            </button>
          </div>

          {/* 연결된 프로젝트 */}
          {isEdit && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
                <span className="text-xs font-bold px-2" style={{ color: "#94A3B8" }}>연결된 프로젝트</span>
                <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
              </div>
              {linkedProjects.length === 0 ? (
                <p className="text-xs text-center py-2" style={{ color: "#CBD5E1" }}>연결된 프로젝트가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {linkedProjects.map((p) => {
                    const statusBg    = p.status === "진행" ? "rgba(49,130,246,0.1)" : p.status === "종료" ? "#F1F5F9" : "rgba(139,92,246,0.1)";
                    const statusColor = p.status === "진행" ? "#3182F6" : p.status === "종료" ? "#64748B" : "#8B5CF6";
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "#F8FAFC" }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: statusBg, color: statusColor }}>{p.status}</span>
                          <span className="text-sm font-medium truncate" style={{ color: "#191F28" }}>{p.campaignName}</span>
                          {(p.startDate || p.endDate) && (
                            <span className="text-xs flex-shrink-0" style={{ color: "#94A3B8" }}>{p.startDate ?? "?"} ~ {p.endDate ?? "?"}</span>
                          )}
                        </div>
                        {onViewProject && (
                          <button
                            type="button"
                            onClick={() => onViewProject(p)}
                            className="flex-shrink-0 ml-3 text-xs px-3 py-1 rounded-lg font-semibold transition-colors hover:bg-white"
                            style={{ color: "#3182F6", border: "1px solid #E9EBEF" }}
                          >
                            열기
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 에러 */}
          {error && <p className="text-xs text-center" style={{ color: "#EF4444" }}>{error}</p>}

          {/* 버튼 */}
          <div className="flex items-center justify-between pt-2">
            {isEdit && onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all hover:bg-red-50"
                style={{ borderColor: "#EF4444", color: "#EF4444" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                삭제
              </button>
            ) : <div />}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-slate-50" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>
                취소
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" }}>
                {saving ? "저장 중..." : isEdit ? "수정 완료" : "광고주 추가"}
              </button>
            </div>
          </div>
        </form>

        {showDeleteConfirm && (
          <DeleteConfirmModal
            companyName={form.companyName}
            onConfirm={() => { setShowDeleteConfirm(false); onDelete!(initial!.id!); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
