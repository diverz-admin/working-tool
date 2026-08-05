"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchJson, saveErrorMessage, SESSION_EXPIRED_MESSAGE } from "@/lib/fetch-json";
import { useRouter } from "next/navigation";
import ProjectReportSection from "@/components/projects/ProjectReportSection";
import { addConfirmRequest, addPaymentRequest, updateConfirmRequest, updatePaymentRequest, deleteConfirmRequest, deletePaymentRequest, type ConfirmStatus, type PaymentStatus } from "@/lib/approvals";
import { uploadAttachment, useFileSrc } from "@/lib/storage";
import { teamBadgeStyle, normalizeTeam } from "@/lib/teams";

type Status = "진행" | "종료";

// 세금계산서 다운로드 링크 (스토리지 경로/레거시 data: 모두 대응)
function InvoiceLink({ url, name }: { url: string; name: string | null }) {
  const src = useFileSrc(url);
  return (
    <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" title={name ?? undefined}
      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
      style={{ background: "rgba(49,130,246,0.1)", color: src ? "#3182F6" : "#94A3B8", border: "1px solid rgba(49,130,246,0.2)", maxWidth: 90, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", pointerEvents: src ? "auto" : "none" }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      {name || "파일"}
    </a>
  );
}

export interface ProjectFormData {
  id?: string;
  status: Status;
  campaignName: string;
  clientId?: string;
  projectType?: string;
  advertiser: string;
  product: string;
  assignedTeam: string;
  assignedPerson: string;
  contractAmount: string;
  kpiSupply: string;
  kpiTax: string;
  startDate: string;
  endDate: string;
  placeLink: string;
  notes: string;
  isExtended: boolean;
}

interface RevenueRow {
  localId: number;
  revenueRowId: string;    // 안정적 UUID — rowKey 충돌 방지
  linkedCostLocalId: number | null; // 1:1 페어 매입 행 localId
  sectionLabel: string;
  assignee: string;
  productName: string;
  productId: string;       // 동명 상품(벤더 다름) 구분용 transient ID
  unitPrice: number;
  quantity: string;
  supplyPrice: string;
  tax: string;
  total: string;
  paymentDate: string;
  invoiceDate: string;
  workStartDate: string;
  workEndDate: string;
  completedQty: string;
  workCompleted: boolean;
  depositAccount: string;
  settingDate: string;
}

interface CostRow {
  localId: number;
  costRowId: string;       // 안정적 UUID — rowKey 충돌 방지
  sectionLabel: string;
  assignee: string;
  vendor: string;
  productName: string;
  productId: string;       // 동명 상품(벤더 다름) 구분용 transient ID
  unitPrice: number;
  quantity: string;
  supplyPrice: string;
  tax: string;
  total: string;
  purchaseDate: string;
  invoiceDate: string;
  workStartDate: string;
  workEndDate: string;
  workCompleted: boolean;
  isApproved: boolean;
  settingDate: string;
  invoiceFileUrl: string;
  invoiceFileName: string;
}

let _lid = 0;
const nid = () => ++_lid;

// 정적 데이터 모듈 캐시 — 모달을 여러 번 열어도 한 번만 로드
let _initCache: { clients: SimpleClient[]; products: ManagedProduct[]; users: { id: string; name: string; team: string | null }[] } | null = null;

type ModalInitData = { clients?: SimpleClient[]; products?: ManagedProduct[]; users?: { id: string; name: string; team: string | null }[] };

// 프로젝트 상세 데이터 prefetch 캐시
type ProjectDetailData = {
  revenues?: Record<string, unknown>[];
  costs?: Record<string, unknown>[];
  confirmRequests?: Record<string, unknown>[];
  paymentRequests?: Record<string, unknown>[];
};
const _projectCache = new Map<string, Promise<ProjectDetailData>>();

/** 페이지 로드 시 호출 — modal-init 데이터를 백그라운드에서 미리 로드 */
export function preloadModalInit() {
  if (_initCache) return;
  fetchJson<ModalInitData>("/api/modal-init")
    .then((d) => {
      _initCache = { clients: d.clients ?? [], products: d.products ?? [], users: d.users ?? [] };
    })
    .catch(() => {});
}

/** 캠페인 행 호버 시 호출 — 클릭 전에 데이터 미리 로드 */
export function prefetchProject(id: string) {
  if (!_projectCache.has(id)) {
    // 실패 응답을 캐시에 남기면 모달이 빈 매출·매입으로 열려, 저장 시 기존 행이 전부 지워진다
    const p = fetchJson<ProjectDetailData>(`/api/projects/${id}`)
      .catch((e) => { _projectCache.delete(id); throw e; });
    p.catch(() => {});   // unhandled rejection 방지 (실제 처리는 모달에서)
    _projectCache.set(id, p);
  }
}

/** 저장/삭제 후 캐시 무효화 */
export function invalidateProjectCache(id: string) {
  _projectCache.delete(id);
}

// 사용자 팀("경영")과 광고주 팀("경영팀") 명칭 불일치 매핑
function matchesTeam(clientTeam: string | undefined, formTeam: string) {
  if (!clientTeam || !formTeam) return false;
  if (clientTeam === formTeam) return true;
  return normalizeTeam(clientTeam) === normalizeTeam(formTeam);
}

function emptyRevenue(sectionLabel = "1주"): RevenueRow {
  return { localId: nid(), revenueRowId: crypto.randomUUID(), linkedCostLocalId: null, sectionLabel, assignee: "", productName: "", productId: "", unitPrice: 0, quantity: "", supplyPrice: "", tax: "", total: "", paymentDate: "", invoiceDate: "", workStartDate: "", workEndDate: "", completedQty: "", workCompleted: false, depositAccount: "", settingDate: "" };
}
function emptyCost(sectionLabel = "1주"): CostRow {
  return { localId: nid(), costRowId: crypto.randomUUID(), sectionLabel, assignee: "", vendor: "", productName: "", productId: "", unitPrice: 0, quantity: "", supplyPrice: "", tax: "", total: "", purchaseDate: "", invoiceDate: "", workStartDate: "", workEndDate: "", workCompleted: false, isApproved: false, settingDate: "", invoiceFileUrl: "", invoiceFileName: "" };
}

function daysLeft(dateStr: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
}

function wonFmt(v: string | number | null | undefined) {
  if (!v) return "";
  const n = typeof v === "string" ? parseInt(v.replace(/,/g, "")) : v;
  if (isNaN(n)) return String(v);
  return n.toLocaleString();
}

function parseWon(v: string): number | null {
  const n = parseInt(v.replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

interface SimpleClient {
  id: string;
  status: string;
  companyName: string;
  storeName?: string | null;
  advertiserName: string;
  products: string[];
  monthlyAvg?: number;
  inboundDate?: string;
  endDate?: string;
  assignedTeam?: string;
  assignedPerson?: string;
  urls?: { label: string; url: string }[];
}

const PRODUCT_OPTIONS = [
  "[플레이스] 상위노출 보장형",
  "[플레이스] 상위노출 관리형",
  "[플레이스] 12개월 패키지",
  "[플레이스] 6개월 패키지",
  "[쇼핑] 상위노출",
  "IMC 마케팅",
];

interface ManagedProduct {
  id: string;
  category: string;
  name: string;
  vendor: string | null;
  vendorBankAccount: string | null;
  costPrice: number | null;
  salePrice: number | null;
}

/* ── 행을 상품관리의 올바른 상품(이름+매입처)에 연결 ──
   동명 상품(매입처만 다른 경우)이 이름만으로 잘못 매칭돼 다른 개당 단가로 표시되던 문제를 바로잡는다.
   productId·unitPrice(개당 단가)만 채워 표시·이후 개수 변경 재계산에 쓰고,
   기존에 저장된 공급가·세액·합계 금액은 건드리지 않는다(승인 금액 보존). */
function findRevProduct(productName: string, products: ManagedProduct[]): ManagedProduct | undefined {
  return products.find((p) => (p.vendor ? `${p.name} · ${p.vendor}` : p.name) === productName)
      ?? products.find((p) => p.name === productName);
}
function findCostProduct(productName: string, vendor: string, products: ManagedProduct[]): ManagedProduct | undefined {
  return products.find((p) => p.name === productName && (p.vendor ?? "") === (vendor ?? ""))
      ?? products.find((p) => p.name === productName);
}
function normalizeRevRows(rows: RevenueRow[], products: ManagedProduct[]): RevenueRow[] {
  if (!products.length) return rows;
  return rows.map((r) => {
    const p = findRevProduct(r.productName, products);
    if (!p || (p.salePrice ?? 0) <= 0) return r;
    return { ...r, productId: p.id, unitPrice: p.salePrice ?? 0 };
  });
}
function normalizeCostRows(rows: CostRow[], products: ManagedProduct[]): CostRow[] {
  if (!products.length) return rows;
  return rows.map((c) => {
    const p = findCostProduct(c.productName, c.vendor, products);
    if (!p || (p.costPrice ?? 0) <= 0) return c;
    return { ...c, productId: p.id, unitPrice: p.costPrice ?? 0 };
  });
}

interface Props {
  initial?: ProjectFormData | null;
  onClose: () => void;
  onSaved: (projectGroupId?: string) => void;
  onDelete?: (id: string) => void;
  onViewClient?: (clientId: string) => void;
  projectGroupId?: string;
}

const inputCls  = "w-full px-2.5 py-1.5 text-xs rounded-lg outline-none border transition-colors focus:border-[#3182F6]";
const inputStyle = { background: "#F8FAFC", borderColor: "#E9EBEF", color: "#191F28" };
const labelCls  = "block text-xs font-semibold mb-1";
const labelStyle = { color: "#64748B" };

export default function ProjectModal({ initial, onClose, onSaved, onDelete, onViewClient, projectGroupId }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  // 신규 프로젝트를 자동 저장한 경우 여기에 ID 기록
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  // ref로도 동기화해 handleSubmit stale 클로저 방지
  const savedIdRef = useRef<string | null>(initial?.id ?? null);
  const [form, setForm] = useState<ProjectFormData>(initial ?? {
    status: "진행", campaignName: "", projectType: "", advertiser: "", product: "",
    assignedTeam: "", assignedPerson: "", contractAmount: "", kpiSupply: "", kpiTax: "",
    startDate: "", endDate: "", placeLink: "", notes: "",
    isExtended: false,
  });
  const [revenues, setRevenues]     = useState<RevenueRow[]>([]);
  const [costs, setCosts]           = useState<CostRow[]>([]);
  const revenuesRef = useRef<RevenueRow[]>([]);
  // eslint-disable-next-line react-hooks/refs
  revenuesRef.current = revenues;
  const costsRef = useRef<CostRow[]>([]);
  // eslint-disable-next-line react-hooks/refs
  costsRef.current = costs;
  // 저장 직렬화용 뮤텍스 — 입금요청/확인요청 버튼 연타·동시 클릭으로 저장이 겹쳐
  // 서버 delete+insert 가 경합해 매입/매출 행이 중복 생성되던 문제 방지
  const saveLockRef = useRef<Promise<unknown>>(Promise.resolve());
  const [clients, setClients]       = useState<SimpleClient[]>([]);
  const [users, setUsers]           = useState<{ id: string; name: string; team: string | null }[]>([]);
  const [managedProducts, setManagedProducts] = useState<ManagedProduct[]>([]);
  const [saving, setSaving]         = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sendingPayment, setSendingPayment] = useState<Set<string>>(new Set());

  // 변경 감지용 초기 스냅샷
  const initFormSnap  = useRef(JSON.stringify({ ...form, id: undefined }));
  const initRevSnap   = useRef("[]");
  const initCostSnap  = useRef("[]");
  const [rowsLoaded, setRowsLoaded] = useState(false);
  // 기존 캠페인의 매출·매입을 불러오지 못한 상태. 저장은 전체 교체(PUT)라 이대로 저장하면 기존 행이 전부 지워진다.
  const [loadFailed, setLoadFailed] = useState(false);
  const normalizedRef = useRef(false);
  // productId·unitPrice 는 상품 매칭으로 파생되는 내부값 — 변경 감지에서 제외해
  // (로드 후 자동 정규화가 이 값만 채워도 '변경됨'으로 오인되지 않게 한다)
  const serRev  = (rows: RevenueRow[])  => JSON.stringify(rows.map(({ localId: _l, productId: _p, unitPrice: _u, ...r }) => r));
  const serCost = (rows: CostRow[])     => JSON.stringify(rows.map(({ localId: _l, productId: _p, unitPrice: _u, ...r }) => r));
  const isDirty = !isEdit || (
    // eslint-disable-next-line react-hooks/refs
    JSON.stringify({ ...form, id: undefined }) !== initFormSnap.current ||
    // eslint-disable-next-line react-hooks/refs
    serRev(revenues)  !== initRevSnap.current ||
    // eslint-disable-next-line react-hooks/refs
    serCost(costs)    !== initCostSnap.current
  );
  const [uploading, setUploading]   = useState<number | null>(null); // localId of uploading row
  const [error, setError]           = useState<string | null>(null);
  const [guaranteeProgress, setGuaranteeProgress] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<"매출" | "매입" | "작업확인">("매출");
  const [toast, setToast]           = useState<string | null>(null);
  const [confirmStatuses, setConfirmStatuses] = useState<Record<string, { status: ConfirmStatus | "발행완료"; rejectReason?: string; requestId?: string; amount?: string; depositConfirmedAt?: string }>>({});
  const [rejectInfo, setRejectInfo]           = useState<{ reason?: string; projectName: string; rowKey: string; requestId: string } | null>(null);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, { status: PaymentStatus; rejectReason?: string; requestId?: string }>>({});
  const [payRejectInfo, setPayRejectInfo]     = useState<{ reason?: string; projectName: string; rowKey: string; requestId: string } | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (_initCache) {
      setClients(_initCache.clients);
      setManagedProducts(_initCache.products);
      setUsers(_initCache.users);
    } else {
      fetchJson<ModalInitData>("/api/modal-init")
        .then((d) => {
          _initCache = {
            clients:  d.clients  ?? [],
            products: d.products ?? [],
            users:    d.users    ?? [],
          };
          setClients(_initCache.clients);
          setManagedProducts(_initCache.products);
          setUsers(_initCache.users);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    if (isEdit && initial?.id) {
      // prefetch 캐시 우선 사용 — 없으면 새로 요청 후 캐시에 저장
      const cached = _projectCache.get(initial.id);
      const pid = initial.id;
      const dataPromise = cached ?? fetchJson<ProjectDetailData>(`/api/projects/${pid}`)
        .catch((e) => { _projectCache.delete(pid); throw e; });
      if (!cached) _projectCache.set(pid, dataPromise);
      dataPromise
        .then(({ revenues: rv, costs: cs, confirmRequests: confirms, paymentRequests: payments }) => {
          // 결재 상태 — 별도 API 호출 없이 여기서 함께 처리
          if (confirms) {
            const m: Record<string, { status: ConfirmStatus | "발행완료"; rejectReason?: string; requestId?: string; amount?: string; depositConfirmedAt?: string }> = {};
            (confirms as Record<string, unknown>[]).forEach((r) => {
              if (!r.rowKey) return;
              m[r.rowKey as string] = {
                status: r.taxInvoiceDate ? "발행완료" as const : r.status as ConfirmStatus,
                rejectReason: r.rejectReason as string | undefined,
                requestId: r.id as string,
                amount: r.amount as string | undefined,
                depositConfirmedAt: r.depositConfirmedAt as string | undefined,
              };
            });
            setConfirmStatuses(m);
          }
          if (payments) {
            const m: Record<string, { status: PaymentStatus; rejectReason?: string; requestId?: string }> = {};
            (payments as Record<string, unknown>[]).forEach((r) => {
              if (!r.rowKey || !r.productName || r.productName === "—") return;
              m[r.rowKey as string] = {
                status: r.status as PaymentStatus,
                rejectReason: r.rejectReason as string | undefined,
                requestId: r.id as string,
              };
            });
            setPaymentStatuses(m);
          }
          const projectEndDate = initial?.endDate ?? "";
          const mappedRev: RevenueRow[] = (rv ?? []).map((r: Record<string, unknown>) => {
            const completed = Boolean(r.workCompleted);
            return {
            localId:        nid(),
            revenueRowId:   r.revenueRowId ? String(r.revenueRowId) : crypto.randomUUID(),
            sectionLabel:   String(r.sectionLabel ?? "1주"),
            assignee:       String(r.assignee ?? ""),
            productName:    String(r.productName ?? ""),
            productId:      "",
            linkedCostLocalId: null,
            unitPrice:      0,
            quantity:       r.quantity != null ? String(r.quantity) : "",
            supplyPrice:    r.supplyPrice != null ? String(r.supplyPrice) : "",
            tax:            r.tax != null ? String(r.tax) : "",
            total:          r.total != null ? String(r.total) : "",
            paymentDate:    String(r.paymentDate ?? ""),
            invoiceDate:    String(r.invoiceDate ?? ""),
            workStartDate:  String(r.workStartDate ?? ""),
            workEndDate:    String(r.workEndDate ?? "") || (!completed ? projectEndDate : ""),
            completedQty:   r.completedQty != null ? String(r.completedQty) : "",
            workCompleted:  Boolean(r.workCompleted),
            depositAccount: String(r.depositAccount ?? ""),
            settingDate:    String(r.settingDate ?? ""),
          }; });
          const mappedCost: CostRow[] = (cs ?? []).map((c: Record<string, unknown>) => ({
            localId:    nid(),
            costRowId:  c.costRowId ? String(c.costRowId) : crypto.randomUUID(),
            sectionLabel: String(c.sectionLabel ?? "1주"),
            assignee:   String(c.assignee ?? ""),
            vendor:     String(c.vendor ?? ""),
            productName: String(c.productName ?? ""),
            productId:  "",
            unitPrice:  c.unitPrice != null ? Number(c.unitPrice) : 0,
            quantity:     c.quantity != null ? String(c.quantity) : "",
            supplyPrice:  c.supplyPrice != null ? String(c.supplyPrice) : "",
            tax:          c.tax != null ? String(c.tax) : "",
            total:        c.total != null ? String(c.total) : "",
            purchaseDate: String(c.purchaseDate ?? ""),
            invoiceDate:  String(c.invoiceDate ?? ""),
            workStartDate:   String(c.workStartDate ?? ""),
            workEndDate:     String(c.workEndDate ?? ""),
            workCompleted:   Boolean(c.workCompleted),
            isApproved:      Boolean(c.isApproved),
            settingDate:     String(c.settingDate ?? ""),
            invoiceFileUrl:  String(c.invoiceFileUrl ?? ""),
            invoiceFileName: String(c.invoiceFileName ?? ""),
          }));
          // 원본(raw) 값을 초기 스냅샷으로 캡처 (productId·unitPrice는 serRev/serCost에서 제외돼 상품 연결만으로는 '변경됨' 아님)
          initRevSnap.current  = serRev(mappedRev);
          initCostSnap.current = serCost(mappedCost);
          setRevenues(mappedRev);
          setCosts(mappedCost);
          setRowsLoaded(true);
          setLoadFailed(false);
        })
        .catch((e: Error) => {
          setLoadFailed(true);
          setError(`${e.message} — 저장하면 기존 매출·매입이 지워질 수 있어 저장을 막았습니다. 창을 닫고 다시 열어주세요.`);
        });
    }
    return () => { document.body.style.overflow = ""; };
  }, [isEdit, initial?.id]);

  // 로드된 행을 상품관리의 올바른 상품(이름+매입처)에 1회 연결한다.
  // (상품 목록과 프로젝트 행이 모두 준비된 뒤 실행. productId·개당 단가만 채우고 저장 금액은 보존.)
  useEffect(() => {
    if (!isEdit || normalizedRef.current) return;
    if (!rowsLoaded || managedProducts.length === 0) return;
    normalizedRef.current = true;
    setRevenues((rows) => normalizeRevRows(rows, managedProducts));
    setCosts((rows) => normalizeCostRows(rows, managedProducts));
  }, [isEdit, rowsLoaded, managedProducts]);

  // 결재 상태는 /api/projects/{id} 응답에 포함되어 별도 로드 불필요

  function setField(f: keyof ProjectFormData, v: string) {
    setForm((p) => ({ ...p, [f]: v }));
    // 작업만료일은 계약 종료일과 별개 — 자동 동기화 없음
  }

  /* ── 보장형 계약 종료일 콜백 ── */
  const handleGuaranteeEndDate = useCallback((calcEndDate: string | null, qualifyingDays: number) => {
    setGuaranteeProgress(qualifyingDays);
    if (calcEndDate) {
      setForm((p) => p.projectType === "보장형" ? { ...p, endDate: calcEndDate } : p);
    }
  }, []);

  /* ── 세금계산서 파일 첨부 (Supabase Storage 업로드) ── */
  const handleInvoiceUpload = useCallback(async (localId: number, file: File) => {
    setUploading(localId);
    try {
      const path = await uploadAttachment(file, "invoices");
      setCosts((prev) => prev.map((c) =>
        c.localId === localId ? { ...c, invoiceFileUrl: path, invoiceFileName: file.name } : c
      ));
      showToast("파일이 첨부되었습니다.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "파일 업로드에 실패했습니다.");
    } finally {
      setUploading(null);
    }
  }, []);

  /* ── 매입 입금요청 반려 → 재요청 허용 ── */
  async function resetPaymentRequest(requestId: string, _productName: string, _amount: string) {
    await deletePaymentRequest(requestId);
    if (savedIdRef.current) invalidateProjectCache(savedIdRef.current);
    setPaymentStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k].requestId === requestId) delete next[k];
      });
      return next;
    });
  }

  /* ── 입금확인요청 반려 → 재요청 허용 ── */
  async function resetConfirmRequest(requestId: string, productName: string, amount: string) {
    await deleteConfirmRequest(requestId);
    setConfirmStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k].requestId === requestId) delete next[k];
      });
      delete next[`${productName}|${amount}`];
      return next;
    });
  }

  /* ── 매출 row helpers ── */
  function updateRev(localId: number, f: keyof Omit<RevenueRow, "localId">, v: string | boolean) {
    // 담당자·작업일은 연동 매입 행에도 동기화
    const SYNC_FIELDS: (keyof Omit<RevenueRow, "localId">)[] = ["assignee", "workStartDate", "workEndDate"];
    if (SYNC_FIELDS.includes(f)) {
      const rev = revenuesRef.current.find((r) => r.localId === localId);
      if (rev?.linkedCostLocalId != null) {
        const linkedId = rev.linkedCostLocalId;
        setCosts((p) => p.map((c) => c.localId === linkedId ? { ...c, [f]: v } : c));
      }
    }
    setRevenues((p) => p.map((r) => r.localId === localId ? { ...r, [f]: v } : r));
  }
  function autoTaxRev(localId: number, supplyStr: string) {
    const supply = parseWon(supplyStr);
    if (supply === null) return;
    setRevenues((p) => p.map((r) => {
      if (r.localId !== localId) return r;
      const noTax = r.depositAccount === "전재민";
      const tax   = noTax ? 0 : Math.round(supply * 0.1);
      return { ...r, supplyPrice: String(supply), tax: String(tax), total: String(supply + tax) };
    }));
  }

  /* ── 매입 row helpers ── */
  function updateCost(localId: number, f: keyof Omit<CostRow, "localId">, v: string | boolean) {
    setCosts((p) => p.map((c) => c.localId === localId ? { ...c, [f]: v } : c));
  }
  function autoTaxCost(localId: number, supplyStr: string) {
    const supply = parseWon(supplyStr);
    if (supply === null) return;
    const tax   = Math.round(supply * 0.1);
    const total = supply + tax;
    setCosts((p) => p.map((c) => c.localId === localId
      ? { ...c, supplyPrice: String(supply), tax: String(tax), total: String(total) } : c));
  }

  /* 매출+매입 행을 1:1 페어로 추가 */
  function addLinkedPair(sectionLabel?: string) {
    const sl = sectionLabel ?? (revenuesRef.current.length > 0
      ? (revenuesRef.current[revenuesRef.current.length - 1].sectionLabel || "1주")
      : "1주");
    const newRev  = emptyRevenue(sl);
    const newCost = emptyCost(sl);
    newRev.linkedCostLocalId = newCost.localId;
    setRevenues((p) => [...p, newRev]);
    setCosts((p) => [...p, newCost]);
  }

  function nextSectionLabel(existingLabels: string[]): string {
    const nums = existingLabels
      .map(s => { const m = s.match(/^(\d+)주$/); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    return `${nums.length > 0 ? Math.max(...nums) + 1 : 1}주`;
  }

  function addSection() {
    const allLabels = [...new Map(revenuesRef.current.map(r => [r.sectionLabel || "1주", true] as [string, boolean])).keys()];
    const sl = nextSectionLabel(allLabels);
    const newRev = emptyRevenue(sl);
    const newCost = emptyCost(sl);
    newRev.linkedCostLocalId = newCost.localId;
    setRevenues(p => [...p, newRev]);
    setCosts(p => [...p, newCost]);
  }

  function addCostSection() {
    const allLabels = [...new Map(costsRef.current.map(c => [c.sectionLabel || "1주", true] as [string, boolean])).keys()];
    const sl = nextSectionLabel(allLabels);
    setCosts(p => [...p, emptyCost(sl)]);
  }

  function copyCostSection(sectionLabel: string) {
    const sectionRows = costsRef.current.filter(c => (c.sectionLabel || "1주") === sectionLabel);
    const allLabels = [...new Map(costsRef.current.map(c => [c.sectionLabel || "1주", true] as [string, boolean])).keys()];
    const nextLabel = nextSectionLabel(allLabels);
    const newCostRows = sectionRows.map(c => ({
      ...c,
      localId:        nid(),
      costRowId:      crypto.randomUUID(),
      sectionLabel:   nextLabel,
      purchaseDate:   "",
      invoiceDate:    "",
      workCompleted:  false,
      isApproved:     false,
      invoiceFileUrl: "",
      invoiceFileName:"",
    }));
    setCosts(p => [...p, ...newCostRows]);
  }

  function copySection(sectionLabel: string) {
    const sectionRows = revenuesRef.current.filter(r => (r.sectionLabel || "1주") === sectionLabel);
    const allLabels = [...new Map(revenuesRef.current.map(r => [r.sectionLabel || "1주", true] as [string, boolean])).keys()];
    const nextLabel = nextSectionLabel(allLabels);
    const newRevRows = sectionRows.map(r => ({
      ...r,
      localId: nid(),
      revenueRowId: crypto.randomUUID(),
      linkedCostLocalId: null,
      sectionLabel: nextLabel,
      paymentDate: "",
      invoiceDate: "",
      workCompleted: false,
    }));
    const newCostRows = newRevRows.map(() => emptyCost(nextLabel));
    setRevenues(p => [...p, ...newRevRows]);
    setCosts(p => [...p, ...newCostRows]);
  }

  /* 매출 행 품명 타이핑 — 글자를 지우거나 고치는 동안에는 상품 연결만 끊고 금액은 건드리지 않는다.
     (타이핑 도중 다른 상품명과 잠깐 일치해 금액이 덮어써지는 것을 막는다) */
  function editRevProductName(localId: number, typed: string) {
    setRevenues((prev) => prev.map((r) => (
      r.localId === localId ? { ...r, productName: typed, productId: "", unitPrice: 0 } : r
    )));
  }

  /* 입력을 마쳤을 때(blur) 상품관리에 등록된 품명과 일치하면
     판매가 기준으로 금액을 채우고 연동 매입 행도 동기화한다. */
  function linkRevProduct(localId: number, typed: string) {
    const p = findRevProduct(typed.trim(), managedProducts);
    if (!p) return;
    const saleUP = p.salePrice ?? 0;
    const costUP = p.costPrice ?? 0;

    // 현재 revenue 행 정보를 ref로 읽어 linked cost 업데이트
    const rev = revenuesRef.current.find((r) => r.localId === localId);
    if (rev?.linkedCostLocalId != null) {
      const linkedId = rev.linkedCostLocalId;
      const qty = parseInt(rev.quantity) || 1;
      const costSupply = costUP * qty;
      const costTax    = Math.round(costSupply * 0.1);
      setCosts((prev) => prev.map((c) => {
        if (c.localId !== linkedId) return c;
        return {
          ...c,
          productName: p.name,
          productId:   p.id,
          vendor:      p.vendor ?? c.vendor,
          unitPrice:   costUP,
          supplyPrice: costUP > 0 ? String(costSupply) : c.supplyPrice,
          tax:         costUP > 0 ? String(costTax)    : c.tax,
          total:       costUP > 0 ? String(costSupply + costTax) : c.total,
        };
      }));
    }

    setRevenues((prev) => prev.map((r) => {
      if (r.localId !== localId) return r;
      const qty    = parseInt(r.quantity) || 1;
      const supply = saleUP * qty;
      const noTax  = r.depositAccount === "전재민";
      const tax    = noTax ? 0 : Math.round(supply * 0.1);
      return {
        ...r,
        productName: typed,
        productId:   p.id,
        unitPrice:   saleUP,
        supplyPrice: saleUP > 0 ? String(supply) : r.supplyPrice,
        tax:         saleUP > 0 ? String(tax)    : r.tax,
        total:       saleUP > 0 ? String(supply + tax) : r.total,
      };
    }));
  }

  function handleRevQuantity(localId: number, qtyStr: string) {
    // 연동 매입 행 수량도 함께 업데이트
    const rev = revenuesRef.current.find((r) => r.localId === localId);
    if (rev?.linkedCostLocalId != null) {
      const linkedId = rev.linkedCostLocalId;
      setCosts((prev) => prev.map((c) => {
        if (c.localId !== linkedId) return c;
        const qty = parseInt(qtyStr) || 0;
        if (c.unitPrice > 0 && qty > 0) {
          const supply = c.unitPrice * qty;
          const taxed  = (parseWon(c.tax) ?? 0) > 0;
          const tax    = taxed ? Math.round(supply * 0.1) : 0;
          return { ...c, quantity: qtyStr, supplyPrice: String(supply), tax: String(tax), total: String(supply + tax) };
        }
        return { ...c, quantity: qtyStr };
      }));
    }

    setRevenues((prev) => prev.map((r) => {
      if (r.localId !== localId) return r;
      const qty = parseInt(qtyStr) || 0;
      if (r.unitPrice > 0 && qty > 0) {
        const supply = r.unitPrice * qty;
        const noTax  = r.depositAccount === "전재민" || (parseWon(r.tax) ?? 0) === 0;
        const tax    = noTax ? 0 : Math.round(supply * 0.1);
        return { ...r, quantity: qtyStr, supplyPrice: String(supply), tax: String(tax), total: String(supply + tax) };
      }
      return { ...r, quantity: qtyStr };
    }));
  }

  /* 매입 행 품명 타이핑 — 입력 중에는 상품 연결만 끊는다 */
  function editCostProductName(localId: number, typed: string) {
    setCosts((prev) => prev.map((c) => (
      c.localId === localId ? { ...c, productName: typed, productId: "", unitPrice: 0 } : c
    )));
  }

  /* 입력을 마쳤을 때(blur) 등록 상품과 일치하면 매입가 기준으로 금액을 채운다 */
  function linkCostProduct(localId: number, typed: string) {
    const cost = costsRef.current.find((c) => c.localId === localId);
    const p = findCostProduct(typed.trim(), cost?.vendor ?? "", managedProducts);
    if (!p) return;
    const unitPrice = p.costPrice ?? 0;
    setCosts((prev) => prev.map((c) => {
      if (c.localId !== localId) return c;
      const qty    = parseInt(c.quantity) || 1;
      const supply = unitPrice * qty;
      const tax    = Math.round(supply * 0.1);
      const total  = supply + tax;
      return {
        ...c,
        productName: typed,
        productId:   p.id,
        vendor:      p.vendor ?? c.vendor,
        unitPrice,
        supplyPrice: unitPrice > 0 ? String(supply) : c.supplyPrice,
        tax:         unitPrice > 0 ? String(tax)    : c.tax,
        total:       unitPrice > 0 ? String(total)  : c.total,
      };
    }));
  }

  function handleCostQuantity(localId: number, qtyStr: string) {
    setCosts((prev) => prev.map((c) => {
      if (c.localId !== localId) return c;
      const qty = parseInt(qtyStr) || 0;
      if (c.unitPrice > 0 && qty > 0) {
        const supply = c.unitPrice * qty;
        const taxed  = (parseWon(c.tax) ?? 0) > 0;
        const tax    = taxed ? Math.round(supply * 0.1) : 0;
        const total  = supply + tax;
        return { ...c, quantity: qtyStr, supplyPrice: String(supply), tax: String(tax), total: String(total) };
      }
      return { ...c, quantity: qtyStr };
    }));
  }

  const requiredFields: { key: keyof ProjectFormData; label: string }[] = [
    { key: "campaignName",   label: "캠페인명" },
    { key: "projectType",    label: "유형" },
    { key: "advertiser",     label: "광고주" },
    { key: "product",        label: "상품" },
    { key: "assignedTeam",   label: "담당팀" },
    { key: "assignedPerson", label: "담당자" },
    { key: "startDate",      label: "시작일" },
    { key: "clientId",       label: "연결 광고주" },
  ];
  const missingFields = requiredFields.filter((f) => !String(form[f.key] ?? "").trim());
  const isFormValid = missingFields.length === 0;

  // 저장을 순차 실행 — 이전 저장이 끝난 뒤에만 다음 저장 시작(경합 방지)
  function ensureSaved(): Promise<string | null> {
    const run = saveLockRef.current.then(() => ensureSavedInner(), () => ensureSavedInner());
    saveLockRef.current = run.catch(() => {});
    return run;
  }

  // 신규 프로젝트일 때 결재 버튼 클릭 시 자동으로 먼저 저장
  async function ensureSavedInner(): Promise<string | null> {
    if (loadFailed) {
      setError("매출·매입을 불러오지 못한 상태에서는 저장할 수 없습니다. 창을 닫고 다시 열어주세요.");
      return null;
    }
    if (savedIdRef.current) {
      // 기존 프로젝트: 승인요청 전에 현재 costs/revenues를 DB에 저장
      // invoiceFileUrl은 이제 스토리지 경로(수십 바이트)라 그대로 전송해도 body 크기 문제 없음
      const pid = savedIdRef.current;
      const [, costRes] = await Promise.all([
        fetch(`/api/projects/${pid}/revenues`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revenues }) }),
        fetch(`/api/projects/${pid}/costs`,    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costs }) }),
      ]);
      if (!costRes.ok) {
        setError(costRes.status === 401
          ? SESSION_EXPIRED_MESSAGE
          : await saveErrorMessage(costRes, "매입 데이터 저장에 실패했습니다. 먼저 저장해주세요."));
        return null;
      }
      return pid;
    }
    if (!isFormValid) {
      setError(`먼저 기본 정보를 입력해주세요: ${missingFields.map((f) => f.label).join(", ")}`);
      return null;
    }
    setSaving(true); setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectGroupId: projectGroupId ?? null }),
    });
    if (!res.ok) { setSaving(false); setError(await saveErrorMessage(res)); return null; }
    const { project } = await res.json();
    const pid: string = project.id;
    await Promise.all([
      fetch(`/api/projects/${pid}/revenues`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revenues }) }),
      fetch(`/api/projects/${pid}/costs`,    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costs }) }),
    ]);
    savedIdRef.current = pid;
    setSavedId(pid);
    setSaving(false);
    return pid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loadFailed) {
      setError("매출·매입을 불러오지 못한 상태에서는 저장할 수 없습니다. 창을 닫고 다시 열어주세요.");
      return;
    }
    if (!isFormValid) {
      setError(`필수 항목을 입력해주세요: ${missingFields.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true); setError(null);

    const effectiveId = savedIdRef.current ?? savedId;
    const url    = effectiveId ? `/api/projects/${effectiveId}` : "/api/projects";
    const method = effectiveId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectGroupId: projectGroupId ?? null }),
    });
    if (!res.ok) { setSaving(false); setError(await saveErrorMessage(res)); return; }

    const { project, projectGroupId: newGroupId } = await res.json();
    const pid = effectiveId ?? project.id;

    // 서버가 종료일 기준으로 상태를 다시 계산한다(기간 연장 → 진행중). 헤더 배지를 응답 값에 맞추고
    // 스냅샷도 함께 갱신해, 사용자가 만지지 않은 이 변경이 '저장 안 함' 경고로 이어지지 않게 한다.
    if (project?.status && project.status !== form.status) {
      const nextForm = { ...form, status: project.status as Status };
      initFormSnap.current = JSON.stringify({ ...nextForm, id: undefined });
      setForm(nextForm);
    }

    const [revRes, costRes] = await Promise.all([
      fetch(`/api/projects/${pid}/revenues`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenues }),
      }),
      fetch(`/api/projects/${pid}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs }),
      }),
    ]);

    if (!revRes.ok || !costRes.ok) {
      const failed = !revRes.ok ? revRes : costRes;
      setSaving(false);
      setError(await saveErrorMessage(failed));
      return;
    }

    invalidateProjectCache(pid);
    setSaving(false);
    if (method === "PATCH") {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
    onSaved(newGroupId ?? undefined);
  }

  const totalRevenue      = revenues.reduce((s, r) => s + (parseWon(r.total) ?? 0), 0);
  const totalSupply       = revenues.reduce((s, r) => s + (parseWon(r.supplyPrice) ?? 0), 0);
  const totalTax          = revenues.reduce((s, r) => s + (parseWon(r.tax) ?? 0), 0);
  // KPI 직접 입력값 사용 (없으면 매출 테이블 합계로 대체) — 입금확인요청 금액은 VAT 포함 총액
  const effectiveTotal = parseWon(form.contractAmount) || totalRevenue;

  // ── 손익은 공급가(VAT 제외) 기준, 매입은 승인된 건만 ──
  // 부가세는 납부·환급되므로 이익에 포함하지 않는다. 다른 화면(프로젝트관리 KPI·
  // 경영관리·대시보드)도 모두 공급가 기준이므로 여기서도 같은 기준을 쓴다.
  const effectiveSupply     = (parseWon(form.kpiSupply) || totalSupply);
  const totalSupplyCost     = costs.reduce((s, c) => s + (parseWon(c.supplyPrice) ?? 0), 0);
  const approvedSupplyCost  = costs.filter(c => c.isApproved)
                                   .reduce((s, c) => s + (parseWon(c.supplyPrice) ?? 0), 0);
  const unapprovedSupplyCost = totalSupplyCost - approvedSupplyCost;
  const approvedProfit      = effectiveSupply - approvedSupplyCost;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(22,31,51,0.5)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="w-full my-4 rounded-2xl"
        style={{ maxWidth: 1500, background: "#FFFFFF", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold" style={{ color: "#191F28" }}>
              {isEdit ? form.campaignName || "프로젝트 수정" : "프로젝트 추가"}
            </h2>
            {isEdit && (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{
                background: form.status === "종료" ? "#F1F5F9" : "rgba(49,130,246,0.1)",
                color: form.status === "종료" ? "#64748B" : "#3182F6",
              }}>{form.status === "종료" ? "종료" : "진행중"}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">

            {/* 기본 정보 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <label className={labelCls} style={labelStyle}>캠페인명 *</label>
                <input type="text" value={form.campaignName} onChange={(e) => setField("campaignName", e.target.value)} placeholder="캠페인명 입력" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>유형</label>
                <div className="flex gap-1.5">
                  {(["관리형", "보장형"] as const).map((type) => {
                    const isActive = form.projectType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, projectType: isActive ? "" : type }))}
                        className="flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all"
                        style={{
                          background: isActive ? (type === "관리형" ? "rgba(49,130,246,0.12)" : "rgba(139,92,246,0.12)") : "#F8FAFC",
                          borderColor: isActive ? (type === "관리형" ? "#3182F6" : "#8B5CF6") : "#E9EBEF",
                          color: isActive ? (type === "관리형" ? "#3182F6" : "#8B5CF6") : "#94A3B8",
                        }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>광고주</label>
                <input type="text" value={form.advertiser} onChange={(e) => setField("advertiser", e.target.value)} placeholder="광고주명" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>상품</label>
                <select value={form.product} onChange={(e) => setField("product", e.target.value)} className={inputCls} style={inputStyle}>
                  <option value="">선택</option>
                  {PRODUCT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>담당팀</label>
                <div className={`${inputCls} flex items-center`} style={{ ...inputStyle, cursor: "default" }}>
                  {form.assignedTeam ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={teamBadgeStyle(form.assignedTeam)}>{form.assignedTeam}</span>
                  ) : (
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>담당자 선택 시 자동 입력</span>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>담당자</label>
                <select value={form.assignedPerson}
                  onChange={(e) => {
                    const name = e.target.value;
                    const user = users.find((u) => u.name === name);
                    setForm((p) => ({ ...p, assignedPerson: name, assignedTeam: user?.team ?? p.assignedTeam }));
                  }}
                  className={inputCls} style={inputStyle}>
                  <option value="">선택 안 함</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.name}>{u.name} ({u.team})</option>
                  ))}
                  {form.assignedPerson && !users.some((u) => u.name === form.assignedPerson) && (
                    <option value={form.assignedPerson}>{form.assignedPerson}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>계약 종료일</label>
                  <div className="flex items-center gap-2">
                    {form.projectType === "보장형" && isEdit && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                        background: guaranteeProgress >= 25 ? "rgba(5,150,105,0.12)" : "rgba(49,130,246,0.1)",
                        color: guaranteeProgress >= 25 ? "#059669" : "#3182F6",
                      }}>
                        보장 {guaranteeProgress}/25일
                      </span>
                    )}
                    {form.endDate && (
                      <span className="text-xs font-bold" style={{ color: (() => { const d = daysLeft(form.endDate); return d === null ? "#94A3B8" : d <= 1 ? "#EF4444" : d <= 3 ? "#F97316" : d <= 7 ? "#EAB308" : "#3182F6"; })() }}>
                        {(() => { const d = daysLeft(form.endDate); return d === null ? "" : d < 0 ? `${Math.abs(d)}일 초과` : d === 0 ? "오늘 종료" : `D-${d}`; })()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} className={`${inputCls} flex-1`} style={inputStyle} />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, isExtended: !f.isExtended }))}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                    style={{
                      background: form.isExtended ? "rgba(99,102,241,0.1)" : "#F1F5F9",
                      color: form.isExtended ? "#6366F1" : "#94A3B8",
                      border: `1px solid ${form.isExtended ? "rgba(99,102,241,0.3)" : "#E9EBEF"}`,
                    }}
                  >
                    <span className="relative inline-flex w-6 h-3.5 rounded-full shrink-0 transition-colors"
                      style={{ background: form.isExtended ? "#6366F1" : "#D1D5DB" }}>
                      <span className="absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: form.isExtended ? "translateX(10px)" : "translateX(0)" }} />
                    </span>
                    연장
                  </button>
                </div>
              </div>
            </div>

            {/* 연결 광고주 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>연결 광고주</label>
                  {form.assignedTeam && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={teamBadgeStyle(form.assignedTeam, 0.1)}>
                      {form.assignedTeam}
                    </span>
                  )}
                </div>
                {form.assignedTeam ? (
                  <>
                    <div className="flex gap-2 items-center">
                      <select
                        value={form.clientId ?? ""}
                        onChange={(e) => {
                          const selectedId = e.target.value || undefined;
                          const client = clients.find((c) => c.id === selectedId);
                          setForm((prev) => {
                            if (!client) return { ...prev, clientId: undefined };
                            return {
                              ...prev,
                              clientId:       selectedId,
                              campaignName:   prev.campaignName   || client.companyName,
                              status:         (prev.status        || client.status) as typeof prev.status,
                              advertiser:     prev.advertiser     || client.advertiserName || client.companyName,
                              product:        prev.product        || client.products[0] || "",
                              assignedTeam:   prev.assignedTeam   || client.assignedTeam  || "",
                              assignedPerson: prev.assignedPerson || client.assignedPerson || "",
                              contractAmount: prev.contractAmount || "",
                              startDate:      prev.startDate      || "",
                              endDate:        prev.endDate        || client.endDate       || "",
                            };
                          });
                        }}
                        className={inputCls}
                        style={inputStyle}
                      >
                        <option value="">선택 안 함</option>
                        {clients
                          .filter((c) => matchesTeam(c.assignedTeam, form.assignedTeam))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.companyName}</option>
                          ))
                        }
                      </select>
                      {form.clientId && onViewClient && (
                        <button
                          type="button"
                          onClick={() => onViewClient(form.clientId!)}
                          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors hover:bg-slate-50"
                          style={{ color: "#3182F6", border: "1px solid #E9EBEF", whiteSpace: "nowrap" }}
                        >
                          광고주 보기
                        </button>
                      )}
                    </div>
                    {clients.filter(c => matchesTeam(c.assignedTeam, form.assignedTeam)).length === 0 && (
                      <p className="text-xs mt-1" style={{ color: "#F97316" }}>
                        {form.assignedTeam}에 등록된 광고주가 없습니다.
                      </p>
                    )}
                    {(() => {
                      const selectedClient = clients.find(c => c.id === form.clientId);
                      if (!selectedClient) return null;
                      const urls = selectedClient.urls ?? [];
                      return (
                        <>
                          {(selectedClient.companyName || selectedClient.storeName) && (
                            <div className="flex gap-3 mt-2 px-3 py-2 rounded-lg" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                              {selectedClient.companyName && (
                                <div>
                                  <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>플레이스/스토어명</p>
                                  <p className="text-xs font-semibold" style={{ color: "#191F28" }}>{selectedClient.companyName}</p>
                                </div>
                              )}
                              {selectedClient.storeName && (
                                <div>
                                  <p className="text-xs mb-0.5" style={{ color: "#94A3B8" }}>상호명 (사업자등록기준)</p>
                                  <p className="text-xs font-semibold" style={{ color: "#191F28" }}>{selectedClient.storeName}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {urls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {urls.map((u, i) => (
                                <a
                                  key={i}
                                  href={u.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
                                  style={{ background: "rgba(49,130,246,0.08)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                  </svg>
                                  {u.label || u.url}
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="flex items-center px-3 py-2 rounded-lg text-xs" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF", color: "#94A3B8" }}>
                    담당팀을 먼저 선택해주세요
                  </div>
                )}
              </div>
            </div>

            {/* 매출 / 매입 탭 */}
            <div>
              {/* 요약 */}
              {(() => {
                const contractKey = "__contract__";
                const cs = confirmStatuses[contractKey];
                const canRequest = Boolean(
                  (isEdit || isFormValid) &&
                  form.campaignName
                );
                const effectiveTax = form.kpiTax !== "" && form.kpiTax !== undefined
                  ? (parseInt(form.kpiTax) || 0)
                  : totalTax;
                const isTaxExempt = effectiveTax === 0;

                return (
                  <div className="mb-4 p-4 rounded-2xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                    {/* 수치 행 */}
                    <div className="flex gap-5 items-center flex-wrap">
                      {/* 공급가 직접 입력 */}
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>공급가 합계</p>
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩</span>
                          <input type="text"
                            value={form.kpiSupply ? Number(form.kpiSupply.replace(/,/g,"")).toLocaleString() : ""}
                            onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g,""); const supply = parseInt(raw)||0; const tax = Math.round(supply * 0.1); setForm(p=>({ ...p, kpiSupply: raw, kpiTax: String(tax), contractAmount: String(supply + tax) })); }}
                            placeholder="0"
                            className="text-sm font-bold outline-none border-b-2 bg-transparent transition-colors focus:border-[#3182F6]"
                            style={{ color: "#3182F6", borderColor: "#E9EBEF", width: 90 }} />
                        </div>
                        {totalSupply > 0 && <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>테이블: ₩{totalSupply.toLocaleString()}</p>}
                      </div>
                      <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                      {/* 부가세 직접 입력 */}
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>부가세 합계</p>
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩</span>
                          <input type="text"
                            value={form.kpiTax ? Number(form.kpiTax.replace(/,/g,"")).toLocaleString() : ""}
                            onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g,""); setForm(p=>({ ...p, kpiTax: raw, contractAmount: String((parseInt(p.kpiSupply)||0) + (parseInt(raw)||0)) })); }}
                            placeholder="0"
                            className="text-sm font-bold outline-none border-b-2 bg-transparent transition-colors focus:border-[#3182F6]"
                            style={{ color: "#3182F6", borderColor: "#E9EBEF", width: 90 }} />
                        </div>
                        {totalTax > 0 && <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>테이블: ₩{totalTax.toLocaleString()}</p>}
                      </div>
                      <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                      {/* 총 매출 직접 입력 */}
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>총 매출(판매)</p>
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩</span>
                          <input type="text"
                            value={form.contractAmount ? Number(form.contractAmount.replace(/,/g,"")).toLocaleString() : ""}
                            /* 총 매출을 직접 입력하면 공급가·부가세를 역산해 채운다 (VAT 10% 포함가 기준).
                               부가세는 뺄셈으로 구해 공급가+부가세가 입력한 총액과 항상 정확히 일치하게 한다. */
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g,"");
                              if (raw === "") { setForm(p=>({...p, contractAmount: "", kpiSupply: "", kpiTax: ""})); return; }
                              const total  = parseInt(raw) || 0;
                              const supply = Math.round(total / 1.1);
                              setForm(p=>({...p, contractAmount: raw, kpiSupply: String(supply), kpiTax: String(total - supply)}));
                            }}
                            placeholder="직접 입력"
                            className="text-sm font-bold outline-none border-b-2 bg-transparent transition-colors focus:border-[#3182F6]"
                            style={{ color: "#3182F6", borderColor: "#E9EBEF", width: 110 }} />
                        </div>
                        {totalRevenue > 0 && <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>테이블: ₩{totalRevenue.toLocaleString()}</p>}
                      </div>
                      <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>총 매입(구매)</p>
                        <p className="text-sm font-bold" style={{ color: "#191F28" }}>₩{approvedSupplyCost.toLocaleString()}</p>
                        {unapprovedSupplyCost > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>
                            미승인 ₩{unapprovedSupplyCost.toLocaleString()} 제외
                          </p>
                        )}
                      </div>
                      {/* 매입은 실제 작업에 들어가야 잡히므로, 승인 매입이 아직 없어도 영업이익을 보여준다 */}
                      {effectiveSupply > 0 && (
                        <>
                          <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                          <div>
                            <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>영업이익</p>
                            <p className="text-sm font-bold" style={{ color: approvedProfit >= 0 ? "#10B981" : "#EF4444" }}>₩{approvedProfit.toLocaleString()}</p>
                            <p className="text-xs mt-0.5" style={{ color: "#CBD5E1" }}>공급가 기준</p>
                          </div>
                          <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                          <div>
                            <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>마진율</p>
                            <p className="text-sm font-bold" style={{ color: approvedProfit >= 0 ? "#10B981" : "#EF4444" }}>
                              {Math.round((approvedProfit / effectiveSupply) * 100)}%
                            </p>
                          </div>
                        </>
                      )}

                      {/* 입금확인요청 버튼 — 우측 정렬 */}
                      <div className="ml-auto flex items-center gap-2">
                        {isTaxExempt && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(148,163,184,0.1)", color: "#94A3B8", border: "1px solid rgba(148,163,184,0.25)" }}>세금계산서 발행 불필요</span>
                        )}
                        {cs?.status === "발행완료" && (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(5,150,105,0.1)", color: "#059669", border: "1px solid rgba(5,150,105,0.2)" }}>계산서 발행완료</span>
                        )}
                        {cs?.status === "반려" && (
                          <div className="flex items-center gap-1.5">
                            <button type="button"
                              onClick={() => setRejectInfo({ reason: cs.rejectReason, projectName: form.campaignName, rowKey: contractKey, requestId: cs.requestId ?? "" })}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>반려</button>
                            <button type="button"
                              onClick={() => { if (confirm("재요청하시겠습니까?")) resetConfirmRequest(cs.requestId ?? "", "계약금액 일괄", `₩${effectiveTotal.toLocaleString()}`); }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)" }}>재요청</button>
                          </div>
                        )}
                        {cs?.status !== "반려" && cs?.status !== "발행완료" && (() => {
                          const isPending  = cs?.status === "대기" && !cs?.depositConfirmedAt;
                          const isApproved = cs?.status === "확인완료" || Boolean(cs?.depositConfirmedAt);
                          const isActive   = !isPending && !isApproved && canRequest;
                          return (
                            <button
                              type="button"
                              disabled={isPending || isApproved || !canRequest}
                              title={(!isPending && !isApproved && !canRequest) ? (
                                !form.campaignName ? "캠페인명을 입력해주세요." :
                                !isFormValid && !isEdit ? `기본 정보를 모두 입력해주세요: ${missingFields.filter(f => f.key !== "campaignName").map(f => f.label).join(", ")}` :
                                ""
                              ) : ""}
                              onClick={async () => {
                                try {
                                  const pid = await ensureSaved();
                                  if (!pid) return;
                                  let clientBusinessNumber = "", clientEmail = "", clientIndustry = "", clientCategory = "";
                                  if (form.clientId) {
                                    try {
                                      const res = await fetch(`/api/clients/${form.clientId}`);
                                      const { client } = await res.json();
                                      clientBusinessNumber = client?.businessNumber ?? "";
                                      clientEmail          = client?.contactEmail  ?? "";
                                      clientIndustry       = client?.industry      ?? "";
                                      clientCategory       = client?.category      ?? "";
                                    } catch {}
                                  }
                                  const clientInfo = clients.find((c) => c.id === form.clientId);
                                  const newReq = await addConfirmRequest({
                                    projectId:      pid,
                                    rowKey:         contractKey,
                                    clientId:       form.clientId,
                                    assignedTeam:   form.assignedTeam || null,
                                    projectName:    form.campaignName || "미지정",
                                    requester:      form.assignedPerson || "—",
                                    productName:    "계약금액 일괄",
                                    description:    form.campaignName || "",
                                    quantity:       "1",
                                    amount:         `₩${effectiveTotal.toLocaleString()}`,
                                    workStartDate:  form.startDate || "",
                                    workEndDate:    form.endDate || "",
                                    clientName:      clientInfo?.companyName || form.advertiser || "—",
                                    clientStoreName: clientInfo?.storeName || "",
                                    clientBusinessNumber,
                                    clientEmail,
                                    clientIndustry,
                                    clientCategory,
                                    dueDate:        form.startDate || "",
                                    depositAccount: revenuesRef.current.find(r => r.depositAccount)?.depositAccount || "",
                                    depositorName:  clientInfo?.advertiserName || "",
                                    taxExempt:      effectiveTax === 0,
                                  });
                                  setConfirmStatuses((p) => ({ ...p, [contractKey]: { status: "대기", requestId: newReq.id } }));
                                  invalidateProjectCache(pid);
                                  window.dispatchEvent(new Event("approval-request-added"));
                                  showToast("요청이 완료되었습니다.");
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "입금확인 요청에 실패했습니다.");
                                }
                              }}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all"
                              style={{
                                background: isApproved ? "linear-gradient(135deg, #10B981, #059669)"
                                          : isActive   ? "linear-gradient(135deg, #3182F6, #2462D8)"
                                          : "#F1F5F9",
                                color:      isApproved ? "#fff" : isActive ? "#fff" : "#94A3B8",
                                cursor:     (isPending || isApproved || !canRequest) ? "not-allowed" : "pointer",
                                boxShadow:  isApproved ? "0 1px 4px rgba(16,185,129,0.3)"
                                          : isActive   ? "0 1px 4px rgba(49,130,246,0.3)" : "none",
                              }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                {isApproved
                                  ? <polyline points="20 6 9 17 4 12"/>
                                  : <><polyline points="22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>
                                }
                              </svg>
                              {isApproved ? "승인됨" : isPending ? "요청됨 (검토 중)" : "입금확인요청"}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 탭 스위처 */}
              <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: "#E9EBEF" }}>
                {([
                  { key: "매출", label: "매출(판매)", count: revenues.length, activeColor: "#3182F6" },
                  { key: "매입", label: "매입(구매)", count: costs.length, activeColor: "#3182F6" },
                  { key: "작업확인", label: "작업확인", count: costs.length, activeColor: "#059669" },
                ] as const).map(({ key, label, count, activeColor }) => {
                  const isActive = activeSection === key;
                  return (
                    <button key={key} type="button" onClick={() => setActiveSection(key)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all"
                      style={{
                        color: isActive ? "#191F28" : "#94A3B8",
                        borderBottom: isActive ? `2px solid ${activeColor}` : "2px solid transparent",
                        marginBottom: -1,
                      }}>
                      {label}
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{
                        background: isActive ? `${activeColor}1A` : "#F1F5F9",
                        color: isActive ? activeColor : "#B0B8C1",
                      }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* 매출 섹션 */}
              {activeSection === "매출" && (
              <div>
                  {(totalSupply > 0 || totalTax > 0 || totalRevenue > 0) && (
                    <div className="mb-3 flex items-center gap-5 px-4 py-2.5 rounded-xl" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: "#64748B" }}>공급가 합계</span>
                        <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩{totalSupply.toLocaleString()}</span>
                      </div>
                      <div className="w-px h-4" style={{ background: "#BFDBFE" }} />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: "#64748B" }}>세액 합계</span>
                        <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩{totalTax.toLocaleString()}</span>
                      </div>
                      <div className="w-px h-4" style={{ background: "#BFDBFE" }} />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: "#64748B" }}>총액</span>
                        <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩{totalRevenue.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  {/* 품명은 직접 입력하되, 상품관리 등록 품명은 자동완성 후보로 제안한다 */}
                  <datalist id="rev-product-options">
                    {managedProducts.map((p) => (
                      <option key={p.id} value={p.vendor ? `${p.name} · ${p.vendor}` : p.name}>{p.category}</option>
                    ))}
                  </datalist>
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E9EBEF" }}>
                    <table className="w-full text-xs" style={{ minWidth: 1200 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {["#","담당자","품명","개수","공급가","세액","합계","입금계좌","입금날짜","계산서날짜","작업시작일","작업만료일","잔여일",""].map((h, idx) => (
                            <th key={idx} className="px-2 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#64748B", background: "#F8FAFC", borderBottom: "2px solid #E9EBEF" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Map(revenues.map(r => [r.sectionLabel || "1주", true] as [string, boolean])).keys()].flatMap(section => {
                          const sectionRows = revenues.filter(r => (r.sectionLabel || "1주") === section);
                          return [
                            <tr key={`sh-${section}`} style={{ background: "#EFF6FF" }}>
                              <td colSpan={14} className="px-3 py-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs" style={{ color: "#3182F6" }}>{section}</span>
                                  <button
                                    type="button"
                                    onClick={() => copySection(section)}
                                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border transition-colors hover:bg-blue-50"
                                    style={{ borderColor: "#BFDBFE", color: "#3182F6" }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    섹션 복사
                                  </button>
                                </div>
                              </td>
                            </tr>,
                            ...sectionRows.map((r) => {
                          const i = revenues.indexOf(r);
                          const remDays = daysLeft(r.workEndDate);
                          const revConfirmStatus = confirmStatuses[r.revenueRowId];
                          const revDeleteBlocked = Boolean(revConfirmStatus && revConfirmStatus.status !== "반려");
                          return (
                            <tr key={r.localId} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                              <td className="px-2 py-1.5 font-medium" style={{ color: "#94A3B8" }}>{i+1}</td>
                              <td className="px-1 py-1">
                                <select value={r.assignee} onChange={(e) => updateRev(r.localId,"assignee",e.target.value)} className={inputCls} style={{...inputStyle, width:80}}>
                                  <option value="">-</option>
                                  {(form.assignedTeam ? users.filter((u) => u.team === form.assignedTeam) : users).map((u) => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                                  {r.assignee && !users.some((u) => u.name === r.assignee) && (
                                    <option value={r.assignee}>{r.assignee}</option>
                                  )}
                                </select>
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="text"
                                  list="rev-product-options"
                                  value={r.productName}
                                  onChange={(e) => editRevProductName(r.localId, e.target.value)}
                                  onBlur={(e) => linkRevProduct(r.localId, e.target.value)}
                                  placeholder="품명 입력"
                                  title="직접 입력할 수 있습니다. 상품관리에 등록된 품명과 같으면 단가·금액이 자동 계산됩니다."
                                  className={inputCls}
                                  style={{...inputStyle, width: 150}}
                                />
                              </td>
                              <td className="px-1 py-1"><input type="number" value={r.quantity} onChange={(e) => handleRevQuantity(r.localId, e.target.value)} className={inputCls} style={{...inputStyle, width:50}} /></td>
                              <td className="px-1 py-1">
                                {/* 상품 단가가 있으면 개수 변경 시 자동 계산되지만, 공급가 직접 수정도 항상 허용한다 */}
                                <input type="text" value={wonFmt(r.supplyPrice)} onChange={(e) => updateRev(r.localId,"supplyPrice",e.target.value)} onBlur={(e) => autoTaxRev(r.localId, e.target.value)} title={r.unitPrice > 0 ? "개수를 바꾸면 상품 등록 개당 단가 × 개수로 자동 계산됩니다. 직접 입력해 덮어쓸 수도 있습니다." : ""} className={inputCls} style={{...inputStyle, width:80}} />
                              </td>
                              <td className="px-1 py-1"><input type="text" value={wonFmt(r.tax)} onChange={(e) => updateRev(r.localId,"tax",e.target.value)} className={inputCls} style={{...inputStyle, width:65}} /></td>
                              <td className="px-1 py-1"><input type="text" value={wonFmt(r.total)} onChange={(e) => updateRev(r.localId,"total",e.target.value)} className={inputCls} style={{...inputStyle, width:80}} /></td>
                              <td className="px-1 py-1">
                                <select
                                  value={r.depositAccount}
                                  onChange={(e) => {
                                    const acc = e.target.value;
                                    setRevenues((p) => p.map((row) => {
                                      if (row.localId !== r.localId) return row;
                                      const supply = parseWon(row.supplyPrice) ?? null;
                                      if (supply === null) return { ...row, depositAccount: acc };
                                      const noTax = acc === "전재민";
                                      const tax   = noTax ? 0 : Math.round(supply * 0.1);
                                      return { ...row, depositAccount: acc, tax: String(tax), total: String(supply + tax) };
                                    }));
                                  }}
                                  className={inputCls}
                                  style={{...inputStyle, width: 100}}
                                >
                                  <option value="">선택</option>
                                  <option value="(주)다이버즈">(주)다이버즈</option>
                                  <option value="전재민">전재민</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap" style={{ color: r.paymentDate ? "#475569" : "#CBD5E1", minWidth: 90 }}>{r.paymentDate || "—"}</td>
                              <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap" style={{ color: r.invoiceDate ? "#475569" : "#CBD5E1", minWidth: 90 }}>{r.invoiceDate || "—"}</td>
                              <td className="px-1 py-1"><input type="date" value={r.workStartDate} onChange={(e) => updateRev(r.localId,"workStartDate",e.target.value)} className={inputCls} style={{...inputStyle, width:115}} /></td>
                              <td className="px-1 py-1">
                                <input
                                  type="date"
                                  value={r.workEndDate}
                                  onChange={(e) => updateRev(r.localId,"workEndDate",e.target.value)}
                                  className={inputCls}
                                  style={{ ...inputStyle, width:115 }}
                                />
                              </td>
                              <td className="px-2 py-1.5 font-medium text-center" style={{ color: remDays === null ? "#CBD5E1" : remDays <= 1 ? "#EF4444" : remDays <= 3 ? "#F97316" : remDays <= 7 ? "#EAB308" : "#475569" }}>
                                {remDays === null ? "—" : remDays < 0 ? `+${Math.abs(remDays)}` : remDays === 0 ? "D-0" : `D-${remDays}`}
                              </td>
                              <td className="px-1 py-1">
                                <button
                                  type="button"
                                  disabled={revDeleteBlocked}
                                  title={revDeleteBlocked ? "입금확인요청이 연동된 항목은 삭제할 수 없습니다." : ""}
                                  onClick={() => setRevenues((p) => p.filter((x) => x.localId !== r.localId))}
                                  className="p-1 rounded transition-colors"
                                  style={{ opacity: revDeleteBlocked ? 0.2 : 1, cursor: revDeleteBlocked ? "not-allowed" : "pointer" }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => { addLinkedPair(); }}
                      className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                      style={{ borderColor: "#3182F6", color: "#3182F6", borderStyle: "dashed" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      행 추가
                    </button>
                    <button type="button" onClick={addSection}
                      className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                      style={{ borderColor: "#64748B", color: "#64748B", borderStyle: "dashed" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      섹션 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 매입 섹션 */}
              {activeSection === "매입" && (
              <div>
                  <datalist id="cost-product-options">
                    {[...new Map(managedProducts.map((p) => [p.name, p] as [string, ManagedProduct])).values()].map((p) => (
                      <option key={p.id} value={p.name}>{p.category}</option>
                    ))}
                  </datalist>
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E9EBEF" }}>
                    <table className="w-full text-xs" style={{ minWidth: 1100 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {["#","결재","담당자","매입처","품명","개수","공급가","세액","합계","매입날짜","계산서날짜","작업시작일","작업만료일","세금계산서","완료",""].map((h, idx) => (
                            <th key={idx} className="px-2 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#64748B", background: "#F8FAFC", borderBottom: "2px solid #E9EBEF" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Map(costs.map(c => [c.sectionLabel || "1주", true] as [string, boolean])).keys()].flatMap(section => {
                          const sectionCosts = costs.filter(c => (c.sectionLabel || "1주") === section);
                          return [
                            <tr key={`csh-${section}`} style={{ background: "#F0FDF4" }}>
                              <td colSpan={16} className="px-3 py-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs" style={{ color: "#059669" }}>{section}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyCostSection(section)}
                                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border transition-colors hover:bg-emerald-50"
                                    style={{ borderColor: "#6EE7B7", color: "#059669" }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    섹션 복사
                                  </button>
                                </div>
                              </td>
                            </tr>,
                            ...sectionCosts.map((c) => {
                          const i = costs.indexOf(c);
                          const costRevAmount = parseWon(c.total);
                          const costFmtAmount = costRevAmount ? `₩${costRevAmount.toLocaleString()}` : "—";
                          // UUID 기반 매칭 — 품명·날짜·금액 충돌 완전 방지
                          const costRowKey = c.costRowId;
                          const costIsLinked = Boolean(c.costRowId && c.productName.trim() && costRevAmount);
                          const costRowCs = costIsLinked ? paymentStatuses[costRowKey] : undefined;
                          const costDeleteBlocked = Boolean(costRowCs && costRowCs.status !== "반려");
                          return (
                          <tr key={c.localId} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                            <td className="px-2 py-1.5 font-medium" style={{ color: "#94A3B8" }}>{i+1}</td>
                            <td className="px-1 py-1.5">
                              {(() => {
                                const rowKey = costRowKey;
                                const ps = costRowCs;
                                if (ps?.status === "승인") return (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap" style={{ background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.25)" }}>승인</span>
                                );
                                if (ps?.status === "반려") return (
                                  <div className="flex items-center gap-1">
                                    <button type="button"
                                      onClick={() => setPayRejectInfo({ reason: ps.rejectReason, projectName: form.campaignName || c.productName, rowKey, requestId: ps.requestId ?? "" })}
                                      className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap transition-opacity hover:opacity-80"
                                      style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}>반려</button>
                                    <button type="button"
                                      onClick={() => {
                                        if (confirm("수정완료 처리하면 입금요청을 다시 보낼 수 있습니다.\n계속하시겠습니까?")) {
                                          resetPaymentRequest(ps.requestId ?? "", c.productName || "—", costFmtAmount);
                                        }
                                      }}
                                      className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap transition-opacity hover:opacity-80"
                                      style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.25)" }}>수정하기</button>
                                  </div>
                                );
                                if (ps?.status === "대기") return (
                                  <span className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap" style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.25)" }}>요청됨</span>
                                );
                                const canPayRequest = Boolean(
                                  c.assignee.trim() &&
                                  c.vendor.trim() &&
                                  c.productName.trim() &&
                                  c.quantity.trim() &&
                                  parseWon(c.supplyPrice) &&
                                  parseWon(c.total)
                                );
                                const isSending = sendingPayment.has(rowKey);
                                return (
                                  <button type="button"
                                    disabled={!canPayRequest || isSending}
                                    title={!canPayRequest ? "담당자·매입처·품명·개수·공급가·합계를 모두 입력해주세요." : ""}
                                    onClick={async () => {
                                      const pid = await ensureSaved();
                                      if (!pid) return;
                                      setSendingPayment((p) => new Set(p).add(rowKey));
                                      try {
                                        const totalNum = parseWon(c.total);
                                        // 개당 단가는 행의 실제 공급가÷개수로 산출 — 승인 화면에서 합계 역산(면세 행 오류)을 쓰지 않도록 스냅샷
                                        const qtyNum   = parseInt(c.quantity, 10);
                                        const supplyNum = parseWon(c.supplyPrice) ?? 0;
                                        const unitPriceNum = (qtyNum > 0 && supplyNum > 0)
                                          ? Math.round(supplyNum / qtyNum)
                                          : (c.unitPrice || null);
                                        const matchedProduct =
                                          managedProducts.find((p) => p.name === c.productName && p.vendor === c.vendor) ??
                                          managedProducts.find((p) => p.name === c.productName);
                                        const newReq = await addPaymentRequest({
                                          projectId:         pid,
                                          rowKey,
                                          assignedTeam:      form.assignedTeam || null,
                                          projectName:       form.campaignName || "미지정",
                                          requester:         c.assignee || form.assignedPerson || "—",
                                          productName:       c.productName || "—",
                                          vendor:            c.vendor || "—",
                                          quantity:          c.quantity || "—",
                                          amount:            totalNum ? `₩${totalNum.toLocaleString()}` : "—",
                                          unitPrice:         unitPriceNum,
                                          payDate:           c.purchaseDate || "",
                                          workStartDate:     c.workStartDate || "",
                                          workEndDate:       c.workEndDate || "",
                                          invoiceFileUrl:    c.invoiceFileUrl || "",
                                          invoiceFileName:   c.invoiceFileName || "",
                                          vendorBankAccount: matchedProduct?.vendorBankAccount || "",
                                        });
                                        setPaymentStatuses((p) => ({ ...p, [rowKey]: { status: "대기", requestId: newReq.id } }));
                                        invalidateProjectCache(pid);
                                        showToast("입금요청이 전송되었습니다.");
                                        window.dispatchEvent(new Event("approval-request-added"));
                                      } finally {
                                        setSendingPayment((p) => { const n = new Set(p); n.delete(rowKey); return n; });
                                      }
                                    }}
                                    className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap transition-all"
                                    style={{
                                      background: (canPayRequest && !isSending) ? "rgba(16,185,129,0.1)" : "#F1F5F9",
                                      color: (canPayRequest && !isSending) ? "#059669" : "#CBD5E1",
                                      border: `1px solid ${(canPayRequest && !isSending) ? "rgba(16,185,129,0.25)" : "#E9EBEF"}`,
                                      cursor: (canPayRequest && !isSending) ? "pointer" : "not-allowed",
                                    }}>
                                    {isSending ? "처리 중..." : "입금요청"}
                                  </button>
                                );
                              })()}
                            </td>
                            <td className="px-1 py-1">
                              <select value={c.assignee} onChange={(e) => updateCost(c.localId,"assignee",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:80, opacity: costDeleteBlocked ? 0.45 : 1}}>
                                <option value="">-</option>
                                {(form.assignedTeam ? users.filter((u) => u.team === form.assignedTeam) : users).map((u) => (
                                  <option key={u.id} value={u.name}>{u.name}</option>
                                ))}
                                {c.assignee && !users.some((u) => u.name === c.assignee) && (
                                  <option value={c.assignee}>{c.assignee}</option>
                                )}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input type="text" value={c.vendor} onChange={(e) => updateCost(c.localId,"vendor",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:80, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1">
                              <input
                                type="text"
                                list="cost-product-options"
                                value={c.productName}
                                onChange={(e) => editCostProductName(c.localId, e.target.value)}
                                onBlur={(e) => linkCostProduct(c.localId, e.target.value)}
                                disabled={costDeleteBlocked}
                                placeholder="품명 입력"
                                title="직접 입력할 수 있습니다. 상품관리에 등록된 품명과 같으면 단가·금액이 자동 계산됩니다."
                                className={inputCls}
                                style={{...inputStyle, width: 150, opacity: costDeleteBlocked ? 0.45 : 1}}
                              />
                            </td>
                            <td className="px-1 py-1"><input type="number" value={c.quantity} onChange={(e) => handleCostQuantity(c.localId, e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:50, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1">
                              {/* 상품 단가가 있으면 개수 변경 시 자동 계산되지만, 공급가 직접 수정도 항상 허용한다 */}
                              <input type="text" value={wonFmt(c.supplyPrice)} onChange={(e) => updateCost(c.localId,"supplyPrice",e.target.value)} onBlur={(e) => autoTaxCost(c.localId, e.target.value)} disabled={costDeleteBlocked} title={c.unitPrice > 0 ? "개수를 바꾸면 상품 등록 개당 단가 × 개수로 자동 계산됩니다. 직접 입력해 덮어쓸 수도 있습니다." : ""} className={inputCls} style={{...inputStyle, width:80, opacity: costDeleteBlocked ? 0.45 : 1}} />
                            </td>
                            <td className="px-1 py-1"><input type="text" value={wonFmt(c.tax)} onChange={(e) => updateCost(c.localId,"tax",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:65, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1"><input type="text" value={wonFmt(c.total)} onChange={(e) => updateCost(c.localId,"total",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:80, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1">
                              <input type="date" value={c.purchaseDate} readOnly
                                className={inputCls}
                                title={c.isApproved ? "입금요청 승인 시 자동 입력됩니다." : "입금요청 승인 후 자동으로 입력됩니다."}
                                style={{
                                  ...inputStyle,
                                  width: 115,
                                  cursor: "not-allowed",
                                  background: c.isApproved ? "rgba(16,185,129,0.07)" : "#F1F5F9",
                                  borderColor: c.isApproved ? "rgba(16,185,129,0.35)" : "#E9EBEF",
                                  color: c.isApproved ? "#059669" : "#94A3B8",
                                }}
                              />
                            </td>
                            <td className="px-1 py-1"><input type="date" value={c.invoiceDate} onChange={(e) => updateCost(c.localId,"invoiceDate",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:115, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1"><input type="date" value={c.workStartDate} onChange={(e) => updateCost(c.localId,"workStartDate",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:115, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1"><input type="date" value={c.workEndDate} onChange={(e) => updateCost(c.localId,"workEndDate",e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:115, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>

                            {/* 세금계산서 첨부 */}
                            <td className="px-1 py-1" style={{ minWidth: 130 }}>
                              {c.invoiceFileUrl ? (
                                <div className="flex items-center gap-1">
                                  <InvoiceLink url={c.invoiceFileUrl} name={c.invoiceFileName} />
                                  {!costDeleteBlocked && (
                                    <button
                                      type="button"
                                      onClick={() => { updateCost(c.localId, "invoiceFileUrl", ""); updateCost(c.localId, "invoiceFileName", ""); }}
                                      className="p-0.5 rounded hover:bg-red-50"
                                      title="첨부 해제"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <label
                                  className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-opacity"
                                  style={{
                                    background: "#F1F5F9",
                                    color: costDeleteBlocked ? "#CBD5E1" : uploading === c.localId ? "#94A3B8" : "#64748B",
                                    border: "1px solid #E9EBEF",
                                    cursor: costDeleteBlocked ? "not-allowed" : "pointer",
                                    opacity: costDeleteBlocked ? 0.5 : 1,
                                  }}>
                                  {uploading === c.localId ? (
                                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                  ) : (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                  )}
                                  {uploading === c.localId ? "업로드 중..." : "파일 첨부"}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    disabled={costDeleteBlocked || uploading !== null}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleInvoiceUpload(c.localId, file);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </td>

                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={c.workCompleted} onChange={(e) => updateCost(c.localId,"workCompleted",e.target.checked)} disabled={costDeleteBlocked} className="w-3.5 h-3.5 rounded accent-[#3182F6]" style={{ opacity: costDeleteBlocked ? 0.45 : 1 }} />
                            </td>
                            <td className="px-1 py-1">
                              <button
                                type="button"
                                disabled={costDeleteBlocked}
                                title={costDeleteBlocked ? "입금요청이 연동된 항목은 삭제할 수 없습니다. 반려 처리 후 삭제해주세요." : ""}
                                onClick={() => setCosts((p) => p.filter((x) => x.localId !== c.localId))}
                                className="p-1 rounded transition-colors"
                                style={{ opacity: costDeleteBlocked ? 0.2 : 1, cursor: costDeleteBlocked ? "not-allowed" : "pointer" }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </td>
                          </tr>
                          );
                        }),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => {
                      const lastSection = costsRef.current.length > 0 ? (costsRef.current[costsRef.current.length - 1].sectionLabel || "1주") : "1주";
                      setCosts((p) => [...p, emptyCost(lastSection)]);
                    }}
                      className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                      style={{ borderColor: "#059669", color: "#059669", borderStyle: "dashed" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      + 행 추가
                    </button>
                    <button type="button" onClick={addCostSection}
                      className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                      style={{ borderColor: "#059669", color: "#059669", borderStyle: "dashed" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      + 섹션 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 작업확인 섹션 — 매입(구매) 데이터 기반 */}
              {activeSection === "작업확인" && (
                <div className="space-y-4">
                  {costs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 rounded-xl border" style={{ borderColor: "#E9EBEF", color: "#94A3B8" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mb-2 opacity-40"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>
                      <p className="text-sm">매입(구매) 데이터가 없습니다.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold mb-2" style={{ color: "#F97316" }}>매입(구매)</p>
                          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E9EBEF" }}>
                            <table className="w-full text-xs" style={{ minWidth: 860 }}>
                              <thead>
                                <tr style={{ background: "#FFF7ED" }}>
                                  {["#","담당자","품명","개수","공급가","세액","합계","작업시작일","작업만료일","셋팅날짜","잔여일","완료"].map((h, idx) => (
                                    <th key={idx} className="px-2 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#F97316", background: "#FFF7ED", borderBottom: "2px solid #FED7AA" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {costs.map((c, i) => {
                                  const remDays = daysLeft(c.workEndDate);
                                  return (
                                    <tr key={c.localId} className="border-t" style={{ borderColor: "#F1F5F9" }}>
                                      <td className="px-2 py-1.5 font-medium" style={{ color: "#94A3B8" }}>{i + 1}</td>
                                      <td className="px-2 py-1.5 text-xs" style={{ color: "#475569" }}>{c.assignee || "—"}</td>
                                      <td className="px-2 py-1.5 text-xs font-medium" style={{ color: "#191F28" }}>{c.productName || "—"}</td>
                                      <td className="px-2 py-1.5 text-xs text-center" style={{ color: "#475569" }}>{c.quantity || "—"}</td>
                                      <td className="px-2 py-1.5 text-xs text-right" style={{ color: "#475569" }}>{c.supplyPrice ? `₩${Number(c.supplyPrice).toLocaleString()}` : "—"}</td>
                                      <td className="px-2 py-1.5 text-xs text-right" style={{ color: "#475569" }}>{c.tax ? `₩${Number(c.tax).toLocaleString()}` : "—"}</td>
                                      <td className="px-2 py-1.5 text-xs text-right font-semibold" style={{ color: "#191F28" }}>{c.total ? `₩${Number(c.total).toLocaleString()}` : "—"}</td>
                                      <td className="px-2 py-1.5 text-xs whitespace-nowrap" style={{ color: c.workStartDate ? "#475569" : "#CBD5E1" }}>
                                        {c.workStartDate ? c.workStartDate.replace(/-/g, ". ") : "—"}
                                      </td>
                                      <td className="px-2 py-1.5 text-xs whitespace-nowrap" style={{ color: c.workEndDate ? "#475569" : "#CBD5E1" }}>
                                        {c.workEndDate ? c.workEndDate.replace(/-/g, ". ") : "—"}
                                      </td>
                                      <td className="px-1 py-1">
                                        <input type="date" value={c.settingDate ?? ""} onChange={(e) => updateCost(c.localId, "settingDate", e.target.value)} className={inputCls} style={{ ...inputStyle, width: 115 }} />
                                      </td>
                                      <td className="px-2 py-1.5 font-medium text-center" style={{ color: remDays === null ? "#CBD5E1" : remDays <= 1 ? "#EF4444" : remDays <= 3 ? "#F97316" : remDays <= 7 ? "#EAB308" : "#475569" }}>
                                        {remDays === null ? "—" : remDays < 0 ? `+${Math.abs(remDays)}` : remDays === 0 ? "D-0" : `D-${remDays}`}
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <input type="checkbox" checked={c.workCompleted ?? false} onChange={(e) => updateCost(c.localId, "workCompleted", e.target.checked)} className="w-3.5 h-3.5 rounded accent-[#F97316]" />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 메모 */}
            <div>
              <label className={labelCls} style={labelStyle}>메모</label>
              <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} style={inputStyle} placeholder="특이사항, 히스토리 등" />
            </div>

            {error && <p className="text-xs text-center" style={{ color: "#EF4444" }}>{error}</p>}
            {savedSuccess && <p className="text-xs text-center font-medium" style={{ color: "#16A34A" }}>수정완료되었습니다.</p>}

            {/* 버튼 */}
            <div className="flex items-center justify-between pt-1">
              <div />
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-medium rounded-xl border transition-colors hover:bg-slate-50" style={{ borderColor: "#E9EBEF", color: "#64748B" }}>취소</button>
                <button type="submit" disabled={saving || !isDirty || (!isEdit && !isFormValid)}
                  className="px-5 py-2 text-sm font-semibold rounded-xl text-white transition-all disabled:opacity-40"
                  style={{
                    background: (isDirty && (isEdit || isFormValid)) ? "linear-gradient(135deg, #3182F6 0%, #2462D8 100%)" : "#CBD5E1",
                    cursor: (isDirty && (isEdit || isFormValid)) ? "pointer" : "not-allowed",
                  }}
                  title={
                    isEdit && !isDirty ? "변경된 내용이 없습니다." :
                    !isEdit && !isFormValid ? `필수 항목 미입력: ${missingFields.map((f) => f.label).join(", ")}` : ""
                  }>
                  {saving ? "저장 중..." : isEdit ? "수정 완료" : "프로젝트 추가"}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* 반려 사유 팝업 */}
        {rejectInfo && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ background: "rgba(25,31,40,0.35)" }}
            onClick={() => setRejectInfo(null)}
          >
            <div
              className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
              style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>반려</span>
                  <span className="text-sm font-semibold" style={{ color: "#191F28" }}>{rejectInfo.projectName}</span>
                </div>
                <button onClick={() => setRejectInfo(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="px-6 py-5">
                {rejectInfo.reason ? (
                  <div className="flex items-start gap-2.5">
                    <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#DC2626" }}>반려 사유</p>
                      <p className="text-sm leading-relaxed" style={{ color: "#191F28" }}>{rejectInfo.reason}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-center py-2" style={{ color: "#94A3B8" }}>반려 사유가 입력되지 않았습니다.</p>
                )}
                <p className="text-xs mt-4" style={{ color: "#94A3B8" }}>
                  수정하기를 클릭하면 이 요청이 초기화되어 다시 입금확인요청을 보낼 수 있습니다.
                </p>
              </div>
              <div className="px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
                <button onClick={() => setRejectInfo(null)}
                  className="w-full py-2.5 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {/* 매입 반려 사유 팝업 */}
        {payRejectInfo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ background: "rgba(25,31,40,0.35)" }}
            onClick={() => setPayRejectInfo(null)}>
            <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
              style={{ background: "#fff", boxShadow: "0 20px 60px rgba(22,31,51,0.2)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>반려</span>
                  <span className="text-sm font-semibold" style={{ color: "#191F28" }}>{payRejectInfo.projectName}</span>
                </div>
                <button onClick={() => setPayRejectInfo(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {payRejectInfo.reason ? (
                  <div className="flex items-start gap-2.5">
                    <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#DC2626" }}>반려 사유</p>
                      <p className="text-sm leading-relaxed" style={{ color: "#191F28" }}>{payRejectInfo.reason}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-center py-2" style={{ color: "#94A3B8" }}>반려 사유가 입력되지 않았습니다.</p>
                )}
                <p className="text-xs" style={{ color: "#94A3B8" }}>
                  수정하기를 클릭하면 이 요청이 초기화되어 다시 입금요청을 보낼 수 있습니다.
                </p>
              </div>
              <div className="flex gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
                <button onClick={() => setPayRejectInfo(null)}
                  className="flex-1 py-2.5 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  style={{ background: "#F8FAFC", color: "#64748B", border: "1px solid #E9EBEF" }}>닫기</button>
                <button
                  onClick={async () => {
                    await deletePaymentRequest(payRejectInfo.requestId);
                    setPaymentStatuses((prev) => {
                      const next = { ...prev };
                      delete next[payRejectInfo.rowKey];
                      return next;
                    });
                    setPayRejectInfo(null);
                    showToast("초기화되었습니다. 입금요청 버튼을 다시 클릭하세요.");
                  }}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                  style={{ background: "#3182F6" }}>
                  수정하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 토스트 */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-semibold text-white"
            style={{ background: "#191F28", boxShadow: "0 8px 24px rgba(22,31,51,0.25)", whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {toast}
          </div>
        )}

        {/* 키워드 순위 리포트 — form 바깥에 위치 (중첩 form 방지) */}
        {isEdit && (
          <div className="px-6 pb-6">
            <ProjectReportSection
              projectId={initial?.id}
              clientId={form.clientId}
              endDate={form.endDate || undefined}
              projectType={form.projectType}
              startDate={form.startDate || undefined}
              onGuaranteeEndDate={handleGuaranteeEndDate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
