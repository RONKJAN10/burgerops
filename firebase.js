import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6KvnMH53ggmXt7WMYsaMPgJObyKNtdUE",
  authDomain: "burgerops-caede.firebaseapp.com",
  databaseURL: "https://burgerops-caede-default-rtdb.firebaseio.com",
  projectId: "burgerops-caede",
  storageBucket: "burgerops-caede.firebasestorage.app",
  messagingSenderId: "260693684282",
  appId: "1:260693684282:web:b247cf1c968282cda98503",
  measurementId: "G-5JV7DGMTSD"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export {
  doc,
  setDoc,
  getDoc,
  onSnapshot
};
