import { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import {
  login as apiLogin,
  listarUsuarios, criarUsuario, editarUsuario,
  listarRegistros, criarRegistro, atualizarRegistro,
  listarMetas, salvarMeta,
  listarAuditoria, registrarAuditoriaBackend,
  listarHistCalc, salvarHistCalc,
  listarOcorrencias, criarOcorrencia, atualizarOcorrencia, excluirOcorrencia,
  listarRelatoriosTurno, criarRelatorioTurno, excluirRelatorioTurno,
  listarParadas, criarParada, atualizarParada, excluirParada,
  listarEscala, definirEscala, excluirEscala,
  listarSHOTurno, criarSHOTurno, confirmarSHOTurno, excluirSHOTurno,
  assinarMudancas,
} from "./api";

// ══════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════

// Metas padrão — podem ser alteradas por Lider/Supervisor em tempo real
const METAS_DEFAULT = {
  UmidSojaEntrada:  { min:10,   max:12,   un:"%",  label:"Umid. Soja Entrada"  },
  UmidSojaProducao: { min:9.5,  max:10.5, un:"%",  label:"Umid. Soja Produção" },
  UmidFarelo:       { min:12,   max:12.5, un:"%",  label:"Umidade Farelo"      },
  ProteinaFarelo:   { min:46,   max:46.5, un:"%",  label:"Proteína Farelo"     },
  OleoFarelo:       { min:null, max:2.5,  un:"%",  label:"Óleo Farelo"         },
  FibraFarelo:      { min:null, max:5.0,  un:"%",  label:"Fibra Farelo"        },
  LEX:              { min:null, max:0.7,  un:"",   label:"LEX"                 },
  OleoCasca:        { min:null, max:1.2,  un:"",   label:"Óleo da Casca"       },
};

// LIMITES_MOAGEM é usado como fallback estático (sem acesso ao state)
const LIMITES_MOAGEM = METAS_DEFAULT;

const LIMITES_MAIS_KPI = {
  TempRolo:        { min:null, max:65,   un:"°C", label:"Temp. Rolo"       },
  TempMancal:      { min:null, max:70,   un:"°C", label:"Temp. Mancal"     },
  EspessuraLamina: { min:0.35, max:0.40, un:"mm", label:"Espessura Lâmina" },
  Q1_Peneira6:     { min:null, max:5,    un:"%",  label:"1ªQ #6"          },
  Q2_Peneira6:     { min:null, max:3,    un:"%",  label:"2ªQ #6"          },
  Q2_Peneira8:     { min:null, max:8,    un:"%",  label:"2ªQ #8"          },
  Q2_Fundo:        { min:85,   max:null, un:"%",  label:"2ªQ Fundo"       },
  Malha283:        { min:null, max:0,    un:"%",  label:"Malha 2,83mm"    },
  Malha200:        { min:null, max:5,    un:"%",  label:"Malha 2,00mm"    },
};

const LIMITES = { ...LIMITES_MOAGEM, ...LIMITES_MAIS_KPI };

// Turnos com horários corretos
const TURNOS_CONFIG = [
  { id:"NOITE", label:"1° Turno — Noite", horario:"23:40 às 07:30", cor:"#6366f1", bg:"#eef2ff" },
  { id:"MANHÃ", label:"2° Turno — Manhã", horario:"07:30 às 15:30", cor:"#0ea5e9", bg:"#e0f2fe" },
  { id:"TARDE", label:"3° Turno — Tarde", horario:"15:30 às 23:40", cor:"#f59e0b", bg:"#fffbeb" },
];

function detectarTurno() {
  const hm = new Date().getHours() * 60 + new Date().getMinutes();
  if (hm >= 450  && hm < 930)  return "MANHÃ";
  if (hm >= 930  && hm < 1420) return "TARDE";
  return "NOITE";
}

const GRUPOS_MOAGEM = [
  { id:"soja",   label:"🌾 Soja",               cor:"#f59e0b", bg:"#fffbeb", campos:["UmidSojaEntrada","UmidSojaProducao"] },
  { id:"farelo", label:"📦 Qualidade do Farelo", cor:"#8b5cf6", bg:"#faf5ff", campos:["UmidFarelo","ProteinaFarelo","OleoFarelo","FibraFarelo","LEX","OleoCasca"] },
];

const CAMPOS_MEDIA = ["UmidSojaEntrada","UmidSojaProducao","UmidFarelo","ProteinaFarelo","OleoFarelo","FibraFarelo"];

const LAMINADORES = ["LAMINADOR A","LAMINADOR B","LAMINADOR C","LAMINADOR D"];
const QUEBRADORES = ["QUEBRADOR A","QUEBRADOR B","QUEBRADOR C"];

const USUARIOS = [
  { id:1, nome:"Eliseu Silva",      perfil:"Operador",   turno:"NOITE", email:"eliseu@adm.com",  senha:"1234" },
  { id:2, nome:"Roni Santos",       perfil:"Operador",   turno:"NOITE", email:"roni@adm.com",    senha:"1234" },
  { id:3, nome:"Diogo Martins",     perfil:"Lider",      turno:"NOITE", email:"diogo@adm.com",   senha:"1234" },
  { id:4, nome:"Carlos Supervisor", perfil:"Supervisor", turno:"TODOS", email:"carlos@adm.com",  senha:"1234" },
];

const PERFIS_ASSINATURA = [
  { id:"lider",     label:"Líder de Turno", icon:"👷", cor:"#3b82f6", bg:"#dbeafe" },
  { id:"qualidade", label:"Qualidade",       icon:"🔬", cor:"#8b5cf6", bg:"#ede9fe" },
  { id:"gerencia",  label:"Gerência",        icon:"🏢", cor:"#10b981", bg:"#d1fae5" },
];

const hoje = () => new Date().toISOString().split("T")[0];

// ══════════════════════════════════════════════════════════════════
// DADOS HISTÓRICOS
// ══════════════════════════════════════════════════════════════════
function gerarHistorico() {
  const base = new Date("2026-01-01");
  const dados = [];
  const horas = ["00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00","18:00","20:00","22:00"];
  const ops   = ["Eliseu Silva","Roni Santos","Marcos Lima","Gilson Ramos","Angelo Souza","Dayana Lima"];
  for (let d = 0; d < 30; d++) {
    const dt = new Date(base); dt.setDate(dt.getDate()+d);
    const dataStr = dt.toISOString().split("T")[0];
    for (let h = 0; h < horas.length; h++) {
      const turno = ["NOITE","MANHÃ","TARDE"][Math.floor(h/4)];
      dados.push({
        id: dados.length+1, data: dataStr, hora: horas[h], turno,
        operador: ops[Math.floor(Math.random()*ops.length)],
        tipoFarelo: Math.random()>0.8?"Hipro":Math.random()>0.5?"Floculado":"Moído",
        UmidSojaEntrada:  +(10+Math.random()*2).toFixed(2),
        UmidSojaProducao: +(9.5+Math.random()*1).toFixed(2),
        UmidFarelo:       +(11.8+Math.random()*1).toFixed(2),
        ProteinaFarelo:   +(45.8+Math.random()*1.2).toFixed(2),
        OleoFarelo:       +(2.1+Math.random()*0.6).toFixed(2),
        FibraFarelo:      +(3.8+Math.random()*1.5).toFixed(2),
        LEX:              +(0.4+Math.random()*0.4).toFixed(2),
        OleoCasca:        +(0.8+Math.random()*0.5).toFixed(2),
        status: Math.random()>0.15?"VALIDADO":"PENDENTE",
        desvios: [], tipo:"moagem",
      });
    }
  }
  return dados;
}
const HISTORICO = gerarHistorico();

const ACOES_SEED = [
  { id:1, data:"2026-01-25", problema:"Piso com soja e poeira (piso 2)", acao:"Retirada soja e limpeza com ar comprimido", afeta:"Área limpa, sem risco de queda", responsavel:"Dayana, Marcelo", lider:"Elias", status:"CONCLUIDO" },
  { id:2, data:"2026-02-01", problema:"Vazamento de condensado — Radiadores do DT", acao:"Trocado duas válvulas", afeta:"Consumo alto de vapor na Extração", responsavel:"Alison Moura", lider:"Elias", status:"CONCLUIDO" },
  { id:3, data:"2026-02-07", problema:"Piso térreo com soja", acao:"Retirada da soja", afeta:"Manter limpeza na área", responsavel:"Eliseu", lider:"Diogo", status:"ABERTO" },
];

// ══════════════════════════════════════════════════════════════════
// PREVISÃO DE DESVIO — regressão linear simples nos últimos N registros
// ══════════════════════════════════════════════════════════════════
function preverDesvio(registros, campo, turno, data, metas) {
  const regs = registros
    .filter(r=>r.tipo==="moagem"&&r.data===data&&r.turno===turno&&r[campo]!==null&&r[campo]!==undefined)
    .slice(-6); // últimos 6 do turno

  if(regs.length < 3) return null; // precisa de pelo menos 3 pontos

  const vals = regs.map((r,i)=>({x:i, y:parseFloat(r[campo])}));
  const n    = vals.length;
  const sumX = vals.reduce((a,v)=>a+v.x, 0);
  const sumY = vals.reduce((a,v)=>a+v.y, 0);
  const sumXY= vals.reduce((a,v)=>a+v.x*v.y, 0);
  const sumX2= vals.reduce((a,v)=>a+v.x*v.x, 0);

  const denom = (n*sumX2 - sumX*sumX);
  if(Math.abs(denom) < 0.0001) return null;

  const slope     = (n*sumXY - sumX*sumY) / denom;
  const intercept = (sumY - slope*sumX) / n;

  // Prevê o próximo valor (x = n)
  const proximoVal = +(intercept + slope*n).toFixed(2);
  const m          = metas[campo] || LIMITES_MOAGEM[campo];
  if(!m) return null;

  const statusAtual   = chk(campo, regs[regs.length-1][campo]);
  const statusPrevisto = chk(campo, proximoVal);
  const tendencia     = slope > 0.05 ? "subindo" : slope < -0.05 ? "caindo" : "estável";
  const alertar       = statusAtual==="ok" && statusPrevisto==="danger";

  return { proximoVal, slope:+slope.toFixed(3), tendencia, alertar, statusPrevisto, campo };
}

// ══════════════════════════════════════════════════════════════════
// PAINEL DE PREVISÃO — componente para o Dashboard
// ══════════════════════════════════════════════════════════════════
function PainelPrevisao({ registros, metas, turnoAtual, dataHoje }) {
  const campos = ["ProteinaFarelo","UmidFarelo","OleoFarelo","UmidSojaEntrada"];
  const previsoes = campos
    .map(c=>preverDesvio(registros, c, turnoAtual, dataHoje, metas))
    .filter(Boolean);

  const alertas = previsoes.filter(p=>p.alertar);
  if(!previsoes.length) return null;

  return (
    <div style={{background:"#fff",borderRadius:12,padding:18,
      border:`1.5px solid ${alertas.length>0?"#fca5a5":"#e2e8f0"}`,
      boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <div style={{width:32,height:32,borderRadius:8,
          background:alertas.length>0?"linear-gradient(135deg,#dc2626,#b91c1c)":"linear-gradient(135deg,#0ea5e9,#0284c7)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>
          {alertas.length>0?"⚠":"📡"}
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>
            Previsão de Desvio — Próximo Registro
          </div>
          <div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>
            Baseado nos últimos registros do turno · regressão linear
          </div>
        </div>
        {alertas.length>0&&(
          <span style={{marginLeft:"auto",background:"#fee2e2",color:"#dc2626",
            fontSize:10,fontFamily:"monospace",fontWeight:700,
            padding:"3px 10px",borderRadius:4,border:"1px solid #fca5a5"}}>
            {alertas.length} ALERTA{alertas.length>1?"S":""}
          </span>
        )}
      </div>

      <div className="grid-2" style={{display:"grid",gap:10}}>
        {previsoes.map(p=>{
          const m    = metas[p.campo]||LIMITES_MOAGEM[p.campo];
          const icon = p.tendencia==="subindo"?"↗":"subindo"===p.tendencia?"↗":p.tendencia==="caindo"?"↘":"→";
          const tcor = p.tendencia==="subindo"?"#dc2626":p.tendencia==="caindo"?"#16a34a":"#64748b";
          return (
            <div key={p.campo} style={{
              background:p.alertar?"#fff1f2":"#f8fafc",
              border:`1px solid ${p.alertar?"#fca5a5":"#e2e8f0"}`,
              borderRadius:9,padding:"11px 13px",
              borderLeft:`4px solid ${p.alertar?"#dc2626":COR[p.statusPrevisto].t}`,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace"}}>
                  {m?.label||p.campo}
                </div>
                <span style={{fontSize:16,color:tcor}}>{icon}</span>
              </div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                <span style={{fontSize:20,fontWeight:800,fontFamily:"monospace",
                  color:COR[p.statusPrevisto].t}}>
                  {p.proximoVal}{m?.un}
                </span>
                <span style={{fontSize:10,color:tcor,fontFamily:"monospace",fontWeight:600}}>
                  {p.tendencia} ({p.slope>0?"+":""}{p.slope}/reg)
                </span>
              </div>
              <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
                Meta: {m?.min!==null&&m?.max!==null?`${m.min}–${m.max}${m.un}`:
                       m?.max!==null?`≤${m.max}${m.un}`:m?.min!==null?`≥${m.min}${m.un}`:"—"}
              </div>
              {p.alertar&&(
                <div style={{marginTop:6,background:"#fee2e2",border:"1px solid #fca5a5",
                  borderRadius:5,padding:"4px 8px",fontSize:10,color:"#dc2626",fontWeight:600}}>
                  ⚠ Tende a sair do limite no próximo registro
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Pesos: Conformidade KPIs 50% | Registros no prazo 20% | Justificativas completas 20% | Validação 10%
function calcularScore(registros, turno, data) {
  const regs = registros.filter(r=>r.tipo==="moagem"&&r.data===data&&r.turno===turno);
  if(!regs.length) return null;

  // 1. Conformidade KPIs — 50 pts
  const comDesvio   = regs.filter(r=>r.desvios?.length>0).length;
  const confPct     = ((regs.length-comDesvio)/regs.length)*100;
  const ptConf      = Math.round(confPct*0.5);

  // 2. Registros no prazo — 20 pts (esperado mínimo 4 registros por turno de 8h)
  const minEsperado = 4;
  const ptPrazo     = Math.min(20, Math.round((regs.length/minEsperado)*20));

  // 3. Justificativas completas — 20 pts
  const comDevJust  = regs.filter(r=>r.desvios?.length>0&&r.justificativasArr?.length>0).length;
  const totalComDev = regs.filter(r=>r.desvios?.length>0).length;
  const ptJust      = totalComDev===0 ? 20 : Math.round((comDevJust/totalComDev)*20);

  // 4. Validação — 10 pts
  const validados   = regs.filter(r=>r.status==="VALIDADO").length;
  const ptValid     = Math.round((validados/regs.length)*10);

  const total = ptConf+ptPrazo+ptJust+ptValid;
  const letra = total>=90?"A+":total>=80?"A":total>=70?"B":total>=60?"C":"D";
  const cor   = total>=90?"#16a34a":total>=70?"#0ea5e9":total>=60?"#d97706":"#dc2626";

  return { total, letra, cor, ptConf, ptPrazo, ptJust, ptValid, regs:regs.length };
}

// ══════════════════════════════════════════════════════════════════
// TEMA (CLARO / ESCURO)
// ══════════════════════════════════════════════════════════════════
const TEMA = {
  claro: {
    bg:       "#f0f4f8",
    surface:  "#ffffff",
    surface2: "#f8fafc",
    border:   "#e2e8f0",
    text:     "#0f172a",
    text2:    "#1e293b",
    text3:    "#64748b",
    text4:    "#94a3b8",
    sidebar:  "#0f172a",
    header:   "#ffffff",
  },
  escuro: {
    bg:       "#0a0f1e",
    surface:  "#111827",
    surface2: "#1f2937",
    border:   "#1e293b",
    text:     "#f1f5f9",
    text2:    "#e2e8f0",
    text3:    "#94a3b8",
    text4:    "#475569",
    sidebar:  "#060d1a",
    header:   "#111827",
  },
};

// ══════════════════════════════════════════════════════════════════
// EXPORTAÇÃO EXCEL (CSV → download)
// ══════════════════════════════════════════════════════════════════
function exportarExcel(registros, labelPeriodo) {
  const regs = registros.filter(r=>r.tipo==="moagem");
  if(!regs.length){ alert("Nenhum registro para exportar."); return; }

  // Cabeçalhos
  const headers = [
    "Data","Hora","Turno","Operador","Tipo Farelo","Status",
    "Umid. Soja Entrada (%)","Umid. Soja Produção (%)","Umidade Farelo (%)",
    "Proteína Farelo (%)","Óleo Farelo (%)","Fibra Farelo (%)","LEX","Óleo Casca",
    "Tem Desvio","Qtd Desvios","Campos com Desvio","Justificativas"
  ];

  // Linhas
  const linhas = regs.map(r=>[
    r.data ?? "",
    r.hora ?? "",
    r.turno ?? "",
    r.operador ?? "",
    r.tipoFarelo ?? "",
    r.status ?? "",
    r.UmidSojaEntrada  ?? "",
    r.UmidSojaProducao ?? "",
    r.UmidFarelo       ?? "",
    r.ProteinaFarelo   ?? "",
    r.OleoFarelo       ?? "",
    r.FibraFarelo      ?? "",
    r.LEX              ?? "",
    r.OleoCasca        ?? "",
    r.desvios?.length>0 ? "SIM" : "NÃO",
    r.desvios?.length ?? 0,
    r.desvios?.map(d=>LIMITES_MOAGEM[d]?.label||d).join("; ") ?? "",
    r.justificativasArr?.map(j=>`${j.label}: ${j.justificativa}`).join(" | ") ?? "",
  ]);

  // Monta CSV com BOM para Excel reconhecer UTF-8
  const BOM = "\uFEFF";
  const sep = ";"; // Ponto-e-vírgula para Excel BR
  const csv = BOM
    + headers.join(sep) + "\n"
    + linhas.map(l=>l.map(v=>{
        const s = String(v);
        // Escapa campos com separador ou aspas
        return s.includes(sep)||s.includes('"')||s.includes('\n')
          ? `"${s.replace(/"/g,'""')}"` : s;
      }).join(sep)).join("\n");

  // Download
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `KPI_SHO_${labelPeriodo.replace(/\//g,"-").replace(/ /g,"_")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function chk(campo, val) {
  if (val===""||val===null||val===undefined) return "neutral";
  const v=parseFloat(val), m=LIMITES[campo]; if(!m) return "neutral";
  if(m.min!==null&&v<m.min) return "danger";
  if(m.max!==null&&v>m.max) return "danger";
  return "ok";
}
const COR={ok:{b:"#86efac",f:"#f0fdf4",t:"#16a34a"},danger:{b:"#fca5a5",f:"#fff1f2",t:"#dc2626"},neutral:{b:"#e2e8f0",f:"#f8fafc",t:"#475569"}};

function Badge({s}) {
  const M={VALIDADO:["#16a34a","#dcfce7","✅ Validado"],PENDENTE:["#d97706","#fef3c7","⏳ Pendente"],REJEITADO:["#dc2626","#fee2e2","❌ Rejeitado"],CONCLUIDO:["#16a34a","#dcfce7","✅ Concluído"],ABERTO:["#d97706","#fef3c7","🔓 Aberto"],APROVADO:["#16a34a","#dcfce7","✅ Aprovado"],REPROVADO:["#dc2626","#fee2e2","❌ Reprovado"]};
  const [c,bg,l]=M[s]||["#6b7280","#f1f5f9",s];
  return <span style={{background:bg,color:c,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:3,fontFamily:"monospace",whiteSpace:"nowrap"}}>{l}</span>;
}
function SC({label,value,sub,icon,color="#0ea5e9"}) {
  return (
    <div style={{background:"#fff",borderRadius:12,padding:"15px 17px",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
        <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5}}>{label}</span>
        <span style={{fontSize:16}}>{icon}</span>
      </div>
      <div style={{fontSize:22,fontWeight:800,color,fontFamily:"monospace"}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:"#94a3b8",marginTop:2,fontFamily:"monospace"}}>{sub}</div>}
    </div>
  );
}
function PH({title,badge,subtitle,action}) {
  return (
    <div className="ph-header" style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"15px 26px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <h1 style={{fontSize:17,fontWeight:800,color:"#0f172a",margin:0}}>{title}</h1>
          {badge&&<span style={{fontSize:9,background:"#0ea5e9",color:"#fff",padding:"2px 8px",borderRadius:2,fontFamily:"monospace",fontWeight:700,letterSpacing:1}}>{badge}</span>}
        </div>
        {subtitle&&<p style={{color:"#64748b",fontSize:12,margin:"3px 0 0"}}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Campo({campo,valor,onChange}) {
  const m=LIMITES[campo],s=chk(campo,valor),c=COR[s];
  const hint=m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:m.max!==null?`Máx ${m.max}${m.un}`:m.min!==null?`Mín ${m.min}${m.un}`:""):"";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      <label style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace"}}>{m?.label||campo}</label>
      <div style={{position:"relative"}}>
        <input type="number" step="0.01" value={valor??""} onChange={e=>onChange&&onChange(campo,e.target.value)}
          style={{width:"100%",padding:"8px 26px 8px 10px",borderRadius:6,border:`1.5px solid ${valor!==""&&valor!==null?c.b:"#e2e8f0"}`,background:valor!==""&&valor!==null?c.f:"#f8fafc",color:valor!==""&&valor!==null?c.t:"#1e293b",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
        {valor!==""&&valor!==null&&s==="danger"&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:11}}>⚠</span>}
        {valor!==""&&valor!==null&&s==="ok"&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#16a34a"}}>✓</span>}
      </div>
      {hint&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>Meta: {hint}</span>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SINO DE NOTIFICAÇÕES
// ══════════════════════════════════════════════════════════════════
function SinoNotificacoes({ registros, setPagina }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  // Fecha ao clicar fora
  useEffect(()=>{
    const handle = (e) => {
      if(ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", handle);
    return ()=>document.removeEventListener("mousedown", handle);
  },[]);

  // Recalcula a posição do painel sempre que abrir (ou a tela mudar de tamanho)
  useEffect(()=>{
    if(!aberto) return;
    const calcular = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if(!r) return;
      const larguraPainel = Math.min(320, window.innerWidth - 24);
      // Mantém o painel dentro da tela, alinhado pela direita do sino
      let left = r.right - larguraPainel;
      left = Math.max(12, Math.min(left, window.innerWidth - larguraPainel - 12));
      setPos({ top: r.bottom + 8, left, width: larguraPainel });
    };
    calcular();
    window.addEventListener("resize", calcular);
    return ()=>window.removeEventListener("resize", calcular);
  },[aberto]);

  const hoje       = new Date().toISOString().split("T")[0];
  const turnoAtual = detectarTurno();

  const alertas = useMemo(()=>{
    const lista = [];

    // 1. Registros pendentes de validação
    const pendentes = registros.filter(r=>r.status==="PENDENTE");
    if(pendentes.length>0) lista.push({
      id:"pend", urgencia:"alta", icon:"⏳",
      titulo:`${pendentes.length} registro${pendentes.length>1?"s":""} pendente${pendentes.length>1?"s":""}`,
      desc:`${pendentes.filter(r=>r.desvios?.length>0).length} com desvio · aguardando validação`,
      cor:"#f59e0b", bg:"#fffbeb", pagina:"verificacao",
    });

    // 2. Desvios sem justificativa
    const semJust = registros.filter(r=>r.desvios?.length>0&&(!r.justificativasArr||r.justificativasArr.length===0));
    if(semJust.length>0) lista.push({
      id:"just", urgencia:"alta", icon:"🚫",
      titulo:`${semJust.length} desvio${semJust.length>1?"s":""} sem justificativa`,
      desc:"Registros fora do parâmetro sem correção registrada",
      cor:"#dc2626", bg:"#fff1f2", pagina:"relatorios",
    });

    // 3. Boletim do dia sem assinaturas
    const regsHoje = registros.filter(r=>r.data===hoje&&r.tipo==="moagem");
    if(regsHoje.length>0) lista.push({
      id:"ass", urgencia:"media", icon:"✍",
      titulo:"Boletim de hoje aguarda assinaturas",
      desc:`${regsHoje.length} registros lançados · Líder, Qualidade e Gerência`,
      cor:"#8b5cf6", bg:"#faf5ff", pagina:"assinaturas",
    });

    // 4. Nenhum registro no turno atual ainda
    const regsTurno = registros.filter(r=>r.data===hoje&&r.turno===turnoAtual&&r.tipo==="moagem");
    if(regsTurno.length===0) lista.push({
      id:"turno", urgencia:"media", icon:"📋",
      titulo:`Nenhum KPI lançado no turno atual`,
      desc:`${TURNOS_CONFIG.find(t=>t.id===turnoAtual)?.label} · ${TURNOS_CONFIG.find(t=>t.id===turnoAtual)?.horario}`,
      cor:"#0ea5e9", bg:"#e0f2fe", pagina:"kpis_moagem",
    });

    // 5. Ações KPI em aberto
    const acoesAbertas = registros.filter(r=>r.justificativasArr?.length>0).length;
    if(acoesAbertas>0) lista.push({
      id:"acoes", urgencia:"baixa", icon:"📌",
      titulo:`${acoesAbertas} ação${acoesAbertas>1?"ões":""} KPI em aberto`,
      desc:"Correções registradas aguardando acompanhamento",
      cor:"#10b981", bg:"#f0fdf4", pagina:"acoes_kpi",
    });

    return lista;
  },[registros, hoje, turnoAtual]);

  const total   = alertas.length;
  const urgente = alertas.filter(a=>a.urgencia==="alta").length;

  return (
    <div ref={ref} style={{position:"relative"}}>
      {/* Botão do sino */}
      <button ref={btnRef} onClick={()=>setAberto(x=>!x)}
        style={{position:"relative",width:34,height:34,borderRadius:8,
          background:aberto?"rgba(14,165,233,.2)":"rgba(255,255,255,.06)",
          border:`1px solid ${aberto?"rgba(14,165,233,.4)":"rgba(255,255,255,.08)"}`,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:16,transition:"all .2s",flexShrink:0}}>
        🔔
        {/* Badge de contagem */}
        {total>0&&(
          <span style={{position:"absolute",top:-5,right:-5,
            background:urgente>0?"#dc2626":"#f59e0b",
            color:"#fff",fontSize:9,fontWeight:800,fontFamily:"monospace",
            width:16,height:16,borderRadius:"50%",
            display:"flex",alignItems:"center",justifyContent:"center",
            border:"2px solid #0f172a"}}>
            {total>9?"9+":total}
          </span>
        )}
      </button>

      {/* Painel de notificações — posição fixa calculada em JS para nunca vazar da tela */}
      {aberto&&(
        <div className="sino-painel" style={{position:"fixed",top:pos.top,left:pos.left,
          width:pos.width||320,background:"#fff",borderRadius:12,
          boxShadow:"0 8px 32px rgba(0,0,0,.25)",
          border:"1px solid #e2e8f0",zIndex:1100,overflow:"hidden"}}>

          {/* Header */}
          <div style={{padding:"12px 16px",background:"#0f172a",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{color:"#f1f5f9",fontSize:13,fontWeight:800}}>
                Notificações
              </div>
              <div style={{color:"#475569",fontSize:10,fontFamily:"monospace",marginTop:1}}>
                {total>0?`${total} item${total>1?"s":""} · ${urgente} urgente${urgente>1?"s":""}` : "Tudo em dia"}
              </div>
            </div>
            {total===0&&<span style={{fontSize:18}}>✅</span>}
          </div>

          {/* Lista */}
          {total===0 ? (
            <div style={{padding:24,textAlign:"center",color:"#94a3b8"}}>
              <div style={{fontSize:28,marginBottom:8}}>🎉</div>
              <div style={{fontSize:12,fontWeight:600,color:"#64748b"}}>
                Nenhuma pendência no momento
              </div>
            </div>
          ) : (
            <div style={{maxHeight:360,overflowY:"auto"}}>
              {/* Urgentes primeiro */}
              {["alta","media","baixa"].map(urgencia=>{
                const grupo = alertas.filter(a=>a.urgencia===urgencia);
                if(!grupo.length) return null;
                const label = {alta:"🔴 Urgente",media:"🟡 Atenção",baixa:"🟢 Informativo"}[urgencia];
                return (
                  <div key={urgencia}>
                    <div style={{padding:"6px 14px",background:"#f8fafc",
                      fontSize:9,fontWeight:700,color:"#64748b",
                      textTransform:"uppercase",letterSpacing:1,fontFamily:"monospace",
                      borderBottom:"1px solid #f1f5f9"}}>
                      {label}
                    </div>
                    {grupo.map(a=>(
                      <div key={a.id}
                        onClick={()=>{setPagina(a.pagina);setAberto(false);}}
                        style={{padding:"11px 14px",borderBottom:"1px solid #f8fafc",
                          background:a.bg,cursor:"pointer",
                          display:"flex",alignItems:"flex-start",gap:10,
                          transition:"filter .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(.97)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                        <div style={{width:32,height:32,borderRadius:8,
                          background:"rgba(255,255,255,.7)",
                          border:`1px solid ${a.cor}30`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:16,flexShrink:0}}>
                          {a.icon}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:a.cor,
                            marginBottom:2,lineHeight:1.3}}>
                            {a.titulo}
                          </div>
                          <div style={{fontSize:10,color:"#64748b",lineHeight:1.4}}>
                            {a.desc}
                          </div>
                        </div>
                        <span style={{fontSize:10,color:"#94a3b8",flexShrink:0,marginTop:2}}>→</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div style={{padding:"9px 14px",borderTop:"1px solid #f1f5f9",
            background:"#f8fafc",textAlign:"center"}}>
            <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
              Atualizado automaticamente
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// GERADOR DE PDF DO TURNO
// ══════════════════════════════════════════════════════════════════
function gerarPDFTurno(registros, turno, data, user) {
  const tc      = TURNOS_CONFIG.find(t=>t.id===turno);
  const regs    = registros.filter(r=>r.data===data&&r.turno===turno&&r.tipo==="moagem");
  const dataFmt = new Date(data+"T12:00:00").toLocaleDateString("pt-BR",{
    weekday:"long",day:"2-digit",month:"long",year:"numeric"
  });

  if(!regs.length){
    alert(`Nenhum registro encontrado para ${turno} em ${data}.`);
    return;
  }

  // Calcula médias e estatísticas
  const campos = Object.keys(LIMITES_MOAGEM);
  const stats  = {};
  campos.forEach(c=>{
    const vals = regs.map(r=>r[c]).filter(v=>v!==null&&v!==undefined);
    if(!vals.length){ stats[c]={media:null,min:null,max:null,desvios:0}; return; }
    stats[c] = {
      media: +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2),
      min:   +Math.min(...vals).toFixed(2),
      max:   +Math.max(...vals).toFixed(2),
      desvios: regs.filter(r=>chk(c,r[c])==="danger").length,
    };
  });
  const totalDesvios = regs.filter(r=>r.desvios?.length>0).length;
  const conformidade = Math.round(((regs.length-totalDesvios)/regs.length)*100);

  // Gera HTML do relatório
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório de Turno — ${turno} ${data}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:11px; color:#1e293b; background:#fff; }
  .page { padding:28px 32px; max-width:900px; margin:0 auto; }
  .header { border-bottom:3px solid ${tc?.cor||"#0ea5e9"}; padding-bottom:14px; margin-bottom:18px; }
  .header-top { display:flex; justify-content:space-between; align-items:flex-start; }
  .logo-area h1 { font-size:20px; font-weight:900; color:#0f172a; }
  .logo-area h1 span { color:${tc?.cor||"#0ea5e9"}; }
  .logo-area p { font-size:10px; color:#64748b; margin-top:3px; font-family:monospace; }
  .badge { background:${tc?.bg||"#e0f2fe"}; color:${tc?.cor||"#0284c7"}; border:1px solid ${tc?.cor||"#0ea5e9"}30;
           padding:4px 12px; border-radius:4px; font-size:10px; font-weight:700; font-family:monospace; }
  .section { margin-bottom:18px; }
  .section-title { font-size:12px; font-weight:800; color:#0f172a; margin-bottom:8px;
                   padding-bottom:5px; border-bottom:1px solid #e2e8f0; }
  .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px; }
  .stat-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:7px; padding:10px 12px; }
  .stat-label { font-size:8px; font-weight:700; color:#64748b; text-transform:uppercase;
                letter-spacing:.5px; font-family:monospace; margin-bottom:4px; }
  .stat-value { font-size:18px; font-weight:800; font-family:monospace; }
  .kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px; }
  .kpi-card { border:1px solid #e2e8f0; border-radius:7px; overflow:hidden; }
  .kpi-header { background:#f1f5f9; padding:6px 10px; font-size:9px; font-weight:700;
                color:#64748b; text-transform:uppercase; letter-spacing:.5px; font-family:monospace; }
  .kpi-body { padding:8px 10px; }
  .kpi-media { font-size:18px; font-weight:800; font-family:monospace; }
  .kpi-meta { font-size:9px; color:#94a3b8; font-family:monospace; margin-top:2px; }
  .ok { color:#16a34a; } .danger { color:#dc2626; } .neutral { color:#64748b; }
  .ok-bg { background:#f0fdf4; border-color:#86efac; }
  .danger-bg { background:#fff1f2; border-color:#fca5a5; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#0f172a; color:#f1f5f9; padding:7px 10px; text-align:left;
       font-size:9px; text-transform:uppercase; letter-spacing:.5px; font-family:monospace; }
  td { padding:7px 10px; border-bottom:1px solid #f1f5f9; }
  tr:nth-child(even) td { background:#fafafa; }
  .desvio-row td { background:#fff7f7 !important; }
  .just-box { margin-top:4px; background:#fffbeb; border:1px solid #fde68a;
              border-radius:4px; padding:5px 8px; font-size:9px; color:#92400e; }
  .footer { margin-top:24px; padding-top:14px; border-top:2px solid ${tc?.cor||"#0ea5e9"};
            display:flex; justify-content:space-between; align-items:center; }
  .assinatura-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:20px; }
  .assinatura-box { border-top:1px solid #1e293b; padding-top:6px; text-align:center; }
  .assinatura-label { font-size:9px; color:#64748b; font-family:monospace; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-top">
      <div class="logo-area">
        <h1>🏭 KPI <span>SHO</span></h1>
        <p>ADM Brasil · Planta Uberlândia · Preparação / Extração</p>
      </div>
      <div style="text-align:right">
        <div class="badge">${tc?.label||turno} · ${tc?.horario||""}</div>
        <p style="font-size:10px;color:#64748b;margin-top:6px;font-family:monospace">${dataFmt}</p>
        <p style="font-size:10px;color:#64748b;font-family:monospace">Emitido por: ${user?.nome||"Sistema"}</p>
      </div>
    </div>
    <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin-top:10px">
      Relatório de Turno — Análises de Qualidade
    </h2>
  </div>

  <!-- RESUMO DO TURNO -->
  <div class="section">
    <div class="section-title">Resumo Executivo</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Registros</div>
        <div class="stat-value" style="color:#0ea5e9">${regs.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Com Desvio</div>
        <div class="stat-value ${totalDesvios>0?"danger":"ok"}">${totalDesvios}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conformidade</div>
        <div class="stat-value ${conformidade>=90?"ok":conformidade>=70?"neutral":"danger"}">${conformidade}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Validados</div>
        <div class="stat-value" style="color:#8b5cf6">${regs.filter(r=>r.status==="VALIDADO").length}</div>
      </div>
    </div>
  </div>

  <!-- MÉDIAS DO TURNO -->
  <div class="section">
    <div class="section-title">Médias do Turno por KPI</div>
    <div class="kpi-grid">
      ${campos.map(c=>{
        const s    = stats[c];
        const m    = LIMITES_MOAGEM[c];
        const cls  = s.media!==null ? (chk(c,s.media)==="ok"?"ok-bg":"danger-bg") : "";
        const vcls = s.media!==null ? (chk(c,s.media)==="ok"?"ok":"danger") : "neutral";
        const hint = m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:
                       m.max!==null?`≤${m.max}${m.un}`:m.min!==null?`≥${m.min}${m.un}`:""):"";
        return `
        <div class="kpi-card ${cls}">
          <div class="kpi-header">${m?.label||c}</div>
          <div class="kpi-body">
            <div class="kpi-media ${vcls}">${s.media!==null?`${s.media}${m?.un||""}`:"—"}</div>
            <div class="kpi-meta">
              ${s.media!==null?`Mín: ${s.min} · Máx: ${s.max} · `:""}
              Meta: ${hint||"—"}
              ${s.desvios>0?` · ⚠ ${s.desvios} desvio${s.desvios>1?"s":""}`:""} 
            </div>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>

  <!-- REGISTROS DETALHADOS -->
  <div class="section">
    <div class="section-title">Registros Detalhados (${regs.length})</div>
    <table>
      <thead>
        <tr>
          <th>Hora</th><th>Operador</th><th>Tipo</th>
          <th>Proteína</th><th>Umid. Farelo</th><th>Óleo</th>
          <th>Umid. Soja E.</th><th>LEX</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${regs.map(r=>{
          const td = r.desvios?.length>0;
          const ps = chk("ProteinaFarelo",r.ProteinaFarelo);
          const us = chk("UmidFarelo",r.UmidFarelo);
          const os = chk("OleoFarelo",r.OleoFarelo);
          return `
          <tr class="${td?"desvio-row":""}">
            <td style="font-family:monospace;font-weight:700">${r.hora}</td>
            <td>${r.operador?.split(" ")[0]}</td>
            <td><span style="font-size:9px;font-family:monospace">${r.tipoFarelo||"—"}</span></td>
            <td style="font-family:monospace;font-weight:700" class="${ps}">${r.ProteinaFarelo!=null?`${r.ProteinaFarelo}%`:"—"}</td>
            <td style="font-family:monospace;font-weight:700" class="${us}">${r.UmidFarelo!=null?`${r.UmidFarelo}%`:"—"}</td>
            <td style="font-family:monospace;font-weight:700" class="${os}">${r.OleoFarelo!=null?`${r.OleoFarelo}%`:"—"}</td>
            <td style="font-family:monospace">${r.UmidSojaEntrada!=null?`${r.UmidSojaEntrada}%`:"—"}</td>
            <td style="font-family:monospace">${r.LEX!=null?r.LEX:"—"}</td>
            <td><span style="font-size:9px;font-weight:700;font-family:monospace;
              color:${r.status==="VALIDADO"?"#16a34a":r.status==="REJEITADO"?"#dc2626":"#d97706"}">
              ${r.status}</span></td>
          </tr>
          ${td&&r.justificativasArr?.length?`
          <tr><td colspan="9">
            <div class="just-box">
              📋 Justificativas: ${r.justificativasArr.map(j=>`<b>${j.label}</b> (${j.valor}${j.un}): ${j.justificativa}`).join(" · ")}
            </div>
          </td></tr>`:""}`;
        }).join("")}
      </tbody>
    </table>
  </div>

  <!-- ASSINATURAS -->
  <div class="section">
    <div class="section-title">Assinaturas</div>
    <div class="assinatura-grid">
      ${["Líder de Turno","Qualidade","Gerência"].map(p=>`
      <div class="assinatura-box">
        <div style="height:50px"></div>
        <div class="assinatura-label">${p}</div>
      </div>`).join("")}
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <span style="font-size:9px;color:#94a3b8;font-family:monospace">
      ADM Brasil · SHO Preparação/Extração · Sistema KPI v3.0
    </span>
    <span style="font-size:9px;color:#94a3b8;font-family:monospace">
      Gerado em ${new Date().toLocaleString("pt-BR")}
    </span>
  </div>

</div>
</body>
</html>`;

  // Abre em nova janela e aciona a impressão
  const win = window.open("","_blank","width=960,height=700");
  win.document.write(html);
  win.document.close();
  win.onload = ()=>{ win.focus(); win.print(); };
}

// ══════════════════════════════════════════════════════════════════
// SIDEBAR — com sino integrado
// ══════════════════════════════════════════════════════════════════
function Sidebar({user, pagina, setPagina, onLogout, registros, modoEscuro, setModoEscuro, mobileOpen, setMobileOpen}) {
  const PC={Operador:"#f59e0b",Lider:"#3b82f6",Supervisor:"#10b981"};
  const NAV=[
    {id:"dashboard",      icon:"📊", label:"Dashboard",        perfis:["Operador","Lider","Supervisor"]},
    {id:"gerencial",      icon:"📈", label:"Painel Gerencial", perfis:["Lider","Supervisor"]},
    {id:"sho_turno",      icon:"📋", label:"SHO Troca Turno",  perfis:["Operador","Lider","Supervisor"]},
    {id:"kpis_moagem",    icon:"🧪", label:"KPIs Moagem",      perfis:["Operador","Lider","Supervisor"]},
    {id:"mais_kpis",      icon:"⚙",  label:"+ KPIs",           perfis:["Operador","Lider","Supervisor"]},
    {id:"paradas",        icon:"⏱",  label:"Paradas de Fábrica", perfis:["Operador","Lider","Supervisor"]},
    {id:"escala",         icon:"📅", label:"Escala de Funções", perfis:["Operador","Lider","Supervisor"]},
    {id:"ocorrencias",    icon:"📝", label:"Ocorrências",      perfis:["Operador","Lider","Supervisor"]},
    {id:"calculadora",    icon:"🧮", label:"Calculadora",      perfis:["Operador","Lider","Supervisor"]},
    {id:"rastreabilidade",icon:"🔍", label:"Rastreabilidade",  perfis:["Lider","Supervisor"]},
    {id:"verificacao",    icon:"✅",  label:"Verificação",      perfis:["Lider","Supervisor"]},
    {id:"assinaturas",    icon:"✍",  label:"Assinaturas",      perfis:["Lider","Supervisor"]},
    {id:"acoes",          icon:"🚨", label:"Ações Corretivas", perfis:["Operador","Lider","Supervisor"]},
    {id:"acoes_kpi",      icon:"📌", label:"Ações KPI's",      perfis:["Operador","Lider","Supervisor"]},
    {id:"relatorios",     icon:"📄", label:"Relatórios",       perfis:["Lider","Supervisor"]},
    {id:"auditoria",      icon:"🔐", label:"Auditoria",        perfis:["Supervisor"]},
    {id:"cadastros",      icon:"🗂",  label:"Cadastros",        perfis:["Supervisor"]},
  ].filter(n=>n.perfis.includes(user.perfil));

  // Contadores de badge por item
  const hoje       = new Date().toISOString().split("T")[0];
  const pendentes  = registros.filter(r=>r.status==="PENDENTE").length;
  const acoesKpi   = registros.filter(r=>r.justificativasArr?.length>0).length;
  const badges     = { verificacao:pendentes, acoes_kpi:acoesKpi };

  const irPara = (id) => { setPagina(id); setMobileOpen(false); };

  return (
    <>
      {/* Overlay escuro — só aparece no mobile quando o menu está aberto */}
      <div
        className="sidebar-overlay"
        onClick={()=>setMobileOpen(false)}
        style={{
          display: mobileOpen ? "block" : "none",
        }}
      />
      <div className={`app-sidebar${mobileOpen ? " app-sidebar--open" : ""}`}
        style={{width:218,minWidth:218,background:"#0f172a",display:"flex",
        flexDirection:"column",boxShadow:"2px 0 12px rgba(0,0,0,.2)"}}>

        {/* Logo + sino */}
        <div style={{padding:"13px 13px 11px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <div style={{width:33,height:33,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>
                🏭
              </div>
              <div>
                <div style={{color:"#f1f5f9",fontSize:13,fontWeight:800}}>
                  KPI <span style={{color:"#0ea5e9"}}>SHO</span>
                </div>
                <div style={{color:"#475569",fontSize:9,fontFamily:"monospace",marginTop:1}}>
                  ADM · Uberlândia
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {/* Sino */}
              <SinoNotificacoes registros={registros} setPagina={irPara}/>
              {/* Botão fechar — só no mobile */}
              <button onClick={()=>setMobileOpen(false)} className="sidebar-close-btn"
                style={{display:"none",background:"rgba(255,255,255,.06)",border:"none",
                  color:"#94a3b8",width:30,height:30,borderRadius:7,fontSize:16,cursor:"pointer"}}>
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav style={{flex:1,padding:"10px 7px",overflowY:"auto"}}>
          {NAV.map((item)=>(
            <div key={item.id}>
              {item.id==="kpis_moagem"&&(
                <div style={{fontSize:9,fontFamily:"monospace",color:"#334155",
                  textTransform:"uppercase",letterSpacing:1.5,padding:"10px 12px 4px"}}>
                  Registros
                </div>
              )}
              {item.id==="calculadora"&&(
                <div style={{fontSize:9,fontFamily:"monospace",color:"#334155",
                  textTransform:"uppercase",letterSpacing:1.5,padding:"10px 12px 4px"}}>
                  Ferramentas
                </div>
              )}
              {item.id==="acoes"&&(
                <div style={{fontSize:9,fontFamily:"monospace",color:"#334155",
                  textTransform:"uppercase",letterSpacing:1.5,padding:"10px 12px 4px"}}>
                  Gestão
                </div>
              )}
              <div onClick={()=>irPara(item.id)}
                style={{display:"flex",alignItems:"center",gap:9,padding:"9px 11px",
                  borderRadius:7,cursor:"pointer",marginBottom:1,
                  background:pagina===item.id?"rgba(14,165,233,.15)":"transparent",
                  borderLeft:pagina===item.id?"3px solid #0ea5e9":"3px solid transparent",
                  transition:"all .15s"}}>
                <span style={{fontSize:14}}>{item.icon}</span>
                <span style={{fontSize:12,fontWeight:pagina===item.id?700:400,
                  color:pagina===item.id?"#e2e8f0":"#64748b",flex:1}}>
                  {item.label}
                </span>
                {/* Badge de contagem no item */}
                {badges[item.id]>0&&(
                  <span style={{background:"#dc2626",color:"#fff",fontSize:9,
                    fontWeight:800,fontFamily:"monospace",
                    padding:"1px 5px",borderRadius:8,minWidth:16,textAlign:"center"}}>
                    {badges[item.id]>99?"99+":badges[item.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Botão PDF do turno */}
        <div style={{padding:"8px 10px",borderTop:"1px solid rgba(255,255,255,.04)",
          borderBottom:"1px solid rgba(255,255,255,.04)"}}>
          <button
            onClick={()=>gerarPDFTurno(
              registros,
              detectarTurno(),
              new Date().toISOString().split("T")[0],
              user
            )}
            style={{width:"100%",padding:"7px",
              background:"linear-gradient(135deg,rgba(14,165,233,.15),rgba(2,132,199,.1))",
              border:"1px solid rgba(14,165,233,.25)",borderRadius:6,
              color:"#7dd3fc",fontSize:11,cursor:"pointer",fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            🖨 PDF do Turno Atual
          </button>
        </div>

        {/* Usuário + sair */}
        <div style={{padding:"10px 13px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",
              background:PC[user.perfil]||"#64748b",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:12,fontWeight:700,color:"#fff"}}>
              {user.nome.charAt(0)}
            </div>
            <div>
              <div style={{color:"#e2e8f0",fontSize:11,fontWeight:600,lineHeight:1}}>
                {user.nome.split(" ")[0]}
              </div>
              <div style={{color:"#475569",fontSize:9,fontFamily:"monospace"}}>
                {user.perfil} · {user.turno}
              </div>
            </div>
          </div>
          <button onClick={onLogout}
            style={{width:"100%",padding:"6px",background:"rgba(239,68,68,.1)",
              border:"1px solid rgba(239,68,68,.2)",borderRadius:5,
              color:"#f87171",fontSize:11,cursor:"pointer",fontWeight:600}}>
            Sair
          </button>
          <button onClick={()=>setModoEscuro(m=>!m)}
            style={{width:"100%",padding:"6px",marginTop:5,
              background:"rgba(255,255,255,.05)",
              border:"1px solid rgba(255,255,255,.08)",borderRadius:5,
              color:"#94a3b8",fontSize:11,cursor:"pointer",fontWeight:600,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {modoEscuro ? "☀ Modo Claro" : "🌙 Modo Escuro"}
          </button>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// PAINEL GERENCIAL
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// CEP — CÁLCULO DE LIMITES DE CONTROLE ESTATÍSTICO (±3σ)
// ══════════════════════════════════════════════════════════════════
function calcularCEP(registros, campo) {
  const vals = registros
    .filter(r=>r.tipo==="moagem"&&r[campo]!==null&&r[campo]!==undefined)
    .map(r=>parseFloat(r[campo]))
    .filter(v=>!isNaN(v));
  if(vals.length < 5) return null;
  const n    = vals.length;
  const mean = vals.reduce((a,b)=>a+b,0)/n;
  const variance = vals.reduce((a,v)=>a+(v-mean)**2,0)/(n-1);
  const sigma = Math.sqrt(variance);
  return {
    media:   +mean.toFixed(3),
    sigma:   +sigma.toFixed(3),
    lsc:     +(mean+3*sigma).toFixed(3), // Limite Superior de Controle
    lic:     +(mean-3*sigma).toFixed(3), // Limite Inferior de Controle
    lsa:     +(mean+2*sigma).toFixed(3), // Limite Superior de Aviso
    lia:     +(mean-2*sigma).toFixed(3), // Limite Inferior de Aviso
    n,
  };
}

// ══════════════════════════════════════════════════════════════════
// AUDITORIA — log global de ações críticas
// ══════════════════════════════════════════════════════════════════
// Usado via: registrarAuditoria(setAuditoria, "META_ALTERADA", user, { campo, de, para })
function registrarAuditoria(setAuditoria, tipo, user, detalhes={}) {
  const entrada = {
    id:        Date.now(),
    timestamp: new Date().toISOString(),
    tipo,      // "META_ALTERADA" | "REGISTRO_VALIDADO" | "USUARIO_DESATIVADO" | "META_RESETADA"
    usuario:   user?.nome || "Sistema",
    perfil:    user?.perfil || "",
    detalhes,
  };
  setAuditoria(prev=>[entrada,...prev].slice(0,500)); // mantém últimas 500 entradas
}

const TIPO_AUDITORIA_COR = {
  META_ALTERADA:     { c:"#f59e0b", bg:"#fffbeb", icon:"🎯", label:"Meta Alterada"     },
  META_RESETADA:     { c:"#64748b", bg:"#f8fafc", icon:"↺",  label:"Meta Resetada"     },
  REGISTRO_VALIDADO: { c:"#16a34a", bg:"#f0fdf4", icon:"✅",  label:"Registro Validado" },
  REGISTRO_REJEITADO:{ c:"#dc2626", bg:"#fff1f2", icon:"❌",  label:"Registro Rejeitado"},
  USUARIO_DESATIVADO:{ c:"#dc2626", bg:"#fff1f2", icon:"🔒",  label:"Usuário Desativado"},
  USUARIO_REATIVADO: { c:"#16a34a", bg:"#f0fdf4", icon:"🔓",  label:"Usuário Reativado" },
  LOGIN:             { c:"#0ea5e9", bg:"#e0f2fe", icon:"🔑",  label:"Login"             },
  PARADA_VALIDADA:   { c:"#16a34a", bg:"#f0fdf4", icon:"⏱",  label:"Parada Validada"   },
  PARADA_REJEITADA:  { c:"#dc2626", bg:"#fff1f2", icon:"⏱",  label:"Parada Rejeitada"  },
};

// ══════════════════════════════════════════════════════════════════
// SCORE HISTÓRICO — acumulado por turno/dia
// ══════════════════════════════════════════════════════════════════
function calcularScoreHistorico(registros) {
  const diasTurnos = {};
  registros.filter(r=>r.tipo==="moagem").forEach(r=>{
    const key = `${r.data}_${r.turno}`;
    if(!diasTurnos[key]) diasTurnos[key] = { data:r.data, turno:r.turno, regs:[] };
    diasTurnos[key].regs.push(r);
  });
  return Object.values(diasTurnos).map(dt=>{
    const score = calcularScore(dt.regs.map(r=>({...r})), dt.turno, dt.data);
    return { data:dt.data, turno:dt.turno, score, regs:dt.regs.length };
  }).filter(dt=>dt.score).sort((a,b)=>a.data.localeCompare(b.data));
}

// ══════════════════════════════════════════════════════════════════
// GERADOR RELATÓRIO MENSAL PDF
// ══════════════════════════════════════════════════════════════════
function gerarRelatorioMensal(registros, mes, ano, metas, user) {
  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const mesLabel = MESES_PT[parseInt(mes)-1];
  const regs     = registros.filter(r=>r.tipo==="moagem"
    && r.data?.slice(5,7)===mes && r.data?.slice(0,4)===ano);

  if(!regs.length){ alert(`Nenhum registro em ${mesLabel}/${ano}.`); return; }

  const campos   = Object.keys(LIMITES_MOAGEM);
  const comDev   = regs.filter(r=>r.desvios?.length>0).length;
  const conf     = Math.round(((regs.length-comDev)/regs.length)*100);
  const validados= regs.filter(r=>r.status==="VALIDADO").length;

  // Médias por campo
  const medias = {};
  campos.forEach(c=>{
    const vals=regs.map(r=>r[c]).filter(v=>v!==null&&v!==undefined);
    if(vals.length) medias[c]=+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
  });

  // CEP por campo principal
  const cep = calcularCEP(regs, "ProteinaFarelo");

  // Score por turno
  const scoresTurno = TURNOS_CONFIG.map(tc=>{
    const tr = regs.filter(r=>r.turno===tc.id);
    const sc = tr.length ? calcularScore(tr, tc.id, tr[0]?.data) : null;
    const cf = tr.length ? Math.round((tr.filter(r=>!r.desvios?.length).length/tr.length)*100) : null;
    return { ...tc, regs:tr.length, score:sc?.total??null, conf:cf };
  });

  // Ranking operadores
  const ops={};
  regs.forEach(r=>{
    if(!ops[r.operador])ops[r.operador]={nome:r.operador,total:0,ok:0};
    ops[r.operador].total++;
    if(!r.desvios?.length) ops[r.operador].ok++;
  });
  const ranking=Object.values(ops).map(o=>({...o,pct:Math.round((o.ok/o.total)*100)}))
    .sort((a,b)=>b.pct-a.pct).slice(0,5);

  // Desvios mais frequentes
  const desvFreq={};
  regs.forEach(r=>r.desvios?.forEach(d=>{
    const lbl=LIMITES_MOAGEM[d]?.label||d;
    desvFreq[lbl]=(desvFreq[lbl]||0)+1;
  }));
  const topDesvios=Object.entries(desvFreq).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório Mensal — ${mesLabel}/${ano}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff}
  .page{padding:28px 32px;max-width:960px;margin:0 auto}
  .header{border-bottom:4px solid #0ea5e9;padding-bottom:16px;margin-bottom:20px;
          display:flex;justify-content:space-between;align-items:flex-end}
  h1{font-size:22px;font-weight:900;color:#0f172a}
  h1 span{color:#0ea5e9}
  h2{font-size:14px;font-weight:800;color:#0f172a;margin:20px 0 10px;
     padding-bottom:6px;border-bottom:2px solid #e2e8f0}
  h3{font-size:12px;font-weight:700;color:#334155;margin:14px 0 8px}
  .subtitle{font-size:10px;color:#64748b;font-family:monospace}
  .badge{background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd;
         padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
  .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:16px}
  .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
  .card-label{font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;
              letter-spacing:.5px;font-family:monospace;margin-bottom:5px}
  .card-value{font-size:22px;font-weight:900;font-family:monospace}
  .ok{color:#16a34a} .warn{color:#d97706} .danger{color:#dc2626} .blue{color:#0ea5e9}
  .ok-bg{background:#f0fdf4;border-color:#86efac}
  .danger-bg{background:#fff1f2;border-color:#fca5a5}
  .warn-bg{background:#fffbeb;border-color:#fde68a}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:16px}
  th{background:#0f172a;color:#f1f5f9;padding:7px 10px;text-align:left;
     font-size:9px;text-transform:uppercase;letter-spacing:.5px;font-family:monospace}
  td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
  tr:nth-child(even) td{background:#fafafa}
  .medal{font-size:14px}
  .bar-wrap{background:#e2e8f0;border-radius:3px;height:8px;overflow:hidden;margin-top:4px}
  .bar{height:100%;border-radius:3px}
  .cep-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
           padding:12px 14px;margin-bottom:16px}
  .cep-line{display:flex;justify-content:space-between;align-items:center;
            padding:5px 0;border-bottom:1px solid #e0f2fe;font-family:monospace}
  .cep-line:last-child{border-bottom:none}
  .desvio-bar{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .desvio-bar-fill{background:#fca5a5;border-radius:3px;height:8px}
  .footer{margin-top:28px;padding-top:14px;border-top:3px solid #0ea5e9;
          display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;font-family:monospace}
  .sign-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px}
  .sign-box{border-top:1px solid #1e293b;padding-top:6px;text-align:center;font-size:9px;color:#64748b}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body><div class="page">

  <!-- CABEÇALHO -->
  <div class="header">
    <div>
      <h1>KPI <span>SHO</span> — Relatório Mensal</h1>
      <p class="subtitle">ADM Brasil · Planta Uberlândia · SHO Preparação / Extração</p>
      <p class="subtitle" style="margin-top:4px">
        Período: <b>${mesLabel} / ${ano}</b> &nbsp;|&nbsp;
        Gerado por: <b>${user?.nome||"Sistema"}</b> &nbsp;|&nbsp;
        Data: <b>${new Date().toLocaleDateString("pt-BR")}</b>
      </p>
    </div>
    <div style="text-align:right">
      <span class="badge">${mesLabel} / ${ano}</span>
      <p class="subtitle" style="margin-top:6px">${regs.length} registros analisados</p>
    </div>
  </div>

  <!-- RESUMO EXECUTIVO -->
  <h2>1. Resumo Executivo</h2>
  <div class="grid4">
    <div class="card ${conf>=90?"ok-bg":conf>=70?"warn-bg":"danger-bg"}">
      <div class="card-label">Conformidade Geral</div>
      <div class="card-value ${conf>=90?"ok":conf>=70?"warn":"danger"}">${conf}%</div>
    </div>
    <div class="card">
      <div class="card-label">Total Registros</div>
      <div class="card-value blue">${regs.length}</div>
    </div>
    <div class="card ${comDev>0?"danger-bg":"ok-bg"}">
      <div class="card-label">Registros c/ Desvio</div>
      <div class="card-value ${comDev>0?"danger":"ok"}">${comDev}</div>
    </div>
    <div class="card">
      <div class="card-label">Validados</div>
      <div class="card-value ok">${validados}</div>
    </div>
  </div>

  <!-- MÉDIAS POR KPI -->
  <h2>2. Médias do Período por KPI</h2>
  <div class="grid3">
    ${campos.map(c=>{
      const m=metas[c]||LIMITES_MOAGEM[c];
      const v=medias[c];
      const s=v!==undefined?(chk(c,v)==="ok"?"ok-bg":"danger-bg"):"";
      const vc=v!==undefined?(chk(c,v)==="ok"?"ok":"danger"):"";
      const hint=m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:
                    m.max!==null?`≤${m.max}${m.un}`:m.min!==null?`≥${m.min}${m.un}`:""):"";
      return `<div class="card ${s}">
        <div class="card-label">${m?.label||c}</div>
        <div class="card-value ${vc}" style="font-size:18px">${v!==undefined?`${v}${m?.un||""}`:"-"}</div>
        <div style="font-size:9px;color:#94a3b8;font-family:monospace;margin-top:3px">Meta: ${hint||"—"}</div>
      </div>`;
    }).join("")}
  </div>

  <!-- CEP -->
  ${cep ? `
  <h2>3. Controle Estatístico — Proteína Farelo (CEP)</h2>
  <div class="cep-box">
    <p style="font-size:10px;color:#0284c7;margin-bottom:10px;font-weight:700">
      Análise baseada em ${cep.n} registros do período
    </p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
      ${[
        ["Média (CL)",   cep.media,  "#0f172a"],
        ["LSC (+3σ)",    cep.lsc,    "#dc2626"],
        ["LIC (-3σ)",    cep.lic,    "#16a34a"],
        ["LSA (+2σ)",    cep.lsa,    "#f59e0b"],
        ["LIA (-2σ)",    cep.lia,    "#f59e0b"],
        ["σ (desvio)",   cep.sigma,  "#8b5cf6"],
      ].map(([l,v,c])=>`
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px">
          <div style="font-size:8px;color:#64748b;font-family:monospace;text-transform:uppercase;margin-bottom:3px">${l}</div>
          <div style="font-size:16px;font-weight:800;font-family:monospace;color:${c}">${v}%</div>
        </div>`).join("")}
    </div>
    <p style="font-size:9px;color:#64748b;font-family:monospace">
      LSC/LIC = Limites de Controle (±3σ) &nbsp;|&nbsp; LSA/LIA = Limites de Aviso (±2σ) &nbsp;|&nbsp;
      Processo ${cep.lsc<=((metas.ProteinaFarelo||LIMITES_MOAGEM.ProteinaFarelo).max||999)&&cep.lic>=((metas.ProteinaFarelo||LIMITES_MOAGEM.ProteinaFarelo).min||0)?"CAPAZ":"NÃO CAPAZ"} para a especificação
    </p>
  </div>` : ""}

  <!-- PERFORMANCE POR TURNO -->
  <h2>4. Performance por Turno</h2>
  <table>
    <thead><tr>
      <th>Turno</th><th>Horário</th><th>Registros</th>
      <th>Conformidade</th><th>Score</th>
    </tr></thead>
    <tbody>
      ${scoresTurno.map(t=>`
      <tr>
        <td style="font-weight:700">${t.label}</td>
        <td style="font-family:monospace">${t.horario}</td>
        <td style="font-family:monospace;font-weight:700">${t.regs}</td>
        <td>
          <span style="font-weight:700;color:${t.conf===null?"#94a3b8":t.conf>=90?"#16a34a":t.conf>=70?"#d97706":"#dc2626"}">
            ${t.conf!==null?`${t.conf}%`:"—"}
          </span>
          ${t.conf!==null?`<div class="bar-wrap"><div class="bar" style="width:${t.conf}%;background:${t.conf>=90?"#16a34a":t.conf>=70?"#f59e0b":"#dc2626"}"></div></div>`:""}
        </td>
        <td>
          <span style="font-size:16px;font-weight:900;font-family:monospace;
            color:${t.score===null?"#94a3b8":t.score>=90?"#16a34a":t.score>=70?"#0ea5e9":t.score>=60?"#d97706":"#dc2626"}">
            ${t.score!==null?t.score:"—"}
          </span>
          ${t.score!==null?`<span style="font-size:10px;color:#64748b">/100</span>`:""}
        </td>
      </tr>`).join("")}
    </tbody>
  </table>

  <!-- RANKING OPERADORES -->
  <h2>5. Ranking de Operadores — ${mesLabel}</h2>
  <table>
    <thead><tr>
      <th>Pos.</th><th>Operador</th><th>Registros</th>
      <th>Sem Desvio</th><th>Conformidade</th>
    </tr></thead>
    <tbody>
      ${ranking.map((op,i)=>`
      <tr>
        <td style="font-size:16px">${i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}°`}</td>
        <td style="font-weight:700">${op.nome}</td>
        <td style="font-family:monospace">${op.total}</td>
        <td style="font-family:monospace">${op.ok}</td>
        <td>
          <span style="font-weight:700;color:${op.pct>=90?"#16a34a":op.pct>=70?"#d97706":"#dc2626"}">${op.pct}%</span>
          <div class="bar-wrap"><div class="bar" style="width:${op.pct}%;background:${op.pct>=90?"#16a34a":op.pct>=70?"#f59e0b":"#dc2626"}"></div></div>
        </td>
      </tr>`).join("")}
    </tbody>
  </table>

  <!-- DESVIOS MAIS FREQUENTES -->
  ${topDesvios.length>0?`
  <h2>6. Desvios Mais Frequentes</h2>
  ${topDesvios.map(([campo,qtd])=>{
    const pct=Math.round((qtd/comDev)*100)||0;
    return `<div class="desvio-bar">
      <div style="min-width:160px;font-size:11px;font-weight:600">${campo}</div>
      <div style="flex:1;background:#f1f5f9;border-radius:3px;height:16px;overflow:hidden;position:relative">
        <div style="width:${pct}%;height:100%;background:#fca5a5;border-radius:3px"></div>
        <span style="position:absolute;left:8px;top:2px;font-size:9px;font-family:monospace;font-weight:700;color:#dc2626">${qtd} ocorrência${qtd>1?"s":""} (${pct}%)</span>
      </div>
    </div>`;
  }).join("")}`:""}

  <!-- ASSINATURAS -->
  <h2 style="margin-top:28px">7. Aprovação</h2>
  <div class="sign-grid">
    ${["Responsável Qualidade","Gerente de Produção","Gerente Geral"].map(p=>`
    <div class="sign-box">
      <div style="height:48px"></div>
      <div>${p}</div>
    </div>`).join("")}
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <span>ADM Brasil · SHO Preparação/Extração · Sistema KPI v3.0</span>
    <span>${mesLabel}/${ano} · Gerado em ${new Date().toLocaleString("pt-BR")}</span>
  </div>

</div></body></html>`;

  const win = window.open("","_blank","width=1000,height=750");
  win.document.write(html);
  win.document.close();
  win.onload = ()=>{ win.focus(); win.print(); };
}

function TelaGerencial({ registros, metas=METAS_DEFAULT }) {
  const hoje = new Date();
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  // ── Filtros de período ─────────────────────────────────────────
  const [modoFiltro, setModoFiltro] = useState("mes");
  const [mesSel,     setMesSel]     = useState(String(hoje.getMonth()+1).padStart(2,"0"));
  const [anoSel,     setAnoSel]     = useState(String(hoje.getFullYear()));
  const [dataIni,    setDataIni]    = useState(hoje.toISOString().split("T")[0]);
  const [dataFim,    setDataFim]    = useState(hoje.toISOString().split("T")[0]);
  const [diaSel,     setDiaSel]     = useState(hoje.toISOString().split("T")[0]);
  const [kpiSel,     setKpiSel]     = useState("ProteinaFarelo");

  const anosDisponiveis = useMemo(()=>{
    const anos=[...new Set(registros.map(r=>r.data?.slice(0,4)).filter(Boolean))].sort().reverse();
    return anos.length?anos:[String(hoje.getFullYear())];
  },[registros]);

  const labelPeriodo = useMemo(()=>{
    if(modoFiltro==="mes")   return `${MESES[parseInt(mesSel)-1]} / ${anoSel}`;
    if(modoFiltro==="dia")   return `Dia ${diaSel.split("-").reverse().join("/")}`;
    if(dataIni===dataFim)    return `Dia ${dataIni.split("-").reverse().join("/")}`;
    return `${dataIni.split("-").reverse().join("/")} até ${dataFim.split("-").reverse().join("/")}`;
  },[modoFiltro,mesSel,anoSel,diaSel,dataIni,dataFim]);

  // Filtra registros pelo período selecionado
  const regsFiltrados = useMemo(()=>{
    return registros.filter(r=>{
      if(!r.data||r.tipo==="mais_kpi") return false;
      if(modoFiltro==="mes"){const[rA,rM]=r.data.split("-");return rA===anoSel&&rM===mesSel;}
      if(modoFiltro==="dia") return r.data===diaSel;
      return r.data>=dataIni&&r.data<=dataFim;
    });
  },[registros,modoFiltro,mesSel,anoSel,diaSel,dataIni,dataFim]);

  const meta=metas[kpiSel]||LIMITES[kpiSel];
  const tip={background:"#1e293b",border:"none",borderRadius:6,fontSize:11,color:"#f1f5f9",fontFamily:"monospace"};

  const dadosDia = useMemo(()=>{
    const dias=[...new Set(regsFiltrados.map(r=>r.data))].sort();
    return dias.map(dia=>{
      const rs=regsFiltrados.filter(r=>r.data===dia&&r[kpiSel]!==null&&r[kpiSel]!==undefined);
      if(!rs.length) return null;
      const vals=rs.map(r=>r[kpiSel]);
      const media=+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
      return {
        dia:dia.slice(5), media,
        min:+Math.min(...vals).toFixed(2),
        max:+Math.max(...vals).toFixed(2),
        conformidade:Math.round((rs.filter(r=>chk(kpiSel,r[kpiSel])==="ok").length/rs.length)*100),
      };
    }).filter(Boolean);
  },[regsFiltrados,kpiSel]);

  const confTurno = useMemo(()=>TURNOS_CONFIG.map(tc=>{
    const rs=regsFiltrados.filter(r=>r.turno===tc.id);
    const ok=rs.filter(r=>chk(kpiSel,r[kpiSel])==="ok").length;
    return{...tc,conformidade:rs.length?Math.round((ok/rs.length)*100):0,total:rs.length};
  }),[regsFiltrados,kpiSel]);

  const ranking = useMemo(()=>{
    const ops={};
    regsFiltrados.forEach(r=>{
      if(!ops[r.operador])ops[r.operador]={nome:r.operador,total:0,ok:0,desvios:0};
      ops[r.operador].total++;
      if(chk("ProteinaFarelo",r.ProteinaFarelo)==="ok"&&chk("UmidFarelo",r.UmidFarelo)==="ok")
        ops[r.operador].ok++;
      else ops[r.operador].desvios++;
    });
    return Object.values(ops).map(o=>({...o,pct:Math.round((o.ok/o.total)*100)})).sort((a,b)=>b.pct-a.pct);
  },[regsFiltrados]);

  const mediaGeral   = dadosDia.length?+(dadosDia.reduce((a,d)=>a+d.media,0)/dadosDia.length).toFixed(2):0;
  const conformGeral = dadosDia.length?Math.round(dadosDia.reduce((a,d)=>a+d.conformidade,0)/dadosDia.length):0;
  const tendencia    = dadosDia.length>1?(dadosDia[dadosDia.length-1].media-dadosDia[0].media).toFixed(2):0;

  const KPIS=[
    ["ProteinaFarelo","Proteína Farelo"],["UmidFarelo","Umidade Farelo"],
    ["OleoFarelo","Óleo Farelo"],["UmidSojaEntrada","Umid. Soja Entrada"],
    ["UmidSojaProducao","Umid. Soja Produção"],
  ];

  return (
    <div>
      <PH title="📈 Painel Gerencial"
        subtitle={`Tendências · Conformidade · Performance — ${labelPeriodo}`}/>
      <div style={{padding:24}}>

        {/* ── PAINEL DE FILTROS ── */}
        <div style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",
          boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12,
            display:"flex",alignItems:"center",gap:8}}>
            🎯 Período de Análise
            <span style={{fontSize:10,background:"#e0f2fe",color:"#0284c7",padding:"2px 9px",
              borderRadius:10,fontFamily:"monospace",fontWeight:700}}>
              {labelPeriodo} · {regsFiltrados.length} registros
            </span>
          </div>

          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
            {/* Modo */}
            <div>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Modo</div>
              <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:3,borderRadius:8}}>
                {[["mes","📅 Por Mês"],["dia","📆 Dia"],["periodo","📊 Intervalo"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setModoFiltro(v)}
                    style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:11,
                      fontWeight:600,cursor:"pointer",
                      background:modoFiltro===v?"#fff":"transparent",
                      color:modoFiltro===v?"#0f172a":"#64748b",
                      boxShadow:modoFiltro===v?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Por Mês */}
            {modoFiltro==="mes" && (<>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Mês</div>
                <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
                  style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                    fontSize:13,fontWeight:600,background:"#fff",minWidth:140}}>
                  {MESES.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Ano</div>
                <select value={anoSel} onChange={e=>setAnoSel(e.target.value)}
                  style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                    fontSize:13,fontWeight:600,background:"#fff"}}>
                  {anosDisponiveis.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </>)}

            {/* Por Dia */}
            {modoFiltro==="dia" && (
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Data</div>
                <input type="date" value={diaSel} onChange={e=>setDiaSel(e.target.value)}
                  style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                    fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
              </div>
            )}

            {/* Por Intervalo */}
            {modoFiltro==="periodo" && (<>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Data Inicial</div>
                <input type="date" value={dataIni} onChange={e=>setDataIni(e.target.value)}
                  style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                    fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
              </div>
              <div style={{fontSize:13,color:"#94a3b8",fontWeight:600,alignSelf:"flex-end",paddingBottom:6}}>até</div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Data Final</div>
                <input type="date" value={dataFim} min={dataIni} onChange={e=>setDataFim(e.target.value)}
                  style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                    fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
              </div>
            </>)}

            {/* KPI selecionado */}
            <div>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>KPI Analisado</div>
              <select value={kpiSel} onChange={e=>setKpiSel(e.target.value)}
                style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,fontFamily:"monospace",fontWeight:600,background:"#fff"}}>
                {KPIS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {meta && (
              <div style={{padding:"7px 12px",background:"#f0f9ff",border:"1px solid #bae6fd",
                borderRadius:7,fontSize:11,color:"#0284c7",fontFamily:"monospace",fontWeight:600,
                alignSelf:"flex-end"}}>
                Meta: {meta.min??""}{meta.min&&meta.max?" – ":""}{meta.max??""}{meta.un}
              </div>
            )}
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Média do Período" value={`${mediaGeral}${meta?.un||""}`} icon="📊" color="#8b5cf6"/>
          <SC label="Conformidade"     value={`${conformGeral}%`}              icon="✅" color="#16a34a"/>
          <SC label="Tendência"
            value={`${parseFloat(tendencia)>0?"+":""}${tendencia}${meta?.un||""}`}
            icon={parseFloat(tendencia)>0?"📈":"📉"}
            color={parseFloat(tendencia)>0?"#dc2626":"#16a34a"}/>
          <SC label="Registros"        value={regsFiltrados.length}             icon="📋" color="#0ea5e9"/>
        </div>

        {regsFiltrados.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:44,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:36,marginBottom:12}}>📈</div>
            <div style={{fontSize:14,fontWeight:600,color:"#64748b",marginBottom:6}}>
              Nenhum registro no período selecionado
            </div>
            <div style={{fontSize:12}}>Tente ajustar o filtro de período ou mês/ano</div>
          </div>
        ) : (<>

          {/* Gráfico de tendência */}
          <div style={{background:"#fff",borderRadius:11,padding:20,border:"1px solid #e2e8f0",
            marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:0}}>
                📉 Tendência Diária — {KPIS.find(([v])=>v===kpiSel)?.[1]}
              </h3>
              <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                Média diária · {labelPeriodo}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={dadosDia} margin={{top:4,right:14,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="dia" tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                <YAxis tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}} domain={["auto","auto"]}/>
                <Tooltip contentStyle={tip}/>
                {meta?.min!==null&&meta?.min!==undefined&&
                  <ReferenceLine y={meta.min} stroke="#86efac" strokeDasharray="4 4"
                    label={{value:`Mín ${meta.min}`,fill:"#16a34a",fontSize:8,fontFamily:"monospace"}}/>}
                {meta?.max!==null&&meta?.max!==undefined&&
                  <ReferenceLine y={meta.max} stroke="#fca5a5" strokeDasharray="4 4"
                    label={{value:`Máx ${meta.max}`,fill:"#dc2626",fontSize:8,fontFamily:"monospace"}}/>}
                <Line type="monotone" dataKey="media" stroke="#8b5cf6" strokeWidth={2.5}
                  dot={{r:3,fill:"#8b5cf6"}} name="Média"/>
                <Line type="monotone" dataKey="min" stroke="#86efac" strokeWidth={1}
                  dot={false} strokeDasharray="3 3" name="Mín"/>
                <Line type="monotone" dataKey="max" stroke="#fca5a5" strokeWidth={1}
                  dot={false} strokeDasharray="3 3" name="Máx"/>
                <Legend wrapperStyle={{fontSize:10,fontFamily:"monospace"}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-2" style={{display:"grid",gap:16,marginBottom:16}}>
            {/* Conformidade por turno */}
            <div style={{background:"#fff",borderRadius:11,padding:20,border:"1px solid #e2e8f0",
              boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:"0 0 14px"}}>
                🌙 Conformidade por Turno
              </h3>
              {confTurno.map(t=>(
                <div key={t.id} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div>
                      <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{t.label}</span>
                      <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginLeft:6}}>
                        {t.horario}
                      </span>
                    </div>
                    <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,
                      color:t.conformidade>=90?"#16a34a":t.conformidade>=70?"#d97706":"#dc2626"}}>
                      {t.conformidade}%
                    </span>
                  </div>
                  <div style={{background:"#f1f5f9",borderRadius:4,height:8,overflow:"hidden"}}>
                    <div style={{width:`${t.conformidade}%`,height:"100%",
                      background:t.conformidade>=90?"#16a34a":t.conformidade>=70?"#f59e0b":"#dc2626",
                      borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginTop:2}}>
                    {t.total} registros no período
                  </div>
                </div>
              ))}
            </div>

            {/* Conformidade diária */}
            <div style={{background:"#fff",borderRadius:11,padding:20,border:"1px solid #e2e8f0",
              boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:"0 0 12px"}}>
                📊 Conformidade Diária (%)
              </h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dadosDia} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="dia" tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                  <YAxis domain={[0,100]} tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                  <Tooltip contentStyle={tip} formatter={v=>[`${v}%`,"Conformidade"]}/>
                  <ReferenceLine y={90} stroke="#86efac" strokeDasharray="4 4"
                    label={{value:"Meta 90%",fill:"#16a34a",fontSize:8}}/>
                  <Bar dataKey="conformidade" fill="#16a34a" radius={[3,3,0,0]} name="Conformidade"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CEP — Gráfico de Controle Estatístico */}
          {(()=>{
            const cep = calcularCEP(regsFiltrados, kpiSel);
            if(!cep||dadosDia.length<3) return null;
            const dadosCEP = dadosDia.map(d=>({
              ...d,
              lsc: cep.lsc, lic: cep.lic,
              lsa: cep.lsa, lia: cep.lia,
              cl:  cep.media,
            }));
            return (
              <div style={{background:"#fff",borderRadius:11,padding:20,
                border:"1px solid #e2e8f0",marginBottom:16,
                boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div>
                    <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:"0 0 4px"}}>
                      CEP — Gráfico de Controle Estatístico
                    </h3>
                    <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                      {KPIS.find(([v])=>v===kpiSel)?.[1]} · {cep.n} registros · σ={cep.sigma}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[["CL",cep.media,"#1e293b"],["LSC",cep.lsc,"#dc2626"],
                      ["LIC",cep.lic,"#16a34a"],["LSA",cep.lsa,"#f59e0b"],
                      ["LIA",cep.lia,"#f59e0b"]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",background:"#f8fafc",
                        border:`1px solid ${c}30`,borderRadius:6,padding:"4px 10px"}}>
                        <div style={{fontSize:8,fontFamily:"monospace",color:"#64748b",
                          textTransform:"uppercase",marginBottom:1}}>{l}</div>
                        <div style={{fontSize:12,fontWeight:800,fontFamily:"monospace",color:c}}>
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dadosCEP} margin={{top:4,right:14,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="dia" tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                    <YAxis tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}} domain={["auto","auto"]}/>
                    <Tooltip contentStyle={tip}/>
                    <ReferenceLine y={cep.lsc} stroke="#dc2626" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{value:"LSC",fill:"#dc2626",fontSize:8,fontFamily:"monospace"}}/>
                    <ReferenceLine y={cep.lic} stroke="#16a34a" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{value:"LIC",fill:"#16a34a",fontSize:8,fontFamily:"monospace"}}/>
                    <ReferenceLine y={cep.lsa} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1}/>
                    <ReferenceLine y={cep.lia} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1}/>
                    <ReferenceLine y={cep.media} stroke="#1e293b" strokeDasharray="8 4" strokeWidth={1.5}
                      label={{value:"CL",fill:"#1e293b",fontSize:8,fontFamily:"monospace"}}/>
                    <Line type="monotone" dataKey="media" stroke="#8b5cf6" strokeWidth={2.5}
                      dot={{r:3,fill:"#8b5cf6"}} name="Média diária"/>
                    <Legend wrapperStyle={{fontSize:9,fontFamily:"monospace"}}/>
                  </LineChart>
                </ResponsiveContainer>
                <div style={{marginTop:8,padding:"7px 12px",
                  background:cep.lsc<=(metas[kpiSel]?.max??Infinity)&&cep.lic>=(metas[kpiSel]?.min??-Infinity)
                    ?"#f0fdf4":"#fff1f2",
                  border:`1px solid ${cep.lsc<=(metas[kpiSel]?.max??Infinity)&&cep.lic>=(metas[kpiSel]?.min??-Infinity)?"#86efac":"#fca5a5"}`,
                  borderRadius:6,fontSize:10,fontFamily:"monospace",
                  color:cep.lsc<=(metas[kpiSel]?.max??Infinity)&&cep.lic>=(metas[kpiSel]?.min??-Infinity)
                    ?"#16a34a":"#dc2626",fontWeight:600}}>
                  {cep.lsc<=(metas[kpiSel]?.max??Infinity)&&cep.lic>=(metas[kpiSel]?.min??-Infinity)
                    ?"Processo CAPAZ — limites de controle dentro da especificação"
                    :"Processo NAO CAPAZ — limites de controle excedem a especificação"}
                </div>
              </div>
            );
          })()}

          {/* Score Histórico por Turno */}
          {(()=>{
            const hist = calcularScoreHistorico(regsFiltrados);
            if(hist.length<2) return null;
            const dadosHist = hist.slice(-20).map(h=>({
              dia: h.data.slice(5),
              turno: h.turno,
              score: h.score?.total||0,
              label: `${h.turno} ${h.data.slice(5)}`,
            }));
            return (
              <div style={{background:"#fff",borderRadius:11,padding:20,
                border:"1px solid #e2e8f0",marginBottom:16,
                boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
                <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:"0 0 12px"}}>
                  Score Histórico de Qualidade — {labelPeriodo}
                </h3>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={dadosHist} margin={{top:4,right:8,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="dia" tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                    <YAxis domain={[0,100]} tick={{fontSize:9,fontFamily:"monospace",fill:"#94a3b8"}}/>
                    <Tooltip contentStyle={tip} formatter={(v,n,p)=>[`${v}/100`,`Score ${p.payload.turno}`]}/>
                    <ReferenceLine y={90} stroke="#16a34a" strokeDasharray="4 4"
                      label={{value:"A+",fill:"#16a34a",fontSize:8}}/>
                    <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{value:"B",fill:"#f59e0b",fontSize:8}}/>
                    <Bar dataKey="score" radius={[3,3,0,0]} name="Score"
                      fill="#8b5cf6"
                      label={{position:"top",fontSize:8,fontFamily:"monospace",fill:"#64748b"}}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Ranking de operadores */}
          <div style={{background:"#fff",borderRadius:11,padding:20,border:"1px solid #e2e8f0",
            boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <h3 style={{fontSize:13,fontWeight:700,color:"#0f172a",margin:"0 0 12px"}}>
              🏆 Performance por Operador — {labelPeriodo}
            </h3>
            {ranking.length===0 ? (
              <div style={{textAlign:"center",color:"#94a3b8",padding:20,fontSize:12}}>
                Nenhum dado disponível para este período
              </div>
            ) : ranking.map((op,i)=>(
              <div key={op.nome} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 11px",
                background:i===0?"#fffbeb":i===1?"#f8fafc":i===2?"#faf5ff":"#f8fafc",
                borderRadius:7,marginBottom:6,border:`1px solid ${i===0?"#fde68a":"#e2e8f0"}`}}>
                <span style={{fontSize:15,minWidth:24}}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}º`}
                </span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:600,color:"#0f172a"}}>{op.nome}</span>
                    <span style={{fontSize:12,fontFamily:"monospace",fontWeight:800,
                      color:op.pct>=90?"#16a34a":op.pct>=70?"#d97706":"#dc2626"}}>
                      {op.pct}%
                    </span>
                  </div>
                  <div style={{background:"#e2e8f0",borderRadius:3,height:5,overflow:"hidden"}}>
                    <div style={{width:`${op.pct}%`,height:"100%",
                      background:op.pct>=90?"#16a34a":op.pct>=70?"#f59e0b":"#dc2626",borderRadius:3}}/>
                  </div>
                </div>
                <div style={{textAlign:"right",fontSize:9,fontFamily:"monospace",
                  color:"#94a3b8",minWidth:65}}>
                  <div>{op.total} reg.</div>
                  <div style={{color:"#dc2626"}}>{op.desvios} dev.</div>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// KPIs MOAGEM — MÉDIA AO VIVO
// ══════════════════════════════════════════════════════════════════
function MediaAoVivo({form, registrosTurno, turnoAtual, metas=METAS_DEFAULT}) {
  const tc = TURNOS_CONFIG.find(t=>t.id===turnoAtual)||TURNOS_CONFIG[0];
  const chkM=(campo,val)=>{if(val===""||val===null||val===undefined)return "neutral";const v=parseFloat(val),m=metas[campo];if(!m)return "neutral";if(m.min!==null&&v<m.min)return "danger";if(m.max!==null&&v>m.max)return "danger";return "ok";};
  const calcMedia = (campo) => {
    const salvos = registrosTurno.map(r=>r[campo]).filter(v=>v!==null&&v!==undefined&&v!=="");
    const atual  = form[campo]!==""&&form[campo]!==null&&form[campo]!==undefined ? [parseFloat(form[campo])] : [];
    const todos  = [...salvos,...atual];
    return todos.length ? +(todos.reduce((a,b)=>a+b,0)/todos.length).toFixed(2) : null;
  };
  const pctConf = (() => {
    const total=[], ok=[];
    CAMPOS_MEDIA.forEach(c=>{
      const salvos=registrosTurno.map(r=>r[c]).filter(v=>v!==null&&v!==undefined);
      const atual=form[c]!==""&&form[c]!==null?[parseFloat(form[c])]:[];
      [...salvos,...atual].forEach(v=>{total.push(v);if(chkM(c,v)==="ok")ok.push(v);});
    });
    return total.length?Math.round((ok.length/total.length)*100):0;
  })();
  return (
    <div style={{background:"#fff",border:`2px solid ${tc.cor}30`,borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.06)",marginBottom:18}}>
      <div style={{background:`linear-gradient(135deg,${tc.cor},${tc.cor}cc)`,padding:"9px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff",fontFamily:"monospace"}}>⌀</div>
          <div>
            <div style={{color:"#fff",fontSize:12,fontWeight:800,lineHeight:1}}>Média Ao Vivo — {tc.label}</div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:9,fontFamily:"monospace",marginTop:2}}>{tc.horario} · {registrosTurno.length} reg. salvos neste turno</div>
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,.15)",borderRadius:5,padding:"2px 9px",fontSize:9,color:"#fff",fontFamily:"monospace",fontWeight:700,letterSpacing:.5}}>AO VIVO 🔴</div>
      </div>
      <div className="grid-3" style={{padding:12,display:"grid",gap:9}}>
        {CAMPOS_MEDIA.map(campo=>{
          const media=calcMedia(campo);
          const m=metas[campo];
          const s=media!==null?chkM(campo,media):"neutral";
          const c=COR[s];
          const hint=m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:m.max!==null?`Máx ${m.max}${m.un}`:m.min!==null?`Mín ${m.min}${m.un}`:""):"";
          const temAtual=form[campo]!==""&&form[campo]!==null&&form[campo]!==undefined;
          return (
            <div key={campo} style={{background:media!==null?c.f:"#f8fafc",border:`1.5px solid ${media!==null?c.b:"#e2e8f0"}`,borderRadius:8,padding:"9px 11px",transition:"all .3s"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:5}}>{m?.label||campo}</div>
              <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                <span style={{fontSize:media!==null?20:14,fontWeight:800,color:media!==null?c.t:"#94a3b8",fontFamily:"monospace",transition:"all .3s"}}>{media!==null?media:"—"}</span>
                {media!==null&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{m?.un}</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                {hint&&<span style={{fontSize:8,color:"#94a3b8",fontFamily:"monospace"}}>Meta: {hint}</span>}
                {media!==null&&<span style={{fontSize:9,fontWeight:700,color:c.t,fontFamily:"monospace"}}>{s==="ok"?"✓ OK":"⚠ DEV"}</span>}
              </div>
              {temAtual&&<div style={{marginTop:3,fontSize:8,color:tc.cor,fontFamily:"monospace",fontWeight:700}}>● inclui valor atual</div>}
            </div>
          );
        })}
      </div>
      <div style={{padding:"0 12px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",flexShrink:0}}>Conformidade do turno</span>
          <div style={{flex:1,height:5,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}}>
            <div style={{width:`${pctConf}%`,height:"100%",background:pctConf>=90?"#16a34a":pctConf>=70?"#f59e0b":"#dc2626",borderRadius:3,transition:"width .4s"}}/>
          </div>
          <span style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:pctConf>=90?"#16a34a":pctConf>=70?"#d97706":"#dc2626",flexShrink:0}}>{pctConf}%</span>
        </div>
      </div>
    </div>
  );
}

// Campo com justificativa embutida
function CampoJust({campo, valor, justificativa, onChangeValor, onChangeJust, metas=METAS_DEFAULT}) {
  const m=metas[campo]||LIMITES_MOAGEM[campo];
  const chkM=(c,v)=>{if(v===""||v===null||v===undefined)return "neutral";const n=parseFloat(v),lm=metas[c]||LIMITES_MOAGEM[c];if(!lm)return "neutral";if(lm.min!==null&&n<lm.min)return "danger";if(lm.max!==null&&n>lm.max)return "danger";return "ok";};
  const s=chkM(campo,valor), c=COR[s];
  const hint=m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:m.max!==null?`Máx ${m.max}${m.un}`:m.min!==null?`Mín ${m.min}${m.un}`:""):"";
  const fora=s==="danger";
  const justOk=!fora||(justificativa&&justificativa.trim().length>=10);
  return (
    <div style={{border:`1.5px solid ${fora?(justOk?"#fbbf24":"#fca5a5"):valor!==""&&valor!==null?c.b:"#e2e8f0"}`,borderRadius:8,background:fora?(justOk?"#fffbeb":"#fff1f2"):valor!==""&&valor!==null?c.f:"#f8fafc",overflow:"hidden",transition:"all .2s"}}>
      <div style={{padding:"8px 10px 6px"}}>
        <label style={{display:"block",fontSize:9,fontWeight:700,color:fora?"#92400e":"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
          {m?.label||campo}{fora&&<span style={{marginLeft:6,color:"#dc2626"}}>⚠ FORA DO LIMITE</span>}
        </label>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{position:"relative",flex:1}}>
            <input type="number" step="0.01" value={valor??""} onChange={e=>onChangeValor(campo,e.target.value)}
              style={{width:"100%",padding:"8px 26px 8px 10px",borderRadius:5,border:"none",outline:"none",background:"transparent",color:fora?"#dc2626":valor!==""&&valor!==null?c.t:"#1e293b",fontSize:14,fontFamily:"monospace",fontWeight:800,boxSizing:"border-box"}}/>
            {valor!==""&&valor!==null&&s==="ok"&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#16a34a"}}>✓</span>}
            {fora&&<span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:12}}>⚠</span>}
          </div>
          {hint&&<span style={{fontSize:9,color:fora?"#92400e":"#94a3b8",fontFamily:"monospace",whiteSpace:"nowrap",flexShrink:0}}>Meta: {hint}</span>}
        </div>
      </div>
      {fora&&(
        <div style={{borderTop:`1px dashed ${justOk?"#fbbf24":"#fca5a5"}`,background:justOk?"rgba(251,191,36,.06)":"rgba(252,165,165,.08)",padding:"7px 10px"}}>
          <label style={{display:"block",fontSize:9,fontWeight:700,color:justOk?"#92400e":"#dc2626",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
            {justOk?"✅ Justificativa registrada":"⚠ Justificativa obrigatória"}
          </label>
          <textarea rows={2} value={justificativa||""} onChange={e=>onChangeJust(campo,e.target.value)}
            placeholder="Descreva a causa e ação tomada para este desvio... (mín. 10 caracteres)"
            style={{width:"100%",padding:"7px 9px",borderRadius:5,border:`1px solid ${justOk?"#fbbf24":"#fca5a5"}`,background:"#fff",fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none",lineHeight:1.5,color:"#1e293b"}}/>
          {!justOk&&justificativa&&justificativa.length>0&&justificativa.length<10&&(
            <div style={{fontSize:9,color:"#dc2626",marginTop:3,fontFamily:"monospace"}}>Mínimo 10 caracteres · {justificativa.length}/10</div>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoJust({grupo, form, justificativas, onChangeValor, onChangeJust, metas=METAS_DEFAULT}) {
  const chkM=(c,v)=>{if(v===""||v===null||v===undefined)return "neutral";const n=parseFloat(v),m=metas[c]||LIMITES_MOAGEM[c];if(!m)return "neutral";if(m.min!==null&&n<m.min)return "danger";if(m.max!==null&&n>m.max)return "danger";return "ok";};
  const [aberto,setAberto]=useState(true);
  const temDesvio=grupo.campos.some(c=>chkM(c,form[c])==="danger");
  const semJust=grupo.campos.filter(c=>chkM(c,form[c])==="danger"&&(!justificativas[c]||justificativas[c].trim().length<10)).length;
  const preench=grupo.campos.filter(c=>form[c]!==""&&form[c]!==null&&form[c]!==undefined).length;
  return (
    <div style={{border:`1.5px solid ${temDesvio?(semJust>0?"#fca5a5":"#fbbf24"):"#e2e8f0"}`,borderRadius:10,overflow:"hidden",marginBottom:12}}>
      <div onClick={()=>setAberto(a=>!a)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 15px",background:temDesvio?(semJust>0?"#fff1f2":"#fffbeb"):grupo.bg,cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,fontSize:12,color:grupo.cor}}>{grupo.label}</span>
          {temDesvio&&semJust>0&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"2px 7px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>{semJust} JUST. PENDENTE{semJust>1?"S":""}</span>}
          {temDesvio&&semJust===0&&<span style={{fontSize:9,background:"#fef3c7",color:"#92400e",padding:"2px 7px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>DESVIO JUSTIFICADO ✓</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{preench}/{grupo.campos.length}</span>
          <span style={{fontSize:11,color:"#94a3b8",transform:aberto?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
        </div>
      </div>
      {aberto&&(
        <div className="grid-autofill-215" style={{padding:13,background:"#fff",display:"grid",gap:11}}>
          {grupo.campos.map(c=><CampoJust key={c} campo={c} valor={form[c]??""} justificativa={justificativas[c]??""} onChangeValor={onChangeValor} onChangeJust={onChangeJust} metas={metas}/>)}
        </div>
      )}
    </div>
  );
}

function TelaKpisMoagem({user, registros, setRegistros, metas=METAS_DEFAULT}) {
  // Helper de validação com metas dinâmicas
  const chkM=(campo,val)=>{
    if(val===""||val===null||val===undefined) return "neutral";
    const v=parseFloat(val), m=metas[campo]||LIMITES_MAIS_KPI[campo]; if(!m) return "neutral";
    if(m.min!==null&&v<m.min) return "danger";
    if(m.max!==null&&v>m.max) return "danger";
    return "ok";
  };

  const [view,setView]        = useState("lista");
  const [filtroTurno,setFT]   = useState("Todos");
  const [filtroStatus,setFS]  = useState("Todos");
  const [savedMsg,setSaved]   = useState("");
  const [tentou,setTentou]    = useState(false);

  const turnoAuto = detectarTurno();
  const emptyForm = () => ({
    data: new Date().toISOString().split("T")[0],
    hora: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
    turno: user.turno==="TODOS" ? turnoAuto : user.turno,
    tipoFarelo: "Moído",
    ...Object.fromEntries(Object.keys(metas).map(k=>[k,""]))
  });
  const [form,setForm]           = useState(emptyForm());
  const [just,setJust]           = useState({});
  const [obsLivre,setObsLivre]   = useState("");
  const onV=(c,v)=>{ setForm(f=>({...f,[c]:v})); if(chkM(c,v)!=="danger") setJust(j=>({...j,[c]:""})); };
  const onJ=(c,t)=>setJust(j=>({...j,[c]:t}));

  const desvios       = useMemo(()=>Object.keys(metas).filter(c=>chkM(c,form[c])==="danger"),[form,metas]);
  const semJust       = desvios.filter(c=>!just[c]||just[c].trim().length<10);
  const podeSalvar    = semJust.length===0;
  const progresso     = Math.round((Object.keys(metas).filter(k=>form[k]!==""&&form[k]!==null).length/Object.keys(metas).length)*100);
  const regsTurno     = useMemo(()=>registros.filter(r=>r.turno===form.turno&&r.tipo==="moagem"),[registros,form.turno]);

  const salvar = () => {
    setTentou(true);
    if(!podeSalvar) return;
    const justArr=desvios.map(c=>({campo:c,label:metas[c]?.label,valor:form[c],un:metas[c]?.un,justificativa:just[c]}));
    const novo={id:`temp_${Date.now()}`,...form,operador:user.nome,status:"PENDENTE",desvios,justificativas:{...just},justificativasArr:justArr,tipo:"moagem",obsLivre:obsLivre.trim()||null,...Object.fromEntries(Object.keys(metas).map(k=>[k,form[k]===""?null:parseFloat(form[k])]))};
    setRegistros(r=>[novo,...r]); setForm(emptyForm()); setJust({}); setObsLivre(""); setTentou(false); setView("lista");
    setSaved("✅ KPI Moagem registrado com sucesso!"); setTimeout(()=>setSaved(""),3000);
  };

  const filtrados = registros.filter(r=>r.tipo==="moagem"&&(filtroTurno==="Todos"||r.turno===filtroTurno)&&(filtroStatus==="Todos"||r.status===filtroStatus));

  if(view==="form") return (
    <div>
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"12px 24px",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 8px rgba(0,0,0,.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <h1 style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>🧪 KPIs Moagem — Novo Registro</h1>
            {desvios.length>0&&<span style={{fontSize:9,background:podeSalvar?"#fef3c7":"#fee2e2",color:podeSalvar?"#92400e":"#dc2626",padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>{desvios.length} DESVIO{desvios.length>1?"S":""} · {podeSalvar?"JUSTIFICADO":"JUST. PENDENTE"}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
            <div style={{width:88,height:5,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}}><div style={{width:`${progresso}%`,height:"100%",background:progresso<50?"#f59e0b":progresso<80?"#0ea5e9":"#16a34a",borderRadius:3}}/></div>
            <span style={{fontSize:10,fontFamily:"monospace",color:"#64748b"}}>{progresso}%</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={salvar} style={{padding:"8px 16px",background:!podeSalvar&&desvios.length>0?"linear-gradient(135deg,#94a3b8,#64748b)":"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:!podeSalvar&&desvios.length>0?"not-allowed":"pointer",boxShadow:podeSalvar||desvios.length===0?"0 4px 12px rgba(14,165,233,.25)":"none"}}>💾 Salvar</button>
          <button onClick={()=>{setView("lista");setTentou(false);}} style={{padding:"8px 12px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:7,fontSize:12,cursor:"pointer",color:"#475569"}}>Cancelar</button>
        </div>
      </div>
      <div style={{padding:22}}>
        {tentou&&semJust.length>0&&(
          <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"11px 14px",marginBottom:14,display:"flex",gap:9}}>
            <span style={{fontSize:17,flexShrink:0}}>🚫</span>
            <div>
              <div style={{fontWeight:700,color:"#dc2626",fontSize:13,marginBottom:3}}>Justificativa obrigatória antes de salvar</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:5}}>
                {semJust.map(c=><span key={c} style={{background:"#fff",border:"1px solid #fca5a5",color:"#dc2626",fontSize:10,fontFamily:"monospace",fontWeight:700,padding:"2px 8px",borderRadius:3}}>{LIMITES_MOAGEM[c]?.label}: {form[c]}{LIMITES_MOAGEM[c]?.un}</span>)}
              </div>
            </div>
          </div>
        )}
        {/* Identificação */}
        <div style={{background:"#fff",borderRadius:9,padding:14,border:"1px solid #e2e8f0",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0f172a",marginBottom:10}}>🕐 Identificação</div>
          <div className="grid-4" style={{display:"grid",gap:11}}>
            {[["Data","date","data"],["Hora","time","hora"]].map(([l,t,k])=>(
              <div key={k}><label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>{l}</label><input type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/></div>
            ))}
            <div>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Turno</label>
              <select value={form.turno} onChange={e=>setForm(f=>({...f,turno:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:11,background:"#fff",boxSizing:"border-box"}}>
                {TURNOS_CONFIG.map(t=><option key={t.id} value={t.id}>{t.id} · {t.horario}</option>)}
              </select>
              <div style={{fontSize:8,color:"#94a3b8",fontFamily:"monospace",marginTop:2}}>Auto detectado: {turnoAuto}</div>
            </div>
            <div>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Tipo Farelo</label>
              <select value={form.tipoFarelo} onChange={e=>setForm(f=>({...f,tipoFarelo:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                {["Moído","Floculado","Hipro","N/A"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
        {/* Média ao vivo */}
        <MediaAoVivo form={form} registrosTurno={regsTurno} turnoAtual={form.turno} metas={metas}/>
        {/* Grupos */}
        {GRUPOS_MOAGEM.map(g=><GrupoJust key={g.id} grupo={g} form={form} justificativas={just} onChangeValor={onV} onChangeJust={onJ} metas={metas}/>)}
        {/* Resumo desvios */}
        {desvios.length>0&&(
          <div style={{background:podeSalvar?"#fffbeb":"#fff1f2",border:`1px solid ${podeSalvar?"#fbbf24":"#fca5a5"}`,borderRadius:8,padding:"11px 14px",marginTop:8}}>
            <div style={{fontWeight:700,color:podeSalvar?"#92400e":"#dc2626",fontSize:12,marginBottom:7}}>{podeSalvar?"✅ Todos os desvios justificados — pode salvar":`⚠ ${semJust.length} justificativa${semJust.length>1?"s":""} pendente${semJust.length>1?"s":""}`}</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {desvios.map(c=>{const ok=just[c]&&just[c].trim().length>=10;return(
                <div key={c} style={{display:"flex",alignItems:"flex-start",gap:8,background:"#fff",border:`1px solid ${ok?"#fbbf24":"#fca5a5"}`,borderRadius:5,padding:"6px 9px"}}>
                  <span style={{fontSize:12,flexShrink:0}}>{ok?"✅":"⏳"}</span>
                  <div style={{flex:1}}>
                    <span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:ok?"#92400e":"#dc2626"}}>{metas[c]?.label}: {form[c]}{metas[c]?.un}</span>
                    {ok&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{just[c]}</div>}
                    {!ok&&<div style={{fontSize:10,color:"#dc2626",marginTop:2}}>Preencha a justificativa no campo acima</div>}
                  </div>
                </div>
              );})}
            </div>
          </div>
        )}
        {/* Campo de Observação Livre */}
        <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",
          overflow:"hidden",marginBottom:12,marginTop:8}}>
          <div style={{padding:"10px 15px",background:"#f8fafc",
            borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>💬</span>
            <span style={{fontWeight:700,fontSize:12,color:"#475569"}}>
              Observação do Turno
            </span>
            <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>(opcional)</span>
          </div>
          <div style={{padding:13}}>
            <textarea rows={3} value={obsLivre} onChange={e=>setObsLivre(e.target.value)}
              placeholder="Registre qualquer observação relevante do turno — equipamento, intercorrências, eventos externos..."
              style={{width:"100%",padding:"9px 11px",borderRadius:7,
                border:"1.5px solid #e2e8f0",fontSize:12,fontFamily:"inherit",
                resize:"vertical",boxSizing:"border-box",outline:"none",
                lineHeight:1.6,color:"#1e293b",
                background:obsLivre?"#fafffe":"#f8fafc"}}
              onFocus={e=>e.target.style.borderColor="#0ea5e9"}
              onBlur={e=>e.target.style.borderColor="#e2e8f0"}
            />
            {obsLivre.length>0&&(
              <div style={{display:"flex",justifyContent:"space-between",
                marginTop:5,fontSize:9,fontFamily:"monospace",color:"#94a3b8"}}>
                <span>{obsLivre.length} caracteres</span>
                <button onClick={()=>setObsLivre("")}
                  style={{background:"none",border:"none",color:"#dc2626",
                    cursor:"pointer",fontSize:9,fontFamily:"monospace",fontWeight:600}}>
                  x Limpar
                </button>
              </div>
            )}
          </div>
        </div>
        <button onClick={salvar} style={{width:"100%",padding:12,marginTop:4,background:!podeSalvar&&desvios.length>0?"linear-gradient(135deg,#94a3b8,#64748b)":"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:!podeSalvar&&desvios.length>0?"not-allowed":"pointer"}}>
          {!podeSalvar&&desvios.length>0?`Preencha ${semJust.length} justificativa${semJust.length>1?"s":""}` : "Salvar Registro"}
        </button>
      </div>
    </div>
  );

  // ── LISTA ──
  return (
    <div>
      <PH title="🧪 KPIs Moagem" subtitle="Análises de qualidade do farelo e soja — hora a hora"
        action={<button onClick={()=>setView("form")} style={{padding:"8px 16px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(14,165,233,.25)"}}>+ Novo Registro</button>}/>
      <div style={{padding:22}}>
        {savedMsg&&<div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:7,padding:"9px 15px",marginBottom:14,color:"#16a34a",fontWeight:600,fontSize:13}}>{savedMsg}</div>}
        {/* Painel médias por turno */}
        <div className="grid-3" style={{display:"grid",gap:12,marginBottom:18}}>
          {TURNOS_CONFIG.map(tc=>{
            const regs=registros.filter(r=>r.tipo==="moagem"&&r.turno===tc.id);
            const mp=regs.length?+(regs.reduce((a,r)=>a+(r.ProteinaFarelo||0),0)/regs.length).toFixed(2):null;
            const mu=regs.length?+(regs.reduce((a,r)=>a+(r.UmidFarelo||0),0)/regs.length).toFixed(2):null;
            const sp=mp?chk("ProteinaFarelo",mp):"neutral", su=mu?chk("UmidFarelo",mu):"neutral";
            return (
              <div key={tc.id} style={{background:"#fff",border:`1.5px solid ${tc.cor}30`,borderRadius:10,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
                <div style={{background:`linear-gradient(135deg,${tc.cor},${tc.cor}cc)`,padding:"7px 12px"}}>
                  <div style={{color:"#fff",fontSize:11,fontWeight:800}}>{tc.label}</div>
                  <div style={{color:"rgba(255,255,255,.7)",fontSize:9,fontFamily:"monospace"}}>{tc.horario} · {regs.length} reg.</div>
                </div>
                <div className="grid-2" style={{padding:"9px 12px",display:"grid",gap:7}}>
                  {[["⌀ Proteína",mp,"%",sp],["⌀ Umid. Farelo",mu,"%",su]].map(([l,v,u,s])=>(
                    <div key={l}><div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:2}}>{l}</div><div style={{fontSize:15,fontWeight:800,fontFamily:"monospace",color:v?COR[s].t:"#cbd5e1"}}>{v??"-"}{v?u:""}</div></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:16}}>
          <SC label="Total" value={filtrados.length} icon="📋" color="#0ea5e9"/>
          <SC label="Validados" value={filtrados.filter(r=>r.status==="VALIDADO").length} icon="✅" color="#16a34a"/>
          <SC label="Pendentes" value={filtrados.filter(r=>r.status==="PENDENTE").length} icon="⏳" color="#d97706"/>
          <SC label="Com Desvio" value={filtrados.filter(r=>r.desvios?.length>0).length} icon="⚠" color="#dc2626"/>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
          {["Todos","NOITE","MANHÃ","TARDE"].map(t=><button key={t} onClick={()=>setFT(t)} style={{padding:"4px 11px",borderRadius:16,border:"1.5px solid",borderColor:filtroTurno===t?"#0ea5e9":"#e2e8f0",background:filtroTurno===t?"#e0f2fe":"#fff",color:filtroTurno===t?"#0284c7":"#64748b",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>{t}</button>)}
          {["Todos","PENDENTE","VALIDADO"].map(t=><button key={t} onClick={()=>setFS(t)} style={{padding:"4px 11px",borderRadius:16,border:"1.5px solid",borderColor:filtroStatus===t?"#8b5cf6":"#e2e8f0",background:filtroStatus===t?"#f5f3ff":"#fff",color:filtroStatus===t?"#7c3aed":"#64748b",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>{t==="Todos"?"Todos status":t.charAt(0)+t.slice(1).toLowerCase()}</button>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {filtrados.slice(0,20).map(r=>{
            const td=r.desvios?.length>0;
            const tc=TURNOS_CONFIG.find(t=>t.id===r.turno);
            return (
              <div key={r.id} style={{background:"#fff",borderRadius:9,padding:14,border:`1px solid ${td?"#fca5a5":"#e2e8f0"}`,borderLeft:`4px solid ${r.status==="VALIDADO"?"#16a34a":td?"#f59e0b":"#0ea5e9"}`,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,flexWrap:"wrap"}}>
                      <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:"#0f172a"}}>{r.hora}</span>
                      {tc&&<span style={{fontSize:10,background:tc.bg,color:tc.cor,padding:"2px 7px",borderRadius:3,fontWeight:700,fontFamily:"monospace",border:`1px solid ${tc.cor}30`}}>{r.turno}</span>}
                      <span style={{fontSize:11,color:"#1e293b",fontWeight:600}}>{r.operador?.split(" ")[0]}</span>
                      <span style={{fontSize:10,fontFamily:"monospace",color:"#94a3b8"}}>{r.tipoFarelo}</span>
                      <Badge s={r.status}/>
                      {td&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"2px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>⚠ {r.desvios.length} DEV.</span>}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:td?7:0}}>
                      {[["ProteinaFarelo","Prot","%"],["UmidFarelo","Umid","%"],["UmidSojaEntrada","UmidE","%"],["UmidSojaProducao","UmidP","%"],["OleoFarelo","Óleo","%"]].filter(([c])=>r[c]!==null&&r[c]!==undefined).map(([c,l,u])=>{
                        const s=chk(c,r[c]);
                        return <span key={c} style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:COR[s].t,background:COR[s].f,border:`1px solid ${COR[s].b}`,padding:"2px 7px",borderRadius:3}}>{l}:{r[c]}{u}</span>;
                      })}
                    </div>
                    {td&&r.justificativasArr&&r.justificativasArr.length>0&&(
                      <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"7px 10px",marginBottom:r.obsLivre?6:0}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:5}}>📋 Justificativas</div>
                        {r.justificativasArr.map((j,i)=>(
                          <div key={i} style={{display:"flex",gap:8,marginBottom:i<r.justificativasArr.length-1?4:0}}>
                            <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,color:"#dc2626",background:"#fee2e2",padding:"1px 6px",borderRadius:3,whiteSpace:"nowrap",flexShrink:0}}>{j.label}: {j.valor}{j.un}</span>
                            <span style={{fontSize:11,color:"#44403c",lineHeight:1.4}}>{j.justificativa}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.obsLivre&&(
                      <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",
                        borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:9,fontWeight:700,color:"#0284c7",
                          textTransform:"uppercase",letterSpacing:.5,
                          fontFamily:"monospace",marginBottom:4}}>
                          💬 Observação do Turno
                        </div>
                        <div style={{fontSize:11,color:"#1e293b",lineHeight:1.5}}>
                          {r.obsLivre}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    {r.status==="PENDENTE" && user.perfil!=="Operador" && (
                      <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",
                        background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:4,
                        padding:"3px 8px",whiteSpace:"nowrap"}}>
                        validar em Verificação →
                      </span>
                    )}
                    {r.status!=="PENDENTE" && r.validadoPor && (
                      <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        por {r.validadoPor.split(" ")[0]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// + KPIs (LAMINADORES / QUEBRADORES / GRANULOMETRIA)
// ══════════════════════════════════════════════════════════════════
function CE({campo,valor,onChange,label:cl}) {
  const m=LIMITES_MAIS_KPI[campo],s=chk(campo,valor),c=COR[s];
  const lbl=cl||m?.label||campo;
  const hint=m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:m.max!==null?`Máx ${m.max}${m.un}`:m.min!==null?`Mín ${m.min}${m.un}`:""):"";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:3}}>
      <label style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace"}}>{lbl}</label>
      <div style={{position:"relative"}}>
        <input type="number" step="0.01" value={valor??""} onChange={e=>onChange&&onChange(campo,e.target.value)}
          style={{width:"100%",padding:"8px 24px 8px 9px",borderRadius:6,border:`1.5px solid ${valor!==""&&valor!==null?c.b:"#e2e8f0"}`,background:valor!==""&&valor!==null?c.f:"#f8fafc",color:valor!==""&&valor!==null?c.t:"#1e293b",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
        {valor!==""&&valor!==null&&s==="danger"&&<span style={{position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",fontSize:10}}>⚠</span>}
        {valor!==""&&valor!==null&&s==="ok"&&<span style={{position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"#16a34a"}}>✓</span>}
      </div>
      {hint&&<span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>Meta: {hint}</span>}
    </div>
  );
}
function CardLam({nome,dados,onChange}) {
  const k=nome.replace(" ","_"),d=dados[k]||{};
  const td=["TempRolo","TempMancal","EspessuraLamina"].some(c=>chk(c,d[c])==="danger");
  const p=["TempRolo","TempMancal","EspessuraLamina"].filter(c=>d[c]!==""&&d[c]!==null&&d[c]!==undefined).length;
  return (
    <div style={{background:"#fff",borderRadius:10,border:`1.5px solid ${td?"#fca5a5":"#e2e8f0"}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <div style={{background:td?"#fff1f2":"linear-gradient(135deg,#1e293b,#334155)",padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:13}}>⚙</span><span style={{fontWeight:800,fontSize:11,color:td?"#dc2626":"#f1f5f9",fontFamily:"monospace"}}>{nome}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>{td&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"1px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>DESVIO</span>}<span style={{fontSize:9,color:td?"#94a3b8":"#475569",fontFamily:"monospace"}}>{p}/3</span></div>
      </div>
      <div className="grid-3" style={{padding:11,display:"grid",gap:8}}>
        <CE campo="TempRolo" valor={d.TempRolo??""} onChange={(c,v)=>onChange(k,c,v)}/>
        <CE campo="TempMancal" valor={d.TempMancal??""} onChange={(c,v)=>onChange(k,c,v)}/>
        <CE campo="EspessuraLamina" valor={d.EspessuraLamina??""} onChange={(c,v)=>onChange(k,c,v)}/>
      </div>
    </div>
  );
}
function CardQbr({nome,dados,onChange}) {
  const k=nome.replace(" ","_"),d=dados[k]||{};
  const td=["Q1_Peneira6","Q2_Peneira6","Q2_Peneira8","Q2_Fundo"].some(c=>chk(c,d[c])==="danger");
  const p1=["Q1_Peneira6"].filter(c=>d[c]!==""&&d[c]!==null&&d[c]!==undefined).length;
  const p2=["Q2_Peneira6","Q2_Peneira8","Q2_Fundo"].filter(c=>d[c]!==""&&d[c]!==null&&d[c]!==undefined).length;
  return (
    <div style={{background:"#fff",borderRadius:10,border:`1.5px solid ${td?"#fca5a5":"#e2e8f0"}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <div style={{background:td?"#fff1f2":"linear-gradient(135deg,#0c4a6e,#0369a1)",padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:13}}>🔩</span><span style={{fontWeight:800,fontSize:11,color:td?"#dc2626":"#f1f5f9",fontFamily:"monospace"}}>{nome}</span></div>
        {td&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"1px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>DESVIO</span>}
      </div>
      <div style={{padding:11}}>
        <div style={{marginBottom:11}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,paddingBottom:6,borderBottom:"1.5px solid #e2e8f0"}}>
            <span style={{background:"#0ea5e9",color:"#fff",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:3,fontFamily:"monospace",letterSpacing:.5}}>1ª QUEBRA</span>
            <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{p1}/1</span>
          </div>
          <div className="grid-auto-1fr" style={{display:"grid",gap:7,alignItems:"center"}}>
            <div style={{background:"#e0f2fe",border:"1px solid #bae6fd",borderRadius:5,padding:"5px 9px",textAlign:"center"}}>
              <div style={{fontSize:8,fontWeight:700,color:"#64748b",textTransform:"uppercase",fontFamily:"monospace",marginBottom:1}}>Peneira</div>
              <div style={{fontSize:15,fontWeight:800,color:"#0ea5e9",fontFamily:"monospace"}}>#6</div>
            </div>
            <CE campo="Q1_Peneira6" valor={d.Q1_Peneira6??""} onChange={(c,v)=>onChange(k,c,v)} label="Retido #6 (%)"/>
          </div>
        </div>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,paddingBottom:6,borderBottom:"1.5px solid #e2e8f0"}}>
            <span style={{background:"#7c3aed",color:"#fff",fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:3,fontFamily:"monospace",letterSpacing:.5}}>2ª QUEBRA</span>
            <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{p2}/3</span>
          </div>
          <div className="grid-3" style={{display:"grid",gap:6}}>
            {[["Q2_Peneira6","#6","#7c3aed","#f5f3ff","#e9d5ff"],["Q2_Peneira8","#8","#7c3aed","#f5f3ff","#e9d5ff"],["Q2_Fundo","FUNDO","#16a34a","#f0fdf4","#bbf7d0"]].map(([c,lbl,cor,bg,bd])=>(
              <div key={c} style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{background:bg,border:`1px solid ${bd}`,borderRadius:4,padding:"4px 0",textAlign:"center"}}>
                  <div style={{fontSize:7,fontWeight:700,color:"#64748b",fontFamily:"monospace",marginBottom:1}}>{c==="Q2_Fundo"?"Passante":"Peneira"}</div>
                  <div style={{fontSize:12,fontWeight:800,color:cor,fontFamily:"monospace"}}>{lbl}</div>
                </div>
                <CE campo={c} valor={d[c]??""} onChange={(c2,v)=>onChange(k,c2,v)} label={`${lbl} (%)`}/>
              </div>
            ))}
          </div>
          {(d.Q2_Peneira6||d.Q2_Peneira8||d.Q2_Fundo)&&(
            <div style={{marginTop:7}}>
              <div style={{display:"flex",height:7,borderRadius:3,overflow:"hidden",gap:1}}>
                {d.Q2_Peneira6>0&&<div style={{flex:parseFloat(d.Q2_Peneira6)||0,background:"#7c3aed",minWidth:3}}/>}
                {d.Q2_Peneira8>0&&<div style={{flex:parseFloat(d.Q2_Peneira8)||0,background:"#a78bfa",minWidth:3}}/>}
                {d.Q2_Fundo>0&&<div style={{flex:parseFloat(d.Q2_Fundo)||0,background:"#16a34a",minWidth:3}}/>}
              </div>
              <div style={{display:"flex",gap:7,marginTop:3}}>
                {[["#6",d.Q2_Peneira6,"#7c3aed"],["#8",d.Q2_Peneira8,"#a78bfa"],["Fundo",d.Q2_Fundo,"#16a34a"]].map(([l,v,c])=>v&&<span key={l} style={{fontSize:8,fontFamily:"monospace",color:c}}>■ {l}:{v}%</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function CardGranu({dados,onChange}) {
  const d=dados["GRANULOMETRIA"]||{};
  const td=["Malha283","Malha200"].some(c=>chk(c,d[c])==="danger");
  return (
    <div style={{background:"#fff",borderRadius:10,border:`1.5px solid ${td?"#fca5a5":"#e2e8f0"}`,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
      <div style={{background:td?"#fff1f2":"linear-gradient(135deg,#0c4a6e,#0284c7)",padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:13}}>🔬</span><span style={{fontWeight:800,fontSize:11,color:td?"#dc2626":"#f1f5f9",fontFamily:"monospace"}}>GRANULOMETRIA DO FARELO</span></div>
        {td&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"1px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>DESVIO</span>}
      </div>
      <div className="grid-2" style={{padding:11,display:"grid",gap:10}}>
        <CE campo="Malha283" valor={d.Malha283??""} onChange={(c,v)=>onChange("GRANULOMETRIA",c,v)}/>
        <CE campo="Malha200" valor={d.Malha200??""} onChange={(c,v)=>onChange("GRANULOMETRIA",c,v)}/>
      </div>
    </div>
  );
}
function Sep({bg,titulo,sub,icon}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}>
      <div style={{height:2,flex:1,background:`linear-gradient(90deg,${bg},transparent)`}}/>
      <div style={{display:"flex",alignItems:"center",gap:7,background:bg,borderRadius:20,padding:"4px 13px"}}>
        <span style={{fontSize:12}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:800,color:"#f1f5f9",fontFamily:"monospace",letterSpacing:.5}}>{titulo}</span>
        {sub&&<span style={{fontSize:9,color:"rgba(255,255,255,.5)",fontFamily:"monospace"}}>{sub}</span>}
      </div>
      <div style={{height:2,flex:1,background:`linear-gradient(90deg,transparent,${bg})`}}/>
    </div>
  );
}

function TelaMaisKpis({user,registros,setRegistros}) {
  const [view,setView]=useState("lista");
  const [filtroTurno,setFT]=useState("Todos");
  const [savedMsg,setSaved]=useState("");
  const [showDev,setSD]=useState(false);
  const [devForm,setDF]=useState({problema:"",acao:"",afeta:""});
  const emptyEquip=()=>{const eq={};LAMINADORES.forEach(l=>{eq[l.replace(" ","_")]={TempRolo:"",TempMancal:"",EspessuraLamina:""};});QUEBRADORES.forEach(q=>{eq[q.replace(" ","_")]={Q1_Peneira6:"",Q2_Peneira6:"",Q2_Peneira8:"",Q2_Fundo:""};});eq["GRANULOMETRIA"]={Malha283:"",Malha200:""};return eq;};
  const [cab,setCab]=useState({data:new Date().toISOString().split("T")[0],hora:"00:00",turno:user.turno==="TODOS"?"NOITE":user.turno});
  const [equip,setEquip]=useState(emptyEquip());
  const handleEquip=(eqKey,campo,valor)=>setEquip(eq=>({...eq,[eqKey]:{...eq[eqKey],[campo]:valor}}));
  const desvios=useMemo(()=>{const devs=[];LAMINADORES.forEach(l=>{const k=l.replace(" ","_"),d=equip[k]||{};["TempRolo","TempMancal","EspessuraLamina"].forEach(c=>{if(chk(c,d[c])==="danger")devs.push({equip:l,campo:c,valor:d[c]});});});QUEBRADORES.forEach(q=>{const k=q.replace(" ","_"),d=equip[k]||{};["Q1_Peneira6","Q2_Peneira6","Q2_Peneira8","Q2_Fundo"].forEach(c=>{if(chk(c,d[c])==="danger")devs.push({equip:q,campo:c,valor:d[c]});});});const g=equip["GRANULOMETRIA"]||{};["Malha283","Malha200"].forEach(c=>{if(chk(c,g[c])==="danger")devs.push({equip:"GRANULOMETRIA",campo:c,valor:g[c]});});return devs;},[equip]);
  const totalCampos=LAMINADORES.length*3+QUEBRADORES.length*4+2;
  const totalPreench=useMemo(()=>{let n=0;LAMINADORES.forEach(l=>{const d=equip[l.replace(" ","_")]||{};["TempRolo","TempMancal","EspessuraLamina"].forEach(c=>{if(d[c]!==""&&d[c]!==null&&d[c]!==undefined)n++;});});QUEBRADORES.forEach(q=>{const d=equip[q.replace(" ","_")]||{};["Q1_Peneira6","Q2_Peneira6","Q2_Peneira8","Q2_Fundo"].forEach(c=>{if(d[c]!==""&&d[c]!==null&&d[c]!==undefined)n++;});});const g=equip["GRANULOMETRIA"]||{};["Malha283","Malha200"].forEach(c=>{if(g[c]!==""&&g[c]!==null&&g[c]!==undefined)n++;});return n;},[equip]);
  const prog=Math.round((totalPreench/totalCampos)*100);
  const salvar=(obs="")=>{const novo={id:`temp_${Date.now()}`,...cab,operador:user.nome,status:"PENDENTE",equipamentos:{...equip},totalDesvios:desvios.length,desviosDetalhe:[...desvios],obs,tipo:"mais_kpi"};setRegistros(r=>[novo,...r]);setEquip(emptyEquip());setView("lista");setSaved("✅ +KPI registrado!");setTimeout(()=>setSaved(""),3000);};
  const mkpiRegs=registros.filter(r=>r.tipo==="mais_kpi");
  const filtrados=mkpiRegs.filter(r=>filtroTurno==="Todos"||r.turno===filtroTurno);

  if(view==="form") return (
    <div>
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"12px 24px",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 8px rgba(0,0,0,.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <h1 style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>⚙ Novo Registro — +KPIs</h1>
            {desvios.length>0&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>{desvios.length} DESVIO{desvios.length>1?"S":""}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
            <div style={{width:110,height:5,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:prog<40?"#f59e0b":prog<80?"#0ea5e9":"#16a34a",borderRadius:3,transition:"width .3s"}}/></div>
            <span style={{fontSize:10,fontFamily:"monospace",color:"#64748b"}}>{totalPreench}/{totalCampos} ({prog}%)</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>desvios.length>0?setSD(true):salvar()} style={{padding:"8px 15px",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(220,38,38,.25)"}}>💾 Salvar</button>
          <button onClick={()=>setView("lista")} style={{padding:"8px 12px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:7,fontSize:12,cursor:"pointer",color:"#475569"}}>Cancelar</button>
        </div>
      </div>
      <div style={{padding:22}}>
        <div style={{background:"#fff",borderRadius:9,padding:13,border:"1px solid #e2e8f0",marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0f172a",marginBottom:9}}>🕐 Identificação</div>
          <div className="grid-3" style={{display:"grid",gap:10}}>
            {[["Data","date","data"],["Hora","time","hora"]].map(([l,t,k])=>(
              <div key={k}><label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>{l}</label><input type={t} value={cab[k]} onChange={e=>setCab(c=>({...c,[k]:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/></div>
            ))}
            <div><label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>Turno</label><select value={cab.turno} onChange={e=>setCab(c=>({...c,turno:e.target.value}))} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,background:"#fff",boxSizing:"border-box"}}>{["NOITE","MANHÃ","TARDE"].map(t=><option key={t}>{t}</option>)}</select></div>
          </div>
        </div>
        <div style={{marginBottom:20}}><Sep bg="#1e293b" icon="⚙" titulo="LAMINADORES" sub="Temp. Rolo · Mancal · Espessura"/><div className="grid-2" style={{display:"grid",gap:11}}>{LAMINADORES.map(l=><CardLam key={l} nome={l} dados={equip} onChange={handleEquip}/>)}</div></div>
        <div style={{marginBottom:20}}><Sep bg="#0c4a6e" icon="🔩" titulo="QUEBRADORES" sub="1ª Quebra #6 · 2ª Quebra #6 #8 Fundo"/><div className="grid-3" style={{display:"grid",gap:11}}>{QUEBRADORES.map(q=><CardQbr key={q} nome={q} dados={equip} onChange={handleEquip}/>)}</div></div>
        <div style={{marginBottom:20}}><Sep bg="#0c4a6e" icon="🔬" titulo="GRANULOMETRIA DO FARELO"/><CardGranu dados={equip} onChange={handleEquip}/></div>
        {desvios.length>0&&(<div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:7,padding:"10px 14px",marginBottom:12}}><div style={{fontWeight:700,color:"#92400e",fontSize:12,marginBottom:6}}>⚠ {desvios.length} desvio{desvios.length>1?"s":""}:</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{desvios.map((d,i)=><span key={i} style={{background:"#fee2e2",color:"#dc2626",fontSize:10,fontFamily:"monospace",fontWeight:700,padding:"2px 8px",borderRadius:3}}>{d.equip.replace("LAMINADOR ","LAM-").replace("QUEBRADOR ","QBR-")} · {LIMITES_MAIS_KPI[d.campo]?.label}: {d.valor}{LIMITES_MAIS_KPI[d.campo]?.un}</span>)}</div></div>)}
        <button onClick={()=>desvios.length>0?setSD(true):salvar()} style={{width:"100%",padding:12,background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(220,38,38,.2)"}}>💾 Salvar Registro de +KPIs</button>
      </div>
      {showDev&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}><div style={{background:"#fff",borderRadius:14,padding:24,width:"100%",maxWidth:480,boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}><h3 style={{fontSize:14,fontWeight:800,margin:"0 0 11px"}}>⚠ Registrar Desvio Obrigatório</h3><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>{desvios.map((d,i)=><span key={i} style={{background:"#fee2e2",color:"#dc2626",fontSize:10,fontFamily:"monospace",fontWeight:700,padding:"2px 7px",borderRadius:3}}>{d.equip.replace("LAMINADOR ","LAM-").replace("QUEBRADOR ","QBR-")} · {LIMITES_MAIS_KPI[d.campo]?.label}: {d.valor}{LIMITES_MAIS_KPI[d.campo]?.un}</span>)}</div>{[["problema","Problema Detectado"],["acao","Ação Tomada"],["afeta","O que Irá Afetar?"]].map(([k,l])=>(<div key={k} style={{marginBottom:9}}><label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>{l}</label><textarea rows={2} value={devForm[k]} onChange={e=>setDF(f=>({...f,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/></div>))}<div style={{display:"flex",gap:8}}><button onClick={()=>{salvar(devForm.problema);setSD(false);setDF({problema:"",acao:"",afeta:""}); }} style={{flex:1,padding:10,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer"}}>💾 Salvar</button><button onClick={()=>setSD(false)} style={{padding:"10px 13px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:7,cursor:"pointer",fontSize:12}}>Cancelar</button></div></div></div>)}
    </div>
  );

  return (
    <div>
      <PH title="⚙ + KPIs — Quebra / Laminadores" subtitle="Por equipamento: Laminador A-D · Quebrador A-C · Granulometria"
        action={<button onClick={()=>setView("form")} style={{padding:"8px 15px",background:"linear-gradient(135deg,#dc2626,#b91c1c)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 12px rgba(220,38,38,.2)"}}>+ Novo Registro</button>}/>
      <div style={{padding:22}}>
        {savedMsg&&<div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:7,padding:"9px 14px",marginBottom:12,color:"#16a34a",fontWeight:600,fontSize:13}}>{savedMsg}</div>}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:16}}>
          <SC label="Total" value={mkpiRegs.length} icon="⚙" color="#dc2626"/>
          <SC label="Lam. c/ Desvio" value={mkpiRegs.filter(r=>r.desviosDetalhe?.some(d=>d.equip?.startsWith("LAM"))).length} icon="🌡" color="#f59e0b"/>
          <SC label="Qbr. c/ Desvio" value={mkpiRegs.filter(r=>r.desviosDetalhe?.some(d=>d.equip?.startsWith("QBR"))).length} icon="🔩" color="#8b5cf6"/>
          <SC label="Pendentes" value={mkpiRegs.filter(r=>r.status==="PENDENTE").length} icon="⏳" color="#d97706"/>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:12}}>
          {["Todos","NOITE","MANHÃ","TARDE"].map(t=><button key={t} onClick={()=>setFT(t)} style={{padding:"4px 11px",borderRadius:16,border:"1.5px solid",borderColor:filtroTurno===t?"#dc2626":"#e2e8f0",background:filtroTurno===t?"#fee2e2":"#fff",color:filtroTurno===t?"#dc2626":"#64748b",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>{t}</button>)}
        </div>
        {filtrados.length===0?(
          <div style={{background:"#fff",borderRadius:11,padding:40,textAlign:"center",border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:34,marginBottom:9}}>⚙</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b",marginBottom:3}}>Nenhum registro ainda</div>
            <div style={{fontSize:12}}>Clique em "+ Novo Registro" para começar</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {filtrados.map(r=>{
              const td=r.totalDesvios>0;
              const lams=LAMINADORES.filter(l=>{const k=l.replace(" ","_"),d=r.equipamentos?.[k];return d&&Object.values(d).some(v=>v!==""&&v!==null);});
              const qbrs=QUEBRADORES.filter(q=>{const k=q.replace(" ","_"),d=r.equipamentos?.[q];return d&&Object.values(d).some(v=>v!==""&&v!==null);});
              return (
                <div key={r.id} style={{background:"#fff",borderRadius:9,padding:13,border:`1px solid ${td?"#fca5a5":"#e2e8f0"}`,borderLeft:`4px solid ${r.status==="VALIDADO"?"#16a34a":td?"#f59e0b":"#dc2626"}`,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:"#0f172a"}}>{r.hora}</span>
                        <span style={{fontSize:10,background:"#f1f5f9",color:"#64748b",padding:"2px 6px",borderRadius:3}}>{r.turno}</span>
                        <span style={{fontSize:11,color:"#1e293b",fontWeight:600}}>{r.operador?.split(" ")[0]}</span>
                        <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{r.data}</span>
                        <Badge s={r.status}/>
                        {td&&<span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",padding:"2px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>⚠ {r.totalDesvios} DEV.</span>}
                      </div>
                      {lams.length>0&&(<div style={{marginBottom:6}}><div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>⚙ Laminadores</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{lams.map(l=>{const k=l.replace(" ","_"),d=r.equipamentos[k];const sr=chk("TempRolo",d.TempRolo),sm=chk("TempMancal",d.TempMancal),se=chk("EspessuraLamina",d.EspessuraLamina);const temDev=[sr,sm,se].some(s=>s==="danger");return(<div key={k} style={{background:temDev?"#fff1f2":"#f8fafc",border:`1px solid ${temDev?"#fca5a5":"#e2e8f0"}`,borderRadius:5,padding:"3px 7px",fontSize:10,fontFamily:"monospace"}}><span style={{fontWeight:700,color:temDev?"#dc2626":"#1e293b"}}>{l.replace("LAMINADOR ","LAM-")}</span><div style={{display:"flex",gap:5,marginTop:2}}>{d.TempRolo&&<span style={{color:COR[sr].t}}>R:{d.TempRolo}°C{sr==="danger"?"⚠":""}</span>}{d.TempMancal&&<span style={{color:COR[sm].t}}>M:{d.TempMancal}°C{sm==="danger"?"⚠":""}</span>}{d.EspessuraLamina&&<span style={{color:COR[se].t}}>E:{d.EspessuraLamina}mm{se==="danger"?"⚠":""}</span>}</div></div>);})}</div></div>)}
                      {qbrs.length>0&&(<div><div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>🔩 Quebradores</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{qbrs.map(q=>{const k=q.replace(" ","_"),d=r.equipamentos[k];const s1=chk("Q1_Peneira6",d.Q1_Peneira6),s2a=chk("Q2_Peneira6",d.Q2_Peneira6),s2b=chk("Q2_Peneira8",d.Q2_Peneira8),s2c=chk("Q2_Fundo",d.Q2_Fundo);const temDev=[s1,s2a,s2b,s2c].some(s=>s==="danger");return(<div key={k} style={{background:temDev?"#fff1f2":"#f8fafc",border:`1px solid ${temDev?"#fca5a5":"#e2e8f0"}`,borderRadius:5,padding:"3px 7px",fontSize:10,fontFamily:"monospace"}}><span style={{fontWeight:700,color:temDev?"#dc2626":"#1e293b"}}>{q.replace("QUEBRADOR ","QBR-")}</span><div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>{d.Q1_Peneira6!==""&&d.Q1_Peneira6!==undefined&&<span style={{color:COR[s1].t}}>1ªQ#6:{d.Q1_Peneira6}%{s1==="danger"?"⚠":""}</span>}{d.Q2_Peneira6!==""&&d.Q2_Peneira6!==undefined&&<span style={{color:COR[s2a].t}}>2ªQ#6:{d.Q2_Peneira6}%</span>}{d.Q2_Peneira8!==""&&d.Q2_Peneira8!==undefined&&<span style={{color:COR[s2b].t}}>#8:{d.Q2_Peneira8}%</span>}{d.Q2_Fundo!==""&&d.Q2_Fundo!==undefined&&<span style={{color:COR[s2c].t}}>Fundo:{d.Q2_Fundo}%{s2c==="danger"?"⚠":""}</span>}</div></div>);})}</div></div>)}
                    </div>
                    <div style={{flexShrink:0,textAlign:"right"}}>
                      {r.status==="PENDENTE" && user.perfil!=="Operador" && (
                        <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",
                          background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:4,
                          padding:"3px 7px",whiteSpace:"nowrap"}}>
                          validar em Verificação →
                        </span>
                      )}
                      {r.status!=="PENDENTE" && r.validadoPor && (
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                          por {r.validadoPor.split(" ")[0]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CALCULADORA
// ══════════════════════════════════════════════════════════════════
function TelaCalculadora({ user, histCalc, setHistCalc }) {
  const [prod, setProd] = useState("");
  const [tipo, setTipo] = useState("simples");
  const [ue,   setUe]   = useState("");
  const [us,   setUs]   = useState("");

  const calc = useMemo(()=>{
    const p=parseFloat(prod);
    if(!p||p<=0) return null;
    if(tipo==="simples") return {
      soja:+(p*1.3702).toFixed(3), farelo:+(p*0.7318).toFixed(3),
      oleo:+(p*0.1820).toFixed(3), rend:+((p*0.7318/(p*1.3702))*100).toFixed(2),
    };
    const uen=parseFloat(ue), usn=parseFloat(us);
    if(!uen||!usn) return null;
    const f=(100-uen)/(100-usn);
    const s=+(p*1.3702*f).toFixed(3), fa=+(p*0.7318*f).toFixed(3);
    return { soja:s, farelo:fa, oleo:+(p*0.1820).toFixed(3),
             rend:+((fa/s)*100).toFixed(2), fator:f.toFixed(4) };
  },[prod,tipo,ue,us]);

  const salvarNoHistorico = () => {
    if(!calc) return;
    setHistCalc(h=>[{
      id: Date.now(),
      hora: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
      data: new Date().toLocaleDateString("pt-BR"),
      producao: parseFloat(prod),
      tipo, ...calc, operador: user.nome,
    },...h]);
    setProd(""); setUe(""); setUs("");
  };

  return (
    <div>
      <PH title="🧮 Calculadora de Produção"
        subtitle="Estimativa de Soja e Farelo fora das balanças"/>
      <div style={{padding:22}}>
        <div className="grid-2" style={{display:"grid",gap:20,alignItems:"start"}}>

          {/* Formulário */}
          <div style={{background:"#fff",borderRadius:11,padding:20,
            border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",gap:5,marginBottom:14,background:"#f1f5f9",
              padding:4,borderRadius:7}}>
              {[["simples","Simples"],["umidade","+ Umidade"]].map(([v,l])=>(
                <button key={v} onClick={()=>setTipo(v)}
                  style={{flex:1,padding:"6px 0",borderRadius:5,border:"none",fontSize:12,
                    fontWeight:600,cursor:"pointer",
                    background:tipo===v?"#fff":"transparent",
                    color:tipo===v?"#0f172a":"#64748b",
                    boxShadow:tipo===v?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
                  {l}
                </button>
              ))}
            </div>

            <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
              Produção do Turno (ton)
            </label>
            <input type="number" step="0.001" value={prod}
              onChange={e=>setProd(e.target.value)} placeholder="Ex: 562.5"
              style={{width:"100%",padding:"10px 12px",borderRadius:7,
                border:"1.5px solid #e2e8f0",fontSize:15,fontFamily:"monospace",
                fontWeight:700,outline:"none",boxSizing:"border-box",marginBottom:11}}/>

            {tipo==="umidade" && (
              <div className="grid-2" style={{display:"grid",gap:9,marginBottom:11}}>
                {[["Umidade Entrada (%)",ue,setUe],["Umidade Saída (%)",us,setUs]].map(([l,v,set])=>(
                  <div key={l}>
                    <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                      textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>
                      {l}
                    </label>
                    <input type="number" step="0.01" value={v}
                      onChange={e=>set(e.target.value)}
                      style={{width:"100%",padding:"8px 10px",borderRadius:6,
                        border:"1.5px solid #e2e8f0",fontSize:13,fontFamily:"monospace",
                        fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>
            )}

            <button onClick={salvarNoHistorico} disabled={!calc}
              style={{width:"100%",padding:10,
                background:calc?"linear-gradient(135deg,#0ea5e9,#0284c7)":"#e2e8f0",
                color:calc?"#fff":"#94a3b8",border:"none",borderRadius:7,
                fontSize:13,fontWeight:700,cursor:calc?"pointer":"not-allowed",
                boxShadow:calc?"0 4px 12px rgba(14,165,233,.2)":"none"}}>
              💾 Salvar no Histórico
            </button>
          </div>

          {/* Resultado */}
          <div>
            {calc ? (
              <>
                <div className="grid-2" style={{display:"grid",gap:10,marginBottom:10}}>
                  {[["🌾 Soja",calc.soja,"ton","#f59e0b","#fffbeb"],
                    ["📦 Farelo",calc.farelo,"ton","#8b5cf6","#faf5ff"],
                    ["💧 Óleo",calc.oleo,"ton","#10b981","#f0fdf4"],
                    ["📊 Rendimento",`${calc.rend}%`,"farelo/soja","#0ea5e9","#e0f2fe"],
                  ].map(([l,v,u,c,bg])=>(
                    <div key={l} style={{background:bg,border:`1px solid ${c}30`,
                      borderRadius:9,padding:13,textAlign:"center"}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#64748b",
                        textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{l}</div>
                      <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
                      <div style={{fontSize:9,color:"#94a3b8",marginTop:2,fontFamily:"monospace"}}>{u}</div>
                    </div>
                  ))}
                </div>
                {calc.fator && (
                  <div style={{background:"#e0f2fe",borderRadius:7,padding:"7px 12px",
                    fontSize:11,color:"#0284c7",fontFamily:"monospace"}}>
                    Fator de correção de umidade: {calc.fator}
                  </div>
                )}
              </>
            ) : (
              <div style={{background:"#fff",borderRadius:11,padding:36,
                border:"1px solid #e2e8f0",textAlign:"center",color:"#94a3b8"}}>
                <div style={{fontSize:34,marginBottom:9}}>🧮</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748b"}}>
                  Digite a produção do turno
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Histórico persistente */}
        {histCalc.length > 0 && (
          <div style={{background:"#fff",borderRadius:11,padding:16,
            border:"1px solid #e2e8f0",marginTop:16,
            boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
              <div style={{fontWeight:700,fontSize:12,color:"#0f172a"}}>
                📋 Histórico de Cálculos
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                  {histCalc.length} cálculo{histCalc.length!==1?"s":""} · persiste entre sessões
                </span>
                <button onClick={()=>setHistCalc([])} title="Oculta da lista nesta sessão — não exclui do banco de dados"
                  style={{padding:"3px 10px",background:"#fee2e2",border:"1px solid #fca5a5",
                    borderRadius:5,color:"#dc2626",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                  🗑 Ocultar
                </button>
              </div>
            </div>
            <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Data","Hora","Operador","Produção","Soja","Farelo","Óleo","Rend.","Tipo"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:9,
                      color:"#64748b",fontWeight:600,textTransform:"uppercase",
                      letterSpacing:.5,borderBottom:"1px solid #e2e8f0",fontFamily:"monospace"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {histCalc.map((r,i)=>(
                  <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                    background:i%2===0?"#ffffff":"#fafafa"}}>
                    {[r.data,r.hora,r.operador?.split(" ")[0],
                      `${r.producao}t`,`${r.soja}t`,`${r.farelo}t`,
                      `${r.oleo}t`,`${r.rend}%`,r.tipo
                    ].map((v,j)=>(
                      <td key={j} style={{padding:"7px 10px",fontFamily:"monospace",
                        fontWeight:j<=2?600:400,
                        color:j===0||j===1?"#0f172a":j===2?"#1e293b":"#475569"}}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// RASTREABILIDADE
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// RASTREABILIDADE — filtros idênticos ao Relatório
// ══════════════════════════════════════════════════════════════════
function TelaRastreabilidade({ registros, metas=METAS_DEFAULT }) {
  const hoje = new Date();
  const [modoFiltro,  setModoFiltro]  = useState("mes");
  const [mesSel,      setMesSel]      = useState(String(hoje.getMonth()+1).padStart(2,"0"));
  const [anoSel,      setAnoSel]      = useState(String(hoje.getFullYear()));
  const [dataIni,     setDataIni]     = useState(hoje.toISOString().split("T")[0]);
  const [dataFim,     setDataFim]     = useState(hoje.toISOString().split("T")[0]);
  const [diaSel,      setDiaSel]      = useState(hoje.toISOString().split("T")[0]);
  const [filtroDesvio,setFiltroDesvio]= useState("Todos");
  const [filtroTurno, setFiltroTurno] = useState("Todos");

  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const anosDisponiveis = useMemo(()=>{
    const anos=[...new Set(registros.map(r=>r.data?.slice(0,4)).filter(Boolean))].sort().reverse();
    return anos.length?anos:[String(hoje.getFullYear())];
  },[registros]);

  // Filtro de registros KPI
  const registrosFiltrados = useMemo(()=>{
    return registros.filter(r=>{
      if(!r.data||r.tipo!=="moagem") return false;
      if(modoFiltro==="mes"){const[rA,rM]=r.data.split("-");if(rA!==anoSel||rM!==mesSel)return false;}
      else if(modoFiltro==="periodo"){if(r.data<dataIni||r.data>dataFim)return false;}
      else if(modoFiltro==="dia"){if(r.data!==diaSel)return false;}
      if(filtroTurno!=="Todos"&&r.turno!==filtroTurno)return false;
      if(filtroDesvio==="com_desvio"&&!(r.desvios?.length>0))return false;
      if(filtroDesvio==="sem_desvio"&&(r.desvios?.length>0))return false;
      return true;
    });
  },[registros,modoFiltro,mesSel,anoSel,dataIni,dataFim,diaSel,filtroTurno,filtroDesvio]);

  const labelPeriodo = useMemo(()=>{
    if(modoFiltro==="mes")    return `${MESES[parseInt(mesSel)-1]} / ${anoSel}`;
    if(modoFiltro==="dia")    return `Dia ${diaSel.split("-").reverse().join("/")}`;
    if(dataIni===dataFim)     return `Dia ${dataIni.split("-").reverse().join("/")}`;
    return `${dataIni.split("-").reverse().join("/")} até ${dataFim.split("-").reverse().join("/")}`;
  },[modoFiltro,mesSel,anoSel,diaSel,dataIni,dataFim]);

  const stats = useMemo(()=>{
    const f=registrosFiltrados;
    if(!f.length)return null;
    const comDev=f.filter(r=>r.desvios?.length>0).length;
    const prot=f.filter(r=>r.ProteinaFarelo).map(r=>r.ProteinaFarelo);
    const umid=f.filter(r=>r.UmidFarelo).map(r=>r.UmidFarelo);
    return{
      total:f.length, comDev,
      conformidade:Math.round(((f.length-comDev)/f.length)*100),
      avgProt:prot.length?+(prot.reduce((a,b)=>a+b,0)/prot.length).toFixed(2):null,
      avgUmid:umid.length?+(umid.reduce((a,b)=>a+b,0)/umid.length).toFixed(2):null,
    };
  },[registrosFiltrados]);

  // Componente do painel de filtros
  const PainelFiltros = () => (
    <div style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",
      boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12,
        display:"flex",alignItems:"center",gap:8}}>
        🎯 Filtros de Período
        <span style={{fontSize:10,background:"#e0f2fe",color:"#0284c7",padding:"2px 9px",
          borderRadius:10,fontFamily:"monospace",fontWeight:700}}>
          {labelPeriodo}
        </span>
      </div>

      {/* Modo de período */}
      <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:4,borderRadius:8,
        width:"fit-content",marginBottom:12}}>
        {[["mes","📅 Por Mês"],["dia","📆 Dia"],["periodo","📊 Intervalo"]].map(([v,l])=>(
          <button key={v} onClick={()=>setModoFiltro(v)}
            style={{padding:"5px 13px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,
              cursor:"pointer",background:modoFiltro===v?"#fff":"transparent",
              color:modoFiltro===v?"#0f172a":"#64748b",
              boxShadow:modoFiltro===v?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
            {l}
          </button>
        ))}
      </div>

      {modoFiltro==="mes" && (
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
          <div>
            <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Mês</label>
            <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
              style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                fontSize:13,fontWeight:600,background:"#fff",cursor:"pointer",minWidth:150}}>
              {MESES.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Ano</label>
            <select value={anoSel} onChange={e=>setAnoSel(e.target.value)}
              style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                fontSize:13,fontWeight:600,background:"#fff",cursor:"pointer"}}>
              {anosDisponiveis.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      )}

      {modoFiltro==="dia" && (
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
            textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>Data</label>
          <input type="date" value={diaSel} onChange={e=>setDiaSel(e.target.value)}
            style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
              fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
        </div>
      )}

      {modoFiltro==="periodo" && (
        <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",marginBottom:12}}>
          <div>
            <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
              Data Inicial</label>
            <input type="date" value={dataIni} onChange={e=>setDataIni(e.target.value)}
              style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
          </div>
          <div style={{fontSize:13,color:"#94a3b8",fontWeight:600,paddingBottom:6}}>até</div>
          <div>
            <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
              Data Final</label>
            <input type="date" value={dataFim} min={dataIni} onChange={e=>setDataFim(e.target.value)}
              style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
          </div>
        </div>
      )}

      {/* Filtros secundários */}
      <div style={{height:1,background:"#f1f5f9",margin:"10px 0"}}/>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
            letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Turno</div>
          <div style={{display:"flex",gap:4}}>
            {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
              const tc=TURNOS_CONFIG.find(x=>x.id===t);
              return(
                <button key={t} onClick={()=>setFiltroTurno(t)}
                  style={{padding:"4px 9px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                    background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                    color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                    fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
            letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Desvios</div>
          <div style={{display:"flex",gap:4}}>
            {[["Todos","Todos"],["com_desvio","⚠ Com Desvio"],["sem_desvio","✅ Sem Desvio"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFiltroDesvio(v)}
                style={{padding:"4px 9px",borderRadius:12,border:"1.5px solid",
                  borderColor:filtroDesvio===v?"#dc2626":"#e2e8f0",
                  background:filtroDesvio===v?"#fff1f2":"#fff",
                  color:filtroDesvio===v?"#dc2626":"#64748b",
                  fontSize:10,fontWeight:600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PH title="🔍 Rastreabilidade" subtitle={`Registros KPI — ${labelPeriodo}`}/>
      <div style={{padding:22}}>

        {/* Painel de filtros */}
        <PainelFiltros/>

        {/* Cards de resumo */}
        {stats && (
          <div className="grid-5" style={{display:"grid",gap:10,marginBottom:16}}>
            <SC label="Registros"     value={stats.total}              icon="📋" color="#0ea5e9"/>
            <SC label="Com Desvio"    value={stats.comDev}             icon="⚠" color="#dc2626"/>
            <SC label="Conformidade"  value={`${stats.conformidade}%`} icon="✅" color="#16a34a"/>
            <SC label="⌀ Proteína"   value={stats.avgProt?`${stats.avgProt}%`:"—"} icon="🔬"
              color={stats.avgProt?chk("ProteinaFarelo",stats.avgProt)==="ok"?"#16a34a":"#dc2626":"#64748b"}/>
            <SC label="⌀ Umid. Farelo" value={stats.avgUmid?`${stats.avgUmid}%`:"—"} icon="💧"
              color={stats.avgUmid?chk("UmidFarelo",stats.avgUmid)==="ok"?"#16a34a":"#dc2626":"#64748b"}/>
          </div>
        )}

        {/* Tabela de registros */}
        {registrosFiltrados.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:38,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:9}}>🔍</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b"}}>
              Nenhum registro encontrado para o período
            </div>
          </div>
        ) : (
          <div style={{background:"#fff",borderRadius:10,overflow:"hidden",
            border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#0f172a"}}>
                  {["Data","Hora","Turno","Operador","Proteína","Umid. Farelo","Óleo","Status","Desvios"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:9,
                      color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                      letterSpacing:.5,borderBottom:"1px solid #1e293b",
                      fontFamily:"monospace",whiteSpace:"nowrap"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.slice(0,50).map((r,ri)=>{
                  const ps=chk("ProteinaFarelo",r.ProteinaFarelo);
                  const us=chk("UmidFarelo",r.UmidFarelo);
                  const os=chk("OleoFarelo",r.OleoFarelo);
                  const tc=TURNOS_CONFIG.find(t=>t.id===r.turno);
                  const td=r.desvios?.length>0;
                  return (
                    <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                      background:td?"#fff7f7":ri%2===0?"#ffffff":"#fafafa"}}>
                      <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:11,
                        color:"#64748b",whiteSpace:"nowrap"}}>{r.data}</td>
                      <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                        color:"#0f172a"}}>{r.hora}</td>
                      <td style={{padding:"8px 12px"}}>
                        {tc&&<span style={{fontSize:9,background:tc.bg,color:tc.cor,
                          padding:"2px 6px",borderRadius:3,fontFamily:"monospace",
                          fontWeight:700,border:`1px solid ${tc.cor}30`}}>{r.turno}</span>}
                      </td>
                      <td style={{padding:"8px 12px",color:"#1e293b",whiteSpace:"nowrap"}}>
                        {r.operador?.split(" ")[0]}
                      </td>
                      <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                        color:COR[ps].t,whiteSpace:"nowrap"}}>
                        {r.ProteinaFarelo?`${r.ProteinaFarelo}%`:"—"}
                      </td>
                      <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                        color:COR[us].t,whiteSpace:"nowrap"}}>
                        {r.UmidFarelo?`${r.UmidFarelo}%`:"—"}
                      </td>
                      <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                        color:COR[os].t,whiteSpace:"nowrap"}}>
                        {r.OleoFarelo?`${r.OleoFarelo}%`:"—"}
                      </td>
                      <td style={{padding:"8px 12px"}}><Badge s={r.status}/></td>
                      <td style={{padding:"8px 12px"}}>
                        {td
                          ? <span style={{fontSize:10,background:"#fee2e2",color:"#dc2626",
                              padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                              ⚠ {r.desvios.length}
                            </span>
                          : <span style={{fontSize:10,color:"#86efac",fontFamily:"monospace"}}>✓</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            {registrosFiltrados.length>50&&(
              <div style={{padding:"10px 16px",background:"#f8fafc",borderTop:"1px solid #e2e8f0",
                fontSize:11,color:"#94a3b8",textAlign:"center",fontFamily:"monospace"}}>
                Exibindo 50 de {registrosFiltrados.length} registros
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// VERIFICAÇÃO
// ══════════════════════════════════════════════════════════════════

// Componente isolado para cada registro — evita hook fora de componente
function RegistroItem({ r, user, onValidar, onRejeitar }) {
  const [expandJust, setExpandJust] = useState(false);
  const tc     = TURNOS_CONFIG.find(t=>t.id===r.turno);
  const temDev = r.desvios?.length > 0;
  const temJust = r.justificativasArr?.length > 0;

  return (
    <div style={{
      background: temDev ? "#fffbeb" : "#fff",
      borderRadius:10, padding:15,
      border:`1px solid ${temDev?"#fde68a":"#e2e8f0"}`,
      borderLeft:`4px solid ${r.status==="VALIDADO"?"#16a34a":temDev?"#f59e0b":"#0ea5e9"}`,
      marginBottom:9, boxShadow:"0 1px 3px rgba(0,0,0,.04)",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1}}>

          {/* Linha de identificação */}
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:800,color:"#0f172a"}}>{r.hora}</span>
            {tc && (
              <span style={{fontSize:10,background:tc.bg,color:tc.cor,padding:"2px 7px",
                borderRadius:3,fontFamily:"monospace",fontWeight:700,border:`1px solid ${tc.cor}30`}}>
                {r.turno}
              </span>
            )}
            <span style={{fontSize:11,color:"#1e293b",fontWeight:600}}>{r.operador}</span>
            <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{r.data}</span>
            {r.tipo==="mais_kpi" && (
              <span style={{fontSize:9,background:"#fff7ed",color:"#c2410c",
                padding:"2px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>
                +KPIs
              </span>
            )}
            {temDev && (
              <span style={{fontSize:9,background:"#fee2e2",color:"#dc2626",
                padding:"2px 6px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>
                ⚠ {r.desvios.length} DESVIO{r.desvios.length>1?"S":""}
              </span>
            )}
            <Badge s={r.status}/>
            {r.status!=="PENDENTE" && r.validadoPor && (
              <span style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
                por {r.validadoPor.split(" ")[0]}
                {r.dataValidacao && ` · ${new Date(r.dataValidacao).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`}
              </span>
            )}
          </div>

          {/* Valores dos KPIs */}
          {r.tipo!=="mais_kpi" && (
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom: temJust ? 8 : 0}}>
              {Object.keys(LIMITES_MOAGEM).filter(c=>r[c]!==null&&r[c]!==undefined).map(c=>{
                const s=chk(c,r[c]);
                return (
                  <span key={c} style={{fontSize:9,fontFamily:"monospace",fontWeight:600,
                    color:COR[s].t,background:COR[s].f,border:`1px solid ${COR[s].b}`,
                    padding:"2px 7px",borderRadius:3}}>
                    {LIMITES_MOAGEM[c]?.label?.slice(0,12)}: {r[c]}{LIMITES_MOAGEM[c]?.un}
                  </span>
                );
              })}
            </div>
          )}

          {/* Justificativas colapsáveis */}
          {temJust && (
            <div>
              <button onClick={()=>setExpandJust(x=>!x)}
                style={{fontSize:10,color:"#92400e",background:"#fef3c7",
                  border:"1px solid #fde68a",borderRadius:5,padding:"3px 10px",
                  cursor:"pointer",fontWeight:600,marginTop:4}}>
                {expandJust ? "▲ Ocultar" : "▼ Ver"} justificativas ({r.justificativasArr.length})
              </button>
              {expandJust && (
                <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,
                  padding:"10px 12px",marginTop:7}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#92400e",textTransform:"uppercase",
                    letterSpacing:.5,fontFamily:"monospace",marginBottom:8}}>
                    📋 Justificativas de desvio
                  </div>
                  {r.justificativasArr.map((j,i)=>(
                    <div key={i} style={{display:"flex",gap:8,
                      marginBottom:i<r.justificativasArr.length-1?8:0}}>
                      <span style={{fontSize:10,fontFamily:"monospace",fontWeight:700,
                        color:"#dc2626",background:"#fee2e2",padding:"1px 7px",
                        borderRadius:3,whiteSpace:"nowrap",flexShrink:0,alignSelf:"flex-start"}}>
                        {j.label}: {j.valor}{j.un}
                      </span>
                      <span style={{fontSize:11,color:"#44403c",lineHeight:1.5}}>
                        {j.justificativa}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
          {r.status==="PENDENTE" ? (
            <>
              <button onClick={()=>onValidar(r.id)}
                style={{padding:"7px 13px",background:"#dcfce7",border:"1px solid #86efac",
                  borderRadius:6,color:"#16a34a",fontWeight:700,fontSize:12,cursor:"pointer",
                  whiteSpace:"nowrap"}}>
                ✅ Validar
              </button>
              <button onClick={()=>onRejeitar(r.id)}
                style={{padding:"7px 13px",background:"#fee2e2",border:"1px solid #fca5a5",
                  borderRadius:6,color:"#dc2626",fontWeight:700,fontSize:12,cursor:"pointer",
                  whiteSpace:"nowrap"}}>
                ❌ Rejeitar
              </button>
            </>
          ) : (
            <Badge s={r.status}/>
          )}
        </div>
      </div>
    </div>
  );
}

function TelaVerificacao({ registros, setRegistros, auditoria, setAuditoria, user }) {
  const [filtroTurno,  setFT]  = useState("Todos");
  const [filtroTipo,   setFTipo]= useState("Todos");
  const [filtroDesvio, setFD]  = useState("Todos");
  const [salvos,       setSalvos]= useState("");

  const pendentes = useMemo(()=>registros.filter(r=>{
    if (r.status !== "PENDENTE") return false;
    if (filtroTurno !== "Todos" && r.turno !== filtroTurno) return false;
    if (filtroTipo === "moagem"   && r.tipo !== "moagem")   return false;
    if (filtroTipo === "mais_kpi" && r.tipo !== "mais_kpi") return false;
    if (filtroDesvio === "com_desvio"  && !(r.desvios?.length>0)) return false;
    if (filtroDesvio === "sem_desvio"  &&  (r.desvios?.length>0)) return false;
    return true;
  }),[registros, filtroTurno, filtroTipo, filtroDesvio]);

  const totalPendentes   = registros.filter(r=>r.status==="PENDENTE").length;
  const totalComDesvio   = registros.filter(r=>r.status==="PENDENTE"&&r.desvios?.length>0).length;
  const totalMaisKpi     = registros.filter(r=>r.status==="PENDENTE"&&r.tipo==="mais_kpi").length;

  const handleValidar = (id) => {
    setRegistros(rs=>rs.map(x=>x.id===id?{
      ...x, status:"VALIDADO", validadoPor:user?.nome||"—", dataValidacao:new Date().toISOString()
    }:x));
    if(setAuditoria) registrarAuditoria(setAuditoria,"REGISTRO_VALIDADO",user,{registroId:id});
    setSalvos("Registro validado!");
    setTimeout(()=>setSalvos(""),2500);
  };
  const handleRejeitar = (id) => {
    setRegistros(rs=>rs.map(x=>x.id===id?{
      ...x, status:"REJEITADO", validadoPor:user?.nome||"—", dataValidacao:new Date().toISOString()
    }:x));
    if(setAuditoria) registrarAuditoria(setAuditoria,"REGISTRO_REJEITADO",user,{registroId:id});
    setSalvos("Registro rejeitado.");
    setTimeout(()=>setSalvos(""),2500);
  };
  const validarTodos = () => {
    setRegistros(rs=>rs.map(x=>
      pendentes.find(p=>p.id===x.id)
        ? {...x, status:"VALIDADO", validadoPor:user?.nome||"—", dataValidacao:new Date().toISOString()}
        : x
    ));
    if(setAuditoria) registrarAuditoria(setAuditoria,"REGISTRO_VALIDADO",user,{obs:`${pendentes.length} registros validados em lote`});
    setSalvos(`${pendentes.length} registros validados!`);
    setTimeout(()=>setSalvos(""),3000);
  };

  return (
    <div>
      <PH
        title="✅ Verificação"
        subtitle={`${totalPendentes} registro${totalPendentes!==1?"s":""} aguardando validação`}
        action={
          pendentes.length > 0 ? (
            <button onClick={validarTodos}
              style={{padding:"8px 16px",background:"linear-gradient(135deg,#16a34a,#15803d)",
                color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,
                cursor:"pointer",boxShadow:"0 4px 12px rgba(22,163,74,.25)"}}>
              ✅ Validar todos ({pendentes.length})
            </button>
          ) : null
        }
      />
      <div style={{padding:22}}>

        {/* Feedback de ação */}
        {salvos && (
          <div style={{background:salvos.startsWith("✅")?"#dcfce7":"#fee2e2",
            border:`1px solid ${salvos.startsWith("✅")?"#86efac":"#fca5a5"}`,
            borderRadius:7,padding:"10px 16px",marginBottom:14,
            color:salvos.startsWith("✅")?"#16a34a":"#dc2626",fontWeight:600,fontSize:13}}>
            {salvos}
          </div>
        )}

        {/* Cards de resumo */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Pendentes"    value={totalPendentes}                                    icon="⏳" color="#d97706"/>
          <SC label="Com Desvio"   value={totalComDesvio}                                    icon="⚠" color="#dc2626"/>
          <SC label="+KPIs Pend."  value={totalMaisKpi}                                      icon="⚙" color="#8b5cf6"/>
          <SC label="Validados Hoje" value={registros.filter(r=>r.status==="VALIDADO").length} icon="✅" color="#16a34a"/>
        </div>

        {/* Filtros */}
        <div style={{background:"#fff",borderRadius:9,padding:"12px 16px",
          marginBottom:16,border:"1px solid #e2e8f0",
          display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>

          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Turno</div>
            <div style={{display:"flex",gap:5}}>
              {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
                const tc=TURNOS_CONFIG.find(x=>x.id===t);
                return (
                  <button key={t} onClick={()=>setFT(t)}
                    style={{padding:"4px 10px",borderRadius:14,border:"1.5px solid",
                      borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                      background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                      color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Tipo</div>
            <div style={{display:"flex",gap:5}}>
              {[["Todos","Todos"],["moagem","KPIs Moagem"],["mais_kpi","+KPIs"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFTipo(v)}
                  style={{padding:"4px 10px",borderRadius:14,border:"1.5px solid",
                    borderColor:filtroTipo===v?"#8b5cf6":"#e2e8f0",
                    background:filtroTipo===v?"#f5f3ff":"#fff",
                    color:filtroTipo===v?"#7c3aed":"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Desvios</div>
            <div style={{display:"flex",gap:5}}>
              {[["Todos","Todos"],["com_desvio","⚠ Com Desvio"],["sem_desvio","✅ Sem Desvio"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFD(v)}
                  style={{padding:"4px 10px",borderRadius:14,border:"1.5px solid",
                    borderColor:filtroDesvio===v?"#dc2626":"#e2e8f0",
                    background:filtroDesvio===v?"#fff1f2":"#fff",
                    color:filtroDesvio===v?"#dc2626":"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista */}
        {pendentes.length === 0 ? (
          <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:10,
            padding:32,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:14,fontWeight:700,color:"#16a34a",marginBottom:4}}>
              Tudo validado!
            </div>
            <div style={{fontSize:12,color:"#15803d"}}>
              Nenhum registro pendente para os filtros selecionados
            </div>
          </div>
        ) : (
          <div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10,fontFamily:"monospace"}}>
              {pendentes.length} registro{pendentes.length!==1?"s":""} pendente{pendentes.length!==1?"s":""}
              {filtroTurno!=="Todos"||filtroTipo!=="Todos"||filtroDesvio!=="Todos"
                ? " (filtrado)" : ""}
            </div>
            {pendentes.map(r=>(
              <RegistroItem
                key={r.id}
                r={r}
                user={user}
                onValidar={handleValidar}
                onRejeitar={handleRejeitar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// AÇÕES CORRETIVAS
// ══════════════════════════════════════════════════════════════════
function TelaAcoes({user}) {
  const [acoes,setAcoes]=useState(ACOES_SEED);
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({problema:"",acao:"",afeta:"",responsavel:user.nome});
  return (
    <div>
      <PH title="🚨 Ações Corretivas" subtitle="Registro de desvios e ações operacionais" action={<button onClick={()=>setModal(true)} style={{padding:"8px 14px",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Nova Ação</button>}/>
      <div style={{padding:22}}>
        <div className="grid-2" style={{display:"grid",gap:12,marginBottom:16}}><SC label="Total" value={acoes.length} icon="📋" color="#0ea5e9"/><SC label="Em Aberto" value={acoes.filter(a=>a.status==="ABERTO").length} icon="🔓" color="#dc2626"/></div>
        {acoes.map(a=>(
          <div key={a.id} style={{background:"#fff",borderRadius:9,padding:14,border:"1px solid #e2e8f0",marginBottom:8,borderLeft:`4px solid ${a.status==="CONCLUIDO"?"#16a34a":"#f59e0b"}`,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><span style={{fontFamily:"monospace",fontSize:10,color:"#64748b"}}>{a.data}</span><Badge s={a.status}/></div><p style={{fontWeight:700,color:"#0f172a",fontSize:12,margin:"0 0 4px"}}>🔴 {a.problema}</p><p style={{color:"#475569",fontSize:11,margin:"0 0 3px"}}>✅ {a.acao}</p><p style={{color:"#94a3b8",fontSize:10,margin:0}}>💥 {a.afeta}</p></div>
              <div style={{textAlign:"right",fontSize:10,color:"#64748b",flexShrink:0}}><div>Resp: <b style={{color:"#1e293b"}}>{a.responsavel}</b></div><div>Líder: <b style={{color:"#1e293b"}}>{a.lider}</b></div>{a.status==="ABERTO"&&<button onClick={()=>setAcoes(ac=>ac.map(x=>x.id===a.id?{...x,status:"CONCLUIDO"}:x))} style={{marginTop:6,padding:"2px 8px",background:"#dcfce7",border:"1px solid #86efac",borderRadius:4,color:"#16a34a",fontWeight:700,fontSize:9,cursor:"pointer"}}>Concluir</button>}</div>
            </div>
          </div>
        ))}
      </div>
      {modal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}><div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:420,boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}><h3 style={{fontSize:14,fontWeight:800,margin:"0 0 14px"}}>+ Nova Ação Corretiva</h3>{[["problema","Problema Detectado"],["acao","Ação Tomada"],["afeta","O que Irá Afetar?"]].map(([k,l])=>(<div key={k} style={{marginBottom:9}}><label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>{l}</label><textarea rows={2} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/></div>))}<div style={{display:"flex",gap:8}}><button onClick={()=>{setAcoes(a=>[...a,{id:a.length+1,data:new Date().toISOString().split("T")[0],...form,lider:"Diogo",status:"ABERTO"}]);setModal(false);setForm({problema:"",acao:"",afeta:"",responsavel:user.nome});}} style={{flex:1,padding:10,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 Salvar</button><button onClick={()=>setModal(false)} style={{padding:"10px 13px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:7,cursor:"pointer",fontSize:11}}>Cancelar</button></div></div></div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// RELATÓRIOS — filtros precisos por período, turno, tipo e desvio
// ══════════════════════════════════════════════════════════════════
function TelaRelatorios({ registros, user, metas=METAS_DEFAULT, relatoriosTurno=[], setRelatoriosTurno }) {
  // ── Alertas pendentes (visível para Lider e Supervisor) ────────
  const alertas = useMemo(()=>{
    const lista = [];
    const pendentes = registros.filter(r=>r.status==="PENDENTE");

    // Registros pendentes há mais de 1 hora (simulado por quantidade)
    if(pendentes.length>0){
      lista.push({
        id:"pend", tipo:"VALIDACAO", cor:"#f59e0b", bg:"#fffbeb", borda:"#fde68a",
        icon:"⏳",
        titulo:`${pendentes.length} registro${pendentes.length>1?"s":""}  aguardando validação`,
        desc:`${pendentes.filter(r=>r.desvios?.length>0).length} deles com desvio registrado`,
        acao:"Ver na Verificação",
      });
    }

    // Registros com desvio sem justificativa (desvios vazios)
    const semJust = registros.filter(r=>
      r.desvios?.length>0 &&
      (!r.justificativasArr || r.justificativasArr.length===0)
    );
    if(semJust.length>0){
      lista.push({
        id:"just", tipo:"JUSTIFICATIVA", cor:"#dc2626", bg:"#fff1f2", borda:"#fca5a5",
        icon:"🚫",
        titulo:`${semJust.length} registro${semJust.length>1?"s":""} com desvio sem justificativa`,
        desc:"Registros que saíram do parâmetro sem justificativa preenchida",
        acao:"Ver no Relatório",
      });
    }

    // Boletins do dia sem assinatura (verifica registros de hoje)
    const hoje = new Date().toISOString().split("T")[0];
    const regsHoje = registros.filter(r=>r.data===hoje&&r.tipo==="moagem");
    if(regsHoje.length>0){
      lista.push({
        id:"ass", tipo:"ASSINATURA", cor:"#8b5cf6", bg:"#faf5ff", borda:"#e9d5ff",
        icon:"✍",
        titulo:"Boletim de hoje aguarda assinaturas",
        desc:`${regsHoje.length} registros lançados hoje — Líder, Qualidade e Gerência precisam assinar`,
        acao:"Ver em Assinaturas",
      });
    }

    // Metas alteradas nos últimos 7 dias (simulado)
    lista.push({
      id:"meta", tipo:"META", cor:"#0ea5e9", bg:"#e0f2fe", borda:"#bae6fd",
      icon:"🎯",
      titulo:"Metas KPI estão com valores padrão",
      desc:"Nenhuma meta foi alterada recentemente — confirme se os parâmetros estão corretos",
      acao:"Ver em Cadastros",
    });

    return lista;
  },[registros]);
  // ── Estado dos filtros ─────────────────────────────────────────
  const hoje = new Date();
  const [modoFiltro, setModoFiltro]   = useState("mes");        // "mes" | "periodo" | "dia"
  const [mesSel,     setMesSel]       = useState(String(hoje.getMonth() + 1).padStart(2,"0"));
  const [anoSel,     setAnoSel]       = useState(String(hoje.getFullYear()));
  const [dataIni,    setDataIni]      = useState(hoje.toISOString().split("T")[0]);
  const [dataFim,    setDataFim]      = useState(hoje.toISOString().split("T")[0]);
  const [diaSel,     setDiaSel]       = useState(hoje.toISOString().split("T")[0]);
  const [filtroTurno,setFiltroTurno]  = useState("Todos");
  const [filtroTipo, setFiltroTipo]   = useState("moagem");
  const [filtroStatus,setFiltroStatus]= useState("Todos");
  const [filtroDesvio,setFiltroDesvio]= useState("Todos");      // "Todos" | "com_desvio" | "sem_desvio"
  const [visualizacao,setVisualizacao]= useState("tabela");     // "tabela" | "resumo"
  const [paginaAtual, setPaginaAtual] = useState(1);
  const POR_PAGINA = 20;

  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  // Anos disponíveis a partir dos registros
  const anosDisponiveis = useMemo(()=>{
    const anos = [...new Set(registros.map(r=>r.data?.slice(0,4)).filter(Boolean))].sort().reverse();
    return anos.length ? anos : [String(hoje.getFullYear())];
  },[registros]);

  // ── Filtragem principal ────────────────────────────────────────
  const filtrados = useMemo(()=>{
    return registros.filter(r=>{
      if (!r.data) return false;

      // Filtro de período
      if (modoFiltro === "mes") {
        const [rAno, rMes] = r.data.split("-");
        if (rAno !== anoSel || rMes !== mesSel) return false;
      } else if (modoFiltro === "periodo") {
        if (r.data < dataIni || r.data > dataFim) return false;
      } else if (modoFiltro === "dia") {
        if (r.data !== diaSel) return false;
      }

      // Filtro de turno
      if (filtroTurno !== "Todos" && r.turno !== filtroTurno) return false;

      // Filtro de tipo
      if (filtroTipo === "moagem"   && r.tipo !== "moagem")    return false;
      if (filtroTipo === "mais_kpi" && r.tipo !== "mais_kpi")  return false;

      // Filtro de status
      if (filtroStatus !== "Todos" && r.status !== filtroStatus) return false;

      // Filtro de desvio
      if (filtroDesvio === "com_desvio"  && !(r.desvios?.length > 0)) return false;
      if (filtroDesvio === "sem_desvio"  &&  (r.desvios?.length > 0)) return false;

      return true;
    });
  },[registros, modoFiltro, mesSel, anoSel, dataIni, dataFim, diaSel,
     filtroTurno, filtroTipo, filtroStatus, filtroDesvio]);

  // Reset paginação ao mudar filtros
  const filtradosComPagina = useMemo(()=>{
    setPaginaAtual(1);
    return filtrados;
  },[filtrados]);

  const totalPaginas = Math.ceil(filtradosComPagina.length / POR_PAGINA);
  const paginados    = filtradosComPagina.slice((paginaAtual-1)*POR_PAGINA, paginaAtual*POR_PAGINA);

  // ── Estatísticas do período filtrado ──────────────────────────
  const stats = useMemo(()=>{
    const f = filtrados.filter(r=>r.tipo==="moagem");
    if (!f.length) return null;
    const comDesvio  = f.filter(r=>r.desvios?.length>0).length;
    const validados  = f.filter(r=>r.status==="VALIDADO").length;
    const mediasProt = f.filter(r=>r.ProteinaFarelo).map(r=>r.ProteinaFarelo);
    const mediasUmid = f.filter(r=>r.UmidFarelo).map(r=>r.UmidFarelo);
    const avgProt    = mediasProt.length ? +(mediasProt.reduce((a,b)=>a+b,0)/mediasProt.length).toFixed(2) : null;
    const avgUmid    = mediasUmid.length ? +(mediasUmid.reduce((a,b)=>a+b,0)/mediasUmid.length).toFixed(2) : null;
    const conformidade = f.length ? Math.round(((f.length-comDesvio)/f.length)*100) : 0;

    // Desvios por campo
    const desviosCampo = {};
    f.forEach(r=>r.desvios?.forEach(c=>{
      const lbl = LIMITES_MOAGEM[c]?.label || c;
      desviosCampo[lbl] = (desviosCampo[lbl]||0)+1;
    }));

    return { total:f.length, comDesvio, validados, avgProt, avgUmid, conformidade, desviosCampo };
  },[filtrados]);

  // ── Label do período selecionado ──────────────────────────────
  const labelPeriodo = useMemo(()=>{
    if (modoFiltro==="mes")     return `${MESES[parseInt(mesSel)-1]} / ${anoSel}`;
    if (modoFiltro==="dia")     return `Dia ${diaSel.split("-").reverse().join("/")}`;
    if (dataIni===dataFim)      return `Dia ${dataIni.split("-").reverse().join("/")}`;
    return `${dataIni.split("-").reverse().join("/")} até ${dataFim.split("-").reverse().join("/")}`;
  },[modoFiltro,mesSel,anoSel,diaSel,dataIni,dataFim]);

  // ── Impressão ─────────────────────────────────────────────────
  const handleImprimir = () => {
    const conteudo = filtrados.filter(r=>r.tipo==="moagem").map(r=>`
      ${r.data} | ${r.hora} | ${r.turno} | ${r.operador} | Prot: ${r.ProteinaFarelo??"-"}% | Umid: ${r.UmidFarelo??"-"}% | ${r.status}
      ${r.desvios?.length>0 ? "⚠ Desvios: "+r.desvios.join(", ") : ""}
    `).join("\n");
    const janela = window.open("","_blank");
    janela.document.write(`<pre style="font-family:monospace;font-size:12px;padding:24px">
=== RELATÓRIO KPI MOAGEM — ADM Brasil · SHO ===
Período: ${labelPeriodo}
Gerado em: ${new Date().toLocaleString("pt-BR")}
Total de registros: ${filtrados.length}
${"─".repeat(80)}
${conteudo}
${"─".repeat(80)}
Conformidade: ${stats?.conformidade??0}% | Desvios: ${stats?.comDesvio??0} | Média Proteína: ${stats?.avgProt??"-"}%
    </pre>`);
    janela.document.close();
    janela.print();
  };

  // ── Relatório do Líder — modal de descrição do turno ───────────
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [salvandoRel,    setSalvandoRel]    = useState(false);
  const [erroRel,        setErroRel]        = useState("");
  const turnoAtualRel = detectarTurno();
  const podeRelatar   = user.perfil==="Lider" || user.perfil==="Supervisor";
  const [formRel, setFormRel] = useState({
    data: hoje.toISOString().split("T")[0],
    turno: turnoAtualRel,
    descricao: "",
    puxouHexano: false,
    qtdHexano: "",
  });

  const abrirModalRelatorio = () => {
    setFormRel({
      data: new Date().toISOString().split("T")[0],
      turno: detectarTurno(),
      descricao: "",
      puxouHexano: false,
      qtdHexano: "",
    });
    setErroRel("");
    setModalRelatorio(true);
  };

  const salvarRelatorioTurno = async () => {
    if (!formRel.descricao.trim()) {
      setErroRel("Descreva o que ocorreu no turno antes de salvar.");
      return;
    }
    if (formRel.puxouHexano && (!formRel.qtdHexano || parseFloat(formRel.qtdHexano) <= 0)) {
      setErroRel("Informe a quantidade de hexano puxada.");
      return;
    }
    setSalvandoRel(true);
    setErroRel("");
    try {
      const novo = await criarRelatorioTurno({
        ...formRel,
        qtdHexano: formRel.puxouHexano ? parseFloat(formRel.qtdHexano) : null,
        autor: user.nome,
        perfil: user.perfil,
      });
      if (setRelatoriosTurno) setRelatoriosTurno(prev => [novo, ...prev]);
      setModalRelatorio(false);
    } catch (e) {
      setErroRel("Erro ao salvar: " + (e.message || e));
    } finally {
      setSalvandoRel(false);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div>
      <PH title="📄 Relatórios" subtitle={`${filtrados.length} registro${filtrados.length!==1?"s":""} · ${labelPeriodo}`}
        action={
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {podeRelatar && (
              <button onClick={abrirModalRelatorio}
                style={{padding:"8px 14px",background:"linear-gradient(135deg,#f59e0b,#d97706)",
                  border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",color:"#fff",
                  boxShadow:"0 4px 12px rgba(245,158,11,.25)",whiteSpace:"nowrap"}}>
                📝 Relatório do Líder
              </button>
            )}
            <button onClick={()=>gerarRelatorioMensal(
                registros, mesSel, anoSel, metas, user
              )}
              style={{padding:"8px 14px",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",
                border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",color:"#fff",
                boxShadow:"0 4px 12px rgba(139,92,246,.25)"}}>
              📋 Relatório Mensal
            </button>
            <button onClick={()=>exportarExcel(filtrados, labelPeriodo)}
              style={{padding:"8px 14px",background:"linear-gradient(135deg,#16a34a,#15803d)",
                border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",color:"#fff",
                boxShadow:"0 4px 12px rgba(22,163,74,.25)"}}>
              📊 Exportar Excel
            </button>
            <button onClick={handleImprimir}
              style={{padding:"8px 14px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",color:"#fff",
                boxShadow:"0 4px 12px rgba(14,165,233,.25)"}}>
              Imprimir PDF
            </button>
          </div>
        }/>

      <div style={{padding:22}}>

        {/* ── PAINEL DE ALERTAS — visível para Lider e Supervisor ── */}
        {alertas.length > 0 && (
          <div style={{marginBottom:20}}>
            {/* Header do painel */}
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
              <div style={{width:28,height:28,background:"linear-gradient(135deg,#dc2626,#b91c1c)",
                borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                🔔
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>
                  Alertas Pendentes
                </div>
                <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                  {alertas.length} item{alertas.length>1?"s":""}  requer{alertas.length===1?"":"em"} atenção
                </div>
              </div>
              <span style={{
                marginLeft:"auto",
                background:"#dc2626",color:"#fff",
                fontSize:11,fontWeight:800,fontFamily:"monospace",
                padding:"2px 10px",borderRadius:10,
              }}>
                {alertas.length}
              </span>
            </div>

            {/* Cards de alerta */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {alertas.map(a=>(
                <div key={a.id} style={{
                  display:"flex",alignItems:"flex-start",gap:14,
                  background:a.bg,
                  border:`1px solid ${a.borda}`,
                  borderLeft:`4px solid ${a.cor}`,
                  borderRadius:9,
                  padding:"12px 16px",
                }}>
                  {/* Ícone */}
                  <div style={{
                    width:36,height:36,flexShrink:0,
                    background:"rgba(255,255,255,.7)",
                    border:`1px solid ${a.borda}`,
                    borderRadius:8,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:18,
                  }}>
                    {a.icon}
                  </div>

                  {/* Texto */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,fontWeight:700,color:a.cor}}>
                        {a.titulo}
                      </span>
                      <span style={{
                        fontSize:9,fontFamily:"monospace",fontWeight:700,
                        background:a.cor,color:"#fff",
                        padding:"1px 7px",borderRadius:3,
                        letterSpacing:.5,
                      }}>
                        {a.tipo}
                      </span>
                    </div>
                    <div style={{fontSize:11,color:"#475569",lineHeight:1.5}}>
                      {a.desc}
                    </div>
                  </div>

                  {/* Botão de ação */}
                  <button style={{
                    flexShrink:0,
                    padding:"6px 14px",
                    background:"rgba(255,255,255,.8)",
                    border:`1px solid ${a.borda}`,
                    borderRadius:6,
                    fontSize:11,fontWeight:700,
                    color:a.cor,cursor:"pointer",
                    whiteSpace:"nowrap",
                  }}>
                    {a.acao} →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RELATÓRIOS DO LÍDER REGISTRADOS ── */}
        {relatoriosTurno.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              📝 Relatórios do Líder
              <span style={{fontSize:10,background:"#fef3c7",color:"#d97706",padding:"2px 9px",
                borderRadius:10,fontFamily:"monospace",fontWeight:700}}>
                {relatoriosTurno.length}
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {relatoriosTurno.slice(0,5).map(r=>{
                const tc = TURNOS_CONFIG.find(t=>t.id===r.turno);
                return (
                  <div key={r.id} style={{background:"#fff",border:"1px solid #e2e8f0",
                    borderRadius:9,padding:"12px 16px",borderLeft:"4px solid #f59e0b"}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",gap:10,marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
                          {new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}
                        </span>
                        {tc && (
                          <span style={{fontSize:9,background:tc.bg,color:tc.cor,
                            padding:"2px 7px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
                            {r.turno}
                          </span>
                        )}
                        {r.puxouHexano && (
                          <span style={{fontSize:9,background:"#e0f2fe",color:"#0284c7",
                            padding:"2px 7px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
                            ⛽ Hexano: {r.qtdHexano}L
                          </span>
                        )}
                      </div>
                      <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        {r.autor}
                      </span>
                    </div>
                    <div style={{fontSize:12,color:"#475569",lineHeight:1.5}}>
                      {r.descricao}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PAINEL DE FILTROS ── */}
        <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid #e2e8f0",
          boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>

          <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:14,
            display:"flex",alignItems:"center",gap:8}}>
            🎯 Filtros do Relatório
            {filtrados.length>0&&(
              <span style={{fontSize:10,background:"#e0f2fe",color:"#0284c7",padding:"2px 9px",
                borderRadius:10,fontFamily:"monospace",fontWeight:700}}>
                {filtrados.length} reg. encontrados
              </span>
            )}
          </div>

          {/* Modo de filtro de data */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:8}}>Período</div>
            <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:4,borderRadius:8,
              width:"fit-content",marginBottom:12}}>
              {[["mes","📅 Por Mês"],["dia","📆 Dia Específico"],["periodo","📊 Intervalo"]].map(([v,l])=>(
                <button key={v} onClick={()=>setModoFiltro(v)}
                  style={{padding:"6px 14px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,
                    cursor:"pointer",
                    background:modoFiltro===v?"#fff":"transparent",
                    color:modoFiltro===v?"#0f172a":"#64748b",
                    boxShadow:modoFiltro===v?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Filtro por Mês/Ano */}
            {modoFiltro==="mes" && (
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Mês
                  </label>
                  <select value={mesSel} onChange={e=>{setMesSel(e.target.value);setPaginaAtual(1);}}
                    style={{padding:"8px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                      fontSize:13,fontWeight:600,background:"#fff",cursor:"pointer",minWidth:160}}>
                    {MESES.map((m,i)=>(
                      <option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Ano
                  </label>
                  <select value={anoSel} onChange={e=>{setAnoSel(e.target.value);setPaginaAtual(1);}}
                    style={{padding:"8px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                      fontSize:13,fontWeight:600,background:"#fff",cursor:"pointer"}}>
                    {anosDisponiveis.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div style={{marginTop:16,padding:"8px 14px",background:"#f0f9ff",
                  border:"1px solid #bae6fd",borderRadius:7,fontSize:12,color:"#0284c7",fontWeight:600}}>
                  📅 {labelPeriodo}
                </div>
              </div>
            )}

            {/* Filtro por Dia */}
            {modoFiltro==="dia" && (
              <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Data
                  </label>
                  <input type="date" value={diaSel}
                    onChange={e=>{setDiaSel(e.target.value);setPaginaAtual(1);}}
                    style={{padding:"8px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                      fontSize:13,fontFamily:"monospace",fontWeight:600,cursor:"pointer"}}/>
                </div>
                <div style={{padding:"8px 14px",background:"#f0f9ff",border:"1px solid #bae6fd",
                  borderRadius:7,fontSize:12,color:"#0284c7",fontWeight:600}}>
                  📆 {labelPeriodo}
                </div>
              </div>
            )}

            {/* Filtro por Intervalo */}
            {modoFiltro==="periodo" && (
              <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Data Inicial
                  </label>
                  <input type="date" value={dataIni}
                    onChange={e=>{setDataIni(e.target.value);setPaginaAtual(1);}}
                    style={{padding:"8px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                      fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",fontWeight:600,paddingBottom:8}}>até</div>
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Data Final
                  </label>
                  <input type="date" value={dataFim} min={dataIni}
                    onChange={e=>{setDataFim(e.target.value);setPaginaAtual(1);}}
                    style={{padding:"8px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                      fontSize:13,fontFamily:"monospace",fontWeight:600}}/>
                </div>
                {dataIni && dataFim && (
                  <div style={{padding:"8px 14px",background:"#f0f9ff",border:"1px solid #bae6fd",
                    borderRadius:7,fontSize:12,color:"#0284c7",fontWeight:600}}>
                    📊 {labelPeriodo}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divisor */}
          <div style={{height:1,background:"#f1f5f9",margin:"14px 0"}}/>

          {/* Filtros secundários */}
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>

            {/* Turno */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>Turno</div>
              <div style={{display:"flex",gap:5}}>
                {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
                  const tc=TURNOS_CONFIG.find(x=>x.id===t);
                  return (
                    <button key={t} onClick={()=>{setFiltroTurno(t);setPaginaAtual(1);}}
                      style={{padding:"5px 11px",borderRadius:14,border:"1.5px solid",
                        borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                        background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                        color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                        fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tipo */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>Tipo</div>
              <div style={{display:"flex",gap:5}}>
                {[["Todos","Todos","#64748b"],["moagem","KPIs Moagem","#8b5cf6"],["mais_kpi","+KPIs","#f97316"]].map(([v,l,cor])=>(
                  <button key={v} onClick={()=>{setFiltroTipo(v);setPaginaAtual(1);}}
                    style={{padding:"5px 11px",borderRadius:14,border:"1.5px solid",
                      borderColor:filtroTipo===v?cor:"#e2e8f0",
                      background:filtroTipo===v?cor+"18":"#fff",
                      color:filtroTipo===v?cor:"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Desvio */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>Desvios</div>
              <div style={{display:"flex",gap:5}}>
                {[["Todos","Todos","#64748b"],["com_desvio","⚠ Com Desvio","#dc2626"],["sem_desvio","✅ Sem Desvio","#16a34a"]].map(([v,l,cor])=>(
                  <button key={v} onClick={()=>{setFiltroDesvio(v);setPaginaAtual(1);}}
                    style={{padding:"5px 11px",borderRadius:14,border:"1.5px solid",
                      borderColor:filtroDesvio===v?cor:"#e2e8f0",
                      background:filtroDesvio===v?cor+"15":"#fff",
                      color:filtroDesvio===v?cor:"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>Status</div>
              <div style={{display:"flex",gap:5}}>
                {[["Todos","Todos"],["PENDENTE","Pendente"],["VALIDADO","Validado"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setFiltroStatus(v);setPaginaAtual(1);}}
                    style={{padding:"5px 11px",borderRadius:14,border:"1.5px solid",
                      borderColor:filtroStatus===v?"#8b5cf6":"#e2e8f0",
                      background:filtroStatus===v?"#f5f3ff":"#fff",
                      color:filtroStatus===v?"#7c3aed":"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── CARDS DE RESUMO DO PERÍODO ── */}
        {stats && (
          <div className="grid-5" style={{display:"grid",gap:10,marginBottom:18}}>
            {[
              ["Total Registros", stats.total,          "📋","#0ea5e9"],
              ["Com Desvio",      stats.comDesvio,      "⚠","#dc2626"],
              ["Conformidade",    `${stats.conformidade}%`,"✅","#16a34a"],
              ["⌀ Proteína",     stats.avgProt?`${stats.avgProt}%`:"—","🔬",
                stats.avgProt ? chk("ProteinaFarelo",stats.avgProt)==="ok"?"#16a34a":"#dc2626" : "#64748b"],
              ["⌀ Umid. Farelo", stats.avgUmid?`${stats.avgUmid}%`:"—","💧",
                stats.avgUmid ? chk("UmidFarelo",stats.avgUmid)==="ok"?"#16a34a":"#dc2626" : "#64748b"],
            ].map(([l,v,ic,c])=>(
              <div key={l} style={{background:"#fff",borderRadius:10,padding:"13px 15px",
                border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                    letterSpacing:.5}}>{l}</span>
                  <span style={{fontSize:14}}>{ic}</span>
                </div>
                <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"monospace"}}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── DESVIOS POR CAMPO (quando filtro de desvio ativo) ── */}
        {stats && Object.keys(stats.desviosCampo).length > 0 && (
          <div style={{background:"#fff",borderRadius:10,padding:16,border:"1px solid #e2e8f0",
            marginBottom:16,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12}}>
              ⚠ Desvios por campo — {labelPeriodo}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {Object.entries(stats.desviosCampo)
                .sort((a,b)=>b[1]-a[1])
                .map(([campo,qtd])=>{
                  const pct = Math.round((qtd/stats.comDesvio)*100);
                  return (
                    <div key={campo} style={{display:"flex",alignItems:"center",gap:10,
                      background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:8,
                      padding:"8px 12px",minWidth:180}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#dc2626",marginBottom:4}}>{campo}</div>
                        <div style={{background:"#fecdd3",borderRadius:3,height:5,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:"#dc2626",borderRadius:3}}/>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#dc2626",fontFamily:"monospace"}}>{qtd}</div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>{pct}%</div>
                      </div>
                    </div>
                  );
              })}
            </div>
          </div>
        )}

        {/* ── ALTERNÂNCIA TABELA / RESUMO ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:12,color:"#64748b"}}>
            {filtrados.length === 0
              ? "Nenhum registro encontrado"
              : `${filtrados.length} registro${filtrados.length!==1?"s":" "} · Página ${paginaAtual} de ${totalPaginas||1}`}
          </div>
          <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:3,borderRadius:7}}>
            {[["tabela","📋 Tabela"],["resumo","📊 Por Dia"]].map(([v,l])=>(
              <button key={v} onClick={()=>setVisualizacao(v)}
                style={{padding:"5px 12px",borderRadius:5,border:"none",fontSize:11,fontWeight:600,
                  cursor:"pointer",background:visualizacao===v?"#fff":"transparent",
                  color:visualizacao===v?"#0f172a":"#64748b",
                  boxShadow:visualizacao===v?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:44,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:36,marginBottom:12}}>🔍</div>
            <div style={{fontSize:14,fontWeight:600,color:"#64748b",marginBottom:6}}>
              Nenhum registro encontrado
            </div>
            <div style={{fontSize:12}}>Tente ajustar os filtros de período ou tipo</div>
          </div>
        ) : visualizacao==="tabela" ? (
          <>
            {/* ── TABELA ── */}
            <div style={{background:"#fff",borderRadius:10,overflow:"hidden",
              border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
              <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#0f172a"}}>
                    {["Data","Hora","Turno","Operador","Tipo","Proteína","Umid. Farelo","Óleo","Status","Desvios"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:9,color:"#94a3b8",
                        fontWeight:600,textTransform:"uppercase",letterSpacing:.5,
                        borderBottom:"1px solid #1e293b",fontFamily:"monospace",whiteSpace:"nowrap"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((r,ri)=>{
                    const ps  = chk("ProteinaFarelo",r.ProteinaFarelo);
                    const us  = chk("UmidFarelo",r.UmidFarelo);
                    const os  = chk("OleoFarelo",r.OleoFarelo);
                    const tc  = TURNOS_CONFIG.find(t=>t.id===r.turno);
                    const td  = r.desvios?.length > 0;
                    return (
                      <tr key={r.id} style={{
                        borderBottom:"1px solid #f1f5f9",
                        background: td ? "#fff7f7" : ri%2===0 ? "#ffffff" : "#fafafa",
                      }}>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:11,
                          color:"#64748b",whiteSpace:"nowrap"}}>{r.data}</td>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                          color:"#0f172a",whiteSpace:"nowrap"}}>{r.hora}</td>
                        <td style={{padding:"8px 12px"}}>
                          {tc && (
                            <span style={{fontSize:9,background:tc.bg,color:tc.cor,padding:"2px 6px",
                              borderRadius:3,fontFamily:"monospace",fontWeight:700,
                              border:`1px solid ${tc.cor}30`,whiteSpace:"nowrap"}}>
                              {r.turno}
                            </span>
                          )}
                        </td>
                        <td style={{padding:"8px 12px",color:"#1e293b",whiteSpace:"nowrap"}}>
                          {r.operador?.split(" ")[0]}
                        </td>
                        <td style={{padding:"8px 12px"}}>
                          <span style={{fontSize:9,
                            background:r.tipo==="mais_kpi"?"#fff7ed":"#f5f3ff",
                            color:r.tipo==="mais_kpi"?"#c2410c":"#7c3aed",
                            padding:"2px 6px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                            {r.tipo==="mais_kpi"?"+KPIs":"Moagem"}
                          </span>
                        </td>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                          color:COR[ps].t,whiteSpace:"nowrap"}}>
                          {r.ProteinaFarelo ? `${r.ProteinaFarelo}%` : "—"}
                        </td>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                          color:COR[us].t,whiteSpace:"nowrap"}}>
                          {r.UmidFarelo ? `${r.UmidFarelo}%` : "—"}
                        </td>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,
                          color:COR[os].t,whiteSpace:"nowrap"}}>
                          {r.OleoFarelo ? `${r.OleoFarelo}%` : "—"}
                        </td>
                        <td style={{padding:"8px 12px"}}>
                          <Badge s={r.status}/>
                        </td>
                        <td style={{padding:"8px 12px"}}>
                          {td ? (
                            <span style={{fontSize:10,background:"#fee2e2",color:"#dc2626",
                              padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700,
                              whiteSpace:"nowrap"}}>
                              ⚠ {r.desvios.length}
                            </span>
                          ) : (
                            <span style={{fontSize:10,color:"#86efac",fontFamily:"monospace"}}>✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",
                gap:6,marginTop:14}}>
                <button onClick={()=>setPaginaAtual(p=>Math.max(1,p-1))} disabled={paginaAtual===1}
                  style={{padding:"6px 12px",borderRadius:6,border:"1px solid #e2e8f0",
                    background:paginaAtual===1?"#f1f5f9":"#fff",color:paginaAtual===1?"#cbd5e1":"#475569",
                    fontSize:12,cursor:paginaAtual===1?"not-allowed":"pointer",fontWeight:600}}>
                  ← Anterior
                </button>
                {Array.from({length:Math.min(totalPaginas,7)},(_,i)=>{
                  let pg = i+1;
                  if(totalPaginas>7){
                    if(paginaAtual<=4) pg=i+1;
                    else if(paginaAtual>=totalPaginas-3) pg=totalPaginas-6+i;
                    else pg=paginaAtual-3+i;
                  }
                  return (
                    <button key={pg} onClick={()=>setPaginaAtual(pg)}
                      style={{width:32,height:32,borderRadius:6,border:"1px solid",
                        borderColor:paginaAtual===pg?"#0ea5e9":"#e2e8f0",
                        background:paginaAtual===pg?"#0ea5e9":"#fff",
                        color:paginaAtual===pg?"#fff":"#475569",
                        fontSize:12,cursor:"pointer",fontWeight:600}}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={()=>setPaginaAtual(p=>Math.min(totalPaginas,p+1))}
                  disabled={paginaAtual===totalPaginas}
                  style={{padding:"6px 12px",borderRadius:6,border:"1px solid #e2e8f0",
                    background:paginaAtual===totalPaginas?"#f1f5f9":"#fff",
                    color:paginaAtual===totalPaginas?"#cbd5e1":"#475569",
                    fontSize:12,cursor:paginaAtual===totalPaginas?"not-allowed":"pointer",fontWeight:600}}>
                  Próximo →
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── VISÃO POR DIA ── */
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[...new Set(filtrados.map(r=>r.data))].sort().reverse().map(data=>{
              const regsdia  = filtrados.filter(r=>r.data===data);
              const comDev   = regsdia.filter(r=>r.desvios?.length>0).length;
              const avgProt  = regsdia.filter(r=>r.ProteinaFarelo).length
                ? +(regsdia.filter(r=>r.ProteinaFarelo).reduce((a,r)=>a+r.ProteinaFarelo,0)
                    / regsdia.filter(r=>r.ProteinaFarelo).length).toFixed(2)
                : null;
              const psCor    = avgProt ? chk("ProteinaFarelo",avgProt)==="ok"?"#16a34a":"#dc2626" : "#94a3b8";
              const [dd,mm,aa] = data.split("-").reverse();
              return (
                <div key={data} style={{background:"#fff",borderRadius:10,padding:16,
                  border:`1px solid ${comDev>0?"#fca5a5":"#e2e8f0"}`,
                  borderLeft:`4px solid ${comDev>0?"#dc2626":"#16a34a"}`,
                  boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:800,color:"#0f172a",fontFamily:"monospace"}}>
                          {dd}/{mm}/{aa}
                        </div>
                        <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace",marginTop:1}}>
                          {regsdia.length} registros · {comDev} desvio{comDev!==1?"s":""}
                        </div>
                      </div>
                      {avgProt && (
                        <div style={{background:psCor+"12",border:`1px solid ${psCor}30`,
                          borderRadius:7,padding:"6px 12px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:"#64748b",fontFamily:"monospace",marginBottom:2}}>
                            ⌀ Proteína
                          </div>
                          <div style={{fontSize:16,fontWeight:800,color:psCor,fontFamily:"monospace"}}>
                            {avgProt}%
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {TURNOS_CONFIG.map(tc=>{
                        const n=regsdia.filter(r=>r.turno===tc.id).length;
                        return n>0 ? (
                          <span key={tc.id} style={{fontSize:10,background:tc.bg,color:tc.cor,
                            padding:"3px 9px",borderRadius:5,fontFamily:"monospace",fontWeight:700,
                            border:`1px solid ${tc.cor}30`}}>
                            {tc.id}: {n}
                          </span>
                        ) : null;
                      })}
                      {comDev>0 && (
                        <span style={{fontSize:10,background:"#fee2e2",color:"#dc2626",
                          padding:"3px 9px",borderRadius:5,fontFamily:"monospace",fontWeight:700}}>
                          ⚠ {comDev} desvio{comDev!==1?"s":""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Relatório do Líder */}
      {modalRelatorio && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:480,
            maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 16px",color:"#0f172a"}}>
              📝 Relatório do Líder — Descrição do Turno
            </h3>

            <div className="grid-2" style={{display:"grid",gap:10,marginBottom:14}}>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Data
                </label>
                <input type="date" value={formRel.data}
                  onChange={e=>setFormRel(f=>({...f,data:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Turno
                </label>
                <select value={formRel.turno}
                  onChange={e=>setFormRel(f=>({...f,turno:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {TURNOS_CONFIG.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Descrição do turno *
              </label>
              <textarea rows={5} value={formRel.descricao}
                onChange={e=>setFormRel(f=>({...f,descricao:e.target.value}))}
                placeholder="Descreva como foi o turno: produção, intercorrências, observações gerais..."
                style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>

            {/* Pergunta Puxou Hexano? */}
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:9,
              padding:14,marginBottom:14}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:8}}>
                Puxou Hexano?
              </label>
              <div style={{display:"flex",gap:8,marginBottom:formRel.puxouHexano?12:0}}>
                <button
                  onClick={()=>setFormRel(f=>({...f,puxouHexano:true}))}
                  style={{flex:1,padding:"9px 0",borderRadius:7,border:"1.5px solid",
                    borderColor:formRel.puxouHexano?"#16a34a":"#e2e8f0",
                    background:formRel.puxouHexano?"#f0fdf4":"#fff",
                    color:formRel.puxouHexano?"#16a34a":"#64748b",
                    fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  ✓ Sim
                </button>
                <button
                  onClick={()=>setFormRel(f=>({...f,puxouHexano:false,qtdHexano:""}))}
                  style={{flex:1,padding:"9px 0",borderRadius:7,border:"1.5px solid",
                    borderColor:!formRel.puxouHexano?"#dc2626":"#e2e8f0",
                    background:!formRel.puxouHexano?"#fff1f2":"#fff",
                    color:!formRel.puxouHexano?"#dc2626":"#64748b",
                    fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  ✕ Não
                </button>
              </div>

              {formRel.puxouHexano && (
                <div>
                  <label style={{display:"block",fontSize:9,fontWeight:700,color:"#16a34a",
                    textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                    Quantidade de Hexano (litros) *
                  </label>
                  <input type="number" step="0.1" min="0" value={formRel.qtdHexano}
                    onChange={e=>setFormRel(f=>({...f,qtdHexano:e.target.value}))}
                    placeholder="Ex: 120"
                    style={{width:"100%",padding:"9px 11px",borderRadius:7,
                      border:"1.5px solid #86efac",fontSize:13,fontFamily:"monospace",
                      fontWeight:700,boxSizing:"border-box",background:"#fff"}}/>
                </div>
              )}
              {!formRel.puxouHexano && (
                <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                  Campo de quantidade desabilitado — selecione "Sim" para informar
                </div>
              )}
            </div>

            {erroRel && (
              <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:6,
                padding:"8px 12px",color:"#dc2626",fontSize:12,marginBottom:12}}>
                {erroRel}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={salvarRelatorioTurno} disabled={salvandoRel}
                style={{flex:1,padding:11,
                  background:salvandoRel?"#94a3b8":"linear-gradient(135deg,#f59e0b,#d97706)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:salvandoRel?"wait":"pointer"}}>
                {salvandoRel?"Salvando...":"💾 Salvar Relatório"}
              </button>
              <button onClick={()=>setModalRelatorio(false)}
                style={{padding:"11px 16px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CADASTROS + EDITOR DE METAS KPI
// ══════════════════════════════════════════════════════════════════
function TelaCadastros({ user, metas=METAS_DEFAULT, setMetas, auditoria, setAuditoria, usuarios, setUsuarios }) {
  const [aba,        setAba]        = useState("metas_kpi");
  const [carregandoU,setCarregandoU]= useState(true);
  const [modal,      setModal]      = useState(false);
  const [editando,   setEditando]   = useState(null); // null = novo, id = editando
  const [uForm,      setUForm]      = useState({nome:"",email:"",perfil:"Operador",turno:"NOITE",senha:"1234"});
  const [confirmaId, setConfirmaId] = useState(null); // id para confirmar desativação

  // ── Carrega usuários reais do Supabase ──────────────────────────
  const carregarUsuarios = async () => {
    try { setUsuarios(await listarUsuarios()); }
    catch(e){ console.error("Erro ao carregar usuários:", e); }
    finally { setCarregandoU(false); }
  };
  useEffect(()=>{ carregarUsuarios(); },[]);

  // ── Metas ──────────────────────────────────────────────────────
  const [editMetas, setEditMetas] = useState(()=>
    Object.fromEntries(Object.entries(metas).map(([k,m])=>[k,{min:m.min??"",max:m.max??""}]))
  );
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg,   setErrMsg]   = useState({});
  const podeLider = user.perfil==="Lider"||user.perfil==="Supervisor";

  const validar=()=>{
    const erros={};
    Object.entries(editMetas).forEach(([k,v])=>{
      const mn=v.min!==""?parseFloat(v.min):null;
      const mx=v.max!==""?parseFloat(v.max):null;
      if(mn!==null&&mx!==null&&mn>=mx) erros[k]="Mín deve ser menor que Máx";
      if(v.min!==""&&isNaN(parseFloat(v.min))) erros[k]="Valor inválido";
      if(v.max!==""&&isNaN(parseFloat(v.max))) erros[k]="Valor inválido";
    });
    return erros;
  };
  const salvarMetas=()=>{
    const erros=validar();
    if(Object.keys(erros).length){setErrMsg(erros);return;}
    setErrMsg({});
    setMetas(prev=>{
      const novo={...prev};
      Object.entries(editMetas).forEach(([k,v])=>{
        const novoMin=v.min!==""?parseFloat(v.min):null;
        const novoMax=v.max!==""?parseFloat(v.max):null;
        if(setAuditoria&&(novoMin!==prev[k].min||novoMax!==prev[k].max)){
          registrarAuditoria(setAuditoria,"META_ALTERADA",user,{
            campo:k,
            de:`min:${prev[k].min??"-"} max:${prev[k].max??"-"}`,
            para:`min:${novoMin??"-"} max:${novoMax??"-"}`,
          });
        }
        novo[k]={...prev[k],min:novoMin,max:novoMax};
      });
      return novo;
    });
    setSavedMsg("Metas atualizadas com sucesso!");
    setTimeout(()=>setSavedMsg(""),3000);
  };
  const resetarMeta=(k)=>{
    const def=METAS_DEFAULT[k];
    setEditMetas(e=>({...e,[k]:{min:def.min??"",max:def.max??""}}));
    setErrMsg(er=>({...er,[k]:undefined}));
  };
  const resetarTudo=()=>{
    setEditMetas(Object.fromEntries(Object.entries(METAS_DEFAULT).map(([k,m])=>[k,{min:m.min??"",max:m.max??""}])));
    setErrMsg({});
  };
  const alterados=Object.keys(metas).filter(k=>{
    const def=METAS_DEFAULT[k];
    return metas[k].min!==def.min||metas[k].max!==def.max;
  });

  // ── Usuários — agora gravando direto no Supabase ────────────────
  const abrirNovo=()=>{
    setEditando(null);
    setUForm({nome:"",email:"",perfil:"Operador",turno:"NOITE",senha:"1234"});
    setModal(true);
  };
  const abrirEditar=(u)=>{
    setEditando(u.id);
    setUForm({nome:u.nome,email:u.email,perfil:u.perfil,turno:u.turno,senha:u.senha});
    setModal(true);
  };
  const salvarUsuario=async()=>{
    if(!uForm.nome||!uForm.email)return;
    try {
      if(editando){
        await editarUsuario(editando, uForm);
      } else {
        await criarUsuario(uForm);
      }
      await carregarUsuarios();
    } catch(e) {
      alert("Erro ao salvar usuário: " + (e.message || e));
      return;
    }
    setModal(false);
    setUForm({nome:"",email:"",perfil:"Operador",turno:"NOITE",senha:"1234"});
    setEditando(null);
  };
  const alternarAtivo=async(id)=>{
    const u=usuarios.find(x=>x.id===id);
    const novoAtivo=u?.ativo===false;
    try {
      await editarUsuario(id, { ativo: novoAtivo });
      await carregarUsuarios();
    } catch(e) {
      alert("Erro ao atualizar usuário: " + (e.message || e));
      return;
    }
    if(setAuditoria) registrarAuditoria(
      setAuditoria,
      novoAtivo?"USUARIO_REATIVADO":"USUARIO_DESATIVADO",
      user,
      {nome:u?.nome, perfil:u?.perfil}
    );
    setConfirmaId(null);
  };

  const PERFIL_COR={
    Operador:  {bg:"#fffbeb",c:"#d97706",b:"#fde68a"},
    Lider:     {bg:"#dbeafe",c:"#1d4ed8",b:"#bfdbfe"},
    Supervisor:{bg:"#dcfce7",c:"#16a34a",b:"#86efac"},
  };

  return (
    <div>
      <PH title="🗂 Cadastros" subtitle="Metas KPI, usuários e configurações"/>
      <div style={{padding:22}}>
        {/* Tabs */}
        <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:4,borderRadius:9,
          width:"fit-content",marginBottom:20}}>
          {[["metas_kpi","🎯 Metas KPI"],["usuarios","👤 Usuários"],["kpis_ref","📋 Referência"]].map(([id,l])=>(
            <button key={id} onClick={()=>setAba(id)}
              style={{padding:"7px 14px",borderRadius:6,border:"none",fontSize:12,fontWeight:600,
                cursor:"pointer",background:aba===id?"#fff":"transparent",
                color:aba===id?"#0f172a":"#64748b",
                boxShadow:aba===id?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
              {l}
            </button>
          ))}
        </div>

        {/* ── ABA METAS KPI ── */}
        {aba==="metas_kpi" && (
          <div>
            {!podeLider && (
              <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,
                padding:"11px 14px",marginBottom:16,display:"flex",gap:9,alignItems:"center"}}>
                <span style={{fontSize:16}}>🔒</span>
                <div style={{fontSize:12,color:"#dc2626",fontWeight:600}}>
                  Apenas Líderes e Supervisores podem alterar as metas.
                </div>
              </div>
            )}
            {savedMsg && (
              <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:7,
                padding:"10px 14px",marginBottom:14,color:"#16a34a",fontWeight:600,fontSize:13}}>
                {savedMsg}
              </div>
            )}
            {alterados.length>0 && (
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,
                padding:"10px 14px",marginBottom:14,display:"flex",gap:9,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:15}}>⚠</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#c2410c",marginBottom:3}}>
                    Metas alteradas — diferentes do padrão
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {alterados.map(k=>(
                      <span key={k} style={{fontSize:10,background:"#fed7aa",color:"#c2410c",
                        padding:"2px 8px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                        {metas[k].label}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={resetarTudo}
                  style={{padding:"7px 12px",background:"#fff",border:"1px solid #fed7aa",
                    borderRadius:6,fontSize:11,fontWeight:700,color:"#c2410c",cursor:"pointer"}}>
                  ↺ Resetar tudo
                </button>
              </div>
            )}
            <div className="grid-2" style={{display:"grid",gap:14,marginBottom:20}}>
              {Object.entries(metas).map(([k,m])=>{
                const def=METAS_DEFAULT[k];
                const foiAlt=m.min!==def.min||m.max!==def.max;
                const edt=editMetas[k]||{min:"",max:""};
                const err=errMsg[k];
                return (
                  <div key={k} style={{background:"#fff",borderRadius:10,
                    border:`1.5px solid ${err?"#fca5a5":foiAlt?"#fbbf24":"#e2e8f0"}`,
                    overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
                    <div style={{background:err?"#fff1f2":foiAlt?"#fffbeb":"linear-gradient(135deg,#1e293b,#334155)",
                      padding:"9px 13px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {foiAlt&&<span style={{fontSize:12}}>⚠</span>}
                        <span style={{fontWeight:800,fontSize:12,color:foiAlt||err?"#92400e":"#f1f5f9",fontFamily:"monospace"}}>
                          {m.label}
                        </span>
                        {foiAlt&&<span style={{fontSize:9,background:"#fde68a",color:"#92400e",
                          padding:"1px 7px",borderRadius:2,fontFamily:"monospace",fontWeight:700}}>
                          ALTERADA
                        </span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:10,color:foiAlt||err?"#92400e":"#64748b",fontFamily:"monospace"}}>
                          {m.un||"—"}
                        </span>
                        {foiAlt&&(
                          <button onClick={()=>resetarMeta(k)}
                            style={{padding:"2px 7px",background:"rgba(255,255,255,.7)",border:"none",
                              borderRadius:3,fontSize:10,cursor:"pointer",color:"#92400e",fontWeight:700}}>
                            ↺
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{padding:12}}>
                      <div className="grid-2" style={{display:"grid",gap:10,marginBottom:8}}>
                        {[["Mínimo","min","#16a34a"],["Máximo","max","#dc2626"]].map(([lbl,campo,cor])=>(
                          <div key={campo}>
                            <label style={{display:"block",fontSize:9,fontWeight:700,color:cor,
                              textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                              {lbl}
                            </label>
                            <input type="number" step="0.01"
                              value={edt[campo]??""}
                              onChange={e=>setEditMetas(em=>({...em,[k]:{...em[k],[campo]:e.target.value}}))}
                              disabled={!podeLider}
                              placeholder={campo==="min"?"sem limite":"sem limite"}
                              style={{width:"100%",padding:"7px 10px",borderRadius:6,
                                border:`1.5px solid ${err?"#fca5a5":"#e2e8f0"}`,
                                fontSize:13,fontFamily:"monospace",fontWeight:700,
                                outline:"none",boxSizing:"border-box",
                                background:podeLider?"#fff":"#f8fafc",
                                color:podeLider?"#1e293b":"#94a3b8"}}/>
                          </div>
                        ))}
                      </div>
                      {/* Barra visual da meta */}
                      {(edt.min!==""||edt.max!=="") && (
                        <div style={{background:"#f1f5f9",borderRadius:5,height:6,overflow:"hidden",marginBottom:5}}>
                          <div style={{
                            marginLeft:`${edt.min!==""?Math.min(parseFloat(edt.min)/50*100,40):0}%`,
                            width:`${edt.min!==""&&edt.max!==""?Math.abs(parseFloat(edt.max)-parseFloat(edt.min))/50*100:30}%`,
                            height:"100%",background:"#0ea5e9",borderRadius:5,minWidth:8,
                          }}/>
                        </div>
                      )}
                      {err && <div style={{fontSize:10,color:"#dc2626",fontFamily:"monospace"}}>{err}</div>}
                      <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
                        Padrão: {def.min??"-"} → {def.max??"-"} {m.un}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {podeLider && (
              <button onClick={salvarMetas}
                style={{width:"100%",padding:12,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,
                  cursor:"pointer",boxShadow:"0 4px 14px rgba(14,165,233,.2)"}}>
                💾 Salvar Metas KPI
              </button>
            )}
          </div>
        )}

        {/* ── ABA USUÁRIOS — com editar e desativar ── */}
        {aba==="usuarios" && (
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                  👤 Usuários cadastrados
                </div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>
                  {usuarios.filter(u=>u.ativo!==false).length} ativos · {usuarios.filter(u=>u.ativo===false).length} inativos
                </div>
              </div>
              <button onClick={abrirNovo}
                style={{padding:"8px 16px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                  color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",
                  boxShadow:"0 4px 12px rgba(14,165,233,.2)"}}>
                + Novo Usuário
              </button>
            </div>

            {/* Tabela de usuários */}
            <div style={{background:"#fff",borderRadius:10,overflow:"hidden",
              border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
              <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#0f172a"}}>
                    {["Nome","E-mail","Perfil","Turno","Status","Ações"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:9,
                        color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                        letterSpacing:.5,borderBottom:"1px solid #1e293b",fontFamily:"monospace"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u,i)=>{
                    const ativo = u.ativo !== false;
                    const pc    = PERFIL_COR[u.perfil] || {bg:"#f1f5f9",c:"#64748b",b:"#e2e8f0"};
                    return (
                      <tr key={u.id} style={{
                        borderBottom:"1px solid #f1f5f9",
                        background: !ativo ? "#f8fafc" : i%2===0?"#fff":"#fafafa",
                        opacity: !ativo ? 0.65 : 1,
                      }}>
                        <td style={{padding:"10px 12px",fontWeight:600,
                          color:ativo?"#0f172a":"#94a3b8"}}>
                          {u.nome}
                        </td>
                        <td style={{padding:"10px 12px",fontFamily:"monospace",
                          fontSize:11,color:"#64748b"}}>
                          {u.email}
                        </td>
                        <td style={{padding:"10px 12px"}}>
                          <span style={{fontSize:10,background:pc.bg,color:pc.c,
                            border:`1px solid ${pc.b}`,padding:"2px 9px",
                            borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
                            {u.perfil}
                          </span>
                        </td>
                        <td style={{padding:"10px 12px",color:"#64748b",fontFamily:"monospace",fontSize:11}}>
                          {u.turno}
                        </td>
                        <td style={{padding:"10px 12px"}}>
                          <span style={{fontSize:10,
                            background:ativo?"#dcfce7":"#fee2e2",
                            color:ativo?"#16a34a":"#dc2626",
                            padding:"2px 9px",borderRadius:4,
                            fontFamily:"monospace",fontWeight:700}}>
                            {ativo?"● Ativo":"○ Inativo"}
                          </span>
                        </td>
                        <td style={{padding:"10px 12px"}}>
                          <div style={{display:"flex",gap:5}}>
                            {/* Editar */}
                            <button onClick={()=>abrirEditar(u)}
                              style={{padding:"4px 10px",background:"#e0f2fe",
                                border:"1px solid #bae6fd",borderRadius:5,
                                color:"#0284c7",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                              ✏ Editar
                            </button>
                            {/* Ativar / Desativar */}
                            {ativo ? (
                              <button
                                onClick={()=>setConfirmaId(u.id)}
                                style={{padding:"4px 10px",background:"#fee2e2",
                                  border:"1px solid #fca5a5",borderRadius:5,
                                  color:"#dc2626",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                                🔒 Desativar
                              </button>
                            ) : (
                              <button
                                onClick={()=>alternarAtivo(u.id)}
                                style={{padding:"4px 10px",background:"#dcfce7",
                                  border:"1px solid #86efac",borderRadius:5,
                                  color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                                🔓 Reativar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>

            {/* Modal confirmação desativar */}
            {confirmaId && (
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",
                display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,padding:20}}>
                <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:380,
                  boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
                  <div style={{fontSize:32,marginBottom:12,textAlign:"center"}}>⚠</div>
                  <h3 style={{fontSize:14,fontWeight:800,margin:"0 0 8px",textAlign:"center",color:"#0f172a"}}>
                    Confirmar Desativação
                  </h3>
                  <p style={{fontSize:12,color:"#64748b",textAlign:"center",margin:"0 0 20px",lineHeight:1.6}}>
                    O usuário <b style={{color:"#0f172a"}}>{usuarios.find(u=>u.id===confirmaId)?.nome}</b> não
                    conseguirá mais fazer login. Você pode reativá-lo a qualquer momento.
                  </p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>alternarAtivo(confirmaId)}
                      style={{flex:1,padding:11,background:"linear-gradient(135deg,#dc2626,#b91c1c)",
                        color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      🔒 Confirmar Desativação
                    </button>
                    <button onClick={()=>setConfirmaId(null)}
                      style={{padding:"11px 14px",background:"#f1f5f9",color:"#64748b",
                        border:"none",borderRadius:7,cursor:"pointer",fontSize:12}}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── ABA REFERÊNCIA ── */}
        {aba==="kpis_ref" && (
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>KPIs Moagem — Metas Ativas</div>
            <div style={{background:"#fff",borderRadius:9,overflow:"hidden",
              border:"1px solid #e2e8f0",marginBottom:16}}>
              <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["KPI","Mínimo","Máximo","Un.","Status"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"7px 11px",fontSize:9,color:"#64748b",
                        fontWeight:600,textTransform:"uppercase",letterSpacing:.5,
                        borderBottom:"1px solid #e2e8f0",fontFamily:"monospace"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metas).map(([k,m])=>{
                    const def=METAS_DEFAULT[k];
                    const alt=m.min!==def.min||m.max!==def.max;
                    return (
                      <tr key={k} style={{borderBottom:"1px solid #f1f5f9",
                        background:alt?"#fffbeb":"#fff"}}>
                        <td style={{padding:"8px 11px",fontWeight:600,color:"#0f172a"}}>{m.label}</td>
                        <td style={{padding:"8px 11px",fontFamily:"monospace",color:"#16a34a",fontWeight:700}}>
                          {m.min??"-"}
                        </td>
                        <td style={{padding:"8px 11px",fontFamily:"monospace",color:"#dc2626",fontWeight:700}}>
                          {m.max??"-"}
                        </td>
                        <td style={{padding:"8px 11px",fontFamily:"monospace",color:"#64748b"}}>
                          {m.un||"—"}
                        </td>
                        <td style={{padding:"8px 11px"}}>
                          {alt
                            ? <span style={{fontSize:9,background:"#fef3c7",color:"#92400e",
                                padding:"2px 8px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                                ⚠ ALTERADA
                              </span>
                            : <span style={{fontSize:9,background:"#f0fdf4",color:"#16a34a",
                                padding:"2px 8px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                                ✓ PADRÃO
                              </span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
            <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:7}}>+ KPIs — Referência</div>
            <div style={{background:"#fff",borderRadius:9,overflow:"hidden",border:"1px solid #e2e8f0"}}>
              <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["KPI","Mínimo","Máximo","Un."].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"7px 11px",fontSize:9,color:"#64748b",
                        fontWeight:600,textTransform:"uppercase",letterSpacing:.5,
                        borderBottom:"1px solid #e2e8f0",fontFamily:"monospace"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(LIMITES_MAIS_KPI).map(([k,m])=>(
                    <tr key={k} style={{borderBottom:"1px solid #f1f5f9"}}>
                      <td style={{padding:"7px 11px",fontWeight:600,color:"#0f172a"}}>{m.label}</td>
                      <td style={{padding:"7px 11px",fontFamily:"monospace",color:"#16a34a",fontWeight:700}}>
                        {m.min??"-"}
                      </td>
                      <td style={{padding:"7px 11px",fontFamily:"monospace",color:"#dc2626",fontWeight:700}}>
                        {m.max??"-"}
                      </td>
                      <td style={{padding:"7px 11px",fontFamily:"monospace",color:"#64748b"}}>
                        {m.un||"—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        )}
      </div>

      {/* Modal novo/editar usuário */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:390,
            boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <h3 style={{fontSize:14,fontWeight:800,margin:"0 0 14px"}}>
              {editando ? "✏ Editar Usuário" : "+ Novo Usuário"}
            </h3>
            {[["Nome completo","text","nome"],["E-mail","email","email"],
              ["Senha","text","senha"]].map(([l,t,k])=>(
              <div key={k} style={{marginBottom:9}}>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>
                  {l}
                </label>
                <input type={t} value={uForm[k]||""}
                  onChange={e=>setUForm(f=>({...f,[k]:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,boxSizing:"border-box"}}/>
              </div>
            ))}
            {[["Perfil","perfil",["Operador","Lider","Supervisor"]],
              ["Turno","turno",["NOITE","MANHÃ","TARDE","TODOS"]]].map(([l,k,opts])=>(
              <div key={k} style={{marginBottom:9}}>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:3}}>
                  {l}
                </label>
                <select value={uForm[k]} onChange={e=>setUForm(f=>({...f,[k]:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={salvarUsuario}
                disabled={!uForm.nome||!uForm.email}
                style={{flex:1,padding:10,
                  background:uForm.nome&&uForm.email
                    ?"linear-gradient(135deg,#0ea5e9,#0284c7)":"#e2e8f0",
                  color:uForm.nome&&uForm.email?"#fff":"#94a3b8",
                  border:"none",borderRadius:7,fontSize:12,fontWeight:700,
                  cursor:uForm.nome&&uForm.email?"pointer":"not-allowed"}}>
                💾 {editando?"Salvar Alterações":"Cadastrar Usuário"}
              </button>
              <button onClick={()=>{setModal(false);setEditando(null);}}
                style={{padding:"10px 13px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:7,cursor:"pointer",fontSize:11}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════
// AÇÕES KPI'S — análises com desvio + correção registrada
// ══════════════════════════════════════════════════════════════════

// Componente isolado para cada item (evita hook em .map)
function AcaoKpiItem({ item, user, onAtualizar }) {
  const [expandJust, setExpandJust] = useState(false);
  const [novaObs,    setNovaObs]    = useState("");
  const [addObs,     setAddObs]     = useState(false);

  const tc       = TURNOS_CONFIG.find(t=>t.id===item.turno);
  const m        = LIMITES_MOAGEM[item.campo];
  const statusCor = {
    ABERTO:     { bg:"#fef3c7", c:"#d97706", b:"#fde68a", label:"🔓 Aberto"    },
    EM_ANDAMENTO:{ bg:"#e0f2fe", c:"#0284c7", b:"#bae6fd", label:"🔄 Em andamento"},
    CONCLUIDO:  { bg:"#dcfce7", c:"#16a34a", b:"#86efac", label:"✅ Concluído"  },
  };
  const sc = statusCor[item.status] || statusCor.ABERTO;

  return (
    <div style={{
      background:"#fff", borderRadius:10,
      border:`1px solid ${item.status==="CONCLUIDO"?"#86efac":"#fde68a"}`,
      borderLeft:`4px solid ${item.status==="CONCLUIDO"?"#16a34a":item.status==="EM_ANDAMENTO"?"#0ea5e9":"#f59e0b"}`,
      marginBottom:10, overflow:"hidden",
      boxShadow:"0 1px 4px rgba(0,0,0,.04)",
    }}>
      {/* Header */}
      <div style={{padding:"12px 16px",display:"flex",alignItems:"flex-start",
        justifyContent:"space-between",gap:12}}>
        <div style={{flex:1}}>
          {/* Linha de identificação */}
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:"#0f172a"}}>
              {item.data}
            </span>
            <span style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>{item.hora}</span>
            {tc && (
              <span style={{fontSize:10,background:tc.bg,color:tc.cor,padding:"2px 7px",
                borderRadius:3,fontFamily:"monospace",fontWeight:700,border:`1px solid ${tc.cor}30`}}>
                {item.turno}
              </span>
            )}
            <span style={{fontSize:11,color:"#1e293b",fontWeight:600}}>{item.operador}</span>
            <span style={{fontSize:10,background:sc.bg,color:sc.c,border:`1px solid ${sc.b}`,
              padding:"2px 8px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
              {sc.label}
            </span>
          </div>

          {/* Campo e valor do desvio */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:8,
              padding:"8px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:2}}>Campo</div>
                <div style={{fontSize:13,fontWeight:800,color:"#dc2626",fontFamily:"monospace"}}>
                  {m?.label || item.campo}
                </div>
              </div>
              <div style={{width:1,height:32,background:"#fca5a5"}}/>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:2}}>Valor Registrado</div>
                <div style={{fontSize:18,fontWeight:800,color:"#dc2626",fontFamily:"monospace"}}>
                  {item.valorRegistrado}{m?.un}
                </div>
              </div>
              <div style={{width:1,height:32,background:"#fca5a5"}}/>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace",marginBottom:2}}>Meta</div>
                <div style={{fontSize:12,fontWeight:700,color:"#64748b",fontFamily:"monospace"}}>
                  {m?.min!==null&&m?.max!==null
                    ? `${m.min} – ${m.max}${m.un}`
                    : m?.max!==null ? `≤ ${m.max}${m.un}`
                    : m?.min!==null ? `≥ ${m.min}${m.un}` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Justificativa/Correção */}
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:7,padding:"10px 13px"}}>
            <div style={{fontSize:9,fontWeight:700,color:"#16a34a",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:5}}>
              🔧 Correção / Justificativa registrada
            </div>
            <div style={{fontSize:12,color:"#1e293b",lineHeight:1.6}}>
              {item.justificativa}
            </div>
          </div>

          {/* Observações adicionais */}
          {item.observacoes?.length > 0 && (
            <div style={{marginTop:8}}>
              <button onClick={()=>setExpandJust(x=>!x)}
                style={{fontSize:10,color:"#0284c7",background:"#e0f2fe",border:"1px solid #bae6fd",
                  borderRadius:5,padding:"3px 10px",cursor:"pointer",fontWeight:600}}>
                {expandJust?"▲ Ocultar":"▼ Ver"} {item.observacoes.length} observação{item.observacoes.length>1?"ões":""}
              </button>
              {expandJust && (
                <div style={{marginTop:7,display:"flex",flexDirection:"column",gap:5}}>
                  {item.observacoes.map((obs,i)=>(
                    <div key={i} style={{background:"#f8fafc",border:"1px solid #e2e8f0",
                      borderRadius:6,padding:"7px 11px"}}>
                      <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:3}}>
                        {obs.data} · {obs.autor}
                      </div>
                      <div style={{fontSize:11,color:"#1e293b"}}>{obs.texto}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Adicionar observação */}
          {addObs && (
            <div style={{marginTop:8}}>
              <textarea rows={2} value={novaObs} onChange={e=>setNovaObs(e.target.value)}
                placeholder="Adicione uma observação de acompanhamento..."
                style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                  fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
              <div style={{display:"flex",gap:6,marginTop:5}}>
                <button
                  onClick={()=>{
                    if(!novaObs.trim()) return;
                    onAtualizar(item.id,"obs",{
                      texto:novaObs,
                      data:new Date().toLocaleDateString("pt-BR"),
                      autor:user.nome,
                    });
                    setNovaObs(""); setAddObs(false);
                  }}
                  disabled={!novaObs.trim()}
                  style={{padding:"6px 13px",background:"#0ea5e9",color:"#fff",border:"none",
                    borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  💾 Salvar obs.
                </button>
                <button onClick={()=>{setAddObs(false);setNovaObs("");}}
                  style={{padding:"6px 10px",background:"#f1f5f9",color:"#64748b",border:"none",
                    borderRadius:6,cursor:"pointer",fontSize:11}}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0,alignItems:"flex-end"}}>
          {item.status !== "CONCLUIDO" && user.perfil !== "Operador" && (
            <>
              {item.status === "ABERTO" && (
                <button onClick={()=>onAtualizar(item.id,"status","EM_ANDAMENTO")}
                  style={{padding:"5px 11px",background:"#e0f2fe",border:"1px solid #bae6fd",
                    borderRadius:6,color:"#0284c7",fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
                  🔄 Iniciar
                </button>
              )}
              <button onClick={()=>onAtualizar(item.id,"status","CONCLUIDO")}
                style={{padding:"5px 11px",background:"#dcfce7",border:"1px solid #86efac",
                  borderRadius:6,color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
                ✅ Concluir
              </button>
            </>
          )}
          <button onClick={()=>setAddObs(x=>!x)}
            style={{padding:"5px 11px",background:"#f1f5f9",border:"1px solid #e2e8f0",
              borderRadius:6,color:"#475569",fontWeight:600,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
            💬 Obs.
          </button>
        </div>
      </div>
    </div>
  );
}

function TelaAcoesKpi({ registros, user }) {
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroCampo,  setFiltroCampo]  = useState("Todos");
  const [filtroTurno,  setFiltroTurno]  = useState("Todos");
  const [acoes, setAcoes] = useState([]);

  // Constrói lista de ações a partir dos registros com desvio + justificativas
  const acoesBase = useMemo(()=>{
    const lista = [];
    registros.forEach(r=>{
      if(!r.justificativasArr?.length) return;
      r.justificativasArr.forEach(j=>{
        lista.push({
          id:        `${r.id}_${j.campo}`,
          registroId: r.id,
          data:       r.data,
          hora:       r.hora,
          turno:      r.turno,
          operador:   r.operador,
          campo:      j.campo,
          valorRegistrado: j.valor,
          justificativa:   j.justificativa,
          observacoes: [],
          status: "ABERTO",
        });
      });
    });
    // Merge com o estado local de atualizações (status, obs)
    return lista;
  },[registros]);

  // Estado local que guarda atualizações de status e observações
  const [overrides, setOverrides] = useState({});

  const acoesFinais = useMemo(()=>{
    return acoesBase.map(a=>({
      ...a,
      ...(overrides[a.id]||{}),
      observacoes: overrides[a.id]?.observacoes || [],
    }));
  },[acoesBase, overrides]);

  const handleAtualizar = (id, tipo, valor) => {
    setOverrides(prev=>{
      const atual = prev[id] || {};
      if(tipo==="status") return {...prev,[id]:{...atual,status:valor}};
      if(tipo==="obs")    return {...prev,[id]:{...atual,
        observacoes:[...(atual.observacoes||[]),valor]}};
      return prev;
    });
  };

  // Campos únicos que tiveram desvio
  const camposComDesvio = useMemo(()=>{
    const campos = [...new Set(acoesFinais.map(a=>a.campo))];
    return campos;
  },[acoesFinais]);

  const filtradas = acoesFinais.filter(a=>{
    if(filtroStatus!=="Todos" && a.status!==filtroStatus) return false;
    if(filtroCampo !=="Todos" && a.campo!==filtroCampo)   return false;
    if(filtroTurno !=="Todos" && a.turno!==filtroTurno)   return false;
    return true;
  });

  // Stats
  const total      = acoesFinais.length;
  const abertas    = acoesFinais.filter(a=>a.status==="ABERTO").length;
  const andamento  = acoesFinais.filter(a=>a.status==="EM_ANDAMENTO").length;
  const concluidas = acoesFinais.filter(a=>a.status==="CONCLUIDO").length;

  return (
    <div>
      <PH title="📌 Ações KPI's"
        subtitle="Análises com desvio registrado e suas correções — geradas automaticamente"/>
      <div style={{padding:22}}>

        {/* Cards de resumo */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Total de Ações" value={total}      icon="📌" color="#0ea5e9"/>
          <SC label="Em Aberto"      value={abertas}    icon="🔓" color="#f59e0b"/>
          <SC label="Em Andamento"   value={andamento}  icon="🔄" color="#0284c7"/>
          <SC label="Concluídas"     value={concluidas} icon="✅" color="#16a34a"/>
        </div>

        {/* Filtros */}
        <div style={{background:"#fff",borderRadius:10,padding:"12px 16px",
          marginBottom:16,border:"1px solid #e2e8f0",
          display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>

          {/* Status */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Status</div>
            <div style={{display:"flex",gap:4}}>
              {[["Todos","Todos","#64748b"],
                ["ABERTO","Aberto","#d97706"],
                ["EM_ANDAMENTO","Andamento","#0284c7"],
                ["CONCLUIDO","Concluído","#16a34a"]].map(([v,l,cor])=>(
                <button key={v} onClick={()=>setFiltroStatus(v)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroStatus===v?cor:"#e2e8f0",
                    background:filtroStatus===v?cor+"18":"#fff",
                    color:filtroStatus===v?cor:"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Turno */}
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Turno</div>
            <div style={{display:"flex",gap:4}}>
              {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
                const tc=TURNOS_CONFIG.find(x=>x.id===t);
                return (
                  <button key={t} onClick={()=>setFiltroTurno(t)}
                    style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                      borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                      background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                      color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo */}
          {camposComDesvio.length > 0 && (
            <div>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Campo</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <button onClick={()=>setFiltroCampo("Todos")}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroCampo==="Todos"?"#8b5cf6":"#e2e8f0",
                    background:filtroCampo==="Todos"?"#f5f3ff":"#fff",
                    color:filtroCampo==="Todos"?"#7c3aed":"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  Todos
                </button>
                {camposComDesvio.map(c=>(
                  <button key={c} onClick={()=>setFiltroCampo(c)}
                    style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                      borderColor:filtroCampo===c?"#dc2626":"#e2e8f0",
                      background:filtroCampo===c?"#fff1f2":"#fff",
                      color:filtroCampo===c?"#dc2626":"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {LIMITES_MOAGEM[c]?.label || c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        {filtradas.length === 0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:44,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:36,marginBottom:12}}>📌</div>
            <div style={{fontSize:14,fontWeight:600,color:"#64748b",marginBottom:6}}>
              {total === 0
                ? "Nenhuma ação registrada ainda"
                : "Nenhuma ação para o filtro selecionado"}
            </div>
            <div style={{fontSize:12}}>
              {total === 0
                ? "Ações são criadas automaticamente quando um KPI sai fora do parâmetro e é justificado"
                : "Tente ajustar os filtros de status, turno ou campo"}
            </div>
          </div>
        ) : (
          <>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10,fontFamily:"monospace"}}>
              {filtradas.length} ação{filtradas.length!==1?"ões":""} encontrada{filtradas.length!==1?"s":""}
            </div>
            {filtradas.map(a=>(
              <AcaoKpiItem
                key={a.id}
                item={a}
                user={user}
                onAtualizar={handleAtualizar}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TELA AUDITORIA
// ══════════════════════════════════════════════════════════════════
function TelaAuditoria({ auditoria }) {
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [busca,      setBusca]      = useState("");

  const filtrada = useMemo(()=>auditoria.filter(a=>{
    if(filtroTipo!=="Todos"&&a.tipo!==filtroTipo) return false;
    if(busca){
      const q=busca.toLowerCase();
      if(!a.usuario.toLowerCase().includes(q)&&
         !a.tipo.toLowerCase().includes(q)&&
         !JSON.stringify(a.detalhes).toLowerCase().includes(q)) return false;
    }
    return true;
  }),[auditoria,filtroTipo,busca]);

  const tipos = [...new Set(auditoria.map(a=>a.tipo))];

  return (
    <div>
      <PH title="Auditoria" subtitle={`${auditoria.length} registro${auditoria.length!==1?"s":""} de atividade`}/>
      <div style={{padding:22}}>

        {/* Cards resumo */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:18}}>
          {[
            ["Total Eventos",    auditoria.length,                                             "📋","#0ea5e9"],
            ["Metas Alteradas",  auditoria.filter(a=>a.tipo==="META_ALTERADA").length,         "🎯","#f59e0b"],
            ["Validações",       auditoria.filter(a=>a.tipo==="REGISTRO_VALIDADO").length,     "✅","#16a34a"],
            ["Usuários",         auditoria.filter(a=>a.tipo?.startsWith("USUARIO")).length,    "👤","#8b5cf6"],
          ].map(([l,v,ic,c])=>(
            <SC key={l} label={l} value={v} icon={ic} color={c}/>
          ))}
        </div>

        {/* Filtros */}
        <div style={{background:"#fff",borderRadius:9,padding:"11px 16px",
          marginBottom:14,border:"1px solid #e2e8f0",
          display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <input
            value={busca} onChange={e=>setBusca(e.target.value)}
            placeholder="Buscar por usuário, tipo ou detalhe..."
            style={{flex:1,minWidth:200,padding:"7px 11px",borderRadius:7,
              border:"1.5px solid #e2e8f0",fontSize:12,outline:"none",
              fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {["Todos",...tipos].map(t=>{
              const cfg=TIPO_AUDITORIA_COR[t];
              return (
                <button key={t} onClick={()=>setFiltroTipo(t)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroTipo===t?(cfg?.c||"#0ea5e9"):"#e2e8f0",
                    background:filtroTipo===t?(cfg?.bg||"#e0f2fe"):"#fff",
                    color:filtroTipo===t?(cfg?.c||"#0284c7"):"#64748b",
                    fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {cfg?`${cfg.icon} ${cfg.label}`:t==="Todos"?"Todos":"?"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista */}
        {filtrada.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:44,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>🔐</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b",marginBottom:4}}>
              {auditoria.length===0
                ? "Nenhum evento registrado ainda"
                : "Nenhum evento para o filtro selecionado"}
            </div>
            <div style={{fontSize:11}}>
              Eventos são registrados automaticamente ao alterar metas, validar registros e gerenciar usuários
            </div>
          </div>
        ) : (
          <div style={{background:"#fff",borderRadius:10,overflow:"hidden",
            border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#0f172a"}}>
                  {["Data/Hora","Usuário","Perfil","Evento","Detalhes"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:9,
                      color:"#94a3b8",fontWeight:600,textTransform:"uppercase",
                      letterSpacing:.5,borderBottom:"1px solid #1e293b",
                      fontFamily:"monospace"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrada.map((a,i)=>{
                  const cfg = TIPO_AUDITORIA_COR[a.tipo]||{c:"#64748b",bg:"#f8fafc",icon:"•",label:a.tipo};
                  const dt  = new Date(a.timestamp);
                  const det = a.detalhes;
                  return (
                    <tr key={a.id} style={{borderBottom:"1px solid #f1f5f9",
                      background:i%2===0?"#fff":"#fafafa"}}>
                      <td style={{padding:"9px 12px",fontFamily:"monospace",fontSize:10,
                        color:"#64748b",whiteSpace:"nowrap"}}>
                        <div style={{fontWeight:700,color:"#0f172a"}}>
                          {dt.toLocaleDateString("pt-BR")}
                        </div>
                        <div>{dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
                      </td>
                      <td style={{padding:"9px 12px",fontWeight:600,color:"#0f172a"}}>
                        {a.usuario}
                      </td>
                      <td style={{padding:"9px 12px"}}>
                        <span style={{fontSize:9,background:"#f1f5f9",color:"#64748b",
                          padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                          {a.perfil}
                        </span>
                      </td>
                      <td style={{padding:"9px 12px"}}>
                        <span style={{fontSize:10,background:cfg.bg,color:cfg.c,
                          padding:"2px 9px",borderRadius:4,fontFamily:"monospace",
                          fontWeight:700,whiteSpace:"nowrap"}}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{padding:"9px 12px",fontSize:11,color:"#475569",maxWidth:280}}>
                        {det.campo&&<span style={{fontFamily:"monospace",color:"#dc2626",
                          fontWeight:700,marginRight:6}}>{LIMITES_MOAGEM[det.campo]?.label||det.campo}</span>}
                        {det.de!==undefined&&<span>De <b>{det.de}</b> para <b style={{color:"#0ea5e9"}}>{det.para}</b></span>}
                        {det.nome&&<span>Usuário: <b>{det.nome}</b></span>}
                        {det.registroId&&<span>Reg #{det.registroId}</span>}
                        {det.obs&&<span style={{color:"#64748b"}}>{det.obs}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <div style={{padding:"9px 14px",background:"#f8fafc",
              borderTop:"1px solid #e2e8f0",fontSize:10,
              color:"#94a3b8",fontFamily:"monospace",textAlign:"center"}}>
              {filtrada.length} de {auditoria.length} eventos · últimas 500 ações registradas
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// OCORRÊNCIAS DO TURNO — diário de bordo do Líder
// ══════════════════════════════════════════════════════════════════
const CATEGORIAS_OCORRENCIA = [
  { id:"GERAL",         label:"Geral",         icon:"📋", cor:"#64748b" },
  { id:"EQUIPAMENTO",   label:"Equipamento",   icon:"⚙",  cor:"#dc2626" },
  { id:"SEGURANCA",     label:"Segurança",     icon:"🦺", cor:"#f59e0b" },
  { id:"QUALIDADE",     label:"Qualidade",     icon:"🧪", cor:"#8b5cf6" },
  { id:"ABASTECIMENTO", label:"Abastecimento", icon:"🚚", cor:"#0ea5e9" },
  { id:"PESSOAL",       label:"Pessoal",       icon:"👤", cor:"#10b981" },
];

const GRAVIDADE_COR = {
  BAIXA: { cor:"#16a34a", bg:"#f0fdf4", label:"Baixa"  },
  MEDIA: { cor:"#d97706", bg:"#fffbeb", label:"Média"  },
  ALTA:  { cor:"#dc2626", bg:"#fff1f2", label:"Alta"   },
};

function OcorrenciaItem({ o, podeGerenciar, onResolver, onExcluir }) {
  const cat = CATEGORIAS_OCORRENCIA.find(c=>c.id===o.categoria) || CATEGORIAS_OCORRENCIA[0];
  const grav = GRAVIDADE_COR[o.gravidade] || GRAVIDADE_COR.BAIXA;
  const tc = TURNOS_CONFIG.find(t=>t.id===o.turno);

  return (
    <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",
      borderLeft:`4px solid ${o.resolvida?"#86efac":grav.cor}`,
      padding:14,marginBottom:10,opacity:o.resolvida?0.7:1,
      boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6,flexWrap:"wrap"}}>
            <span style={{fontSize:9,background:cat.cor+"15",color:cat.cor,border:`1px solid ${cat.cor}30`,
              padding:"2px 8px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
              {cat.icon} {cat.label}
            </span>
            <span style={{fontSize:9,background:grav.bg,color:grav.cor,
              padding:"2px 8px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
              {grav.label}
            </span>
            {tc&&<span style={{fontSize:9,background:tc.bg,color:tc.cor,
              padding:"2px 7px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
              {o.turno}
            </span>}
            {o.resolvida&&<span style={{fontSize:9,background:"#dcfce7",color:"#16a34a",
              padding:"2px 8px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
              ✓ Resolvida
            </span>}
          </div>
          <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:4,
            textDecoration:o.resolvida?"line-through":"none"}}>
            {o.titulo}
          </div>
          {o.descricao&&(
            <div style={{fontSize:12,color:"#475569",lineHeight:1.5,marginBottom:6}}>
              {o.descricao}
            </div>
          )}
          <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
            {o.autor} · {new Date(o.timestamp).toLocaleString("pt-BR",
              {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
        {podeGerenciar&&(
          <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
            {!o.resolvida&&(
              <button onClick={()=>onResolver(o.id)}
                style={{padding:"5px 10px",background:"#dcfce7",border:"1px solid #86efac",
                  borderRadius:6,color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",
                  whiteSpace:"nowrap"}}>
                ✓ Resolver
              </button>
            )}
            <button onClick={()=>onExcluir(o.id)}
              style={{padding:"5px 10px",background:"#fee2e2",border:"1px solid #fca5a5",
                borderRadius:6,color:"#dc2626",fontWeight:700,fontSize:11,cursor:"pointer",
                whiteSpace:"nowrap"}}>
              🗑 Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TelaOcorrencias({ user, ocorrencias, setOcorrencias }) {
  const podeGerenciar = user.perfil==="Lider" || user.perfil==="Supervisor";
  const [modal, setModal] = useState(false);
  const [filtroTurno, setFiltroTurno] = useState("Todos");
  const [filtroCat, setFiltroCat] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Abertas");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const turnoAtual = detectarTurno();
  const hoje = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    data: hoje,
    turno: turnoAtual,
    categoria: "GERAL",
    titulo: "",
    descricao: "",
    gravidade: "BAIXA",
  });

  const abrirNovo = () => {
    setForm({ data: hoje, turno: turnoAtual, categoria: "GERAL", titulo: "", descricao: "", gravidade: "BAIXA" });
    setErro("");
    setModal(true);
  };

  const salvar = async () => {
    if (!form.titulo.trim()) { setErro("Descreva o ocorrido em poucas palavras no título."); return; }
    setSalvando(true);
    setErro("");
    try {
      const nova = await criarOcorrencia({ ...form, autor: user.nome, perfil: user.perfil });
      setOcorrencias(prev => [nova, ...prev]);
      setModal(false);
    } catch (e) {
      setErro("Erro ao salvar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  const resolver = async (id) => {
    try {
      await atualizarOcorrencia(id, { resolvida: true });
      setOcorrencias(prev => prev.map(o => o.id===id ? { ...o, resolvida: true } : o));
    } catch (e) { alert("Erro ao atualizar: " + (e.message || e)); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir esta ocorrência? Essa ação não pode ser desfeita.")) return;
    try {
      await excluirOcorrencia(id);
      setOcorrencias(prev => prev.filter(o => o.id !== id));
    } catch (e) { alert("Erro ao excluir: " + (e.message || e)); }
  };

  const filtradas = ocorrencias.filter(o => {
    if (filtroTurno !== "Todos" && o.turno !== filtroTurno) return false;
    if (filtroCat !== "Todos" && o.categoria !== filtroCat) return false;
    if (filtroStatus === "Abertas" && o.resolvida) return false;
    if (filtroStatus === "Resolvidas" && !o.resolvida) return false;
    return true;
  });

  const abertas = ocorrencias.filter(o => !o.resolvida).length;
  const altas = ocorrencias.filter(o => !o.resolvida && o.gravidade==="ALTA").length;
  const hojeCount = ocorrencias.filter(o => o.data===hoje).length;

  return (
    <div>
      <PH title="📝 Ocorrências do Turno" subtitle="Diário de bordo — paradas, intercorrências e eventos do turno"
        action={
          podeGerenciar && (
            <button onClick={abrirNovo}
              style={{padding:"9px 16px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",
                boxShadow:"0 4px 12px rgba(14,165,233,.25)",whiteSpace:"nowrap"}}>
              + Nova Ocorrência
            </button>
          )
        }/>

      <div style={{padding:22}}>
        {!podeGerenciar && (
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,
            padding:"10px 14px",marginBottom:16,fontSize:12,color:"#0284c7"}}>
            ℹ️ Apenas Líderes e Supervisores podem registrar ocorrências. Você pode consultar o histórico abaixo.
          </div>
        )}

        <div className="grid-3" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Abertas hoje"   value={hojeCount} icon="📅" color="#0ea5e9"/>
          <SC label="Em aberto"      value={abertas}   icon="⏳" color="#d97706"/>
          <SC label="Gravidade alta" value={altas}      icon="🔥" color="#dc2626"/>
        </div>

        {/* Filtros */}
        <div style={{background:"#fff",borderRadius:9,padding:"12px 16px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Status</div>
            <div style={{display:"flex",gap:4}}>
              {["Abertas","Resolvidas","Todos"].map(s=>(
                <button key={s} onClick={()=>setFiltroStatus(s)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroStatus===s?"#0ea5e9":"#e2e8f0",
                    background:filtroStatus===s?"#e0f2fe":"#fff",
                    color:filtroStatus===s?"#0284c7":"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Turno</div>
            <div style={{display:"flex",gap:4}}>
              {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
                const tc=TURNOS_CONFIG.find(x=>x.id===t);
                return (
                  <button key={t} onClick={()=>setFiltroTurno(t)}
                    style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                      borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                      background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                      color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Categoria</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <button onClick={()=>setFiltroCat("Todos")}
                style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                  borderColor:filtroCat==="Todos"?"#8b5cf6":"#e2e8f0",
                  background:filtroCat==="Todos"?"#f5f3ff":"#fff",
                  color:filtroCat==="Todos"?"#7c3aed":"#64748b",
                  fontSize:11,fontWeight:600,cursor:"pointer"}}>
                Todas
              </button>
              {CATEGORIAS_OCORRENCIA.map(c=>(
                <button key={c.id} onClick={()=>setFiltroCat(c.id)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroCat===c.id?c.cor:"#e2e8f0",
                    background:filtroCat===c.id?c.cor+"15":"#fff",
                    color:filtroCat===c.id?c.cor:"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista */}
        {filtradas.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:40,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>📝</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b",marginBottom:4}}>
              Nenhuma ocorrência para o filtro selecionado
            </div>
            <div style={{fontSize:11}}>
              {podeGerenciar ? "Clique em \"+ Nova Ocorrência\" para registrar um evento do turno" : "Tente ajustar os filtros"}
            </div>
          </div>
        ) : (
          filtradas.map(o => (
            <OcorrenciaItem key={o.id} o={o} podeGerenciar={podeGerenciar}
              onResolver={resolver} onExcluir={excluir}/>
          ))
        )}
      </div>

      {/* Modal nova ocorrência */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:460,
            maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 16px",color:"#0f172a"}}>
              📝 Nova Ocorrência do Turno
            </h3>

            <div className="grid-2" style={{display:"grid",gap:10,marginBottom:12}}>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Data
                </label>
                <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Turno
                </label>
                <select value={form.turno} onChange={e=>setForm(f=>({...f,turno:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {TURNOS_CONFIG.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Categoria
              </label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {CATEGORIAS_OCORRENCIA.map(c=>(
                  <button key={c.id} onClick={()=>setForm(f=>({...f,categoria:c.id}))}
                    style={{padding:"6px 11px",borderRadius:7,border:"1.5px solid",
                      borderColor:form.categoria===c.id?c.cor:"#e2e8f0",
                      background:form.categoria===c.id?c.cor+"15":"#fff",
                      color:form.categoria===c.id?c.cor:"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer"}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Gravidade
              </label>
              <div style={{display:"flex",gap:5}}>
                {Object.entries(GRAVIDADE_COR).map(([g,cfg])=>(
                  <button key={g} onClick={()=>setForm(f=>({...f,gravidade:g}))}
                    style={{flex:1,padding:"7px 0",borderRadius:7,border:"1.5px solid",
                      borderColor:form.gravidade===g?cfg.cor:"#e2e8f0",
                      background:form.gravidade===g?cfg.bg:"#fff",
                      color:form.gravidade===g?cfg.cor:"#64748b",
                      fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Título *
              </label>
              <input type="text" value={form.titulo}
                onChange={e=>setForm(f=>({...f,titulo:e.target.value}))}
                placeholder="Ex: Parada do Laminador B por 20 minutos"
                style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:13,boxSizing:"border-box"}}/>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Descrição detalhada (opcional)
              </label>
              <textarea rows={3} value={form.descricao}
                onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}
                placeholder="Detalhe o que aconteceu, causa provável, ações já tomadas..."
                style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>

            {erro && (
              <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:6,
                padding:"8px 12px",color:"#dc2626",fontSize:12,marginBottom:12}}>
                {erro}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={salvar} disabled={salvando}
                style={{flex:1,padding:11,background:salvando?"#94a3b8":"linear-gradient(135deg,#0ea5e9,#0284c7)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:salvando?"wait":"pointer"}}>
                {salvando?"Salvando...":"💾 Registrar Ocorrência"}
              </button>
              <button onClick={()=>setModal(false)}
                style={{padding:"11px 16px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PARADAS DE FÁBRICA — registro de tempo parado por turno
// ══════════════════════════════════════════════════════════════════
const MOTIVOS_PARADA = [
  { id:"MANUTENCAO",     label:"Manutenção",         icon:"🔧", cor:"#dc2626" },
  { id:"FALTA_MATERIA",  label:"Falta de Matéria-Prima", icon:"📦", cor:"#f59e0b" },
  { id:"ELETRICA",       label:"Falha Elétrica",     icon:"⚡", cor:"#eab308" },
  { id:"MECANICA",       label:"Falha Mecânica",     icon:"⚙",  cor:"#dc2626" },
  { id:"LIMPEZA",        label:"Limpeza / Higienização", icon:"🧹", cor:"#0ea5e9" },
  { id:"TROCA_TURNO",    label:"Troca de Turno",     icon:"🔄", cor:"#8b5cf6" },
  { id:"SEGURANCA",      label:"Parada de Segurança", icon:"🦺", cor:"#f97316" },
  { id:"OUTRO",          label:"Outro",              icon:"📋", cor:"#64748b" },
];

function ParadaItem({ p, podeValidar, onValidar, onRejeitar }) {
  const motivo = MOTIVOS_PARADA.find(m=>m.id===p.motivo) || MOTIVOS_PARADA[MOTIVOS_PARADA.length-1];
  const tc = TURNOS_CONFIG.find(t=>t.id===p.turno);

  return (
    <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",
      borderLeft:`4px solid ${p.status==="VALIDADO"?"#16a34a":p.status==="REJEITADO"?"#dc2626":motivo.cor}`,
      padding:14,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7,flexWrap:"wrap"}}>
            <span style={{fontSize:20,fontWeight:800,fontFamily:"monospace",color:"#0f172a"}}>
              {p.minutos}<span style={{fontSize:11,color:"#94a3b8"}}> min</span>
            </span>
            <span style={{fontSize:9,background:motivo.cor+"15",color:motivo.cor,
              border:`1px solid ${motivo.cor}30`,padding:"2px 8px",borderRadius:4,
              fontFamily:"monospace",fontWeight:700}}>
              {motivo.icon} {motivo.label}
            </span>
            {tc && (
              <span style={{fontSize:9,background:tc.bg,color:tc.cor,
                padding:"2px 7px",borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
                {p.turno}
              </span>
            )}
            <Badge s={p.status}/>
          </div>
          {p.observacao && (
            <div style={{fontSize:12,color:"#475569",lineHeight:1.5,marginBottom:6}}>
              {p.observacao}
            </div>
          )}
          <div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
            {new Date(p.data+"T12:00:00").toLocaleDateString("pt-BR")} ·  {p.operador}
            {p.status!=="PENDENTE" && p.validadoPor && (
              <span> · {p.status==="VALIDADO"?"validado":"rejeitado"} por {p.validadoPor.split(" ")[0]}</span>
            )}
          </div>
        </div>
        {podeValidar && p.status==="PENDENTE" && (
          <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
            <button onClick={()=>onValidar(p.id)}
              style={{padding:"6px 12px",background:"#dcfce7",border:"1px solid #86efac",
                borderRadius:6,color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",
                whiteSpace:"nowrap"}}>
              ✓ Validar
            </button>
            <button onClick={()=>onRejeitar(p.id)}
              style={{padding:"6px 12px",background:"#fee2e2",border:"1px solid #fca5a5",
                borderRadius:6,color:"#dc2626",fontWeight:700,fontSize:11,cursor:"pointer",
                whiteSpace:"nowrap"}}>
              ✕ Rejeitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TelaParadas({ user, paradas, setParadas, auditoria, setAuditoria }) {
  const podeValidar = user.perfil==="Lider" || user.perfil==="Supervisor";
  const hoje = new Date();
  const turnoAtual = detectarTurno();

  const [modal,        setModal]        = useState(false);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");
  const [filtroTurno,  setFiltroTurno]  = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroMotivo, setFiltroMotivo] = useState("Todos");

  // Período exibido na somatória — por padrão, hoje
  const [modoPeriodo, setModoPeriodo] = useState("hoje"); // "hoje" | "mes"
  const [mesSel, setMesSel] = useState(String(hoje.getMonth()+1).padStart(2,"0"));
  const [anoSel, setAnoSel] = useState(String(hoje.getFullYear()));
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const [form, setForm] = useState({
    data: hoje.toISOString().split("T")[0],
    turno: turnoAtual,
    minutos: "",
    motivo: "MANUTENCAO",
    observacao: "",
  });

  const abrirNovo = () => {
    setForm({
      data: new Date().toISOString().split("T")[0],
      turno: detectarTurno(),
      minutos: "",
      motivo: "MANUTENCAO",
      observacao: "",
    });
    setErro("");
    setModal(true);
  };

  const salvar = async () => {
    const min = parseFloat(form.minutos);
    if (!min || min <= 0) { setErro("Informe os minutos parados (maior que zero)."); return; }
    setSalvando(true);
    setErro("");
    try {
      const nova = await criarParada({ ...form, minutos: min, operador: user.nome });
      setParadas(prev => [nova, ...prev]);
      setModal(false);
    } catch (e) {
      setErro("Erro ao salvar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  const validar = async (id) => {
    try {
      await atualizarParada(id, { status:"VALIDADO", validadoPor:user.nome, dataValidacao:new Date().toISOString() });
      setParadas(prev => prev.map(p => p.id===id ? {...p, status:"VALIDADO", validadoPor:user.nome, dataValidacao:new Date().toISOString()} : p));
      if (setAuditoria) registrarAuditoria(setAuditoria, "PARADA_VALIDADA", user, { paradaId: id });
    } catch (e) { alert("Erro ao validar: " + (e.message || e)); }
  };

  const rejeitar = async (id) => {
    try {
      await atualizarParada(id, { status:"REJEITADO", validadoPor:user.nome, dataValidacao:new Date().toISOString() });
      setParadas(prev => prev.map(p => p.id===id ? {...p, status:"REJEITADO", validadoPor:user.nome, dataValidacao:new Date().toISOString()} : p));
      if (setAuditoria) registrarAuditoria(setAuditoria, "PARADA_REJEITADA", user, { paradaId: id });
    } catch (e) { alert("Erro ao rejeitar: " + (e.message || e)); }
  };

  // Paradas do período selecionado para a somatória (sempre só as VALIDADAS contam no total oficial)
  const paradasPeriodo = useMemo(()=>{
    return paradas.filter(p=>{
      if (modoPeriodo === "hoje") {
        return p.data === hoje.toISOString().split("T")[0];
      }
      const [pAno, pMes] = p.data.split("-");
      return pAno===anoSel && pMes===mesSel;
    });
  },[paradas, modoPeriodo, anoSel, mesSel]);

  // Somatória de minutos VALIDADOS por turno
  const somatorioPorTurno = useMemo(()=>{
    return TURNOS_CONFIG.map(tc=>{
      const doTurno = paradasPeriodo.filter(p=>p.turno===tc.id);
      const validadas = doTurno.filter(p=>p.status==="VALIDADO");
      const pendentes = doTurno.filter(p=>p.status==="PENDENTE");
      return {
        ...tc,
        totalValidado: validadas.reduce((a,p)=>a+p.minutos,0),
        totalPendente: pendentes.reduce((a,p)=>a+p.minutos,0),
        qtdValidadas: validadas.length,
        qtdPendentes: pendentes.length,
      };
    });
  },[paradasPeriodo]);

  const totalGeralValidado = somatorioPorTurno.reduce((a,t)=>a+t.totalValidado,0);
  const totalGeralPendente = somatorioPorTurno.reduce((a,t)=>a+t.totalPendente,0);
  const totalPendentesValidacao = paradas.filter(p=>p.status==="PENDENTE").length;

  const formatarMinutos = (min) => {
    const h = Math.floor(min/60);
    const m = Math.round(min%60);
    if (h===0) return `${m}min`;
    return `${h}h${m>0?` ${m}min`:""}`;
  };

  // Lista filtrada para exibição (não necessariamente a do período da somatória)
  const filtradas = paradas.filter(p=>{
    if (filtroTurno!=="Todos" && p.turno!==filtroTurno) return false;
    if (filtroStatus!=="Todos" && p.status!==filtroStatus) return false;
    if (filtroMotivo!=="Todos" && p.motivo!==filtroMotivo) return false;
    return true;
  });

  return (
    <div>
      <PH title="⏱ Paradas de Fábrica" subtitle="Tempo de parada por turno — registrado pelo operador, validado pelo líder"
        action={
          <button onClick={abrirNovo}
            style={{padding:"9px 16px",background:"linear-gradient(135deg,#dc2626,#b91c1c)",
              color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",
              boxShadow:"0 4px 12px rgba(220,38,38,.25)",whiteSpace:"nowrap"}}>
            + Registrar Parada
          </button>
        }/>

      <div style={{padding:22}}>

        {/* Cards de resumo geral */}
        <div className="grid-3" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Total Validado"   value={formatarMinutos(totalGeralValidado)} icon="⏱" color="#16a34a"/>
          <SC label="Aguardando Validação" value={formatarMinutos(totalGeralPendente)} icon="⏳" color="#d97706"/>
          <SC label="Registros Pendentes" value={totalPendentesValidacao} icon="📋" color="#dc2626"/>
        </div>

        {/* Somatória por turno */}
        <div style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",
          boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            marginBottom:14,flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>
              Somatória de Paradas por Turno
            </div>
            <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:3,borderRadius:7}}>
              {[["hoje","📅 Hoje"],["mes","📊 Mensal"]].map(([v,l])=>(
                <button key={v} onClick={()=>setModoPeriodo(v)}
                  style={{padding:"5px 12px",borderRadius:5,border:"none",fontSize:11,fontWeight:600,
                    cursor:"pointer",background:modoPeriodo===v?"#fff":"transparent",
                    color:modoPeriodo===v?"#0f172a":"#64748b",
                    boxShadow:modoPeriodo===v?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {modoPeriodo==="mes" && (
            <div style={{display:"flex",gap:10,marginBottom:14}}>
              <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
                style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,fontWeight:600,background:"#fff",cursor:"pointer"}}>
                {MESES.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}
              </select>
              <select value={anoSel} onChange={e=>setAnoSel(e.target.value)}
                style={{padding:"7px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,fontWeight:600,background:"#fff",cursor:"pointer"}}>
                {[...new Set(paradas.map(p=>p.data?.slice(0,4)))].filter(Boolean).sort().reverse()
                  .concat(String(hoje.getFullYear())).filter((v,i,a)=>a.indexOf(v)===i)
                  .map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}

          <div className="grid-3" style={{display:"grid",gap:12}}>
            {somatorioPorTurno.map(t=>(
              <div key={t.id} style={{border:`2px solid ${t.cor}30`,borderRadius:10,
                overflow:"hidden"}}>
                <div style={{background:`linear-gradient(135deg,${t.cor},${t.cor}cc)`,
                  padding:"9px 13px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#fff"}}>{t.label}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.7)",fontFamily:"monospace"}}>
                    {t.horario}
                  </div>
                </div>
                <div style={{padding:14}}>
                  <div style={{fontSize:24,fontWeight:800,fontFamily:"monospace",color:"#0f172a",
                    marginBottom:2}}>
                    {formatarMinutos(t.totalValidado)}
                  </div>
                  <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:8}}>
                    validado · {t.qtdValidadas} registro{t.qtdValidadas!==1?"s":""}
                  </div>
                  {t.totalPendente>0 && (
                    <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,
                      padding:"5px 9px",fontSize:10,color:"#92400e",fontFamily:"monospace"}}>
                      +{formatarMinutos(t.totalPendente)} pendente ({t.qtdPendentes})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div style={{background:"#fff",borderRadius:9,padding:"12px 16px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Status</div>
            <div style={{display:"flex",gap:4}}>
              {["Todos","PENDENTE","VALIDADO","REJEITADO"].map(s=>(
                <button key={s} onClick={()=>setFiltroStatus(s)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroStatus===s?"#0ea5e9":"#e2e8f0",
                    background:filtroStatus===s?"#e0f2fe":"#fff",
                    color:filtroStatus===s?"#0284c7":"#64748b",
                    fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {s==="Todos"?"Todos":s.charAt(0)+s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Turno</div>
            <div style={{display:"flex",gap:4}}>
              {["Todos","NOITE","MANHÃ","TARDE"].map(t=>{
                const tc=TURNOS_CONFIG.find(x=>x.id===t);
                return (
                  <button key={t} onClick={()=>setFiltroTurno(t)}
                    style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                      borderColor:filtroTurno===t?(tc?.cor||"#0ea5e9"):"#e2e8f0",
                      background:filtroTurno===t?(tc?.bg||"#e0f2fe"):"#fff",
                      color:filtroTurno===t?(tc?.cor||"#0284c7"):"#64748b",
                      fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>Motivo</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              <button onClick={()=>setFiltroMotivo("Todos")}
                style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                  borderColor:filtroMotivo==="Todos"?"#8b5cf6":"#e2e8f0",
                  background:filtroMotivo==="Todos"?"#f5f3ff":"#fff",
                  color:filtroMotivo==="Todos"?"#7c3aed":"#64748b",
                  fontSize:10,fontWeight:600,cursor:"pointer"}}>
                Todos
              </button>
              {MOTIVOS_PARADA.map(m=>(
                <button key={m.id} onClick={()=>setFiltroMotivo(m.id)}
                  style={{padding:"4px 10px",borderRadius:12,border:"1.5px solid",
                    borderColor:filtroMotivo===m.id?m.cor:"#e2e8f0",
                    background:filtroMotivo===m.id?m.cor+"15":"#fff",
                    color:filtroMotivo===m.id?m.cor:"#64748b",
                    fontSize:10,fontWeight:600,cursor:"pointer"}}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista */}
        {filtradas.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:40,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>⏱</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b",marginBottom:4}}>
              {paradas.length===0
                ? "Nenhuma parada registrada ainda"
                : "Nenhuma parada para o filtro selecionado"}
            </div>
            <div style={{fontSize:11}}>
              Clique em "+ Registrar Parada" para informar o tempo parado do turno
            </div>
          </div>
        ) : (
          filtradas.map(p => (
            <ParadaItem key={p.id} p={p} podeValidar={podeValidar}
              onValidar={validar} onRejeitar={rejeitar}/>
          ))
        )}
      </div>

      {/* Modal nova parada */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:460,
            maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 16px",color:"#0f172a"}}>
              ⏱ Registrar Parada de Fábrica
            </h3>

            <div className="grid-2" style={{display:"grid",gap:10,marginBottom:12}}>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Data
                </label>
                <input type="date" value={form.data} onChange={e=>setForm(f=>({...f,data:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Turno
                </label>
                <select value={form.turno} onChange={e=>setForm(f=>({...f,turno:e.target.value}))}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {TURNOS_CONFIG.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Minutos Parados *
              </label>
              <input type="number" step="1" min="1" value={form.minutos}
                onChange={e=>setForm(f=>({...f,minutos:e.target.value}))}
                placeholder="Ex: 25"
                style={{width:"100%",padding:"10px 12px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:18,fontFamily:"monospace",fontWeight:800,boxSizing:"border-box",
                  color:"#dc2626"}}/>
            </div>

            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:6}}>
                Motivo da Parada *
              </label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {MOTIVOS_PARADA.map(m=>(
                  <button key={m.id} onClick={()=>setForm(f=>({...f,motivo:m.id}))}
                    style={{padding:"6px 11px",borderRadius:7,border:"1.5px solid",
                      borderColor:form.motivo===m.id?m.cor:"#e2e8f0",
                      background:form.motivo===m.id?m.cor+"15":"#fff",
                      color:form.motivo===m.id?m.cor:"#64748b",
                      fontSize:11,fontWeight:600,cursor:"pointer"}}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Observação (opcional)
              </label>
              <textarea rows={3} value={form.observacao}
                onChange={e=>setForm(f=>({...f,observacao:e.target.value}))}
                placeholder="Detalhe o que causou a parada, ações tomadas..."
                style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>

            {erro && (
              <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:6,
                padding:"8px 12px",color:"#dc2626",fontSize:12,marginBottom:12}}>
                {erro}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={salvar} disabled={salvando}
                style={{flex:1,padding:11,background:salvando?"#94a3b8":"linear-gradient(135deg,#dc2626,#b91c1c)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:salvando?"wait":"pointer"}}>
                {salvando?"Salvando...":"💾 Registrar Parada"}
              </button>
              <button onClick={()=>setModal(false)}
                style={{padding:"11px 16px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ESCALA DE FUNÇÕES — calendário mensal de Farelo/Processo
// ══════════════════════════════════════════════════════════════════
const FUNCOES_ESCALA = {
  FARELO:   { label:"Farelo",   icon:"🌾", cor:"#d97706", bg:"#fffbeb" },
  PROCESSO: { label:"Processo", icon:"⚙",  cor:"#0ea5e9", bg:"#e0f2fe" },
};

function DiaEscalaModal({ dia, turnoLider, operadoresDoTurno, escalaDoMes, podeEditar, onDefinir, onFechar }) {
  const dataStr = dia.toISOString().split("T")[0];
  const atribuicoesDoDia = escalaDoMes.filter(e=>e.data===dataStr);

  const funcaoDe = (operadorNome) => {
    const a = atribuicoesDoDia.find(x=>x.operador===operadorNome);
    return a?.funcao || null;
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
      <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:460,
        maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
        <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 4px",color:"#0f172a"}}>
          📅 {dia.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}
        </h3>
        <p style={{fontSize:11,color:"#94a3b8",margin:"0 0 16px",fontFamily:"monospace"}}>
          Turno {turnoLider}
        </p>

        {!podeEditar && (
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,
            padding:"9px 13px",marginBottom:14,fontSize:11,color:"#0284c7"}}>
            ℹ️ Apenas o Líder do turno pode atribuir funções. Você está vendo a escala definida.
          </div>
        )}

        {operadoresDoTurno.length===0 ? (
          <div style={{textAlign:"center",padding:24,color:"#94a3b8",fontSize:12}}>
            Nenhum operador cadastrado para este turno.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {operadoresDoTurno.map(op=>{
              const funcaoAtual = funcaoDe(op.nome);
              return (
                <div key={op.id} style={{background:"#f8fafc",border:"1px solid #e2e8f0",
                  borderRadius:9,padding:13}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:8}}>
                    {op.nome}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    {Object.entries(FUNCOES_ESCALA).map(([fk,fc])=>(
                      <button key={fk}
                        disabled={!podeEditar}
                        onClick={()=>podeEditar && onDefinir(dataStr, op.nome, fk)}
                        style={{flex:1,padding:"9px 0",borderRadius:7,border:"1.5px solid",
                          borderColor:funcaoAtual===fk?fc.cor:"#e2e8f0",
                          background:funcaoAtual===fk?fc.bg:"#fff",
                          color:funcaoAtual===fk?fc.cor:"#94a3b8",
                          fontSize:12,fontWeight:700,
                          cursor:podeEditar?"pointer":"default",
                          opacity:podeEditar?1:0.7}}>
                        {fc.icon} {fc.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onFechar}
          style={{width:"100%",marginTop:16,padding:11,background:"#f1f5f9",color:"#64748b",
            border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600}}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function TelaEscala({ user, escala, setEscala, usuarios }) {
  const hoje = new Date();
  const [mesAtual, setMesAtual] = useState(hoje.getMonth());
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear());
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  // Só Líder edita, e só para o turno dele. Supervisor e Operador só visualizam.
  const podeEditar = user.perfil === "Lider";
  const turnoRelevante = user.perfil === "Lider" ? user.turno : null;

  // Operadores do turno que estamos olhando (do Líder logado, ou "Todos" se for Supervisor/Operador vendo um turno escolhido)
  const [turnoVisualizado, setTurnoVisualizado] = useState(
    user.perfil==="Supervisor" ? "NOITE" : user.turno
  );

  const operadoresDoTurno = useMemo(()=>{
    return usuarios.filter(u=>u.perfil==="Operador" && u.turno===turnoVisualizado && u.ativo!==false);
  },[usuarios, turnoVisualizado]);

  // Dados do mês atual para a grade do calendário
  const primeiroDia = new Date(anoAtual, mesAtual, 1);
  const ultimoDia = new Date(anoAtual, mesAtual+1, 0);
  const diasNoMes = ultimoDia.getDate();
  const diaSemanaInicio = primeiroDia.getDay();

  const celulas = [];
  for (let i=0; i<diaSemanaInicio; i++) celulas.push(null);
  for (let d=1; d<=diasNoMes; d++) celulas.push(new Date(anoAtual, mesAtual, d));

  const mesAnterior = () => {
    if (mesAtual===0) { setMesAtual(11); setAnoAtual(a=>a-1); } else setMesAtual(m=>m-1);
  };
  const mesProximo = () => {
    if (mesAtual===11) { setMesAtual(0); setAnoAtual(a=>a+1); } else setMesAtual(m=>m+1);
  };
  const irHoje = () => { setMesAtual(hoje.getMonth()); setAnoAtual(hoje.getFullYear()); };

  // Escala apenas do turno visualizado, para colorir os dias do calendário
  const escalaDoTurno = useMemo(()=>{
    const nomesOperadores = new Set(operadoresDoTurno.map(o=>o.nome));
    return escala.filter(e=>nomesOperadores.has(e.operador));
  },[escala, operadoresDoTurno]);

  const definirFuncao = async (dataStr, operadorNome, funcao) => {
    setSalvando(true);
    setErro("");
    try {
      const nova = await definirEscala({
        data: dataStr,
        turno: turnoVisualizado,
        operador: operadorNome,
        funcao,
        definidoPor: user.nome,
      });
      setEscala(prev=>{
        const semEsse = prev.filter(e=>!(e.data===dataStr && e.operador===operadorNome));
        return [...semEsse, nova];
      });
    } catch (e) {
      setErro("Erro ao salvar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  // Resumo de quem está em qual função no dia selecionado (para o badge do dia)
  const resumoDoDia = (dia) => {
    if (!dia) return null;
    const dataStr = dia.toISOString().split("T")[0];
    const doDia = escalaDoTurno.filter(e=>e.data===dataStr);
    return doDia;
  };

  const isHoje = (dia) => dia && dia.toDateString() === hoje.toDateString();

  return (
    <div>
      <PH title="📅 Escala de Funções" subtitle="Farelo e Processo — definido pelo Líder de cada turno"/>

      <div style={{padding:22}}>

        {/* Aviso de permissão */}
        {!podeEditar && (
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,
            padding:"10px 14px",marginBottom:16,fontSize:12,color:"#0284c7"}}>
            ℹ️ {user.perfil==="Supervisor"
              ? "Como Supervisor você pode visualizar a escala de qualquer turno, mas só o Líder de cada turno pode editá-la."
              : "Apenas o Líder do seu turno pode atribuir as funções. Você pode consultar a escala abaixo."}
          </div>
        )}

        {/* Seletor de turno — só o Supervisor pode escolher qual turno ver */}
        {user.perfil==="Supervisor" && (
          <div style={{background:"#fff",borderRadius:9,padding:"10px 14px",marginBottom:16,
            border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
              letterSpacing:.5,fontFamily:"monospace"}}>Visualizando turno:</span>
            <div style={{display:"flex",gap:4}}>
              {TURNOS_CONFIG.map(tc=>(
                <button key={tc.id} onClick={()=>setTurnoVisualizado(tc.id)}
                  style={{padding:"5px 12px",borderRadius:12,border:"1.5px solid",
                    borderColor:turnoVisualizado===tc.id?tc.cor:"#e2e8f0",
                    background:turnoVisualizado===tc.id?tc.bg:"#fff",
                    color:turnoVisualizado===tc.id?tc.cor:"#64748b",
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                  {tc.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Legenda */}
        <div style={{background:"#fff",borderRadius:9,padding:"10px 14px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
            letterSpacing:.5,fontFamily:"monospace"}}>Legenda:</span>
          {Object.entries(FUNCOES_ESCALA).map(([fk,fc])=>(
            <div key={fk} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:12,height:12,borderRadius:3,background:fc.cor}}/>
              <span style={{fontSize:12,color:"#475569"}}>{fc.icon} {fc.label}</span>
            </div>
          ))}
          <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>
            {operadoresDoTurno.length} operador{operadoresDoTurno.length!==1?"es":""} no turno {turnoVisualizado}
          </span>
        </div>

        {/* Navegação do calendário */}
        <div style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",
          boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <button onClick={mesAnterior}
              style={{padding:"7px 13px",background:"#f1f5f9",border:"none",borderRadius:7,
                cursor:"pointer",fontSize:13,fontWeight:700,color:"#475569"}}>
              ←
            </button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>
                {MESES[mesAtual]} {anoAtual}
              </div>
              <button onClick={irHoje}
                style={{fontSize:10,color:"#0ea5e9",background:"none",border:"none",
                  cursor:"pointer",fontWeight:600,marginTop:2}}>
                Ir para hoje
              </button>
            </div>
            <button onClick={mesProximo}
              style={{padding:"7px 13px",background:"#f1f5f9",border:"none",borderRadius:7,
                cursor:"pointer",fontSize:13,fontWeight:700,color:"#475569"}}>
              →
            </button>
          </div>

          {/* Cabeçalho dias da semana */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
            {DIAS_SEMANA.map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94a3b8",
                fontFamily:"monospace",padding:"4px 0"}}>
                {d}
              </div>
            ))}
          </div>

          {/* Grade do calendário */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {celulas.map((dia,i)=>{
              if (!dia) return <div key={i}/>;
              const atribs = resumoDoDia(dia) || [];
              const hojeFlag = isHoje(dia);
              return (
                <button key={i} onClick={()=>setDiaSelecionado(dia)}
                  style={{minHeight:64,padding:"6px 4px",borderRadius:8,
                    border:`1.5px solid ${hojeFlag?"#0ea5e9":"#e2e8f0"}`,
                    background:hojeFlag?"#f0f9ff":"#fff",cursor:"pointer",
                    display:"flex",flexDirection:"column",alignItems:"center",
                    gap:3,textAlign:"center"}}>
                  <span style={{fontSize:12,fontWeight:hojeFlag?800:600,
                    color:hojeFlag?"#0284c7":"#1e293b"}}>
                    {dia.getDate()}
                  </span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center"}}>
                    {atribs.slice(0,4).map((a,j)=>{
                      const fc = FUNCOES_ESCALA[a.funcao];
                      return (
                        <div key={j} title={`${a.operador}: ${fc?.label}`}
                          style={{width:7,height:7,borderRadius:"50%",background:fc?.cor||"#94a3b8"}}/>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {erro && (
          <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:6,
            padding:"8px 12px",color:"#dc2626",fontSize:12,marginTop:12}}>
            {erro}
          </div>
        )}
      </div>

      {/* Modal do dia selecionado */}
      {diaSelecionado && (
        <DiaEscalaModal
          dia={diaSelecionado}
          turnoLider={turnoVisualizado}
          operadoresDoTurno={operadoresDoTurno}
          escalaDoMes={escalaDoTurno}
          podeEditar={podeEditar && turnoVisualizado===turnoRelevante}
          onDefinir={definirFuncao}
          onFechar={()=>setDiaSelecionado(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SHO TURNO — Shift Hand Over / Agenda da Troca de Turno
// Digitaliza o formulário em papel: Operador de Saída preenche,
// Operador de Entrada confirma.
// ══════════════════════════════════════════════════════════════════

// Pergunta Sim/Não com campo de detalhe condicional
function PerguntaSimNao({ label, valor, detalhe, onChangeValor, onChangeDetalhe, labelDetalhe="Motivo / detalhe" }) {
  return (
    <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:12,marginBottom:9}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#1e293b",flex:1}}>{label}</span>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>onChangeValor(true)}
            style={{padding:"5px 14px",borderRadius:6,border:"1.5px solid",
              borderColor:valor===true?"#16a34a":"#e2e8f0",
              background:valor===true?"#f0fdf4":"#fff",
              color:valor===true?"#16a34a":"#94a3b8",
              fontSize:11,fontWeight:700,cursor:"pointer"}}>
            Sim
          </button>
          <button onClick={()=>onChangeValor(false)}
            style={{padding:"5px 14px",borderRadius:6,border:"1.5px solid",
              borderColor:valor===false?"#dc2626":"#e2e8f0",
              background:valor===false?"#fff1f2":"#fff",
              color:valor===false?"#dc2626":"#94a3b8",
              fontSize:11,fontWeight:700,cursor:"pointer"}}>
            Não
          </button>
        </div>
      </div>
      {valor===true && onChangeDetalhe && (
        <input type="text" value={detalhe||""} onChange={e=>onChangeDetalhe(e.target.value)}
          placeholder={labelDetalhe}
          style={{width:"100%",marginTop:8,padding:"7px 10px",borderRadius:6,
            border:"1.5px solid #e2e8f0",fontSize:12,boxSizing:"border-box"}}/>
      )}
    </div>
  );
}

function CampoNumerico({ label, meta, valor, onChange, placeholder }) {
  return (
    <div style={{marginBottom:9}}>
      <label style={{display:"flex",justifyContent:"space-between",fontSize:9,fontWeight:700,
        color:"#64748b",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
        <span>{label}</span>
        {meta && <span style={{color:"#94a3b8",textTransform:"none",letterSpacing:0}}>{meta}</span>}
      </label>
      <input type="number" step="0.01" value={valor||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder||"—"}
        style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
          fontSize:13,fontFamily:"monospace",fontWeight:600,boxSizing:"border-box"}}/>
    </div>
  );
}

function SHOTurnoCard({ s, podeConfirmar, onConfirmar, onAbrir }) {
  const tc = TURNOS_CONFIG.find(t=>t.id===s.turno);
  const aguardando = s.status === "AGUARDANDO_ENTRADA";
  return (
    <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",
      borderLeft:`4px solid ${aguardando?"#f59e0b":"#16a34a"}`,
      padding:14,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onAbrir(s)}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>
              {new Date(s.data+"T12:00:00").toLocaleDateString("pt-BR")}
            </span>
            {tc && (
              <span style={{fontSize:9,background:tc.bg,color:tc.cor,padding:"2px 7px",
                borderRadius:4,fontFamily:"monospace",fontWeight:700}}>
                {s.turno}
              </span>
            )}
            <span style={{fontSize:9,background:aguardando?"#fffbeb":"#f0fdf4",
              color:aguardando?"#d97706":"#16a34a",padding:"2px 8px",borderRadius:4,
              fontFamily:"monospace",fontWeight:700}}>
              {aguardando?"⏳ Aguardando entrada":"✓ Confirmado"}
            </span>
          </div>
          <div style={{fontSize:11,color:"#64748b"}}>
            Saída: <b style={{color:"#1e293b"}}>{s.operadorSaida}</b>
            {s.operadorEntrada && <> · Entrada: <b style={{color:"#1e293b"}}>{s.operadorEntrada}</b></>}
          </div>
          {s.temaDDS && (
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4,fontStyle:"italic"}}>
              DDS: {s.temaDDS}
            </div>
          )}
        </div>
        {podeConfirmar && aguardando && (
          <button onClick={()=>onConfirmar(s)}
            style={{padding:"7px 13px",background:"#dcfce7",border:"1px solid #86efac",
              borderRadius:6,color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",
              whiteSpace:"nowrap"}}>
            ✓ Confirmar Entrada
          </button>
        )}
      </div>
    </div>
  );
}

function TelaSHOTurno({ user, shoTurnos, setShoTurnos, metas=METAS_DEFAULT }) {
  const hoje = new Date();
  const turnoAtual = detectarTurno();
  const [modal, setModal] = useState(false);
  const [visualizando, setVisualizando] = useState(null); // SHO sendo visualizado (read-only)
  const [confirmando, setConfirmando] = useState(null); // SHO sendo confirmado pelo Op. Entrada
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  const TIPOS_FARELO = ["Moído","Floculado","Hipro"];

  const formVazio = () => ({
    data: hoje.toISOString().split("T")[0],
    turno: turnoAtual,
    temaDDS: "",
    relatorioTurno: "",
    // Produtividade
    mediaSojaProcessada: "", umidSojaEntrada: "", umidSojaPreparacao: "",
    tipoFareloProduzido: "Moído", granulometriaBom: null,
    espessuraLamina: "", pressaoLaminadores: "",
    aspiracaoSecundaria: "", qualGraneleiro: "", qualCela: "", qualBica: "",
    lexTurno: "", vaporRadiadoresDT: "", vaporRadiadoresMega: "",
    limpezaRDL5533: null, limpezaFiltroManga: null,
    dosandoCasca: null, dosandoCascaPct: "", cascaParaArmazem: null,
    totalizacaoSoja: "", totalizacaoFarelo: "",
    // Segurança
    houveRelatar: null, houveRelatarQual: "",
    // Qualidade — por tipo de farelo
    qualidade: { Moído:{umid:"",prot:"",oleo:"",fibra:""}, Floculado:{umid:"",prot:"",oleo:"",fibra:""}, Hipro:{umid:"",prot:"",oleo:"",fibra:""} },
    percentOleoCasca: "",
    // 5S
    areaLimpa: null, areaLimpaMotivo: "",
    checklistsOk: null, checklistsMotivo: "",
    wpoOk: null, lubrificacaoOk: null,
  });

  const [form, setForm] = useState(formVazio());

  const abrirNovo = () => {
    setForm(formVazio());
    setErro("");
    setModal(true);
  };

  const upd = (campo, valor) => setForm(f=>({...f, [campo]:valor}));
  const updQualidade = (tipo, campo, valor) => setForm(f=>({
    ...f, qualidade: {...f.qualidade, [tipo]: {...f.qualidade[tipo], [campo]:valor}}
  }));

  const salvar = async () => {
    if (!form.relatorioTurno.trim()) { setErro("Preencha o relatório do turno."); return; }
    setSalvando(true);
    setErro("");
    try {
      const novo = await criarSHOTurno({ ...form, operadorSaida: user.nome });
      setShoTurnos(prev=>[novo, ...prev]);
      setModal(false);
    } catch (e) {
      setErro("Erro ao salvar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarEntrada = async () => {
    if (!confirmando) return;
    setSalvando(true);
    try {
      await confirmarSHOTurno(confirmando.id, user.nome);
      setShoTurnos(prev=>prev.map(s=>s.id===confirmando.id
        ? {...s, status:"CONFIRMADO", operadorEntrada:user.nome, dataConfirmacao:new Date().toISOString()}
        : s));
      setConfirmando(null);
    } catch (e) {
      alert("Erro ao confirmar: " + (e.message || e));
    } finally {
      setSalvando(false);
    }
  };

  const filtrados = shoTurnos.filter(s=>{
    if (filtroStatus==="Todos") return true;
    return s.status===filtroStatus;
  });

  const aguardandoCount = shoTurnos.filter(s=>s.status==="AGUARDANDO_ENTRADA").length;

  return (
    <div>
      <PH title="📋 SHO — Troca de Turno" subtitle="Shift Hand Over · Agenda da Troca de Turno Preparação/Extração"
        action={
          <button onClick={abrirNovo}
            style={{padding:"9px 16px",background:"linear-gradient(135deg,#0f172a,#334155)",
              color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:700,cursor:"pointer",
              boxShadow:"0 4px 12px rgba(15,23,42,.25)",whiteSpace:"nowrap"}}>
            + Preencher SHO do Turno
          </button>
        }/>

      <div style={{padding:22}}>

        <div className="grid-2" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Total de SHOs" value={shoTurnos.length} icon="📋" color="#0ea5e9"/>
          <SC label="Aguardando Confirmação" value={aguardandoCount} icon="⏳" color="#d97706"/>
        </div>

        <div style={{background:"#fff",borderRadius:9,padding:"12px 16px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",gap:5}}>
          {["Todos","AGUARDANDO_ENTRADA","CONFIRMADO"].map(s=>(
            <button key={s} onClick={()=>setFiltroStatus(s)}
              style={{padding:"5px 12px",borderRadius:12,border:"1.5px solid",
                borderColor:filtroStatus===s?"#0ea5e9":"#e2e8f0",
                background:filtroStatus===s?"#e0f2fe":"#fff",
                color:filtroStatus===s?"#0284c7":"#64748b",
                fontSize:11,fontWeight:600,cursor:"pointer"}}>
              {s==="Todos"?"Todos":s==="AGUARDANDO_ENTRADA"?"Aguardando":"Confirmados"}
            </button>
          ))}
        </div>

        {filtrados.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:40,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>📋</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b"}}>
              Nenhum SHO registrado ainda
            </div>
          </div>
        ) : (
          filtrados.map(s=>(
            <SHOTurnoCard key={s.id} s={s}
              podeConfirmar={s.operadorSaida!==user.nome}
              onConfirmar={setConfirmando}
              onAbrir={setVisualizando}/>
          ))
        )}
      </div>

      {/* Modal de preenchimento (Operador de Saída) */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
          <div style={{background:"#fff",borderRadius:13,padding:22,width:"100%",maxWidth:680,
            maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>

            <div style={{background:"#0f172a",borderRadius:10,padding:"14px 18px",marginBottom:16}}>
              <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",textTransform:"uppercase",
                letterSpacing:1,marginBottom:3}}>ADM Brasil · Preparação/Extração</div>
              <h3 style={{fontSize:15,fontWeight:800,margin:0,color:"#fff"}}>
                Shift Hand Over (SHO) — Agenda da Troca de Turno
              </h3>
            </div>

            <div className="grid-2" style={{display:"grid",gap:10,marginBottom:14}}>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Data
                </label>
                <input type="date" value={form.data} onChange={e=>upd("data",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Turno de Saída
                </label>
                <select value={form.turno} onChange={e=>upd("turno",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {TURNOS_CONFIG.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Tema DDS (Diálogo Diário de Segurança)
              </label>
              <input type="text" value={form.temaDDS} onChange={e=>upd("temaDDS",e.target.value)}
                placeholder="Ex: Uso correto de EPI's"
                style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                  fontSize:12,boxSizing:"border-box"}}/>
            </div>

            {/* PRODUTIVIDADE */}
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,
              padding:"6px 12px",marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",
                letterSpacing:.5}}>📊 Produtividade</span>
            </div>

            <div className="grid-2" style={{display:"grid",gap:10}}>
              <CampoNumerico label="Média Soja Processada" meta="Meta 75 Ton/H"
                valor={form.mediaSojaProcessada} onChange={v=>upd("mediaSojaProcessada",v)} placeholder="Ton/H"/>
              <CampoNumerico label="Umid. Soja Entrada" meta={`Entre ${metas.UmidSojaEntrada?.min}% e ${metas.UmidSojaEntrada?.max}%`}
                valor={form.umidSojaEntrada} onChange={v=>upd("umidSojaEntrada",v)} placeholder="%"/>
              <CampoNumerico label="Umid. Soja Preparação" meta={`Entre ${metas.UmidSojaProducao?.min}% e ${metas.UmidSojaProducao?.max}%`}
                valor={form.umidSojaPreparacao} onChange={v=>upd("umidSojaPreparacao",v)} placeholder="%"/>
              <div style={{marginBottom:9}}>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Tipo Farelo Produzido
                </label>
                <select value={form.tipoFareloProduzido} onChange={e=>upd("tipoFareloProduzido",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,background:"#fff",boxSizing:"border-box"}}>
                  {TIPOS_FARELO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <CampoNumerico label="Espessura Lâmina" meta="Entre 0,35mm e 0,40mm"
                valor={form.espessuraLamina} onChange={v=>upd("espessuraLamina",v)} placeholder="mm"/>
              <CampoNumerico label="Pressão Hidráulica Laminadores" meta="Entre 40bar e 65bar"
                valor={form.pressaoLaminadores} onChange={v=>upd("pressaoLaminadores",v)} placeholder="bar"/>
              <CampoNumerico label="Aspiração Secundária (KICE)" valor={form.aspiracaoSecundaria}
                onChange={v=>upd("aspiracaoSecundaria",v)} placeholder="Check depressões"/>
              <CampoNumerico label="LEX do turno" meta="Meta 0,69" valor={form.lexTurno}
                onChange={v=>upd("lexTurno",v)}/>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Qual Graneleiro?
                </label>
                <input type="text" value={form.qualGraneleiro} onChange={e=>upd("qualGraneleiro",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Qual Célula?
                </label>
                <input type="text" value={form.qualCela} onChange={e=>upd("qualCela",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                  textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                  Qual Bica?
                </label>
                <input type="text" value={form.qualBica} onChange={e=>upd("qualBica",e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1.5px solid #e2e8f0",
                    fontSize:12,boxSizing:"border-box"}}/>
              </div>
              <CampoNumerico label="Vapor Radiadores DT" valor={form.vaporRadiadoresDT}
                onChange={v=>upd("vaporRadiadoresDT",v)}/>
              <CampoNumerico label="Vapor Radiadores Mega" valor={form.vaporRadiadoresMega}
                onChange={v=>upd("vaporRadiadoresMega",v)}/>
            </div>

            <PerguntaSimNao label="Foi feito limpeza no RDL5533?" valor={form.limpezaRDL5533}
              onChangeValor={v=>upd("limpezaRDL5533",v)}/>
            <PerguntaSimNao label="Foi feito limpeza no filtro de manga 2560?" valor={form.limpezaFiltroManga}
              onChangeValor={v=>upd("limpezaFiltroManga",v)}/>
            <PerguntaSimNao label="Está dosando casca?" valor={form.dosandoCasca}
              detalhe={form.dosandoCascaPct} onChangeValor={v=>upd("dosandoCasca",v)}
              onChangeDetalhe={v=>upd("dosandoCascaPct",v)} labelDetalhe="Quantos % ?"/>
            <PerguntaSimNao label="Casca está para o armazém?" valor={form.cascaParaArmazem}
              onChangeValor={v=>upd("cascaParaArmazem",v)}/>

            <div className="grid-2" style={{display:"grid",gap:10,marginTop:4}}>
              <CampoNumerico label="Totalização Soja" valor={form.totalizacaoSoja}
                onChange={v=>upd("totalizacaoSoja",v)} placeholder="ton"/>
              <CampoNumerico label="Totalização Farelo" valor={form.totalizacaoFarelo}
                onChange={v=>upd("totalizacaoFarelo",v)} placeholder="ton"/>
            </div>

            {/* SEGURANÇA */}
            <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,
              padding:"6px 12px",margin:"16px 0 12px"}}>
              <span style={{fontSize:11,fontWeight:800,color:"#991b1b",textTransform:"uppercase",
                letterSpacing:.5}}>🦺 Segurança</span>
            </div>
            <PerguntaSimNao label="Houve algum RELATAR durante o turno?" valor={form.houveRelatar}
              detalhe={form.houveRelatarQual} onChangeValor={v=>upd("houveRelatar",v)}
              onChangeDetalhe={v=>upd("houveRelatarQual",v)} labelDetalhe="Qual?"/>

            {/* QUALIDADE */}
            <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,
              padding:"6px 12px",margin:"16px 0 12px"}}>
              <span style={{fontSize:11,fontWeight:800,color:"#1e3a8a",textTransform:"uppercase",
                letterSpacing:.5}}>🧪 Qualidade</span>
            </div>
            <div className="table-scroll">
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:12}}>
                <thead>
                  <tr style={{background:"#f1f5f9"}}>
                    <th style={{textAlign:"left",padding:"6px 8px",fontSize:9,fontFamily:"monospace",
                      color:"#64748b",textTransform:"uppercase"}}>KPI</th>
                    <th style={{textAlign:"left",padding:"6px 8px",fontSize:9,fontFamily:"monospace",
                      color:"#64748b",textTransform:"uppercase"}}>Meta</th>
                    {TIPOS_FARELO.map(t=>(
                      <th key={t} style={{textAlign:"center",padding:"6px 8px",fontSize:9,
                        fontFamily:"monospace",color:"#64748b",textTransform:"uppercase"}}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["umid","Umidade","46% Menor que 12,8 / Hipro Menor que 11,5%"],
                    ["prot","Proteína","46% Maior que 45,7 / Hipro Maior que 47,0%"],
                    ["oleo","Óleo","Máximo 2,5%"],
                    ["fibra","Fibra","Máximo 6%"],
                  ].map(([campo,label,meta])=>(
                    <tr key={campo} style={{borderTop:"1px solid #f1f5f9"}}>
                      <td style={{padding:"6px 8px",fontWeight:600,whiteSpace:"nowrap"}}>{label}</td>
                      <td style={{padding:"6px 8px",fontSize:9,color:"#94a3b8",whiteSpace:"nowrap"}}>{meta}</td>
                      {TIPOS_FARELO.map(tipo=>(
                        <td key={tipo} style={{padding:"4px 6px"}}>
                          <input type="number" step="0.01" value={form.qualidade[tipo][campo]}
                            onChange={e=>updQualidade(tipo,campo,e.target.value)}
                            style={{width:60,padding:"5px 6px",borderRadius:5,border:"1px solid #e2e8f0",
                              fontSize:11,fontFamily:"monospace",textAlign:"center",boxSizing:"border-box"}}/>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CampoNumerico label="% Óleo na Casca" valor={form.percentOleoCasca}
              onChange={v=>upd("percentOleoCasca",v)} placeholder="%"/>

            {/* 5S */}
            <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,
              padding:"6px 12px",margin:"16px 0 12px"}}>
              <span style={{fontSize:11,fontWeight:800,color:"#14532d",textTransform:"uppercase",
                letterSpacing:.5}}>🧹 5S</span>
            </div>
            <PerguntaSimNao label="Área limpa e organizada?" valor={form.areaLimpa}
              detalhe={form.areaLimpaMotivo} onChangeValor={v=>upd("areaLimpa",v)}
              onChangeDetalhe={v=>upd("areaLimpaMotivo",v)} labelDetalhe="Motivo (se não)"/>
            <PerguntaSimNao label="Check Lists WPO e DEC preenchidos e assinados?" valor={form.checklistsOk}
              detalhe={form.checklistsMotivo} onChangeValor={v=>upd("checklistsOk",v)}
              onChangeDetalhe={v=>upd("checklistsMotivo",v)} labelDetalhe="Motivo (se não)"/>
            <PerguntaSimNao label="WPO / Qualidade — em dia?" valor={form.wpoOk}
              onChangeValor={v=>upd("wpoOk",v)}/>
            <PerguntaSimNao label="Lubrificação e Inspeção das Máquinas — em dia?" valor={form.lubrificacaoOk}
              onChangeValor={v=>upd("lubrificacaoOk",v)}/>

            {/* RELATÓRIO DO TURNO */}
            <div style={{marginTop:6,marginBottom:14}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#64748b",
                textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>
                Relatório do Turno *
              </label>
              <textarea rows={5} value={form.relatorioTurno} onChange={e=>upd("relatorioTurno",e.target.value)}
                placeholder="Descreva os principais acontecimentos do turno para o próximo operador..."
                style={{width:"100%",padding:"9px 11px",borderRadius:7,border:"1.5px solid #e2e8f0",
                  fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>

            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,
              padding:"10px 13px",marginBottom:14,fontSize:11,color:"#64748b"}}>
              ✍ Assinatura Operador de Saída: <b style={{color:"#0f172a"}}>{user.nome}</b>
              <div style={{marginTop:3,color:"#94a3b8",fontSize:10}}>
                A assinatura do Operador de Entrada será coletada quando ele confirmar o recebimento do turno.
              </div>
            </div>

            {erro && (
              <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:6,
                padding:"8px 12px",color:"#dc2626",fontSize:12,marginBottom:12}}>
                {erro}
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={salvar} disabled={salvando}
                style={{flex:1,padding:12,background:salvando?"#94a3b8":"linear-gradient(135deg,#0f172a,#334155)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:salvando?"wait":"pointer"}}>
                {salvando?"Salvando...":"💾 Salvar SHO do Turno"}
              </button>
              <button onClick={()=>setModal(false)}
                style={{padding:"12px 16px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de visualização (read-only) */}
      {visualizando && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}
          onClick={()=>setVisualizando(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#fff",borderRadius:13,padding:22,width:"100%",maxWidth:560,
            maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 4px",color:"#0f172a"}}>
              {new Date(visualizando.data+"T12:00:00").toLocaleDateString("pt-BR")} · {visualizando.turno}
            </h3>
            <p style={{fontSize:10,color:"#94a3b8",margin:"0 0 16px",fontFamily:"monospace"}}>
              Saída: {visualizando.operadorSaida} {visualizando.operadorEntrada && `→ Entrada: ${visualizando.operadorEntrada}`}
            </p>
            {visualizando.temaDDS && (
              <div style={{marginBottom:12,fontSize:12}}>
                <b>Tema DDS:</b> {visualizando.temaDDS}
              </div>
            )}
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,
              padding:13,marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",
                marginBottom:6,fontFamily:"monospace"}}>Relatório do Turno</div>
              <div style={{fontSize:12,color:"#1e293b",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                {visualizando.relatorioTurno}
              </div>
            </div>
            <button onClick={()=>setVisualizando(null)}
              style={{width:"100%",padding:11,background:"#f1f5f9",color:"#64748b",
                border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600}}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmação (Operador de Entrada) */}
      {confirmando && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:210,padding:20}}>
          <div style={{background:"#fff",borderRadius:13,padding:24,width:"100%",maxWidth:420,
            boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:32,marginBottom:10,textAlign:"center"}}>✍</div>
            <h3 style={{fontSize:15,fontWeight:800,margin:"0 0 8px",textAlign:"center",color:"#0f172a"}}>
              Confirmar Recebimento do Turno
            </h3>
            <p style={{fontSize:12,color:"#64748b",textAlign:"center",margin:"0 0 18px",lineHeight:1.6}}>
              Você está confirmando que recebeu o turno de <b style={{color:"#0f172a"}}>{confirmando.operadorSaida}</b>{" "}
              ({new Date(confirmando.data+"T12:00:00").toLocaleDateString("pt-BR")} · {confirmando.turno})
              e leu o relatório do turno.
            </p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirmarEntrada} disabled={salvando}
                style={{flex:1,padding:11,background:salvando?"#94a3b8":"linear-gradient(135deg,#16a34a,#15803d)",
                  color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,
                  cursor:salvando?"wait":"pointer"}}>
                {salvando?"Confirmando...":`✓ Confirmar como ${user.nome.split(" ")[0]}`}
              </button>
              <button onClick={()=>setConfirmando(null)}
                style={{padding:"11px 16px",background:"#f1f5f9",color:"#64748b",
                  border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════
function TelaLogin({onLogin}) {
  const [email,setEmail]=useState(""); const [senha,setSenha]=useState(""); const [erro,setErro]=useState(""); const [load,setLoad]=useState(false);
  const go=async()=>{
    if(!email||!senha) return;
    setLoad(true); setErro("");
    try {
      const u = await apiLogin(email, senha);
      if(u) onLogin(u);
      else setErro("Credenciais inválidas ou usuário inativo.");
    } catch(e) {
      setErro("Erro ao conectar com o servidor. Tente novamente.");
      console.error(e);
    } finally {
      setLoad(false);
    }
  };
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",width:60,height:60,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",borderRadius:16,alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:12,boxShadow:"0 0 28px rgba(14,165,233,.4)"}}>🏭</div>
          <div style={{color:"#94a3b8",fontSize:10,letterSpacing:3,textTransform:"uppercase",fontFamily:"monospace",marginBottom:5}}>ADM Brasil · SHO · Preparação</div>
          <h1 style={{color:"#f1f5f9",fontSize:24,fontWeight:800,margin:0}}>Sistema <span style={{color:"#0ea5e9"}}>KPI</span></h1>
          <p style={{color:"#64748b",fontSize:12,marginTop:4}}>Gerenciamento Completo · Uberlândia</p>
        </div>
        <div style={{background:"rgba(30,41,59,.85)",border:"1px solid rgba(148,163,184,.1)",borderRadius:15,padding:24}}>
          {[["E-mail Corporativo",email,setEmail,"text","usuario@adm.com"],["Senha",senha,setSenha,"password","••••••••"]].map(([l,v,set,t,ph])=>(
            <div key={l} style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:9,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",marginBottom:4}}>{l}</label>
              <input type={t} value={v} onChange={e=>set(e.target.value)} placeholder={ph} onKeyDown={e=>e.key==="Enter"&&go()} style={{width:"100%",padding:"10px 12px",borderRadius:7,border:"1.5px solid rgba(148,163,184,.15)",background:"rgba(15,23,42,.6)",color:"#f1f5f9",fontSize:13,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          {erro&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:5,padding:"8px 12px",color:"#dc2626",fontSize:12,marginBottom:10}}>{erro}</div>}
          <button onClick={go} style={{width:"100%",padding:11,background:load?"#0369a1":"linear-gradient(135deg,#0ea5e9,#0284c7)",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:load?"wait":"pointer",boxShadow:"0 4px 14px rgba(14,165,233,.3)"}}>{load?"Autenticando...":"Entrar →"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CANVAS DE ASSINATURA
// ══════════════════════════════════════════════════════════════════
function PadAssinatura({ onSave, onCancel, nomeUsuario, assinaturaSalva }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef({x:0,y:0});
  const [isEmpty,   setIsEmpty]  = useState(true);
  const [salvarDev, setSalvarDev]= useState(false);

  const initCanvas = () => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setLineDash([4,4]); ctx.strokeStyle="#e2e8f0"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(20,canvas.height-38); ctx.lineTo(canvas.width-20,canvas.height-38); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle="#1e293b"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
  };
  useEffect(()=>{ initCanvas(); },[]);

  const getPos=(e,canvas)=>{
    const r=canvas.getBoundingClientRect();
    const sx=canvas.width/r.width, sy=canvas.height/r.height;
    if(e.touches) return {x:(e.touches[0].clientX-r.left)*sx,y:(e.touches[0].clientY-r.top)*sy};
    return {x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};
  };
  const startDraw=(e)=>{ e.preventDefault(); drawing.current=true; lastPos.current=getPos(e,canvasRef.current); setIsEmpty(false); };
  const doDraw=(e)=>{ e.preventDefault(); if(!drawing.current) return; const c=canvasRef.current; const ctx=c.getContext("2d"); const pos=getPos(e,c); ctx.strokeStyle="#1e293b"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(lastPos.current.x,lastPos.current.y); ctx.lineTo(pos.x,pos.y); ctx.stroke(); lastPos.current=pos; };
  const stopDraw=()=>{ drawing.current=false; };
  const limpar=()=>{ initCanvas(); setIsEmpty(true); };
  const confirmar=()=>{ const url=canvasRef.current.toDataURL("image/png"); onSave(url, salvarDev); };

  return (
    <div style={{background:"#fff",borderRadius:14,padding:26,width:"100%",maxWidth:500,boxShadow:"0 24px 64px rgba(0,0,0,.35)"}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,fontFamily:"monospace",color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Assinatura Digital</div>
        <h3 style={{fontSize:16,fontWeight:800,color:"#0f172a",margin:"0 0 3px"}}>{nomeUsuario}</h3>
        <div style={{fontSize:11,color:"#94a3b8"}}>Data: <b style={{color:"#1e293b"}}>{new Date().toLocaleDateString("pt-BR")}</b> · válida somente hoje</div>
      </div>

      {/* Opção usar assinatura salva */}
      {assinaturaSalva && (
        <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"10px 13px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#16a34a",marginBottom:2}}>💾 Assinatura salva disponível</div>
            <div style={{fontSize:11,color:"#64748b"}}>Reutilize sua assinatura armazenada</div>
          </div>
          <button onClick={()=>onSave(assinaturaSalva, false)}
            style={{padding:"7px 14px",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            Usar salva ✓
          </button>
        </div>
      )}

      {/* Canvas */}
      <div style={{position:"relative",marginBottom:10}}>
        <canvas ref={canvasRef} width={450} height={155}
          onMouseDown={startDraw} onMouseMove={doDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={doDraw} onTouchEnd={stopDraw}
          style={{width:"100%",height:155,borderRadius:8,border:"1.5px solid #e2e8f0",cursor:"crosshair",touchAction:"none",display:"block"}}/>
        {isEmpty&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><span style={{fontSize:13,color:"#cbd5e1",fontFamily:"monospace"}}>✍  Assine aqui</span></div>}
      </div>

      {/* Salvar no dispositivo */}
      {!isEmpty && (
        <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:13,cursor:"pointer",fontSize:12,color:"#475569",userSelect:"none"}}>
          <input type="checkbox" checked={salvarDev} onChange={e=>setSalvarDev(e.target.checked)} style={{width:14,height:14,cursor:"pointer"}}/>
          💾 Salvar assinatura neste dispositivo para reutilizar hoje
        </label>
      )}

      {/* Botões */}
      <div style={{display:"flex",gap:9}}>
        <button onClick={confirmar} disabled={isEmpty}
          style={{flex:1,padding:11,background:isEmpty?"#e2e8f0":"linear-gradient(135deg,#0ea5e9,#0284c7)",color:isEmpty?"#94a3b8":"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:isEmpty?"not-allowed":"pointer",boxShadow:isEmpty?"none":"0 4px 12px rgba(14,165,233,.25)"}}>
          ✅ Confirmar Assinatura
        </button>
        <button onClick={limpar} style={{padding:"11px 14px",background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:600}} title="Limpar">🗑</button>
        <button onClick={onCancel} style={{padding:"11px 14px",background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,fontSize:13,cursor:"pointer"}}>✕</button>
      </div>
    </div>
  );
}

// Card individual de assinatura por perfil
function CardAss({ perfil, assinaturas, onAbrir }) {
  const cfg = PERFIS_ASSINATURA.find(p=>p.id===perfil);
  const ass = assinaturas?.[perfil];
  const ok  = !!ass?.dataURL;
  return (
    <div style={{background:"#fff",border:`2px solid ${ok?"#86efac":"#e2e8f0"}`,borderRadius:11,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.05)",transition:"border-color .2s"}}>
      <div style={{background:ok?"linear-gradient(135deg,#16a34a,#15803d)":`linear-gradient(135deg,${cfg.cor},${cfg.cor}cc)`,padding:"9px 13px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:14}}>{cfg.icon}</span>
          <div>
            <div style={{color:"#fff",fontSize:11,fontWeight:800,lineHeight:1}}>{cfg.label}</div>
            {ok&&<div style={{color:"rgba(255,255,255,.75)",fontSize:9,fontFamily:"monospace",marginTop:2}}>{ass.nome} · {new Date(ass.timestamp).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>}
          </div>
        </div>
        <span style={{background:"rgba(255,255,255,.2)",color:"#fff",fontSize:9,fontFamily:"monospace",fontWeight:700,padding:"2px 7px",borderRadius:3}}>{ok?"ASSINADO":"PENDENTE"}</span>
      </div>
      <div style={{padding:13,minHeight:90,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        {ok ? (
          <>
            <img src={ass.dataURL} alt="ass" style={{maxWidth:"100%",maxHeight:70,objectFit:"contain",border:"1px solid #f1f5f9",borderRadius:5}}/>
            <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginTop:5,textAlign:"center"}}>{ass.data} · válida por hoje</div>
          </>
        ) : (
          <button onClick={()=>onAbrir(perfil)} style={{padding:"9px 18px",background:`linear-gradient(135deg,${cfg.cor},${cfg.cor}cc)`,color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 12px ${cfg.cor}40`}}>
            ✍ Assinar
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TELA DE ASSINATURAS
// ══════════════════════════════════════════════════════════════════
// ── BOLETIM ITEM — componente isolado para corrigir o hook-in-map ──
function BoletimItem({ b, assinaturas, onAbrirAss, onAdicionarFoto }) {
  const [expand,    setExpand]    = useState(false);
  const [abaAtiva,  setAbaAtiva]  = useState("assinaturas"); // "assinaturas" | "fotos"
  const fileRef                   = useRef(null);

  const ass       = assinaturas[b.data] || {};
  const assinados = PERFIS_ASSINATURA.filter(p=>ass[p.id]?.dataURL).length;
  const todasOk   = assinados === PERFIS_ASSINATURA.length;
  const fotos     = b.fotos || [];

  const handleFotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onAdicionarFoto(b.data, {
        id:        Date.now(),
        dataURL:   ev.target.result,
        nome:      file.name,
        timestamp: new Date().toISOString(),
        tipo:      file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div style={{background:"#fff",borderRadius:12,overflow:"hidden",
      border:`1.5px solid ${todasOk?"#86efac":"#e2e8f0"}`,
      boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:12}}>

      {/* ── HEADER DO BOLETIM ── */}
      <div style={{
        padding:"12px 16px",
        background: todasOk
          ? "linear-gradient(135deg,#f0fdf4,#dcfce7)"
          : "linear-gradient(135deg,#f8fafc,#f1f5f9)",
        borderBottom:"1px solid #e2e8f0",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:800,color:"#0f172a"}}>{b.lote}</span>
            <span style={{fontSize:11,color:"#64748b"}}>· {b.data}</span>
            <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{b.totalRegs} registros</span>
            {fotos.length > 0 && (
              <span style={{fontSize:10,background:"#fff7ed",color:"#c2410c",padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>
                📷 {fotos.length} foto{fotos.length>1?"s":""}
              </span>
            )}
            {todasOk
              ? <span style={{fontSize:10,background:"#dcfce7",color:"#16a34a",padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>✅ APROVADO</span>
              : <span style={{fontSize:10,background:"#fef3c7",color:"#d97706",padding:"2px 7px",borderRadius:3,fontFamily:"monospace",fontWeight:700}}>🔒 {assinados}/3</span>}
          </div>
          <div style={{display:"flex",gap:12,fontSize:11,fontFamily:"monospace",flexWrap:"wrap"}}>
            <span>🔬 Prot: <b style={{color:b.proteina_media>=46&&b.proteina_media<=46.5?"#16a34a":"#dc2626"}}>{b.proteina_media}%</b></span>
            <span>💧 Umid: <b style={{color:b.umid_media>=12&&b.umid_media<=12.5?"#16a34a":"#dc2626"}}>{b.umid_media}%</b></span>
            <span>🫙 Óleo: <b style={{color:"#1e293b"}}>{b.oleo_media}%</b></span>
          </div>
        </div>
        <button onClick={()=>setExpand(x=>!x)}
          style={{padding:"7px 13px",background:"#fff",border:"1px solid #e2e8f0",
            borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",color:"#475569",
            flexShrink:0, whiteSpace:"nowrap"}}>
          {expand ? "▲ Fechar" : "✍ Ver Boletim"}
        </button>
      </div>

      {/* ── PAINEL EXPANDIDO ── */}
      {expand && (
        <div style={{padding:16}}>

          {/* Abas: Assinaturas / Fotos */}
          <div style={{display:"flex",gap:4,background:"#f1f5f9",padding:4,borderRadius:8,marginBottom:16,width:"fit-content"}}>
            {[["assinaturas","✍ Assinaturas"],["fotos","📷 Fotos NC"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setAbaAtiva(id)}
                style={{padding:"6px 14px",borderRadius:6,border:"none",fontSize:12,fontWeight:600,
                  cursor:"pointer",
                  background:abaAtiva===id?"#fff":"transparent",
                  color:abaAtiva===id?"#0f172a":"#64748b",
                  boxShadow:abaAtiva===id?"0 1px 4px rgba(0,0,0,.1)":"none"}}>
                {lbl}
                {id==="fotos"&&fotos.length>0&&(
                  <span style={{marginLeft:5,background:"#f97316",color:"#fff",fontSize:9,
                    fontFamily:"monospace",fontWeight:700,padding:"1px 5px",borderRadius:8}}>
                    {fotos.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── ABA ASSINATURAS ── */}
          {abaAtiva==="assinaturas" && (
            <>
              {/* Barra de progresso */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <div style={{flex:1,background:"#e2e8f0",borderRadius:3,height:7,overflow:"hidden"}}>
                  <div style={{width:`${(assinados/3)*100}%`,height:"100%",
                    background:todasOk?"#16a34a":"#0ea5e9",borderRadius:3,transition:"width .5s"}}/>
                </div>
                <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,
                  color:todasOk?"#16a34a":"#64748b",whiteSpace:"nowrap"}}>
                  {assinados}/3
                </span>
              </div>

              {/* Grid de cards de assinatura */}
              <div className="grid-3" style={{display:"grid",gap:11,marginBottom:14}}>
                {PERFIS_ASSINATURA.map(p=>(
                  <CardAss key={p.id} perfil={p.id} assinaturas={ass}
                    onAbrir={()=>onAbrirAss(b.data, p.id)}/>
                ))}
              </div>

              {/* Status final */}
              {!todasOk ? (
                <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:8,
                  padding:"10px 13px",display:"flex",alignItems:"center",gap:9}}>
                  <span style={{fontSize:15}}>🔒</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
                      Boletim bloqueado — assinaturas pendentes
                    </div>
                    <div style={{fontSize:11,color:"#92400e",marginTop:2}}>
                      Faltam: {PERFIS_ASSINATURA.filter(p=>!ass[p.id]?.dataURL).map(p=>p.label).join(", ")}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:8,
                  padding:"10px 13px",display:"flex",alignItems:"center",
                  justifyContent:"space-between",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{fontSize:15}}>✅</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>
                        Boletim aprovado — todas as assinaturas coletadas
                      </div>
                      <div style={{fontSize:11,color:"#16a34a",marginTop:2}}>Válido para {b.data}</div>
                    </div>
                  </div>
                  <button style={{padding:"7px 14px",background:"linear-gradient(135deg,#16a34a,#15803d)",
                    color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,
                    cursor:"pointer",whiteSpace:"nowrap"}}>
                    🖨 Imprimir
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── ABA FOTOS NC ── */}
          {abaAtiva==="fotos" && (
            <div>
              {/* Botão adicionar foto */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:2}}>
                    📷 Fotos de Não Conformidade
                  </div>
                  <div style={{fontSize:11,color:"#64748b"}}>
                    Registre evidências fotográficas de desvios e não conformidades deste boletim
                  </div>
                </div>
                <button
                  onClick={()=>fileRef.current?.click()}
                  style={{padding:"8px 16px",background:"linear-gradient(135deg,#f97316,#ea580c)",
                    color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,
                    cursor:"pointer",boxShadow:"0 4px 12px rgba(249,115,22,.25)",
                    whiteSpace:"nowrap",flexShrink:0}}>
                  📷 Adicionar Foto
                </button>
                <input ref={fileRef} type="file" accept="image/*"
                  style={{display:"none"}} onChange={handleFotoUpload}/>
              </div>

              {/* Grid de fotos */}
              {fotos.length === 0 ? (
                <div style={{background:"#fff7ed",border:"1.5px dashed #fed7aa",borderRadius:10,
                  padding:32,textAlign:"center",color:"#94a3b8"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📷</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#c2410c",marginBottom:4}}>
                    Nenhuma foto registrada
                  </div>
                  <div style={{fontSize:11,color:"#92400e"}}>
                    Clique em "Adicionar Foto" para anexar evidências de não conformidade
                  </div>
                </div>
              ) : (
                <div className="grid-3" style={{display:"grid",gap:10}}>
                  {fotos.map((foto,i)=>(
                    <div key={foto.id} style={{borderRadius:8,overflow:"hidden",
                      border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                      <img src={foto.dataURL} alt={foto.nome}
                        style={{width:"100%",height:140,objectFit:"cover",display:"block"}}/>
                      <div style={{padding:"8px 10px",background:"#f8fafc"}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#1e293b",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          marginBottom:2}}>
                          📎 {foto.nome}
                        </div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
                          {new Date(foto.timestamp).toLocaleTimeString("pt-BR",
                            {hour:"2-digit",minute:"2-digit"})}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Card de adicionar mais */}
                  <button onClick={()=>fileRef.current?.click()}
                    style={{borderRadius:8,border:"1.5px dashed #fed7aa",
                      background:"#fff7ed",cursor:"pointer",
                      display:"flex",flexDirection:"column",
                      alignItems:"center",justifyContent:"center",
                      gap:8,minHeight:160,padding:16}}>
                    <span style={{fontSize:24}}>➕</span>
                    <span style={{fontSize:11,color:"#c2410c",fontWeight:600}}>
                      Adicionar mais
                    </span>
                  </button>
                </div>
              )}

              {/* Aviso */}
              <div style={{marginTop:14,background:"#fef9c3",border:"1px solid #fde68a",
                borderRadius:7,padding:"9px 13px",fontSize:11,color:"#854d0e",
                display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{flexShrink:0}}>⚠</span>
                <span>Fotos são vinculadas a este boletim e ficam disponíveis para consulta.
                  Descreva a não conformidade na ação corretiva correspondente.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TELA ASSINATURAS — corrigida (sem hook dentro de .map)
// ══════════════════════════════════════════════════════════════════
function TelaAssinaturas({ registros }) {
  const [assinaturas,  setAssinaturas]  = useState({});
  const [fotosBoletim, setFotosBoletim] = useState({}); // { [data]: [{id,dataURL,nome,timestamp}] }
  const [perfilAtivo,  setPerfilAtivo]  = useState(null);
  const [boletimAtivo, setBoletimAtivo] = useState(null);
  const [filtro,       setFiltro]       = useState("todos");
  const [assSalvas,    setAssSalvas]    = useState({});

  // Boletins derivados dos registros agrupados por dia
  const boletins = useMemo(()=>{
    const dias = [...new Set(registros.filter(r=>r.tipo==="moagem").map(r=>r.data))].sort().reverse();
    return dias.slice(0,10).map(data=>{
      const regs = registros.filter(r=>r.tipo==="moagem"&&r.data===data&&r.ProteinaFarelo);
      if(!regs.length) return null;
      const prot = +(regs.reduce((a,r)=>a+(r.ProteinaFarelo||0),0)/regs.length).toFixed(2);
      const umid = +(regs.reduce((a,r)=>a+(r.UmidFarelo||0),0)/regs.length).toFixed(2);
      const oleo = +(regs.reduce((a,r)=>a+(r.OleoFarelo||0),0)/regs.length).toFixed(2);
      return {
        data, lote:`LOT-${data.replace(/-/g,"")}`,
        proteina_media:prot, umid_media:umid, oleo_media:oleo,
        totalRegs:regs.length,
        fotos: fotosBoletim[data] || [],
      };
    }).filter(Boolean);
  },[registros, fotosBoletim]);

  const handleAbrirAss = (data, perfil) => {
    setBoletimAtivo(data);
    setPerfilAtivo(perfil);
  };

  const handleSalvarAss = (dataURL, salvarDispositivo) => {
    const cfg    = PERFIS_ASSINATURA.find(p=>p.id===perfilAtivo);
    const novaAss = {
      dataURL,
      nome:      cfg?.label || perfilAtivo,
      perfil:    perfilAtivo,
      data:      boletimAtivo,
      timestamp: new Date().toISOString(),
    };
    setAssinaturas(prev=>({
      ...prev,
      [boletimAtivo]: { ...(prev[boletimAtivo]||{}), [perfilAtivo]: novaAss },
    }));
    if(salvarDispositivo) setAssSalvas(s=>({...s,[perfilAtivo]:dataURL}));
    setPerfilAtivo(null);
    setBoletimAtivo(null);
  };

  const handleAdicionarFoto = (data, foto) => {
    setFotosBoletim(prev=>({
      ...prev,
      [data]: [...(prev[data]||[]), foto],
    }));
  };

  const stats = useMemo(()=>{
    const total     = boletins.length;
    const aprovados = boletins.filter(b=>{
      const a=assinaturas[b.data]||{};
      return PERFIS_ASSINATURA.every(p=>a[p.id]?.dataURL);
    }).length;
    const totalFotos = Object.values(fotosBoletim).reduce((a,f)=>a+f.length,0);
    return { total, aprovados, pendentes:total-aprovados, totalFotos };
  },[boletins,assinaturas,fotosBoletim]);

  const filtrados = boletins.filter(b=>{
    const a=assinaturas[b.data]||{};
    const ok=PERFIS_ASSINATURA.every(p=>a[p.id]?.dataURL);
    if(filtro==="aprovados") return ok;
    if(filtro==="pendentes") return !ok;
    return true;
  });

  const totalAssColetadas = boletins.reduce((a,b)=>{
    const ass=assinaturas[b.data]||{};
    return a+PERFIS_ASSINATURA.filter(p=>ass[p.id]?.dataURL).length;
  },0);

  return (
    <div>
      <PH title="✍ Assinaturas & Fotos NC"
        subtitle="Boletim diário — Líder · Qualidade · Gerência · Evidências fotográficas"/>
      <div style={{padding:24}}>

        {/* Cards de status */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:20}}>
          <SC label="Boletins"    value={stats.total}            icon="📋" color="#0ea5e9"/>
          <SC label="Aprovados"   value={stats.aprovados}        icon="✅" color="#16a34a"/>
          <SC label="Pendentes"   value={stats.pendentes}        icon="🔒" color="#dc2626"/>
          <SC label="Fotos NC"    value={stats.totalFotos}       icon="📷" color="#f97316"/>
        </div>

        {/* Progresso de assinaturas */}
        <div style={{background:"#fff",borderRadius:9,padding:"12px 16px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>
            ✍ Assinaturas coletadas:
          </span>
          <div style={{flex:1,background:"#e2e8f0",borderRadius:4,height:8,overflow:"hidden"}}>
            <div style={{
              width:`${stats.total*3>0?(totalAssColetadas/(stats.total*3))*100:0}%`,
              height:"100%",background:"#0ea5e9",borderRadius:4,transition:"width .5s"}}/>
          </div>
          <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,color:"#0284c7",whiteSpace:"nowrap"}}>
            {totalAssColetadas}/{stats.total*3}
          </span>
        </div>

        {/* Legenda perfis + filtros */}
        <div style={{background:"#fff",borderRadius:9,padding:"10px 15px",marginBottom:16,
          border:"1px solid #e2e8f0",display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
          {PERFIS_ASSINATURA.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:9,height:9,borderRadius:2,background:p.cor}}/>
              <span style={{fontSize:11,color:"#475569"}}>{p.icon} {p.label}</span>
            </div>
          ))}
          <div style={{marginLeft:"auto",display:"flex",gap:5}}>
            {[["todos","Todos"],["pendentes","Pendentes"],["aprovados","Aprovados"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFiltro(v)}
                style={{padding:"4px 11px",borderRadius:16,border:"1.5px solid",
                  borderColor:filtro===v?"#0ea5e9":"#e2e8f0",
                  background:filtro===v?"#e0f2fe":"#fff",
                  color:filtro===v?"#0284c7":"#64748b",
                  fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"monospace"}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Aviso validade diária */}
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,
          padding:"10px 14px",marginBottom:18,display:"flex",gap:9,alignItems:"flex-start"}}>
          <span style={{fontSize:16,flexShrink:0}}>📅</span>
          <div style={{fontSize:11,color:"#92400e",lineHeight:1.6}}>
            <b>Validade diária:</b> assinaturas são vinculadas à data do boletim e válidas apenas naquele dia.
            Fotos de NC ficam registradas permanentemente no boletim.
          </div>
        </div>

        {/* Lista de boletins — usando BoletimItem para evitar hook em .map() */}
        {filtrados.length===0 ? (
          <div style={{background:"#fff",borderRadius:11,padding:38,textAlign:"center",
            border:"1px solid #e2e8f0",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:9}}>✅</div>
            <div style={{fontSize:13,fontWeight:600,color:"#64748b"}}>
              Nenhum boletim para o filtro selecionado
            </div>
          </div>
        ) : (
          filtrados.map(b=>(
            <BoletimItem
              key={b.data}
              b={b}
              assinaturas={assinaturas}
              onAbrirAss={handleAbrirAss}
              onAdicionarFoto={handleAdicionarFoto}
            />
          ))
        )}
      </div>

      {/* Modal de assinatura */}
      {perfilAtivo && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}>
          <PadAssinatura
            nomeUsuario={PERFIS_ASSINATURA.find(p=>p.id===perfilAtivo)?.label}
            assinaturaSalva={assSalvas[perfilAtivo]||null}
            onSave={handleSalvarAss}
            onCancel={()=>{setPerfilAtivo(null);setBoletimAtivo(null);}}
          />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD — turno ao vivo
// ══════════════════════════════════════════════════════════════════
function TelaDashboard({user, setPagina, registros, metas=METAS_DEFAULT}) {
  const [agora, setAgora] = useState(new Date());

  // Atualiza relógio a cada minuto
  useEffect(()=>{
    const t = setInterval(()=>setAgora(new Date()), 60000);
    return ()=>clearInterval(t);
  },[]);

  const turnoAtual  = detectarTurno();
  const tc          = TURNOS_CONFIG.find(t=>t.id===turnoAtual);
  const dataHoje    = agora.toISOString().split("T")[0];
  const horaAtual   = agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});

  // Registros do turno atual (hoje)
  const regsTurno = useMemo(()=>
    registros.filter(r=>r.tipo==="moagem"&&r.data===dataHoje&&r.turno===turnoAtual),
    [registros, dataHoje, turnoAtual]
  );

  // Registros de todos os turnos hoje
  const regsHoje = useMemo(()=>
    registros.filter(r=>r.tipo==="moagem"&&r.data===dataHoje),
    [registros, dataHoje]
  );

  // Médias do turno atual
  const mediasTurno = useMemo(()=>{
    const f = regsTurno.filter(r=>r.ProteinaFarelo);
    if(!f.length) return null;
    return {
      proteina: +(f.reduce((a,r)=>a+r.ProteinaFarelo,0)/f.length).toFixed(2),
      umid:     +(f.reduce((a,r)=>a+(r.UmidFarelo||0),0)/f.length).toFixed(2),
      oleo:     +(f.reduce((a,r)=>a+(r.OleoFarelo||0),0)/f.length).toFixed(2),
      fibra:    +(f.reduce((a,r)=>a+(r.FibraFarelo||0),0)/f.length).toFixed(2),
    };
  },[regsTurno]);

  // Conformidade do turno
  const confTurno = useMemo(()=>{
    if(!regsTurno.length) return null;
    const ok = regsTurno.filter(r=>!r.desvios?.length).length;
    return Math.round((ok/regsTurno.length)*100);
  },[regsTurno]);

  // Semáforo por KPI
  const semaforo = useMemo(()=>{
    if(!mediasTurno) return null;
    return {
      proteina: chk("ProteinaFarelo", mediasTurno.proteina),
      umid:     chk("UmidFarelo",     mediasTurno.umid),
      oleo:     chk("OleoFarelo",     mediasTurno.oleo),
      fibra:    chk("FibraFarelo",    mediasTurno.fibra),
    };
  },[mediasTurno]);

  // Desvios do turno
  const desviosTurno = regsTurno.filter(r=>r.desvios?.length>0).length;
  const pendentes    = registros.filter(r=>r.status==="PENDENTE").length;
  const acoesAbertas = registros.filter(r=>r.justificativasArr?.length>0).length;

  const semCor = {ok:"#16a34a", danger:"#dc2626", neutral:"#94a3b8"};
  const semBg  = {ok:"#f0fdf4", danger:"#fff1f2", neutral:"#f8fafc"};
  const semIcon= {ok:"🟢", danger:"🔴", neutral:"⚪"};

  return (
    <div>
      {/* Header com turno atual */}
      <div style={{background:"#0f172a",padding:"16px 26px",
        borderBottom:`3px solid ${tc?.cor||"#0ea5e9"}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",
                background:tc?.cor||"#0ea5e9",
                boxShadow:`0 0 8px ${tc?.cor||"#0ea5e9"}`,
                animation:"pulse 2s infinite"}}/>
              <span style={{color:"#f1f5f9",fontSize:14,fontWeight:800}}>
                {tc?.label} — AO VIVO
              </span>
              <span style={{fontSize:10,background:"rgba(255,255,255,.1)",
                color:"#94a3b8",padding:"2px 9px",borderRadius:4,fontFamily:"monospace"}}>
                {tc?.horario}
              </span>
            </div>
            <div style={{color:"#475569",fontSize:11,fontFamily:"monospace"}}>
              {agora.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})} · {horaAtual}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right"}}>
              <div style={{color:"#f1f5f9",fontSize:12,fontWeight:700}}>
                {user.nome.split(" ")[0]}
              </div>
              <div style={{color:"#475569",fontSize:10,fontFamily:"monospace"}}>
                {user.perfil}
              </div>
            </div>
            <div style={{width:36,height:36,borderRadius:"50%",
              background:`linear-gradient(135deg,${tc?.cor||"#0ea5e9"},${tc?.cor||"#0284c7"}cc)`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,fontWeight:800,color:"#fff"}}>
              {user.nome.charAt(0)}
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:22}}>

        {/* SEMÁFORO DE SAÚDE — KPIs do turno ao vivo */}
        <div style={{background:"#fff",borderRadius:12,padding:18,
          border:`1.5px solid ${tc?.cor||"#0ea5e9"}30`,
          boxShadow:"0 2px 8px rgba(0,0,0,.06)",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:2}}>
                Saúde do Turno — {tc?.label}
              </div>
              <div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>
                {regsTurno.length} registro{regsTurno.length!==1?"s":""} lançado{regsTurno.length!==1?"s":""}
                {regsTurno.length>0 ? ` · último às ${regsTurno[regsTurno.length-1]?.hora}` : " · nenhum ainda"}
              </div>
            </div>
            {confTurno!==null && (
              <div style={{textAlign:"center",
                background:confTurno>=90?"#f0fdf4":confTurno>=70?"#fffbeb":"#fff1f2",
                border:`1.5px solid ${confTurno>=90?"#86efac":confTurno>=70?"#fde68a":"#fca5a5"}`,
                borderRadius:10,padding:"8px 18px"}}>
                <div style={{fontSize:24,fontWeight:800,fontFamily:"monospace",
                  color:confTurno>=90?"#16a34a":confTurno>=70?"#d97706":"#dc2626"}}>
                  {confTurno}%
                </div>
                <div style={{fontSize:9,color:"#64748b",textTransform:"uppercase",
                  letterSpacing:.5,fontFamily:"monospace"}}>Conformidade</div>
              </div>
            )}
          </div>

          {/* Grid de semáforos */}
          {mediasTurno ? (
            <div className="grid-4" style={{display:"grid",gap:10}}>
              {[
                ["Proteína Farelo","proteina",mediasTurno.proteina,"%","ProteinaFarelo",metas],
                ["Umid. Farelo",   "umid",    mediasTurno.umid,    "%","UmidFarelo",    metas],
                ["Óleo Farelo",    "oleo",    mediasTurno.oleo,    "%","OleoFarelo",    metas],
                ["Fibra Farelo",   "fibra",   mediasTurno.fibra,   "%","FibraFarelo",   metas],
              ].map(([label,key,val,un,campo])=>{
                const s   = chk(campo,val);
                const m   = metas[campo];
                const hint= m?(m.min!==null&&m.max!==null?`${m.min}–${m.max}${m.un}`:
                              m.max!==null?`≤${m.max}${m.un}`:m.min!==null?`≥${m.min}${m.un}`:""):"";
                return (
                  <div key={key} style={{background:semBg[s]||"#f8fafc",
                    border:`1.5px solid ${COR[s].b}`,borderRadius:10,padding:"12px 14px",
                    transition:"all .3s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#64748b",
                        textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace",
                        lineHeight:1.3}}>
                        {label}
                      </div>
                      <span style={{fontSize:14}}>{semIcon[s]}</span>
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:COR[s].t,
                      fontFamily:"monospace",marginBottom:4}}>
                      {val}{un}
                    </div>
                    <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace"}}>
                      ⌀ turno · meta {hint}
                    </div>
                    {/* Mini barra de posição na meta */}
                    {m?.min!==null&&m?.max!==null&&(()=>{
                      const range = m.max-m.min;
                      const pct   = Math.min(100,Math.max(0,((val-m.min)/range)*100));
                      return (
                        <div style={{marginTop:6,background:"#e2e8f0",borderRadius:3,
                          height:4,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",
                            background:COR[s].t,borderRadius:3,transition:"width .5s"}}/>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{background:"#f8fafc",borderRadius:9,padding:24,textAlign:"center",
              border:"1.5px dashed #e2e8f0"}}>
              <div style={{fontSize:24,marginBottom:8}}>📋</div>
              <div style={{fontSize:13,fontWeight:600,color:"#64748b",marginBottom:4}}>
                Nenhum registro lançado neste turno ainda
              </div>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>
                O semáforo será atualizado automaticamente ao registrar o primeiro KPI
              </div>
              <button onClick={()=>setPagina("kpis_moagem")}
                style={{padding:"8px 18px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
                  color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,
                  cursor:"pointer",boxShadow:"0 4px 12px rgba(14,165,233,.2)"}}>
                + Registrar primeiro KPI do turno
              </button>
            </div>
          )}
        </div>

        {/* PREVISÃO DE DESVIO */}
        <PainelPrevisao
          registros={registros}
          metas={metas}
          turnoAtual={turnoAtual}
          dataHoje={dataHoje}
        />

        {/* SCORE DE QUALIDADE DO TURNO */}
        {(()=>{
          const score = calcularScore(registros, turnoAtual, dataHoje);
          if(!score) return null;
          return (
            <div style={{background:"#fff",borderRadius:12,padding:18,
              border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",
                justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:2}}>
                    Score de Qualidade do Turno
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace"}}>
                    Calculado automaticamente · {score.regs} registros
                  </div>
                </div>
                {/* Nota em destaque */}
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{textAlign:"center",
                    background:score.cor+"12",
                    border:`2px solid ${score.cor}`,
                    borderRadius:12,padding:"10px 20px"}}>
                    <div style={{fontSize:32,fontWeight:900,color:score.cor,
                      fontFamily:"monospace",lineHeight:1}}>
                      {score.total}
                    </div>
                    <div style={{fontSize:10,color:"#64748b",
                      textTransform:"uppercase",letterSpacing:.5,fontFamily:"monospace"}}>
                      de 100
                    </div>
                  </div>
                  <div style={{background:score.cor,color:"#fff",
                    fontSize:28,fontWeight:900,fontFamily:"monospace",
                    width:52,height:52,borderRadius:12,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {score.letra}
                  </div>
                </div>
              </div>

              {/* Barra geral */}
              <div style={{marginBottom:14}}>
                <div style={{background:"#e2e8f0",borderRadius:6,height:10,overflow:"hidden"}}>
                  <div style={{width:`${score.total}%`,height:"100%",
                    background:`linear-gradient(90deg,${score.cor},${score.cor}cc)`,
                    borderRadius:6,transition:"width .8s ease"}}>
                  </div>
                </div>
              </div>

              {/* Detalhamento dos 4 critérios */}
              <div className="grid-4" style={{display:"grid",gap:10}}>
                {[
                  ["Conformidade KPIs",  score.ptConf,  50, "#8b5cf6"],
                  ["Registros no prazo", score.ptPrazo, 20, "#0ea5e9"],
                  ["Justificativas",     score.ptJust,  20, "#f59e0b"],
                  ["Validação",          score.ptValid, 10, "#10b981"],
                ].map(([label,pts,max,cor])=>(
                  <div key={label} style={{background:"#f8fafc",borderRadius:8,
                    padding:"10px 12px",border:"1px solid #e2e8f0"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#64748b",
                      textTransform:"uppercase",letterSpacing:.5,
                      fontFamily:"monospace",marginBottom:6,lineHeight:1.3}}>
                      {label}
                    </div>
                    <div style={{display:"flex",alignItems:"baseline",gap:3,marginBottom:5}}>
                      <span style={{fontSize:18,fontWeight:800,color:cor,fontFamily:"monospace"}}>
                        {pts}
                      </span>
                      <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>
                        /{max}
                      </span>
                    </div>
                    <div style={{background:"#e2e8f0",borderRadius:3,height:4,overflow:"hidden"}}>
                      <div style={{width:`${(pts/max)*100}%`,height:"100%",
                        background:cor,borderRadius:3}}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Legenda de notas */}
              <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
                {[["A+","≥90","#16a34a"],["A","80–89","#10b981"],
                  ["B","70–79","#0ea5e9"],["C","60–69","#d97706"],["D","<60","#dc2626"]].map(([l,r,c])=>(
                  <span key={l} style={{fontSize:9,fontFamily:"monospace",
                    color:score.letra===l?"#fff":c,
                    background:score.letra===l?c:c+"15",
                    border:`1px solid ${c}40`,
                    padding:"2px 8px",borderRadius:4,fontWeight:700}}>
                    {l} {r}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Cards de resumo do dia */}
        <div className="grid-4" style={{display:"grid",gap:12,marginBottom:18}}>
          <SC label="Registros hoje"   value={regsHoje.length}    icon="📋" color="#0ea5e9"
            sub={`${regsTurno.length} neste turno`}/>
          <SC label="Pendentes"        value={pendentes}           icon="⏳" color="#d97706"
            sub="aguardando validação"/>
          <SC label="Desvios hoje"     value={regsHoje.filter(r=>r.desvios?.length>0).length}
            icon="⚠" color="#dc2626" sub={`${desviosTurno} neste turno`}/>
          <SC label="Ações KPI abertas" value={acoesAbertas}      icon="📌" color="#8b5cf6"
            sub="com correção registrada"/>
        </div>

        {/* Comparativo dos 3 turnos hoje */}
        <div style={{background:"#fff",borderRadius:12,padding:18,
          border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)",marginBottom:18}}>
          <div style={{fontSize:13,fontWeight:800,color:"#0f172a",marginBottom:14}}>
            Comparativo de Turnos — Hoje
          </div>
          <div className="grid-3" style={{display:"grid",gap:12}}>
            {TURNOS_CONFIG.map(t=>{
              const regs = regsHoje.filter(r=>r.turno===t.id);
              const prot = regs.filter(r=>r.ProteinaFarelo);
              const avg  = prot.length
                ? +(prot.reduce((a,r)=>a+r.ProteinaFarelo,0)/prot.length).toFixed(2)
                : null;
              const sAvg = avg?chk("ProteinaFarelo",avg):"neutral";
              const conf = regs.length
                ? Math.round((regs.filter(r=>!r.desvios?.length).length/regs.length)*100)
                : null;
              const isAtual = t.id===turnoAtual;
              return (
                <div key={t.id} style={{
                  border:`2px solid ${isAtual?t.cor:"#e2e8f0"}`,
                  borderRadius:10,overflow:"hidden",
                  boxShadow:isAtual?`0 0 0 3px ${t.cor}20`:"none",
                  transition:"all .3s",
                }}>
                  <div style={{background:isAtual
                    ?`linear-gradient(135deg,${t.cor},${t.cor}cc)`
                    :"#f8fafc",
                    padding:"9px 13px",display:"flex",alignItems:"center",
                    justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,
                        color:isAtual?"#fff":"#1e293b"}}>{t.label}</div>
                      <div style={{fontSize:9,color:isAtual?"rgba(255,255,255,.7)":"#94a3b8",
                        fontFamily:"monospace"}}>{t.horario}</div>
                    </div>
                    {isAtual&&<span style={{fontSize:9,background:"rgba(255,255,255,.2)",
                      color:"#fff",padding:"2px 7px",borderRadius:3,
                      fontFamily:"monospace",fontWeight:700}}>ATUAL</span>}
                  </div>
                  <div style={{padding:"11px 13px"}}>
                    <div className="grid-2" style={{display:"grid",gap:8}}>
                      <div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:3}}>
                          Registros
                        </div>
                        <div style={{fontSize:18,fontWeight:800,color:"#0f172a",fontFamily:"monospace"}}>
                          {regs.length}
                        </div>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:3}}>
                          Conf.
                        </div>
                        <div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",
                          color:conf===null?"#cbd5e1":conf>=90?"#16a34a":conf>=70?"#d97706":"#dc2626"}}>
                          {conf!==null?`${conf}%`:"—"}
                        </div>
                      </div>
                      <div style={{gridColumn:"1/-1"}}>
                        <div style={{fontSize:9,color:"#94a3b8",fontFamily:"monospace",marginBottom:3}}>
                          ⌀ Proteína
                        </div>
                        <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",
                          color:avg?COR[sAvg].t:"#cbd5e1"}}>
                          {avg?`${avg}%`:"—"}
                        </div>
                      </div>
                    </div>
                    {conf!==null&&(
                      <div style={{marginTop:8,background:"#f1f5f9",borderRadius:3,
                        height:5,overflow:"hidden"}}>
                        <div style={{width:`${conf}%`,height:"100%",
                          background:conf>=90?"#16a34a":conf>=70?"#f59e0b":"#dc2626",
                          borderRadius:3}}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Atalhos rápidos */}
        <div className="grid-4" style={{display:"grid",gap:10,marginBottom:18}}>
          {[
            {id:"kpis_moagem", icon:"🧪", title:"KPIs Moagem",     desc:"Registrar análise",    color:"#8b5cf6"},
            {id:"mais_kpis",   icon:"⚙",  title:"+ KPIs",          desc:"Laminadores & quebra", color:"#dc2626"},
            {id:"verificacao", icon:"✅",  title:"Verificação",     desc:`${pendentes} pendentes`,color:"#f59e0b"},
            {id:"acoes_kpi",   icon:"📌", title:"Ações KPI's",     desc:`${acoesAbertas} abertas`,color:"#0ea5e9"},
          ].map(m=>(
            <div key={m.id} onClick={()=>setPagina(m.id)}
              style={{background:"#fff",borderLeft:`4px solid ${m.color}`,borderRadius:9,
                padding:13,cursor:"pointer",border:`1px solid #e2e8f0`,
                boxShadow:"0 1px 3px rgba(0,0,0,.04)",transition:"box-shadow .15s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,.1)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.04)"}>
              <div style={{fontSize:18,marginBottom:4}}>{m.icon}</div>
              <div style={{fontWeight:700,fontSize:12,color:"#0f172a",marginBottom:2}}>{m.title}</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>{m.desc}</div>
            </div>
          ))}
        </div>

        {/* Últimos registros do turno atual */}
        {regsTurno.length > 0 && (
          <div style={{background:"#fff",borderRadius:11,overflow:"hidden",
            border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
            <div style={{padding:"12px 18px",borderBottom:"1px solid #f1f5f9",
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>
                Registros do Turno Atual
              </div>
              <button onClick={()=>setPagina("kpis_moagem")}
                style={{fontSize:11,color:"#0ea5e9",background:"none",border:"none",
                  cursor:"pointer",fontWeight:600}}>
                Ver todos →
              </button>
            </div>
            <div className="table-scroll"><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"#f8fafc"}}>
                  {["Hora","Operador","Proteína","Umid. Farelo","Óleo","Status"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"7px 13px",fontSize:10,
                      color:"#64748b",fontWeight:600,textTransform:"uppercase",
                      letterSpacing:.5,borderBottom:"1px solid #e2e8f0",fontFamily:"monospace"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...regsTurno].reverse().slice(0,8).map(r=>{
                  const ps=chk("ProteinaFarelo",r.ProteinaFarelo);
                  const us=chk("UmidFarelo",r.UmidFarelo);
                  const os=chk("OleoFarelo",r.OleoFarelo);
                  const td=r.desvios?.length>0;
                  return (
                    <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9",
                      background:td?"#fff7f7":"#fff"}}>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontWeight:700,
                        color:"#0f172a"}}>{r.hora}</td>
                      <td style={{padding:"8px 13px",color:"#1e293b"}}>
                        {r.operador?.split(" ")[0]}
                      </td>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontWeight:700,
                        color:COR[ps].t}}>{r.ProteinaFarelo?`${r.ProteinaFarelo}%`:"—"}</td>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontWeight:700,
                        color:COR[us].t}}>{r.UmidFarelo?`${r.UmidFarelo}%`:"—"}</td>
                      <td style={{padding:"8px 13px",fontFamily:"monospace",fontWeight:700,
                        color:COR[os].t}}>{r.OleoFarelo?`${r.OleoFarelo}%`:"—"}</td>
                      <td style={{padding:"8px 13px"}}><Badge s={r.status}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// APP PRINCIPAL — com persistência via Supabase (banco compartilhado)
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [user,        setUser]        = useState(
    () => { try { return JSON.parse(localStorage.getItem("sho_sessao_usuario")||"null"); } catch { return null; } }
  );
  const [pagina,      setPagina]      = useState("dashboard");
  const [registros,   setRegistros]   = useState([]);
  const [metas,       setMetas]       = useState(METAS_DEFAULT);
  const [histCalc,    setHistCalc]    = useState([]);
  const [carregando,  setCarregando]  = useState(true);
  const [erroConexao, setErroConexao] = useState("");
  const [salvando,    setSalvando]    = useState(false);
  const [modoEscuro,  setModoEscuro]  = useState(
    () => { try { return JSON.parse(localStorage.getItem("sho_modo_escuro")||"false"); } catch { return false; } }
  );
  const [auditoria,   setAuditoria]   = useState([]);
  const [ocorrencias, setOcorrencias] = useState([]);
  const [relatoriosTurno, setRelatoriosTurno] = useState([]);
  const [paradas, setParadas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [escala, setEscala] = useState([]);
  const [shoTurnos, setShoTurnos] = useState([]);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  const tema = modoEscuro ? TEMA.escuro : TEMA.claro;

  // ── Carrega tudo do Supabase ao iniciar ──────────────────────
  const carregarTudo = async () => {
    try {
      const [regs, mts, audit, calc, ocor, relTurno, parad, usrs, esc, shoT] = await Promise.all([
        listarRegistros(),
        listarMetas(),
        listarAuditoria(),
        listarHistCalc(),
        listarOcorrencias(),
        listarRelatoriosTurno(),
        listarParadas(),
        listarUsuarios(),
        listarEscala(),
        listarSHOTurno(),
      ]);
      setRegistros(regs);
      // Se o banco ainda não tem metas (primeira execução do schema.sql
      // não rodou), cai de volta nas metas padrão do código.
      setMetas(Object.keys(mts).length ? mts : METAS_DEFAULT);
      setAuditoria(audit);
      setHistCalc(calc);
      setOcorrencias(ocor);
      setRelatoriosTurno(relTurno);
      setParadas(parad);
      setUsuarios(usrs);
      setEscala(esc);
      setShoTurnos(shoT);
      setErroConexao("");
    } catch (e) {
      console.error("Erro ao conectar no Supabase:", e);
      setErroConexao(
        "Não foi possível conectar ao banco de dados. Verifique se as variáveis " +
        "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão configuradas (.env) e " +
        "se o schema.sql foi executado no seu projeto Supabase."
      );
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregarTudo(); }, []);

  // ── Realtime: qualquer dispositivo que salvar atualiza todos os outros ──
  useEffect(() => {
    const cancelar = assinarMudancas(() => { carregarTudo(); });
    return cancelar;
  }, []);

  // ── Modo escuro fica salvo no dispositivo (preferência visual, não dado compartilhado) ──
  useEffect(() => {
    try { localStorage.setItem("sho_modo_escuro", JSON.stringify(modoEscuro)); } catch {}
    document.body.style.background = modoEscuro ? TEMA.escuro.bg : TEMA.claro.bg;
    document.body.style.transition = "background .3s";
  }, [modoEscuro]);

  // ── Wrappers que escrevem no Supabase e atualizam o estado local ──
  // As telas chamam setRegistros(...) como sempre faziam (com uma função
  // de atualização ou um array novo); aqui interceptamos para também
  // persistir a mudança no banco, mantendo a mesma assinatura de uso.
  const setRegistrosSync = (atualizador) => {
    setRegistros((atual) => {
      const novo = typeof atualizador === "function" ? atualizador(atual) : atualizador;
      sincronizarRegistros(atual, novo);
      return novo;
    });
  };

  const sincronizarRegistros = async (antigos, novos) => {
    setSalvando(true);
    try {
      const antigosPorId = new Map(antigos.map((r) => [r.id, r]));
      const novosPorId   = new Map(novos.map((r) => [r.id, r]));

      // Registros novos (ids "temp_..." ainda não existem no banco)
      for (const r of novos) {
        if (typeof r.id === "string" && r.id.startsWith("temp_")) {
          const salvo = await criarRegistro(r);
          setRegistros((atual) => atual.map((x) => (x.id === r.id ? salvo : x)));
        } else if (antigosPorId.has(r.id)) {
          const antigo = antigosPorId.get(r.id);
          if (
            antigo.status !== r.status ||
            antigo.validadoPor !== r.validadoPor ||
            antigo.obsLivre !== r.obsLivre
          ) {
            await atualizarRegistro(r.id, {
              status: r.status,
              validadoPor: r.validadoPor,
              dataValidacao: r.dataValidacao,
              desvios: r.desvios,
              justificativas: r.justificativas,
              justificativasArr: r.justificativasArr,
              obsLivre: r.obsLivre,
            });
          }
        }
      }
    } catch (e) {
      console.error("Erro ao sincronizar registros:", e);
    } finally {
      setSalvando(false);
    }
  };

  const setMetasSync = (atualizador) => {
    setMetas((atual) => {
      const novo = typeof atualizador === "function" ? atualizador(atual) : atualizador;
      sincronizarMetas(atual, novo);
      return novo;
    });
  };

  const sincronizarMetas = async (antigas, novas) => {
    setSalvando(true);
    try {
      for (const campo of Object.keys(novas)) {
        const a = antigas[campo], n = novas[campo];
        if (!a || a.min !== n.min || a.max !== n.max) {
          await salvarMeta(campo, { min: n.min, max: n.max });
        }
      }
    } catch (e) {
      console.error("Erro ao sincronizar metas:", e);
    } finally {
      setSalvando(false);
    }
  };

  const setHistCalcSync = (atualizador) => {
    setHistCalc((atual) => {
      const novo = typeof atualizador === "function" ? atualizador(atual) : atualizador;
      const adicionado = novo.find((h) => !atual.some((x) => x.id === h.id));
      if (adicionado && user) {
        salvarHistCalc(user.nome, adicionado).catch((e) =>
          console.error("Erro ao salvar histórico da calculadora:", e)
        );
      }
      return novo;
    });
  };

  const setAuditoriaSync = (atualizador) => {
    setAuditoria((atual) => {
      const novo = typeof atualizador === "function" ? atualizador(atual) : atualizador;
      const adicionado = novo.find((a) => !atual.some((x) => x.id === a.id));
      if (adicionado) {
        registrarAuditoriaBackend(adicionado.tipo, { nome: adicionado.usuario, perfil: adicionado.perfil }, adicionado.detalhes)
          .catch((e) => console.error("Erro ao registrar auditoria:", e));
      }
      return novo;
    });
  };

  // ── Login real contra a tabela usuarios do Supabase ──────────
  const handleLogin = async (u) => {
    setUser(u);
    try { localStorage.setItem("sho_sessao_usuario", JSON.stringify(u)); } catch {}
    setPagina("dashboard");
  };

  // ── Tela de erro de conexão ───────────────────────────────────
  if (erroConexao) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",
      alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:480,background:"#1e293b",border:"1px solid #334155",
        borderRadius:14,padding:28,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
        <div style={{color:"#f1f5f9",fontSize:15,fontWeight:700,marginBottom:10}}>
          Erro de conexão com o banco de dados
        </div>
        <div style={{color:"#94a3b8",fontSize:13,lineHeight:1.6,marginBottom:16}}>
          {erroConexao}
        </div>
        <button onClick={carregarTudo}
          style={{padding:"10px 20px",background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
            color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          Tentar novamente
        </button>
      </div>
    </div>
  );

  // ── Tela de carregamento ─────────────────────────────────────
  if(carregando) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",
      alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:48,height:48,background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
        borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
        🏭
      </div>
      <div style={{color:"#f1f5f9",fontSize:14,fontWeight:700}}>Carregando sistema...</div>
      <div style={{color:"#475569",fontSize:11,fontFamily:"monospace"}}>
        Conectando ao banco de dados
      </div>
      <div style={{width:120,height:4,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:"60%",height:"100%",background:"#0ea5e9",borderRadius:2,
          animation:"slide 1.5s ease-in-out infinite"}}/>
      </div>
    </div>
  );

  if(!user) return <TelaLogin onLogin={handleLogin}/>;

  const telas={
    dashboard:       <TelaDashboard      user={user} setPagina={setPagina} registros={registros} metas={metas}/>,
    gerencial:       <TelaGerencial      registros={registros} metas={metas}/>,
    sho_turno:       <TelaSHOTurno       user={user} shoTurnos={shoTurnos} setShoTurnos={setShoTurnos} metas={metas}/>,
    kpis_moagem:     <TelaKpisMoagem     user={user} registros={registros} setRegistros={setRegistrosSync} metas={metas}/>,
    mais_kpis:       <TelaMaisKpis       user={user} registros={registros} setRegistros={setRegistrosSync}/>,
    ocorrencias:     <TelaOcorrencias    user={user} ocorrencias={ocorrencias} setOcorrencias={setOcorrencias}/>,
    paradas:         <TelaParadas        user={user} paradas={paradas} setParadas={setParadas} auditoria={auditoria} setAuditoria={setAuditoria}/>,
    escala:          <TelaEscala         user={user} escala={escala} setEscala={setEscala} usuarios={usuarios}/>,
    calculadora:     <TelaCalculadora    user={user} histCalc={histCalc} setHistCalc={setHistCalcSync}/>,
    rastreabilidade: <TelaRastreabilidade registros={registros} metas={metas}/>,
    verificacao:     <TelaVerificacao    registros={registros} setRegistros={setRegistrosSync} auditoria={auditoria} setAuditoria={setAuditoriaSync} user={user}/>,
    assinaturas:     <TelaAssinaturas    registros={registros}/>,
    acoes:           <TelaAcoes          user={user}/>,
    acoes_kpi:       <TelaAcoesKpi       registros={registros} user={user}/>,
    relatorios:      <TelaRelatorios     registros={registros} user={user} metas={metas} relatoriosTurno={relatoriosTurno} setRelatoriosTurno={setRelatoriosTurno}/>,
    auditoria:       <TelaAuditoria      auditoria={auditoria}/>,
    cadastros:       <TelaCadastros      user={user} metas={metas} setMetas={setMetasSync} auditoria={auditoria} setAuditoria={setAuditoriaSync} usuarios={usuarios} setUsuarios={setUsuarios}/>,
  };

  return (
    <div style={{display:"flex",minHeight:"100vh",
      background: modoEscuro ? TEMA.escuro.bg : TEMA.claro.bg,
      fontFamily:"'DM Sans',sans-serif",
      transition:"background .3s"}}>
      <Sidebar user={user} pagina={pagina} setPagina={setPagina}
        onLogout={()=>{setUser(null);try{localStorage.removeItem("sho_sessao_usuario");}catch{};setPagina("dashboard");}}
        registros={registros}
        modoEscuro={modoEscuro} setModoEscuro={setModoEscuro}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <div style={{flex:1,overflow:"auto",position:"relative",minWidth:0,
        background: modoEscuro ? TEMA.escuro.bg : TEMA.claro.bg,
        transition:"background .3s"}}>
        {/* Barra superior mobile — só aparece em telas pequenas */}
        <div className="mobile-topbar">
          <button onClick={()=>setMobileOpen(true)} className="mobile-hamburger" aria-label="Abrir menu">
            <span/><span/><span/>
          </button>
          <div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>
            KPI <span style={{color:"#0ea5e9"}}>SHO</span>
          </div>
          <div style={{width:34}}/>
        </div>
        {/* Indicador de salvamento */}
        {salvando && (
          <div style={{position:"fixed",bottom:16,right:16,zIndex:999,
            background:"#1e293b",color:"#7dd3fc",fontSize:11,fontFamily:"monospace",
            padding:"6px 14px",borderRadius:20,boxShadow:"0 4px 12px rgba(0,0,0,.3)",
            display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#0ea5e9"}}/>
            Salvando...
          </div>
        )}
        {/* Overlay escuro sobre telas quando modo escuro ativo */}
        <div style={{
          position:"fixed",inset:0,
          background: modoEscuro ? "rgba(0,0,0,.35)" : "transparent",
          pointerEvents:"none",zIndex:1,
          transition:"background .3s",
        }}/>
        <div style={{position:"relative",zIndex:2}}>
          {telas[pagina]||telas.dashboard}
        </div>
      </div>
    </div>
  );
}
