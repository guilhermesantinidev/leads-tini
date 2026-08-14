// lead-detail.js
// Página de detalhe de um lead: perfil editável, descrição livre, e um
// histórico com data (subcoleção "historico" dentro do próprio lead no
// Firestore) — cada atualização de negociação vira um registro novo em vez
// de sobrescrever um campo único.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const leadId = params.get("id");

const loadingEl = document.getElementById("loading");
const pageEl = document.getElementById("detail-page");
const toastEl = document.getElementById("toast");

const dNome = document.getElementById("d-nome");
const dHandle = document.getElementById("d-handle");
const dCategoria = document.getElementById("d-categoria");
const dLocalizacao = document.getElementById("d-localizacao");
const dTelefone = document.getElementById("d-telefone");
const dWhatsappBtn = document.getElementById("d-whatsapp-btn");
const dStatus = document.getElementById("d-status");
const dTipoResposta = document.getElementById("d-tipo-resposta");
const dProximaAcao = document.getElementById("d-proxima-acao");
const dMensagem = document.getElementById("d-mensagem");
const dDescricao = document.getElementById("d-descricao");
const categoriaOptions = document.getElementById("d-categoria-options");

const saveBtn = document.getElementById("save-btn");
const deleteBtn = document.getElementById("detail-delete-btn");

const historicoInput = document.getElementById("historico-input");
const historicoAddBtn = document.getElementById("historico-add-btn");
const historicoList = document.getElementById("historico-list");

let unsubscribeHistorico = null;

if (!leadId) {
  window.location.href = "index.html";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadLead();
  loadCategoriaOptions();
  subscribeHistorico();
  loadingEl.hidden = true;
  pageEl.hidden = false;
});

async function loadLead() {
  const ref = doc(db, "leads", leadId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    showToast("Lead não encontrado.");
    setTimeout(() => (window.location.href = "index.html"), 1500);
    return;
  }
  const lead = snap.data();
  dNome.value = lead.nome || "";
  dHandle.value = lead.instagramHandle || "";
  dCategoria.value = lead.categoria || "";
  dLocalizacao.value = lead.localizacao || "";
  dTelefone.value = lead.telefone || "";
  dStatus.value = lead.status || "contatado";
  dTipoResposta.value = lead.tipoResposta || "";
  dProximaAcao.value = lead.proximaAcao || "";
  dMensagem.value = lead.mensagemUsada || "";
  dDescricao.value = lead.notas || "";
  document.title = `${lead.nome || "Lead"} — Leads STN`;
  updateWhatsappButton();
}

// ------------------------------------------------------------
// Botão "Abrir WhatsApp" — monta o link wa.me a partir do telefone
// ------------------------------------------------------------
function updateWhatsappButton() {
  const digits = (dTelefone.value || "").replace(/\D/g, "");
  if (digits.length < 10) {
    dWhatsappBtn.hidden = true;
    return;
  }
  // Se a pessoa já digitou o DDI (55) mantém, senão assume Brasil e adiciona
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  dWhatsappBtn.href = `https://wa.me/${withCountryCode}`;
  dWhatsappBtn.hidden = false;
}

dTelefone.addEventListener("input", updateWhatsappButton);

async function loadCategoriaOptions() {
  const snap = await getDocs(collection(db, "leads"));
  const categorias = new Set();
  snap.forEach((d) => {
    const c = d.data().categoria;
    if (c) categorias.add(c);
  });
  categoriaOptions.innerHTML = [...categorias]
    .sort()
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
}

saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvando…";
  try {
    await updateDoc(doc(db, "leads", leadId), {
      nome: dNome.value.trim(),
      instagramHandle: dHandle.value.trim().replace(/^@/, ""),
      categoria: dCategoria.value.trim(),
      localizacao: dLocalizacao.value.trim(),
      telefone: dTelefone.value.trim(),
      status: dStatus.value,
      tipoResposta: dTipoResposta.value,
      proximaAcao: dProximaAcao.value || null,
      mensagemUsada: dMensagem.value.trim(),
      notas: dDescricao.value.trim(),
      updatedAt: serverTimestamp()
    });
    showToast("Alterações salvas.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar. Tenta de novo.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salvar alterações";
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!confirm(`Excluir "${dNome.value}"? Isso apaga também todo o histórico. Não dá pra desfazer.`)) return;
  try {
    await deleteDoc(doc(db, "leads", leadId));
    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    showToast("Erro ao excluir. Tenta de novo.");
  }
});

// ------------------------------------------------------------
// Histórico da negociação (subcoleção leads/{id}/historico)
// ------------------------------------------------------------
function subscribeHistorico() {
  const q = query(collection(db, "leads", leadId, "historico"), orderBy("createdAt", "desc"));
  unsubscribeHistorico = onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderHistorico(entries);
  });
}

function renderHistorico(entries) {
  if (entries.length === 0) {
    historicoList.innerHTML = `<p class="historico-empty">Nenhuma entrada ainda — registra a primeira atualização acima.</p>`;
    return;
  }
  historicoList.innerHTML = entries
    .map((entry) => {
      const date = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date();
      const formatted = date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) + " às " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `
        <div class="historico-entry">
          <div class="historico-date">${formatted}</div>
          <div class="historico-text">${escapeHtml(entry.texto)}</div>
        </div>
      `;
    })
    .join("");
}

historicoAddBtn.addEventListener("click", async () => {
  const texto = historicoInput.value.trim();
  if (!texto) return;
  historicoAddBtn.disabled = true;
  try {
    await addDoc(collection(db, "leads", leadId, "historico"), {
      texto,
      createdAt: serverTimestamp()
    });
    // atualiza também o updatedAt do lead, pra ele "subir" na ordenação do Kanban
    await updateDoc(doc(db, "leads", leadId), { updatedAt: serverTimestamp() });
    historicoInput.value = "";
  } catch (err) {
    console.error(err);
    showToast("Erro ao adicionar ao histórico.");
  } finally {
    historicoAddBtn.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}