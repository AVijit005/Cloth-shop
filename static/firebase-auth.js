import { app } from "./firebase-config.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const auth = getAuth(app);

const provider = new GoogleAuthProvider();

document
  .getElementById("google-login-btn")
  ?.addEventListener("click", async () => {

    try {

      const result = await signInWithPopup(auth, provider);

      const user = result.user;

      console.log(user);

      alert("Google Login Successful");

    } catch (error) {

      console.error(error);

      alert("Login Failed");

    }

});