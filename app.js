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
const fieldStatus = document.getElementById("field-status");
const fieldMensagem = document.getElementById("field-mensagem");
const fieldTipoResposta = document.getElementById("field-tipo-resposta");
const fieldProximaAcao = document.getElementById("field-proxima-acao");
const fieldNotas = document.getElementById("field-notas");

const toastEl = document.getElementById("toast");

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.hidden = true;
    appEl.hidden = false;
    subscribeLeads();
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
function openModal(lead = null) {
  leadForm.reset();
  if (lead) {
    modalTitle.textContent = "Editar lead";
    deleteLeadBtn.hidden = false;
    fieldId.value = lead.id;
    fieldHandle.value = lead.instagramHandle || "";
    fieldNome.value = lead.nome || "";
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
  }
  modal.hidden = false;
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
// Service worker (PWA)
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker não registrado:", err);
    });
  });
}
