// PAV Service — firebase-config.js
// ============================================================
// ATENÇÃO: Substitua os valores abaixo pelas suas credenciais
// do Firebase. Acesse https://console.firebase.google.com,
// selecione seu projeto → Configurações do projeto →
// "Seus aplicativos" → SDK setup and configuration.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAqL9qA7lSaDblcLgFXo2cUT0rJ80duzo",
  authDomain: "pav-service.firebaseapp.com",
  databaseURL: "https://pav-service-default-rtdb.firebaseio.com",
  projectId: "pav-service",
  storageBucket: "pav-service.firebasestorage.app",
  messagingSenderId: "775345482845",
  appId: "1:775345482845:web:9d55e879a6960c082fb1b4"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
