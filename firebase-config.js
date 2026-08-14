// firebase-config.js
//
// Config do projeto Firebase "leads-tini".
//
// IMPORTANTE: esse arquivo só exporta o objeto de configuração — quem
// inicializa o Firebase de verdade (initializeApp) é o app.js, usando os
// SDKs carregados via CDN (gstatic.com). NÃO adiciona "import" de
// "firebase/app" aqui nem chama initializeApp() — isso é o formato que o
// Firebase Console sugere pra projetos com bundler (Webpack/Vite), e não
// funciona em HTML puro sem build step, que é o nosso caso.

export const firebaseConfig = {
  apiKey: "AIzaSyChhUheQQh4vK4LdbxtZvljGY5TpBaQ9oc",
  authDomain: "leads-tini.firebaseapp.com",
  projectId: "leads-tini",
  storageBucket: "leads-tini.firebasestorage.app",
  messagingSenderId: "112923575371",
  appId: "1:112923575371:web:9854dedb19c661daabb9ce"
};