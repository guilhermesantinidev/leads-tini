// firebase-config.js
//
// Preenche com o config do SEU projeto Firebase (Configurações do projeto
// > Geral > Seus apps > SDK setup and configuration > Config).
//
// Recomendo criar um projeto Firebase NOVO e separado do tinisportsreplay
// pra isso (ex: "stn-leads") — são dados de negócio diferentes, sem motivo
// pra misturar no mesmo projeto. Plano Spark (gratuito) é suficiente.

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyChhUheQQh4vK4LdbxtZvljGY5TpBaQ9oc",
  authDomain: "leads-tini.firebaseapp.com",
  projectId: "leads-tini",
  storageBucket: "leads-tini.firebasestorage.app",
  messagingSenderId: "112923575371",
  appId: "1:112923575371:web:9854dedb19c661daabb9ce",
  measurementId: "G-1C0WYR6DYF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
