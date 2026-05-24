import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFG8h0ssjkOj6FLN6ukfiJSk4WUT6350I",
  authDomain: "fashion-store-b34e1.firebaseapp.com",
  projectId: "fashion-store-b34e1",
  storageBucket: "fashion-store-b34e1.appspot.com",
  messagingSenderId: "958992471571",
  appId: "1:958992471571:web:94ef3cdb929ec3a71151e6"
};

const app = initializeApp(firebaseConfig);

export { app };