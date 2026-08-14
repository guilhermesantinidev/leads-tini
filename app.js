// app.js
// Lógica principal — auth, CRUD no Firestore, renderização do Kanban.
// Vanilla JS, sem framework, seguindo o padrão de sempre.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// Configuração das colunas do Kanban
// ------------------------------------------------------------
const COLUMNS = [
  { status: "contatado", label: "Contatado", dotColor: "var(--text-muted)" },
  { status: "respondeu", label: "Respondeu", dotColor: "var(--info)" },
  { status: "conversa", label: "Em conversa", dotColor: "var(--accent)" },
  { status: "fechado", label: "Fechado", dotColor: "var(--success)" },
  { status: "perdido", label: "Perdido", dotColor: "var(--danger)" }
];

const STATUS_ORDER = COLUMNS.map((c) => c.status);

const TIPO_RESPOSTA_LABEL = {
  interessado: "Interessado",
  pediu_info: "Pediu info",
  nao_interessado: "Não interessado",
  sem_resposta: "Sem resposta"
};

let allLeads = [];
let showLost = false;
let searchTerm = "";
let unsubscribeLeads = null;

// ------------------------------------------------------------
// Elementos
// ------------------------------------------------------------
const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

const board = document.getElementById("board");
const statsBar = document.getElementById("stats-bar");
const toggleLostBtn = document.getElementById("toggle-lost");
const toggleLostLabel = document.getElementById("toggle-lost-label");
const searchInput = document.getElementById("search-input");
const fabAdd = document.getElementById("fab-add");

const modal = document.getElementById("lead-modal");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const cancelLeadBtn = document.getElementById("cancel-lead-btn");
const deleteLeadBtn = document.getElementById("delete-lead-btn");
const leadForm = document.getElementById("lead-form");

const fieldId = document.getElementById("lead-id");
const fieldHandle = document.getElementById("field-handle");
const fieldNome = document.getElementById("field-nome");
const fieldCategoria = document.getElementById("field-categoria");
const fieldLocalizacao = document.getElementById("field-localizacao");
const fieldStatus = document.getElementById("field-status");
const fieldMensagem = document.getElementById("field-mensagem");
const fieldTipoResposta = document.getElementById("field-tipo-resposta");
const fieldProximaAcao = document.getElementById("field-proxima-acao");
const fieldNotas = document.getElementById("field-notas");
const categoriaOptions = document.getElementById("categoria-options");

const importBtn = document.getElementById("import-btn");
const importModal = document.getElementById("import-modal");
const importModalClose = document.getElementById("import-modal-close");
const importCancelBtn = document.getElementById("import-cancel-btn");
const importConfirmBtn = document.getElementById("import-confirm-btn");
const importTextarea = document.getElementById("import-textarea");
const importStatusSelect = document.getElementById("import-status");
const importPreview = document.getElementById("import-preview");

const toastEl = document.getElementById("toast");

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.hidden = true;
    appEl.hidden = false;
    subscribeLeads();
    checkSharedHandle();
  } else {
    loginScreen.hidden = false;
    appEl.hidden = true;
    if (unsubscribeLeads) unsubscribeLeads();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando…";
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
  } catch (err) {
    loginError.textContent = "E-mail ou senha incorretos.";
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

// ------------------------------------------------------------
// Firestore — assinatura em tempo real
// ------------------------------------------------------------
function subscribeLeads() {
  const q = query(collection(db, "leads"), orderBy("updatedAt", "desc"));
  unsubscribeLeads = onSnapshot(q, (snapshot) => {
    allLeads = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error("Erro ao ler leads:", err);
    showToast("Erro ao carregar leads. Confira sua conexão.");
  });
}

// ------------------------------------------------------------
// Renderização
// ------------------------------------------------------------
function render() {
  const term = searchTerm.trim().toLowerCase();

  const filtered = allLeads.filter((lead) => {
    if (!showLost && lead.status === "perdido") return false;
    if (!term) return true;
    const haystack = `${lead.nome || ""} ${lead.instagramHandle || ""}`.toLowerCase();
    return haystack.includes(term);
  });

  renderStats(filtered);
  renderBoard(filtered);
  updateCategoriaOptions();
}

function updateCategoriaOptions() {
  const categorias = [...new Set(allLeads.map((l) => l.categoria).filter(Boolean))].sort();
  categoriaOptions.innerHTML = categorias.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
}

function renderStats(leads) {
  const total = leads.length;
  const respondeu = leads.filter((l) => l.status !== "contatado").length;
  const fechado = leads.filter((l) => l.status === "fechado").length;
  const taxa = total > 0 ? Math.round((respondeu / total) * 100) : 0;

  statsBar.innerHTML = `
    <span><strong>${total}</strong> leads</span>
    <span><strong>${taxa}%</strong> taxa de resposta</span>
    <span><strong>${fechado}</strong> fechados</span>
  `;
}

function renderBoard(leads) {
  board.innerHTML = "";

  const visibleColumns = showLost
    ? COLUMNS
    : COLUMNS.filter((c) => c.status !== "perdido");

  visibleColumns.forEach((col) => {
    const columnLeads = leads
      .filter((l) => l.status === col.status)
      .sort((a, b) => {
        // dentro da coluna, quem tem "próxima ação" mais próxima sobe primeiro
        if (a.proximaAcao && b.proximaAcao) return a.proximaAcao.localeCompare(b.proximaAcao);
        if (a.proximaAcao) return -1;
        if (b.proximaAcao) return 1;
        return 0;
      });

    const colEl = document.createElement("div");
    colEl.className = "column";
    colEl.innerHTML = `
      <div class="column-head">
        <span class="column-title">
          <span class="column-dot" style="background:${col.dotColor}"></span>
          ${col.label}
        </span>
        <span class="column-count">${columnLeads.length}</span>
      </div>
      <div class="column-body"></div>
    `;

    const body = colEl.querySelector(".column-body");

    if (columnLeads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "column-empty";
      empty.textContent = "Vazio";
      body.appendChild(empty);
    } else {
      columnLeads.forEach((lead) => body.appendChild(renderCard(lead, col.status)));
    }

    board.appendChild(colEl);
  });
}

function renderCard(lead, currentStatus) {
  const card = document.createElement("div");
  card.className = `lead-card status-${lead.status}`;

  const handle = lead.instagramHandle
    ? `@${lead.instagramHandle.replace(/^@/, "")}`
    : "";

  const tag = lead.tipoResposta
    ? `<span class="lead-card-tag tag-${lead.tipoResposta}">${TIPO_RESPOSTA_LABEL[lead.tipoResposta] || lead.tipoResposta}</span>`
    : "";

  const nextAction = lead.proximaAcao
    ? `<div class="lead-card-nextaction">→ ${formatDate(lead.proximaAcao)}</div>`
    : "";

  card.innerHTML = `
    <div class="lead-card-name">${escapeHtml(lead.nome)}</div>
    ${lead.categoria ? `<div class="lead-card-categoria">${escapeHtml(lead.categoria)}</div>` : ""}
    ${handle ? `<div class="lead-card-handle">${escapeHtml(handle)}</div>` : ""}
    <div class="lead-card-meta">
      <span>${formatDate(lead.dataContato) || ""}</span>
      ${tag}
    </div>
    ${nextAction}
  `;

  // Botões rápidos de mover (evita depender de drag-and-drop em touch)
  const idx = STATUS_ORDER.indexOf(currentStatus);
  const moveRow = document.createElement("div");
  moveRow.className = "move-row";

  if (idx > 0) {
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "move-btn";
    prevBtn.textContent = "←";
    prevBtn.title = `Voltar para ${COLUMNS[idx - 1].label}`;
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLead(lead.id, STATUS_ORDER[idx - 1]);
    });
    moveRow.appendChild(prevBtn);
  }

  if (idx < STATUS_ORDER.length - 1 && currentStatus !== "perdido") {
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "move-btn";
    nextBtn.textContent = "→";
    nextBtn.title = `Avançar para ${COLUMNS[idx + 1].label}`;
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLead(lead.id, STATUS_ORDER[idx + 1]);
    });
    moveRow.appendChild(nextBtn);
  }

  card.appendChild(moveRow);
  card.addEventListener("click", () => openModal(lead));

  return card;
}

function formatDate(value) {
  if (!value) return "";
  // aceita tanto string "YYYY-MM-DD" quanto Firestore Timestamp
  const date = typeof value === "string" ? new Date(value + "T00:00:00") : value.toDate();
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Mover lead de coluna direto (sem abrir modal)
// ------------------------------------------------------------
async function moveLead(id, newStatus) {
  try {
    await updateDoc(doc(db, "leads", id), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    showToast("Não consegui mover o lead. Tenta de novo.");
  }
}

// ------------------------------------------------------------
// Modal — novo / editar
// ------------------------------------------------------------
function openModal(lead = null, prefill = null) {
  leadForm.reset();
  if (lead) {
    modalTitle.textContent = "Editar lead";
    deleteLeadBtn.hidden = false;
    fieldId.value = lead.id;
    fieldHandle.value = lead.instagramHandle || "";
    fieldNome.value = lead.nome || "";
    fieldCategoria.value = lead.categoria || "";
    fieldLocalizacao.value = lead.localizacao || "";
    fieldStatus.value = lead.status || "contatado";
    fieldMensagem.value = lead.mensagemUsada || "";
    fieldTipoResposta.value = lead.tipoResposta || "";
    fieldProximaAcao.value = lead.proximaAcao || "";
    fieldNotas.value = lead.notas || "";
  } else {
    modalTitle.textContent = "Novo lead";
    deleteLeadBtn.hidden = true;
    fieldId.value = "";
    fieldStatus.value = "contatado";
    if (prefill?.handle) {
      fieldHandle.value = prefill.handle;
      // já deixa o cursor pronto pro campo Nome — o @ já veio preenchido,
      // só falta a pessoa digitar quem é
      setTimeout(() => fieldNome.focus(), 50);
    }
  }
  modal.hidden = false;
}

// ------------------------------------------------------------
// Compartilhamento do Instagram (Web Share Target — Android)
// ------------------------------------------------------------
// Quando a pessoa compartilha um perfil do Instagram direto pro app
// (aparece "Leads" na lista de apps do menu Compartilhar), o Android abre
// share-target.html, que extrai o @handle e redireciona pra cá com
// ?novo_lead_handle=alguem. Aqui a gente pega esse parâmetro, abre o modal
// já preenchido, e limpa a URL pra não reabrir de novo se a pessoa
// recarregar a página depois.
function checkSharedHandle() {
  const params = new URLSearchParams(window.location.search);
  const handle = params.get("novo_lead_handle");
  if (handle) {
    openModal(null, { handle });
    // limpa o parâmetro da URL sem recarregar a página
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

function closeModal() {
  modal.hidden = true;
}

modalClose.addEventListener("click", closeModal);
cancelLeadBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

fabAdd.addEventListener("click", () => openModal());

leadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    instagramHandle: fieldHandle.value.trim().replace(/^@/, ""),
    nome: fieldNome.value.trim(),
    categoria: fieldCategoria.value.trim(),
    localizacao: fieldLocalizacao.value.trim(),
    status: fieldStatus.value,
    mensagemUsada: fieldMensagem.value.trim(),
    tipoResposta: fieldTipoResposta.value,
    proximaAcao: fieldProximaAcao.value || null,
    notas: fieldNotas.value.trim(),
    updatedAt: serverTimestamp()
  };

  const id = fieldId.value;
  const submitBtn = leadForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, "leads", id), payload);
      showToast("Lead atualizado.");
    } else {
      await addDoc(collection(db, "leads"), {
        ...payload,
        dataContato: new Date().toISOString().split("T")[0],
        createdAt: serverTimestamp()
      });
      showToast("Lead adicionado.");
    }
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar. Tenta de novo.");
  } finally {
    submitBtn.disabled = false;
  }
});

deleteLeadBtn.addEventListener("click", async () => {
  const id = fieldId.value;
  if (!id) return;
  if (!confirm("Excluir esse lead? Não dá pra desfazer.")) return;
  try {
    await deleteDoc(doc(db, "leads", id));
    showToast("Lead excluído.");
    closeModal();
  } catch (err) {
    console.error(err);
    showToast("Erro ao excluir. Tenta de novo.");
  }
});

// ------------------------------------------------------------
// Filtros — busca e mostrar/esconder perdidos
// ------------------------------------------------------------
searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

toggleLostBtn.addEventListener("click", () => {
  showLost = !showLost;
  toggleLostBtn.classList.toggle("active", showLost);
  toggleLostLabel.textContent = showLost ? "Ocultar perdidos" : "Mostrar perdidos";
  render();
});

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

// ------------------------------------------------------------
// Importação em massa (cola de planilha/.txt exportado)
// ------------------------------------------------------------
// Formato esperado por linha (separado por TAB, como sai ao copiar de uma
// planilha): Nome · Categoria · @Instagram · Telefone · Localização · Data
//
// Data é opcional — se vier no formato dd/mm/aaaa, vira o "dataContato" do
// lead. Se não vier ou não for reconhecida, usa a data de hoje.
function parseImportLine(line) {
  const cols = line.split("\t").map((c) => c.trim());
  const [nome, categoria, handleRaw, , localizacao, dataRaw] = cols;

  if (!nome) return null; // linha vazia ou malformada — ignora

  let dataContato = new Date().toISOString().split("T")[0];
  if (dataRaw) {
    const match = dataRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      dataContato = `${yyyy}-${mm}-${dd}`;
    }
  }

  return {
    nome,
    categoria: categoria || "",
    instagramHandle: (handleRaw || "").replace(/^@/, ""),
    localizacao: localizacao || "",
    dataContato
  };
}

function parseImportText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseImportLine)
    .filter(Boolean);
}

function openImportModal() {
  importTextarea.value = "";
  importPreview.textContent = "";
  importModal.hidden = false;
}
function closeImportModal() {
  importModal.hidden = true;
}

importBtn.addEventListener("click", openImportModal);
importModalClose.addEventListener("click", closeImportModal);
importCancelBtn.addEventListener("click", closeImportModal);
importModal.addEventListener("click", (e) => {
  if (e.target === importModal) closeImportModal();
});

importTextarea.addEventListener("input", () => {
  const parsed = parseImportText(importTextarea.value);
  importPreview.textContent = parsed.length > 0
    ? `${parsed.length} lead(s) reconhecido(s) pra importar.`
    : "Nenhuma linha reconhecida ainda.";
});

importConfirmBtn.addEventListener("click", async () => {
  const parsed = parseImportText(importTextarea.value);
  if (parsed.length === 0) {
    showToast("Nada pra importar — confere se colou as linhas certas.");
    return;
  }

  importConfirmBtn.disabled = true;
  importConfirmBtn.textContent = "Importando…";

  const status = importStatusSelect.value;
  let sucesso = 0;
  let falhas = 0;

  // Sequencial (não Promise.all em paralelo) — evita estourar limite de
  // escritas simultâneas do Firestore se um dia a lista colada for grande,
  // e deixa o preview de progresso mais previsível.
  for (const lead of parsed) {
    try {
      await addDoc(collection(db, "leads"), {
        instagramHandle: lead.instagramHandle,
        nome: lead.nome,
        categoria: lead.categoria,
        localizacao: lead.localizacao,
        status,
        mensagemUsada: "",
        tipoResposta: "",
        proximaAcao: null,
        notas: "",
        dataContato: lead.dataContato,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      sucesso++;
    } catch (err) {
      console.error("Falha ao importar lead:", lead.nome, err);
      falhas++;
    }
  }

  importConfirmBtn.disabled = false;
  importConfirmBtn.textContent = "Importar";
  closeImportModal();
  showToast(
    falhas === 0
      ? `${sucesso} lead(s) importado(s) com sucesso.`
      : `${sucesso} importado(s), ${falhas} falharam — confere o console.`
  );
});

// ------------------------------------------------------------
// Service worker (PWA)
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker não registrado:", err);
    });
  });
}