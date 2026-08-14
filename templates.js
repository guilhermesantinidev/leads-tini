// templates.js
// Gerencia os templates de mensagem salvos (Firestore, coleção "templates")
// — cada um com nome + texto, e um botão de copiar rápido.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loadingEl = document.getElementById("loading");
const pageEl = document.getElementById("templates-page");
const toastEl = document.getElementById("toast");

const tNome = document.getElementById("t-nome");
const tTexto = document.getElementById("t-texto");
const tAddBtn = document.getElementById("t-add-btn");
const listEl = document.getElementById("templates-list");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  loadingEl.hidden = true;
  pageEl.hidden = false;
  subscribeTemplates();
});

function subscribeTemplates() {
  const q = query(collection(db, "templates"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(templates);
  });
}

function renderList(templates) {
  if (templates.length === 0) {
    listEl.innerHTML = `<p class="historico-empty">Nenhum template salvo ainda.</p>`;
    return;
  }

  listEl.innerHTML = "";
  templates.forEach((t) => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <div class="template-card-head">
        <span class="template-card-name">${escapeHtml(t.nome)}</span>
        <div class="template-card-actions">
          <button class="ghost-btn template-copy-btn" type="button">Copiar</button>
          <button class="icon-btn template-delete-btn" type="button" aria-label="Excluir">✕</button>
        </div>
      </div>
      <p class="template-card-text">${escapeHtml(t.texto)}</p>
    `;

    card.querySelector(".template-copy-btn").addEventListener("click", () => copyText(t.texto));
    card.querySelector(".template-delete-btn").addEventListener("click", () => removeTemplate(t.id, t.nome));

    listEl.appendChild(card);
  });
}

tAddBtn.addEventListener("click", async () => {
  const nome = tNome.value.trim();
  const texto = tTexto.value.trim();
  if (!nome || !texto) {
    showToast("Preenche nome e texto antes de salvar.");
    return;
  }
  tAddBtn.disabled = true;
  try {
    await addDoc(collection(db, "templates"), { nome, texto, createdAt: serverTimestamp() });
    tNome.value = "";
    tTexto.value = "";
    showToast("Template salvo.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar template.");
  } finally {
    tAddBtn.disabled = false;
  }
});

async function removeTemplate(id, nome) {
  if (!confirm(`Excluir o template "${nome}"?`)) return;
  try {
    await deleteDoc(doc(db, "templates", id));
    showToast("Template excluído.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao excluir.");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copiado! Já pode colar no Instagram.");
  } catch (err) {
    console.error(err);
    showToast("Não consegui copiar automaticamente — copia manualmente.");
  }
}

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
