"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ── 타입 ── */
interface Product {
  id: string;
  category: string;
  rowNum: number | null;
  name: string;
  vendor: string | null;
  vendorBankAccount: string | null;
  costPrice: number | null;
  salePrice: number | null;
  notes: string | null;
}
interface Section { id: string; name: string; tabType: string; sortOrder: number; accent: string; }
interface RowForm {
  name: string; vendor: string; vendorBankAccount: string;
  costPrice: string; salePrice: string; notes: string;
}

/* ── 상수 ── */
const ACCENT_COLORS = ["#3182F6","#10B981","#8B5CF6","#F59E0B","#EF4444","#06B6D4","#EC4899","#F97316"];

/* ── 헬퍼 ── */
function wonFmt(n: number|null|undefined) { return n==null?"—":"₩"+n.toLocaleString(); }
function parseWon(s: string) { const n=parseInt(s.replace(/[^0-9]/g,""),10); return isNaN(n)?null:n; }
function marginRate(cost: number|null, sale: number|null) {
  if(!cost||!sale||sale===0) return null;
  return Math.round(((sale-cost)/sale)*100);
}
function emptyForm(): RowForm { return {name:"",vendor:"",vendorBankAccount:"",costPrice:"",salePrice:"",notes:""}; }

/* ── 마진 배지 ── */
function MarginBadge({ rate }: { rate: number|null }) {
  if(rate===null) return <span style={{color:"#B0B8C1"}}>—</span>;
  const color=rate>=60?"#10B981":rate>=40?"#3182F6":rate>=20?"#F59E0B":"#EF4444";
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:`${color}14`,color}}>{rate}%</span>;
}

/* ── 편집 행 ── */
function EditRow({ form, setForm, onSave, onCancel, isSaving }: {
  form: RowForm; setForm:(f:RowForm)=>void;
  onSave:()=>void; onCancel:()=>void; isSaving:boolean;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{ firstRef.current?.focus(); },[]);
  const inp = "w-full px-2.5 py-1.5 text-xs rounded-xl border outline-none focus:border-[#3182F6] transition-colors";
  const s   = { borderColor:"#E5E8EB", background:"#F8FAFC", color:"#191F28" };

  return (
    <tr style={{background:"rgba(139,92,246,0.03)",borderTop:"1px solid #F2F4F6"}}>
      <td className="px-4 py-2 text-xs text-center" style={{color:"#B0B8C1"}}>—</td>
      <td className="px-2 py-2"><input ref={firstRef} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="상품명" className={inp} style={s}/></td>
      <td className="px-2 py-2"><input value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="거래처" className={inp} style={s}/></td>
      <td className="px-2 py-2"><input value={form.vendorBankAccount} onChange={e=>setForm({...form,vendorBankAccount:e.target.value})} placeholder="은행 계좌번호 예금주" className={inp} style={s}/></td>
      <td className="px-2 py-2"><input value={form.salePrice} onChange={e=>setForm({...form,salePrice:e.target.value})} placeholder="0" className={inp} style={{...s,textAlign:"right"}}/></td>
      <td className="px-2 py-2"><input value={form.costPrice} onChange={e=>setForm({...form,costPrice:e.target.value})} placeholder="0" className={inp} style={{...s,textAlign:"right"}}/></td>
      <td className="px-3 py-2 text-center text-xs" style={{color:"#B0B8C1"}}>—</td>
      <td className="px-2 py-2"><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="비고" className={inp} style={s}/></td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1.5 justify-end">
          <button onClick={onSave} disabled={isSaving||!form.name.trim()}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl text-white disabled:opacity-40"
            style={{background:"#3182F6"}}>{isSaving?"…":"저장"}</button>
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-xl border"
            style={{borderColor:"#E5E8EB",color:"#8B95A1"}}>취소</button>
        </div>
      </td>
    </tr>
  );
}

/* ── 섹션 추가 모달 ── */
function AddSectionModal({ onClose, onAdd }: {
  onClose:()=>void; onAdd:(name:string,accent:string)=>void;
}) {
  const [name,   setName]   = useState("");
  const [accent, setAccent] = useState("#8B5CF6");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{background:"rgba(22,31,51,0.45)",backdropFilter:"blur(2px)"}} onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden"
        style={{background:"#fff",boxShadow:"0 20px 60px rgba(22,31,51,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:"1px solid #F1F5F9"}}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full" style={{background:accent}}/>
            <h2 className="text-base font-bold" style={{color:"#191F28"}}>섹션 추가</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={e=>{e.preventDefault();if(!name.trim())return;onAdd(name.trim(),accent);onClose();}} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{color:"#64748B"}}>섹션명 *</label>
            <input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="예: SNS 광고, 유튜브 영상…"
              className="w-full px-3 py-2.5 text-sm rounded-xl outline-none border transition-colors focus:border-[#3182F6]"
              style={{background:"#F8FAFC",borderColor:"#E9EBEF",color:"#191F28"}}/>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-2" style={{color:"#64748B"}}>색상</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map(c=>(
                <button key={c} type="button" onClick={()=>setAccent(c)} className="w-8 h-8 rounded-full transition-all"
                  style={{background:c,outline:accent===c?`3px solid ${c}`:"none",outlineOffset:2,transform:accent===c?"scale(1.15)":"scale(1)"}}/>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{background:"#F8FAFC"}}>
              <span className="w-1 h-5 rounded-full" style={{background:accent}}/>
              <span className="text-sm font-bold" style={{color:"#191F28"}}>{name||"섹션명 미리보기"}</span>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{borderColor:"#E9EBEF",color:"#64748B"}}>취소</button>
            <button type="submit" disabled={!name.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)"}}>추가</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 테이블 헤더 ── */
function TableHead() {
  return (
    <thead>
      <tr style={{background:"#FAFAFA"}}>
        <th className="px-4 py-2.5 text-center text-xs font-semibold" style={{color:"#B0B8C1",width:48}}>No.</th>
        <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{color:"#6B7684"}}>상품명</th>
        <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{color:"#6B7684",width:150}}>거래처</th>
        <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{color:"#6B7684",width:190}}>입금계좌</th>
        <th className="px-4 py-2.5 text-right text-xs font-semibold" style={{color:"#6B7684",width:120}}>판매가</th>
        <th className="px-4 py-2.5 text-right text-xs font-semibold" style={{color:"#6B7684",width:100}}>원가</th>
        <th className="px-4 py-2.5 text-center text-xs font-semibold" style={{color:"#6B7684",width:88}}>마진율</th>
        <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{color:"#6B7684",width:180}}>비고</th>
        <th className="px-4 py-2.5" style={{width:72}}/>
      </tr>
    </thead>
  );
}

/* ── 메인 ── */
export default function ProductsPage() {
  const [all,        setAll]        = useState<Product[]>([]);
  const [sections,   setSections]   = useState<Section[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [editId,     setEditId]     = useState<string|null>(null);
  const [editForm,   setEditForm]   = useState<RowForm>(emptyForm());
  const [addCat,     setAddCat]     = useState<string|null>(null);
  const [addForm,    setAddForm]    = useState<RowForm>(emptyForm());
  const [saving,     setSaving]     = useState(false);
  const [showAddSec, setShowAddSec] = useState(false);
  const [delSecId,   setDelSecId]   = useState<string|null>(null);

  const load = useCallback(()=>{
    setLoading(true);
    Promise.all([
      fetch("/api/products").then(r=>r.json()),
      fetch("/api/product-sections").then(r=>r.json()),
    ]).then(([pd,sd])=>{ setAll(pd.products??[]); setSections(sd.sections??[]); })
    .finally(()=>setLoading(false));
  },[]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ load(); },[load]);

  const purchaseSections = sections.filter(s => s.tabType === "purchase");

  function startEdit(p: Product) {
    setEditId(p.id); setAddCat(null);
    setEditForm({name:p.name,vendor:p.vendor??"",vendorBankAccount:p.vendorBankAccount??"",costPrice:p.costPrice!=null?String(p.costPrice):"",salePrice:p.salePrice!=null?String(p.salePrice):"",notes:p.notes??""});
  }
  function startAdd(cat: string) { setAddCat(cat); setEditId(null); setAddForm(emptyForm()); }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/products/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editForm.name,vendor:editForm.vendor,vendorBankAccount:editForm.vendorBankAccount,costPrice:parseWon(editForm.costPrice),salePrice:parseWon(editForm.salePrice),notes:editForm.notes})});
    setSaving(false); setEditId(null); load();
  }

  async function saveAdd(cat: string) {
    if(!addForm.name.trim()) return;
    setSaving(true);
    const catProducts = all.filter(p=>p.category===cat);
    await fetch("/api/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:cat,rowNum:catProducts.length+1,name:addForm.name,vendor:addForm.vendor,vendorBankAccount:addForm.vendorBankAccount,costPrice:parseWon(addForm.costPrice),salePrice:parseWon(addForm.salePrice),notes:addForm.notes})});
    setSaving(false); setAddCat(null); load();
  }

  async function handleDelete(id: string) { await fetch(`/api/products/${id}`,{method:"DELETE"}); load(); }

  async function handleAddSection(name: string, accent: string) {
    await fetch("/api/product-sections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,accent,tabType:"purchase"})});
    load();
  }

  async function handleDeleteSection(sec: Section) {
    if(all.some(p=>p.category===sec.name)){ alert(`"${sec.name}" 섹션에 상품이 있어 삭제할 수 없습니다.\n상품을 먼저 삭제해주세요.`); return; }
    await fetch(`/api/product-sections/${sec.id}`,{method:"DELETE"});
    setDelSecId(null); load();
  }

  return (
    <div className="space-y-4">
      {showAddSec && <AddSectionModal onClose={()=>setShowAddSec(false)} onAdd={handleAddSection}/>}

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{color:"#191F28"}}>상품 관리</h1>
          <p className="text-xs mt-0.5" style={{color:"#8B95A1"}}>총 {all.length}개 상품 · {purchaseSections.length}개 섹션</p>
        </div>
        <button onClick={()=>setShowAddSec(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          섹션 추가
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm" style={{color:"#B0B8C1"}}>불러오는 중...</div>
      ) : (
        <>
          {/* 빈 상태 */}
          {purchaseSections.length===0 && (
            <div className="py-16 text-center rounded-2xl" style={{border:"2px dashed rgba(139,92,246,0.3)"}}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:"rgba(139,92,246,0.1)"}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{color:"#475569"}}>섹션이 없습니다</p>
                  <p className="text-xs mt-0.5" style={{color:"#94A3B8"}}>상품을 섹션으로 분류해 관리하세요</p>
                </div>
                <button onClick={()=>setShowAddSec(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{background:"linear-gradient(135deg,#8B5CF6,#7C3AED)"}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  첫 섹션 추가
                </button>
              </div>
            </div>
          )}

          {purchaseSections.map(sec=>{
            const catProducts = all.filter(p=>p.category===sec.name);
            const accent = sec.accent;
            const avgMargin=(()=>{
              const rates=catProducts.map(p=>marginRate(p.costPrice,p.salePrice)).filter((r):r is number=>r!==null);
              return rates.length?Math.round(rates.reduce((a,b)=>a+b,0)/rates.length):null;
            })();
            const isDelConfirm=delSecId===sec.id;

            return (
              <div key={sec.id} className="rounded-2xl overflow-hidden" style={{background:"#fff",border:"1px solid #E5E8EB"}}>
                {/* 카드 헤더 */}
                <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:"1px solid #F2F4F6"}}>
                  <div className="flex items-center gap-3">
                    <span className="w-1 h-5 rounded-full shrink-0" style={{background:accent}}/>
                    <span className="text-sm font-bold" style={{color:"#191F28"}}>{sec.name}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{background:"#F2F4F6",color:"#8B95A1"}}>
                      {catProducts.length}개
                    </span>
                    {avgMargin!==null && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{background:`${avgMargin>=60?"#10B981":avgMargin>=40?"#3182F6":avgMargin>=20?"#F59E0B":"#EF4444"}14`,color:avgMargin>=60?"#10B981":avgMargin>=40?"#3182F6":avgMargin>=20?"#F59E0B":"#EF4444"}}>
                        평균마진 {avgMargin}%
                      </span>
                    )}
                    {catProducts.some(p=>p.vendor) && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{background:"rgba(139,92,246,0.08)",color:"#8B5CF6"}}>
                        거래처 {catProducts.filter(p=>p.vendor).length}곳
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isDelConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{color:"#94A3B8"}}>삭제할까요?</span>
                        <button onClick={()=>setDelSecId(null)} className="px-2.5 py-1 text-xs rounded-lg border" style={{borderColor:"#E9EBEF",color:"#64748B"}}>취소</button>
                        <button onClick={()=>handleDeleteSection(sec)} className="px-2.5 py-1 text-xs rounded-lg font-semibold text-white" style={{background:"#EF4444"}}>삭제</button>
                      </div>
                    ) : (
                      <button onClick={()=>setDelSecId(sec.id)} className="p-1.5 rounded-lg transition-colors"
                        style={{opacity:0.4}} onMouseEnter={e=>(e.currentTarget.style.opacity="1")} onMouseLeave={e=>(e.currentTarget.style.opacity="0.4")}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    )}
                    <button onClick={()=>startAdd(sec.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors"
                      style={{background:`${accent}14`,color:accent}}
                      onMouseEnter={e=>(e.currentTarget.style.background=`${accent}25`)}
                      onMouseLeave={e=>(e.currentTarget.style.background=`${accent}14`)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      상품 추가
                    </button>
                  </div>
                </div>

                {/* 테이블 */}
                <table className="w-full text-sm" style={{tableLayout:"fixed"}}>
                  <TableHead/>
                  <tbody>
                    {catProducts.length===0 && addCat!==sec.name && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-xs" style={{color:"#B0B8C1"}}>
                          상품이 없습니다. &nbsp;
                          <button onClick={()=>startAdd(sec.name)} className="font-semibold" style={{color:accent}}>+ 추가</button>
                        </td>
                      </tr>
                    )}
                    {catProducts.map((p,idx)=>
                      editId===p.id ? (
                        <EditRow key={p.id} form={editForm} setForm={setEditForm} onSave={()=>saveEdit(p.id)} onCancel={()=>setEditId(null)} isSaving={saving}/>
                      ) : (
                        <tr key={p.id} className="group cursor-pointer" style={{borderTop:"1px solid #F2F4F6"}}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(139,92,246,0.025)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                          onClick={()=>startEdit(p)}>
                          <td className="px-4 py-3.5 text-xs text-center font-medium" style={{color:"#B0B8C1"}}>{idx+1}</td>
                          <td className="px-4 py-3.5 text-sm font-semibold truncate" style={{color:"#191F28"}}>{p.name}</td>
                          <td className="px-4 py-3.5 text-xs truncate" style={{color:"#6B7684"}}>{p.vendor||<span style={{color:"#D1D5DB"}}>—</span>}</td>
                          <td className="px-4 py-3.5 text-xs truncate" style={{color:"#6B7684"}}>{p.vendorBankAccount||<span style={{color:"#D1D5DB"}}>—</span>}</td>
                          <td className="px-4 py-3.5 text-sm text-right font-bold" style={{color:"#191F28"}}>{wonFmt(p.salePrice)}</td>
                          <td className="px-4 py-3.5 text-xs text-right font-medium" style={{color:"#8B95A1"}}>{wonFmt(p.costPrice)}</td>
                          <td className="px-4 py-3.5 text-center"><MarginBadge rate={marginRate(p.costPrice,p.salePrice)}/></td>
                          <td className="px-4 py-3.5 text-xs" style={{color:"#8B95A1"}}>{p.notes||<span style={{color:"#E9EBEF"}}>—</span>}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={e=>{e.stopPropagation();startEdit(p);}} className="p-1.5 rounded-lg hover:bg-gray-100">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={e=>{e.stopPropagation();handleDelete(p.id);}} className="p-1.5 rounded-lg"
                                style={{background:"rgba(239,68,68,0.08)"}}
                                onMouseEnter={e=>(e.currentTarget.style.background="rgba(239,68,68,0.16)")}
                                onMouseLeave={e=>(e.currentTarget.style.background="rgba(239,68,68,0.08)")}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                    {addCat===sec.name && (
                      <EditRow form={addForm} setForm={setAddForm} onSave={()=>saveAdd(sec.name)} onCancel={()=>setAddCat(null)} isSaving={saving}/>
                    )}
                  </tbody>
                  {catProducts.length>0 && (
                    <tfoot>
                      <tr style={{background:"#FAFAFA",borderTop:"1px solid #F2F4F6"}}>
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-medium" style={{color:"#B0B8C1"}}>평균</td>
                        <td colSpan={2}/>
                        <td className="px-4 py-2.5 text-sm text-right font-bold" style={{color:"#191F28"}}>{wonFmt(Math.round(catProducts.reduce((s,p)=>s+(p.salePrice??0),0)/catProducts.length))}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-medium" style={{color:"#8B95A1"}}>{wonFmt(Math.round(catProducts.reduce((s,p)=>s+(p.costPrice??0),0)/catProducts.length))}</td>
                        <td className="px-4 py-2.5 text-center"><MarginBadge rate={avgMargin}/></td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
