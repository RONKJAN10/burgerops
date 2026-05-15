import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBAtKHHsJ52ZYPMb8ySQaozlSWfR-j8aKQ",
  authDomain: "burgerops-f1fa2.firebaseapp.com",
  databaseURL: "https://burgerops-f1fa2-default-rtdb.firebaseio.com/",
  projectId: "burgerops-f1fa2",
  storageBucket: "burgerops-f1fa2.firebasestorage.app",
  messagingSenderId: "875427365546",
  appId: "1:875427365546:web:4917a08ee88b5345f906d3",
  measurementId: "G-CW21YB06DC"
};

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);

export {
  database,
  ref,
  set,
  onValue
};
