import { supabase } from "./supabaseClient";

// ════════════════════════════════════════════════════════════════
// Esta camada existe para que o resto do app (todas as telas)
// continue trabalhando exatamente com os mesmos formatos de objeto
// que já usava com dados em memória/localStorage. Cada função aqui
// converte daquele formato para o formato das tabelas do Supabase
// e vice-versa, então as telas não precisam saber que existe um
// banco de dados por trás.
// ════════════════════════════════════════════════════════════════

// Campos "soltos" de KPI que ficam dentro da coluna jsonb "dados"
const CAMPOS_MOAGEM = [
  "tipoFarelo","UmidSojaEntrada","UmidSojaProducao","UmidFarelo",
  "ProteinaFarelo","OleoFarelo","FibraFarelo","LEX","OleoCasca",
];

// ── Conversão registro: linha do banco → objeto usado nas telas ──
function rowParaRegistro(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    data: row.data,
    hora: row.hora,
    turno: row.turno,
    operador: row.operador,
    status: row.status,
    validadoPor: row.validado_por,
    dataValidacao: row.data_validacao,
    desvios: row.desvios || [],
    justificativas: row.justificativas || {},
    justificativasArr: row.justificativas_arr || [],
    obsLivre: row.obs_livre,
    ...(row.dados || {}),
  };
}

// ── Conversão registro: objeto da tela → linha pronta pro banco ──
function registroParaRow(registro) {
  const dados = {};
  Object.keys(registro).forEach((k) => {
    if (
      ![
        "id","tipo","data","hora","turno","operador","status",
        "validadoPor","dataValidacao","desvios","justificativas",
        "justificativasArr","obsLivre",
      ].includes(k)
    ) {
      dados[k] = registro[k];
    }
  });
  return {
    tipo: registro.tipo,
    data: registro.data,
    hora: registro.hora,
    turno: registro.turno,
    operador: registro.operador,
    status: registro.status || "PENDENTE",
    validado_por: registro.validadoPor || null,
    data_validacao: registro.dataValidacao || null,
    desvios: registro.desvios || [],
    justificativas: registro.justificativas || {},
    justificativas_arr: registro.justificativasArr || [],
    obs_livre: registro.obsLivre || null,
    dados,
  };
}

// ════════════════════════════════════════════════════════════════
// USUÁRIOS
// ════════════════════════════════════════════════════════════════

export async function login(email, senha) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .eq("senha", senha)
    .eq("ativo", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    email: data.email,
    perfil: data.perfil,
    turno: data.turno,
  };
}

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    senha: u.senha,
    perfil: u.perfil,
    turno: u.turno,
    ativo: u.ativo,
  }));
}

export async function criarUsuario(usuario) {
  const { data, error } = await supabase
    .from("usuarios")
    .insert({
      nome: usuario.nome,
      email: usuario.email.trim().toLowerCase(),
      senha: usuario.senha,
      perfil: usuario.perfil,
      turno: usuario.turno,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarUsuario(id, campos) {
  const payload = {};
  if (campos.nome !== undefined) payload.nome = campos.nome;
  if (campos.email !== undefined) payload.email = campos.email.trim().toLowerCase();
  if (campos.senha !== undefined) payload.senha = campos.senha;
  if (campos.perfil !== undefined) payload.perfil = campos.perfil;
  if (campos.turno !== undefined) payload.turno = campos.turno;
  if (campos.ativo !== undefined) payload.ativo = campos.ativo;

  const { error } = await supabase.from("usuarios").update(payload).eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// REGISTROS (KPIs Moagem + KPIs)
// ════════════════════════════════════════════════════════════════

export async function listarRegistros() {
  const { data, error } = await supabase
    .from("registros")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowParaRegistro);
}

export async function criarRegistro(registro) {
  const row = registroParaRow(registro);
  const { data, error } = await supabase
    .from("registros")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowParaRegistro(data);
}

export async function atualizarRegistro(id, campos) {
  const payload = {};
  if (campos.status !== undefined) payload.status = campos.status;
  if (campos.validadoPor !== undefined) payload.validado_por = campos.validadoPor;
  if (campos.dataValidacao !== undefined) payload.data_validacao = campos.dataValidacao;
  if (campos.desvios !== undefined) payload.desvios = campos.desvios;
  if (campos.justificativas !== undefined) payload.justificativas = campos.justificativas;
  if (campos.justificativasArr !== undefined) payload.justificativas_arr = campos.justificativasArr;
  if (campos.obsLivre !== undefined) payload.obs_livre = campos.obsLivre;

  const { error } = await supabase.from("registros").update(payload).eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// METAS
// ════════════════════════════════════════════════════════════════

export async function listarMetas() {
  const { data, error } = await supabase.from("metas").select("*");
  if (error) throw error;
  const metas = {};
  (data || []).forEach((m) => {
    metas[m.campo] = {
      label: m.label,
      min: m.min,
      max: m.max,
      un: m.unidade || "",
    };
  });
  return metas;
}

export async function salvarMeta(campo, valores) {
  const { error } = await supabase
    .from("metas")
    .update({
      min: valores.min,
      max: valores.max,
      updated_at: new Date().toISOString(),
    })
    .eq("campo", campo);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// AUDITORIA
// ════════════════════════════════════════════════════════════════

export async function listarAuditoria() {
  const { data, error } = await supabase
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map((a) => ({
    id: a.id,
    timestamp: a.created_at,
    tipo: a.tipo,
    usuario: a.usuario,
    perfil: a.perfil,
    detalhes: a.detalhes || {},
  }));
}

export async function registrarAuditoriaBackend(tipo, user, detalhes = {}) {
  const { error } = await supabase.from("auditoria").insert({
    tipo,
    usuario: user?.nome || "Sistema",
    perfil: user?.perfil || "",
    detalhes,
  });
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// HISTÓRICO DA CALCULADORA
// ════════════════════════════════════════════════════════════════

export async function listarHistCalc(usuario) {
  let query = supabase.from("hist_calc").select("*").order("created_at", { ascending: false });
  if (usuario) query = query.eq("usuario", usuario);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((h) => ({ id: h.id, ...h.dados, usuario: h.usuario, timestamp: h.created_at }));
}

export async function salvarHistCalc(usuario, dados) {
  const { error } = await supabase.from("hist_calc").insert({ usuario, dados });
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// OCORRÊNCIAS DO TURNO — diário de bordo registrado pelo Líder
// ════════════════════════════════════════════════════════════════

export async function listarOcorrencias() {
  const { data, error } = await supabase
    .from("ocorrencias")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((o) => ({
    id: o.id,
    data: o.data,
    turno: o.turno,
    categoria: o.categoria,
    titulo: o.titulo,
    descricao: o.descricao,
    gravidade: o.gravidade,
    autor: o.autor,
    perfil: o.perfil,
    resolvida: o.resolvida,
    timestamp: o.created_at,
  }));
}

export async function criarOcorrencia(ocorrencia) {
  const { data, error } = await supabase
    .from("ocorrencias")
    .insert({
      data: ocorrencia.data,
      turno: ocorrencia.turno,
      categoria: ocorrencia.categoria || "GERAL",
      titulo: ocorrencia.titulo,
      descricao: ocorrencia.descricao || "",
      gravidade: ocorrencia.gravidade || "BAIXA",
      autor: ocorrencia.autor,
      perfil: ocorrencia.perfil || "",
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    data: data.data,
    turno: data.turno,
    categoria: data.categoria,
    titulo: data.titulo,
    descricao: data.descricao,
    gravidade: data.gravidade,
    autor: data.autor,
    perfil: data.perfil,
    resolvida: data.resolvida,
    timestamp: data.created_at,
  };
}

export async function atualizarOcorrencia(id, campos) {
  const payload = {};
  if (campos.resolvida !== undefined) payload.resolvida = campos.resolvida;
  if (campos.titulo !== undefined) payload.titulo = campos.titulo;
  if (campos.descricao !== undefined) payload.descricao = campos.descricao;
  if (campos.gravidade !== undefined) payload.gravidade = campos.gravidade;
  if (campos.categoria !== undefined) payload.categoria = campos.categoria;

  const { error } = await supabase.from("ocorrencias").update(payload).eq("id", id);
  if (error) throw error;
}

export async function excluirOcorrencia(id) {
  const { error } = await supabase.from("ocorrencias").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// RELATÓRIO DO LÍDER — descrição do turno + controle de hexano
// ════════════════════════════════════════════════════════════════

export async function listarRelatoriosTurno() {
  const { data, error } = await supabase
    .from("relatorios_turno")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    data: r.data,
    turno: r.turno,
    descricao: r.descricao,
    puxouHexano: r.puxou_hexano,
    qtdHexano: r.qtd_hexano,
    autor: r.autor,
    perfil: r.perfil,
    timestamp: r.created_at,
  }));
}

export async function criarRelatorioTurno(relatorio) {
  const { data, error } = await supabase
    .from("relatorios_turno")
    .insert({
      data: relatorio.data,
      turno: relatorio.turno,
      descricao: relatorio.descricao || "",
      puxou_hexano: !!relatorio.puxouHexano,
      qtd_hexano: relatorio.puxouHexano ? relatorio.qtdHexano : null,
      autor: relatorio.autor,
      perfil: relatorio.perfil || "",
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    data: data.data,
    turno: data.turno,
    descricao: data.descricao,
    puxouHexano: data.puxou_hexano,
    qtdHexano: data.qtd_hexano,
    autor: data.autor,
    perfil: data.perfil,
    timestamp: data.created_at,
  };
}

export async function excluirRelatorioTurno(id) {
  const { error } = await supabase.from("relatorios_turno").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// PARADAS DE FÁBRICA — tempo de parada registrado pelo Operador,
// validado pelo Líder/Supervisor, somado por turno
// ════════════════════════════════════════════════════════════════

function rowParaParada(p) {
  return {
    id: p.id,
    data: p.data,
    turno: p.turno,
    minutos: p.minutos,
    motivo: p.motivo,
    observacao: p.observacao,
    status: p.status,
    operador: p.operador,
    validadoPor: p.validado_por,
    dataValidacao: p.data_validacao,
    timestamp: p.created_at,
  };
}

export async function listarParadas() {
  const { data, error } = await supabase
    .from("paradas_fabrica")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowParaParada);
}

export async function criarParada(parada) {
  const { data, error } = await supabase
    .from("paradas_fabrica")
    .insert({
      data: parada.data,
      turno: parada.turno,
      minutos: parada.minutos,
      motivo: parada.motivo,
      observacao: parada.observacao || "",
      status: "PENDENTE",
      operador: parada.operador,
    })
    .select()
    .single();
  if (error) throw error;
  return rowParaParada(data);
}

export async function atualizarParada(id, campos) {
  const payload = {};
  if (campos.status !== undefined) payload.status = campos.status;
  if (campos.validadoPor !== undefined) payload.validado_por = campos.validadoPor;
  if (campos.dataValidacao !== undefined) payload.data_validacao = campos.dataValidacao;
  if (campos.minutos !== undefined) payload.minutos = campos.minutos;
  if (campos.motivo !== undefined) payload.motivo = campos.motivo;
  if (campos.observacao !== undefined) payload.observacao = campos.observacao;

  const { error } = await supabase.from("paradas_fabrica").update(payload).eq("id", id);
  if (error) throw error;
}

export async function excluirParada(id) {
  const { error } = await supabase.from("paradas_fabrica").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// ESCALA DE FUNÇÕES — calendário de Farelo/Processo definido pelo
// Líder, por operador do turno dele
// ════════════════════════════════════════════════════════════════

function rowParaEscala(e) {
  return {
    id: e.id,
    data: e.data,
    turno: e.turno,
    operador: e.operador,
    funcao: e.funcao,
    definidoPor: e.definido_por,
    timestamp: e.created_at,
    atualizadoEm: e.updated_at,
  };
}

export async function listarEscala() {
  const { data, error } = await supabase
    .from("escala_funcoes")
    .select("*")
    .order("data", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowParaEscala);
}

// Cria ou substitui a atribuição do dia para aquele operador
// (a constraint unique(data, operador) faz o upsert funcionar como
// "inverter a função" sem duplicar linha).
export async function definirEscala({ data, turno, operador, funcao, definidoPor }) {
  const { data: row, error } = await supabase
    .from("escala_funcoes")
    .upsert(
      {
        data,
        turno,
        operador,
        funcao,
        definido_por: definidoPor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "data,operador" }
    )
    .select()
    .single();
  if (error) throw error;
  return rowParaEscala(row);
}

export async function excluirEscala(id) {
  const { error } = await supabase.from("escala_funcoes").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// REALTIME — assina mudanças nas tabelas para refletir entre
// dispositivos automaticamente (ex: celular salva → desktop atualiza)
// ════════════════════════════════════════════════════════════════

export function assinarMudancas(callback) {
  const canal = supabase
    .channel("sho-kpi-mudancas")
    .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "metas" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "auditoria" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "ocorrencias" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "relatorios_turno" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "paradas_fabrica" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "escala_funcoes" }, callback)
    .subscribe();

  return () => supabase.removeChannel(canal);
}
