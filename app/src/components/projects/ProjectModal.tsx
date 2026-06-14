"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ProjectReportSection from "@/components/projects/ProjectReportSection";
import { addConfirmRequest, addPaymentRequest, getConfirmRequests, getPaymentRequests, updateConfirmRequest, updatePaymentRequest, deleteConfirmRequest, deletePaymentRequest, type ConfirmStatus, type PaymentStatus } from "@/lib/approvals";

type Status = "진행" | "종료";

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
  assignee: string;
  productName: string;
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
}

interface CostRow {
  localId: number;
  costRowId: string;       // 안정적 UUID — rowKey 충돌 방지
  assignee: string;
  vendor: string;
  productName: string;
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
  invoiceFileUrl: string;
  invoiceFileName: string;
}

let _lid = 0;
const nid = () => ++_lid;

function emptyRevenue(): RevenueRow {
  return { localId: nid(), revenueRowId: crypto.randomUUID(), linkedCostLocalId: null, assignee: "", productName: "", unitPrice: 0, quantity: "", supplyPrice: "", tax: "", total: "", paymentDate: "", invoiceDate: "", workStartDate: "", workEndDate: "", completedQty: "", workCompleted: false, depositAccount: "" };
}
function emptyCost(): CostRow {
  return { localId: nid(), costRowId: crypto.randomUUID(), assignee: "", vendor: "", productName: "", unitPrice: 0, quantity: "", supplyPrice: "", tax: "", total: "", purchaseDate: "", invoiceDate: "", workStartDate: "", workEndDate: "", workCompleted: false, isApproved: false, invoiceFileUrl: "", invoiceFileName: "" };
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
  advertiserName: string;
  products: string[];
  monthlyAvg?: number;
  inboundDate?: string;
  endDate?: string;
  assignedTeam?: string;
  assignedPerson?: string;
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
  const isEdit = Boolean(initial?.id);
  // 신규 프로젝트를 자동 저장한 경우 여기에 ID 기록
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  // ref로도 동기화해 handleSubmit stale 클로저 방지
  const savedIdRef = useRef<string | null>(initial?.id ?? null);
  const [form, setForm] = useState<ProjectFormData>(initial ?? {
    status: "진행", campaignName: "", projectType: "", advertiser: "", product: "",
    assignedTeam: "", assignedPerson: "", contractAmount: "",
    startDate: "", endDate: "", placeLink: "", notes: "",
    isExtended: false,
  });
  const [revenues, setRevenues]     = useState<RevenueRow[]>([]);
  const [costs, setCosts]           = useState<CostRow[]>([]);
  const revenuesRef = useRef<RevenueRow[]>([]);
  // eslint-disable-next-line react-hooks/refs
  revenuesRef.current = revenues;
  const [clients, setClients]       = useState<SimpleClient[]>([]);
  const [users, setUsers]           = useState<{ id: string; name: string; team: string | null }[]>([]);
  const [managedProducts, setManagedProducts] = useState<ManagedProduct[]>([]);
  const [saving, setSaving]         = useState(false);

  // 변경 감지용 초기 스냅샷
  const initFormSnap  = useRef(JSON.stringify({ ...form, id: undefined }));
  const initRevSnap   = useRef("[]");
  const initCostSnap  = useRef("[]");
  const serRev  = (rows: RevenueRow[])  => JSON.stringify(rows.map(({ localId: _l, ...r }) => r));
  const serCost = (rows: CostRow[])     => JSON.stringify(rows.map(({ localId: _l, ...r }) => r));
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
  const [activeSection, setActiveSection] = useState<"매출" | "매입">("매출");
  const [toast, setToast]           = useState<string | null>(null);
  const [manualTotal, setManualTotal] = useState<string>(() => initial ? "" : "");
  const [confirmStatuses, setConfirmStatuses] = useState<Record<string, { status: ConfirmStatus | "발행완료"; rejectReason?: string; requestId?: string }>>({});
  const [rejectInfo, setRejectInfo]           = useState<{ reason?: string; projectName: string; rowKey: string; requestId: string } | null>(null);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, { status: PaymentStatus; rejectReason?: string; requestId?: string }>>({});
  const [payRejectInfo, setPayRejectInfo]     = useState<{ reason?: string; projectName: string; rowKey: string; requestId: string } | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(({ clients: rows }) => setClients(rows ?? []))
      .catch(() => {});
    fetch("/api/products")
      .then((r) => r.json())
      .then(({ products: rows }) => setManagedProducts(rows ?? []))
      .catch(() => {});
    fetch("/api/users")
      .then((r) => r.json())
      .then(({ users: rows }) => setUsers((rows ?? []).filter((u: { status: string }) => u.status === "활성")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    if (isEdit && initial?.id) {
      fetch(`/api/projects/${initial.id}`)
        .then((r) => r.json())
        .then(({ revenues: rv, costs: cs }) => {
          const projectEndDate = initial?.endDate ?? "";
          setRevenues((rv ?? []).map((r: Record<string, unknown>) => {
            const completed = Boolean(r.workCompleted);
            return {
            localId:        nid(),
            revenueRowId:   r.revenueRowId ? String(r.revenueRowId) : crypto.randomUUID(),
            assignee:       String(r.assignee ?? ""),
            productName:    String(r.productName ?? ""),
            linkedCostLocalId: null,
            unitPrice:      0,
            quantity:       r.quantity != null ? String(r.quantity) : "",
            supplyPrice:    r.supplyPrice != null ? String(r.supplyPrice) : "",
            tax:            r.tax != null ? String(r.tax) : "",
            total:          r.total != null ? String(r.total) : "",
            paymentDate:    String(r.paymentDate ?? ""),
            invoiceDate:    String(r.invoiceDate ?? ""),
            workStartDate:  String(r.workStartDate ?? ""),
            workEndDate:    completed ? String(r.workEndDate ?? "") : (projectEndDate || String(r.workEndDate ?? "")),
            completedQty:   r.completedQty != null ? String(r.completedQty) : "",
            workCompleted:  Boolean(r.workCompleted),
            depositAccount: String(r.depositAccount ?? ""),
          }; }));
          setCosts((cs ?? []).map((c: Record<string, unknown>) => ({
            localId:    nid(),
            costRowId:  c.costRowId ? String(c.costRowId) : crypto.randomUUID(),
            assignee:   String(c.assignee ?? ""),
            vendor:     String(c.vendor ?? ""),
            productName: String(c.productName ?? ""),
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
            invoiceFileUrl:  String(c.invoiceFileUrl ?? ""),
            invoiceFileName: String(c.invoiceFileName ?? ""),
          })));
        })
        .then(() => {
          // 로드 완료 후 초기 스냅샷 갱신 (다음 프레임에서 state 반영)
          setTimeout(() => {
            setRevenues((rv) => { initRevSnap.current = serRev(rv); return rv; });
            setCosts((cs) => { initCostSnap.current = serCost(cs); return cs; });
          }, 0);
        })
        .catch(() => {});
    }
    return () => { document.body.style.overflow = ""; };
  }, [isEdit, initial?.id]);

  // 결재 승인 상태 로드
  useEffect(() => {
    if (!initial?.id) return;
    getConfirmRequests(initial.id).then((reqs) => {
      const map: Record<string, { status: ConfirmStatus | "발행완료"; rejectReason?: string; requestId?: string }> = {};
      reqs.forEach((r) => {
        if (!r.rowKey) return;
        map[r.rowKey] = { status: r.taxInvoiceDate ? "발행완료" as const : r.status as ConfirmStatus, rejectReason: r.rejectReason, requestId: r.id };
      });
      setConfirmStatuses(map);
    });
  }, [initial?.id]);

  // 매입 입금요청 상태 로드
  useEffect(() => {
    if (!initial?.id) return;
    getPaymentRequests(initial.id).then((reqs) => {
      const map: Record<string, { status: PaymentStatus; rejectReason?: string; requestId?: string }> = {};
      reqs.forEach((r) => {
        if (!r.rowKey || !r.productName || r.productName === "—") return;
        map[r.rowKey] = { status: r.status as PaymentStatus, rejectReason: r.rejectReason, requestId: r.id };
      });
      setPaymentStatuses(map);
    });
  }, [initial?.id]);

  function setField(f: keyof ProjectFormData, v: string) {
    setForm((p) => ({ ...p, [f]: v }));
    // 관리형/보장형: endDate 변경 시 미완료 매출행 workEndDate 자동 동기화
    if (f === "endDate" && v && (form.projectType === "관리형" || form.projectType === "보장형")) {
      setRevenues((p) => p.map((r) => r.workCompleted ? r : { ...r, workEndDate: v }));
    }
    // 관리형/보장형으로 유형 전환 시 기존 미완료 매출행 workEndDate 동기화
    if (f === "projectType" && (v === "관리형" || v === "보장형") && form.endDate) {
      setRevenues((p) => p.map((r) => r.workCompleted ? r : { ...r, workEndDate: form.endDate }));
    }
  }

  /* ── 보장형 계약 종료일 콜백 ── */
  const handleGuaranteeEndDate = useCallback((calcEndDate: string | null, qualifyingDays: number) => {
    setGuaranteeProgress(qualifyingDays);
    if (calcEndDate) {
      setForm((p) => p.projectType === "보장형" ? { ...p, endDate: calcEndDate } : p);
      setRevenues((p) => p.map((r) => r.workCompleted ? r : { ...r, workEndDate: calcEndDate }));
    }
  }, []);

  /* ── 세금계산서 파일 첨부 (Base64 변환) ── */
  const handleInvoiceUpload = useCallback((localId: number, file: File) => {
    setUploading(localId);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setCosts((prev) => prev.map((c) =>
        c.localId === localId ? { ...c, invoiceFileUrl: dataUrl, invoiceFileName: file.name } : c
      ));
      showToast("파일이 첨부되었습니다.");
      setUploading(null);
    };
    reader.onerror = () => {
      showToast("파일 읽기에 실패했습니다.");
      setUploading(null);
    };
    reader.readAsDataURL(file);
  }, []);

  /* ── 매입 입금요청 반려 → 재요청 허용 ── */
  async function resetPaymentRequest(requestId: string, _productName: string, _amount: string) {
    await deletePaymentRequest(requestId);
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
  function addLinkedPair() {
    const newRev  = emptyRevenue();
    const newCost = emptyCost();
    newRev.linkedCostLocalId = newCost.localId;
    setRevenues((p) => [...p, newRev]);
    setCosts((p) => [...p, newCost]);
  }

  /* 상품관리에서 매출 행 자동 채우기 (판매가 기준) + 연동 매입 행 동기화 */
  function pickProductForRev(localId: number, productId: string) {
    const p = managedProducts.find((x) => x.id === productId);
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
        productName: p.name,
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
          const tax    = Math.round(supply * 0.1);
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
        const noTax  = r.depositAccount === "전재민";
        const tax    = noTax ? 0 : Math.round(supply * 0.1);
        return { ...r, quantity: qtyStr, supplyPrice: String(supply), tax: String(tax), total: String(supply + tax) };
      }
      return { ...r, quantity: qtyStr };
    }));
  }

  /* 상품관리에서 매입 행 자동 채우기 */
  function pickProductForCost(localId: number, productId: string) {
    const p = managedProducts.find((x) => x.id === productId);
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
        productName: p.name,
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
        const tax    = Math.round(supply * 0.1);
        const total  = supply + tax;
        return { ...c, quantity: qtyStr, supplyPrice: String(supply), tax: String(tax), total: String(total) };
      }
      return { ...c, quantity: qtyStr };
    }));
  }

  const productCategories = Array.from(new Set(managedProducts.map((p) => p.category)));

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

  // 신규 프로젝트일 때 결재 버튼 클릭 시 자동으로 먼저 저장
  async function ensureSaved(): Promise<string | null> {
    if (savedIdRef.current) return savedIdRef.current;
    if (!isFormValid) {
      setError(`먼저 기본 정보를 입력해주세요: ${missingFields.map((f) => f.label).join(", ")}`);
      return null;
    }
    setSaving(true); setError(null);
    const contractAmount = revenuesRef.current.reduce((s, r) => s + (parseWon(r.total) ?? 0), 0) || parseWon(manualTotal) || parseWon(form.contractAmount) || null;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, contractAmount, projectGroupId: projectGroupId ?? null }),
    });
    if (!res.ok) { setSaving(false); setError("저장에 실패했습니다."); return null; }
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
      body: JSON.stringify({ ...form, contractAmount: effectiveTotal || parseWon(form.contractAmount) || null, projectGroupId: projectGroupId ?? null }),
    });
    if (!res.ok) { setSaving(false); setError("저장에 실패했습니다."); return; }

    const { project, projectGroupId: newGroupId } = await res.json();
    const pid = effectiveId ?? project.id;

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
      const body = await failed.json().catch(() => ({}));
      setSaving(false);
      setError(body.error ?? "저장에 실패했습니다.");
      return;
    }

    setSaving(false);
    onSaved(newGroupId ?? undefined);
  }

  const totalRevenue  = revenues.reduce((s, r) => s + (parseWon(r.total) ?? 0), 0);
  const totalCost     = costs.reduce((s, c) => s + (parseWon(c.total) ?? 0), 0);
  // 매출 행이 없으면 직접 입력값 사용
  const effectiveTotal = totalRevenue > 0 ? totalRevenue : (parseWon(manualTotal) || 0);
  const profit         = effectiveTotal - totalCost;

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
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                      background: form.assignedTeam === "영업 1팀" ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)",
                      color:      form.assignedTeam === "영업 1팀" ? "#6366F1" : "#10B981",
                    }}>{form.assignedTeam}</span>
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
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: form.assignedTeam === "영업 1팀" ? "rgba(99,102,241,0.1)" : "rgba(16,185,129,0.1)",
                        color:      form.assignedTeam === "영업 1팀" ? "#6366F1" : "#10B981",
                      }}>
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
                          .filter((c) => c.assignedTeam === form.assignedTeam)
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
                    {clients.filter(c => c.assignedTeam === form.assignedTeam).length === 0 && (
                      <p className="text-xs mt-1" style={{ color: "#F97316" }}>
                        {form.assignedTeam}에 등록된 광고주가 없습니다.
                      </p>
                    )}
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
              {isEdit && (() => {
                const contractKey = "__contract__";
                const cs = confirmStatuses[contractKey];
                const canRequest = Boolean(effectiveTotal && form.assignedPerson);

                return (
                  <div className="mb-4 p-4 rounded-2xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                    {/* 수치 행 */}
                    <div className="flex gap-5 items-center">
                      {/* 총 매출 — 직접 입력 가능 */}
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: "#94A3B8" }}>총 매출(판매)</p>
                        {totalRevenue > 0 ? (
                          <p className="text-sm font-bold" style={{ color: "#3182F6" }}>₩{totalRevenue.toLocaleString()}</p>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold" style={{ color: "#3182F6" }}>₩</span>
                            <input
                              type="text"
                              value={manualTotal ? Number(manualTotal).toLocaleString() : ""}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                setManualTotal(raw);
                              }}
                              placeholder="직접 입력"
                              className="text-sm font-bold outline-none border-b-2 bg-transparent transition-colors focus:border-[#3182F6]"
                              style={{ color: "#3182F6", borderColor: "#E9EBEF", width: 110 }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>총 매입(구매)</p>
                        <p className="text-sm font-bold" style={{ color: "#191F28" }}>₩{totalCost.toLocaleString()}</p>
                      </div>
                      <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>순이익</p>
                        <p className="text-sm font-bold" style={{ color: profit >= 0 ? "#10B981" : "#EF4444" }}>₩{profit.toLocaleString()}</p>
                      </div>
                      {effectiveTotal > 0 && (
                        <>
                          <div className="w-px self-stretch" style={{ background: "#E9EBEF" }} />
                          <div>
                            <p className="text-xs mb-1" style={{ color: "#94A3B8" }}>마진율</p>
                            <p className="text-sm font-bold" style={{ color: profit >= 0 ? "#10B981" : "#EF4444" }}>
                              {Math.round((profit / effectiveTotal) * 100)}%
                            </p>
                          </div>
                        </>
                      )}

                      {/* 입금확인요청 버튼 — 우측 정렬 */}
                      <div className="ml-auto flex items-center gap-2">
                        {cs?.status === "발행완료" && (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(5,150,105,0.1)", color: "#059669", border: "1px solid rgba(5,150,105,0.2)" }}>계산서 발행완료</span>
                        )}
                        {cs?.status === "확인완료" && (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}>입금 확인완료</span>
                        )}
                        {cs?.status === "대기" && (
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04", border: "1px solid rgba(234,179,8,0.2)" }}>요청됨 (검토 중)</span>
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
                        {(!cs || cs.status === undefined) && (
                          <button
                            type="button"
                            disabled={!canRequest}
                            title={!canRequest ? (effectiveTotal ? "담당자를 입력해주세요." : "총 매출 금액을 입력해주세요.") : ""}
                            onClick={async () => {
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
                                clientName:     clientInfo?.companyName || form.advertiser || "—",
                                clientBusinessNumber,
                                clientEmail,
                                clientIndustry,
                                clientCategory,
                                dueDate:        form.startDate || "",
                                depositAccount: revenuesRef.current.find(r => r.depositAccount)?.depositAccount || "",
                                depositorName:  clientInfo?.advertiserName || "",
                              });
                              setConfirmStatuses((p) => ({ ...p, [contractKey]: { status: "대기", requestId: newReq.id } }));
                              showToast("입금확인 요청이 전송되었습니다.");
                              window.dispatchEvent(new Event("approval-request-added"));
                            }}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all"
                            style={{
                              background: canRequest ? "linear-gradient(135deg, #3182F6, #2462D8)" : "#F1F5F9",
                              color: canRequest ? "#fff" : "#CBD5E1",
                              cursor: canRequest ? "pointer" : "not-allowed",
                              boxShadow: canRequest ? "0 1px 4px rgba(49,130,246,0.3)" : "none",
                            }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            입금확인요청
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 탭 스위처 */}
              <div className="flex items-center gap-1 mb-4 border-b" style={{ borderColor: "#E9EBEF" }}>
                {(["매출", "매입"] as const).map((tab) => {
                  const isActive = activeSection === tab;
                  const count = tab === "매출" ? revenues.length : costs.length;
                  const tabLabel = tab === "매출" ? "매출(판매)" : "매입(구매)";
                  return (
                    <button key={tab} type="button" onClick={() => setActiveSection(tab)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all"
                      style={{
                        color: isActive ? "#191F28" : "#94A3B8",
                        borderBottom: isActive ? "2px solid #3182F6" : "2px solid transparent",
                        marginBottom: -1,
                      }}>
                      {tabLabel}
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{
                        background: isActive ? "rgba(49,130,246,0.1)" : "#F1F5F9",
                        color: isActive ? "#3182F6" : "#B0B8C1",
                      }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* 매출 섹션 */}
              {activeSection === "매출" && (
              <div>
                  {/* ── 계약금액 일괄 입금확인요청 ── */}
                  {(() => {
                    const contractKey = "__contract__";
                    const contractAmt = effectiveTotal;
                    const cs = confirmStatuses[contractKey];
                    const canBulk = Boolean(contractAmt && form.assignedPerson);

                    if (cs?.status === "발행완료") return (
                      <div className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)" }}>
                        <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>계약금액 일괄 요청</span>
                        <span className="font-bold text-sm" style={{ color: "#191F28" }}>₩{contractAmt?.toLocaleString() ?? "—"}</span>
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>계산서발행완료</span>
                      </div>
                    );
                    if (cs?.status === "확인완료") return (
                      <div className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                        <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>계약금액 일괄 요청</span>
                        <span className="font-bold text-sm" style={{ color: "#191F28" }}>₩{contractAmt?.toLocaleString() ?? "—"}</span>
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>확인완료</span>
                      </div>
                    );
                    if (cs?.status === "대기") return (
                      <div className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)" }}>
                        <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>계약금액 일괄 요청</span>
                        <span className="font-bold text-sm" style={{ color: "#191F28" }}>₩{contractAmt?.toLocaleString() ?? "—"}</span>
                        <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(234,179,8,0.1)", color: "#CA8A04" }}>요청됨</span>
                      </div>
                    );
                    return (
                      <div className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E9EBEF" }}>
                        <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>계약금액 일괄 요청</span>
                        <span className="font-bold text-sm" style={{ color: contractAmt ? "#191F28" : "#CBD5E1" }}>
                          {contractAmt ? `₩${contractAmt.toLocaleString()}` : "계약금액 미입력"}
                        </span>
                        <button
                          type="button"
                          disabled={!canBulk}
                          title={!canBulk ? "계약금액과 담당자를 입력해주세요." : ""}
                          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all"
                          style={{
                            background: canBulk ? "rgba(49,130,246,0.1)" : "#F1F5F9",
                            color: canBulk ? "#3182F6" : "#CBD5E1",
                            border: `1px solid ${canBulk ? "rgba(49,130,246,0.25)" : "#E9EBEF"}`,
                            cursor: canBulk ? "pointer" : "not-allowed",
                          }}
                          onClick={async () => {
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
                              amount:         `₩${contractAmt!.toLocaleString()}`,
                              workStartDate:  form.startDate || "",
                              workEndDate:    form.endDate || "",
                              clientName:     clientInfo?.companyName || form.advertiser || "—",
                              clientBusinessNumber,
                              clientEmail,
                              clientIndustry,
                              clientCategory,
                              dueDate:        form.startDate || "",
                              depositAccount: revenuesRef.current.find(r => r.depositAccount)?.depositAccount || "",
                              depositorName:  clientInfo?.advertiserName || "",
                            });
                            setConfirmStatuses((p) => ({ ...p, [contractKey]: { status: "대기", requestId: newReq.id } }));
                            showToast("계약금액 입금확인 요청이 전송되었습니다.");
                            window.dispatchEvent(new Event("approval-request-added"));
                          }}
                        >
                          입금확인요청
                        </button>
                      </div>
                    );
                  })()}

                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E9EBEF" }}>
                    <table className="w-full text-xs" style={{ minWidth: 1200 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          {["#","담당자","품명","개수","공급가","세액","합계","입금계좌","입금날짜","계산서날짜","작업시작일","작업만료일","잔여일","완료",""].map((h, idx) => (
                            <th key={idx} className="px-2 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: "#64748B", background: "#F8FAFC", borderBottom: "2px solid #E9EBEF" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {revenues.map((r, i) => {
                          const remDays = daysLeft(r.workEndDate);
                          const revConfirmStatus = confirmStatuses[r.revenueRowId];
                          const revDeleteBlocked = Boolean(r.paymentDate) || Boolean(revConfirmStatus && revConfirmStatus.status !== "반려");
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
                                <select
                                  value={managedProducts.find((p) => p.name === r.productName)?.id ?? ""}
                                  onChange={(e) => {
                                    if (e.target.value) pickProductForRev(r.localId, e.target.value);
                                    else updateRev(r.localId, "productName", "");
                                  }}
                                  className={inputCls}
                                  style={{...inputStyle, width: 150}}
                                >
                                  <option value="">{r.productName || "선택..."}</option>
                                  {productCategories.map((cat) => (
                                    <optgroup key={cat} label={cat}>
                                      {managedProducts.filter((p) => p.category === cat).map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` · ${p.vendor}` : ""}</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </td>
                              <td className="px-1 py-1"><input type="number" value={r.quantity} onChange={(e) => handleRevQuantity(r.localId, e.target.value)} className={inputCls} style={{...inputStyle, width:50}} /></td>
                              <td className="px-1 py-1"><input type="text" value={wonFmt(r.supplyPrice)} onChange={(e) => updateRev(r.localId,"supplyPrice",e.target.value)} onBlur={(e) => autoTaxRev(r.localId, e.target.value)} className={inputCls} style={{...inputStyle, width:80}} /></td>
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
                              <td className="px-2 py-1.5 text-center">
                                <input type="checkbox" checked={r.workCompleted} onChange={(e) => updateRev(r.localId,"workCompleted",e.target.checked)} className="w-3.5 h-3.5 rounded accent-[#3182F6]" />
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
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => {
                    addLinkedPair();
                  }}
                    className="mt-3 flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                    style={{ borderColor: "#3182F6", color: "#3182F6", borderStyle: "dashed" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    매출(판매) 행 추가
                  </button>
                </div>
              )}

              {/* 매입 섹션 */}
              {activeSection === "매입" && (
              <div>
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
                        {costs.map((c, i) => {
                          const costRevAmount = parseWon(c.total);
                          const costFmtAmount = costRevAmount ? `₩${costRevAmount.toLocaleString()}` : "—";
                          // UUID 기반 매칭 — 품명·날짜·금액 충돌 완전 방지
                          const costRowKey = c.costRowId;
                          const costIsLinked = Boolean(c.costRowId && c.productName.trim() && costRevAmount);
                          const costRowCs = costIsLinked ? paymentStatuses[costRowKey] : undefined;
                          const costDeleteBlocked = c.isApproved || Boolean(costRowCs && costRowCs.status !== "반려");
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
                                  parseWon(c.total) &&
                                  c.invoiceFileUrl
                                );
                                return (
                                  <button type="button"
                                    disabled={!canPayRequest}
                                    title={!canPayRequest ? "담당자·매입처·품명·개수·공급가·합계·세금계산서 파일을 모두 입력해주세요." : ""}
                                    onClick={async () => {
                                      const pid = await ensureSaved();
                                      if (!pid) return;
                                      const totalNum = parseWon(c.total);
                                      const matchedProduct = managedProducts.find((p) => p.name === c.productName);
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
                                        payDate:           c.purchaseDate || "",
                                        workStartDate:     c.workStartDate || "",
                                        workEndDate:       c.workEndDate || "",
                                        invoiceFileUrl:    c.invoiceFileUrl || "",
                                        invoiceFileName:   c.invoiceFileName || "",
                                        vendorBankAccount: matchedProduct?.vendorBankAccount || c.vendor || "",
                                      });
                                      setPaymentStatuses((p) => ({ ...p, [rowKey]: { status: "대기", requestId: newReq.id } }));
                                      showToast("입금요청이 전송되었습니다.");
                                      window.dispatchEvent(new Event("approval-request-added"));
                                    }}
                                    className="text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap transition-all"
                                    style={{
                                      background: canPayRequest ? "rgba(16,185,129,0.1)" : "#F1F5F9",
                                      color: canPayRequest ? "#059669" : "#CBD5E1",
                                      border: `1px solid ${canPayRequest ? "rgba(16,185,129,0.25)" : "#E9EBEF"}`,
                                      cursor: canPayRequest ? "pointer" : "not-allowed",
                                    }}>
                                    입금요청
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
                              <select
                                value={managedProducts.find((p) => p.name === c.productName)?.id ?? ""}
                                onChange={(e) => {
                                  if (e.target.value) pickProductForCost(c.localId, e.target.value);
                                  else updateCost(c.localId, "productName", "");
                                }}
                                disabled={costDeleteBlocked}
                                className={inputCls}
                                style={{...inputStyle, width: 150, opacity: costDeleteBlocked ? 0.45 : 1}}
                              >
                                <option value="">{c.productName || "선택..."}</option>
                                {productCategories.map((cat) => (
                                  <optgroup key={cat} label={cat}>
                                    {managedProducts.filter((p) => p.category === cat).map((p) => (
                                      <option key={p.id} value={p.id}>{p.name}{p.vendor ? ` · ${p.vendor}` : ""}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input type="number" value={c.quantity} onChange={(e) => handleCostQuantity(c.localId, e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:50, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
                            <td className="px-1 py-1"><input type="text" value={wonFmt(c.supplyPrice)} onChange={(e) => updateCost(c.localId,"supplyPrice",e.target.value)} onBlur={(e) => autoTaxCost(c.localId, e.target.value)} disabled={costDeleteBlocked} className={inputCls} style={{...inputStyle, width:80, opacity: costDeleteBlocked ? 0.45 : 1}} /></td>
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
                                  <a
                                    href={c.invoiceFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={c.invoiceFileName}
                                    className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
                                    style={{ background: "rgba(49,130,246,0.1)", color: "#3182F6", border: "1px solid rgba(49,130,246,0.2)", maxWidth: 90, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    {c.invoiceFileName || "파일"}
                                  </a>
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
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={() => setCosts((p) => [...p, emptyCost()])}
                    className="mt-3 flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50"
                    style={{ borderColor: "#059669", color: "#059669", borderStyle: "dashed" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    매입(구매) 행 추가
                  </button>
                </div>
              )}
            </div>

            {/* 메모 */}
            <div>
              <label className={labelCls} style={labelStyle}>메모</label>
              <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} style={inputStyle} placeholder="특이사항, 히스토리 등" />
            </div>

            {error && <p className="text-xs text-center" style={{ color: "#EF4444" }}>{error}</p>}

            {/* 버튼 */}
            <div className="flex items-center justify-between pt-1">
              {isEdit && onDelete ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onDelete(initial!.id!)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all hover:bg-red-50"
                    style={{ borderColor: "#EF4444", color: "#EF4444" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    삭제
                  </button>
                  {form.status !== "종료" && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        if (!confirm("캠페인을 종료 처리하시겠습니까?")) return;
                        setSaving(true); setError(null);
                        const res = await fetch(`/api/projects/${initial!.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "종료" }),
                        });
                        setSaving(false);
                        if (!res.ok) { setError("저장에 실패했습니다."); return; }
                        onSaved(undefined);
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all hover:bg-orange-50 disabled:opacity-40"
                      style={{ borderColor: "#F97316", color: "#F97316" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      종료
                    </button>
                  )}
                </div>
              ) : <div />}
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
