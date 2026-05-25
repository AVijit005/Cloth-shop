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
      const idToken = await result.user.getIdToken();

      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

      const response = await fetch("/api/login/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || ""
        },
        body: JSON.stringify({ id_token: idToken }),
        credentials: "same-origin"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Google login failed");
      }

      window.location.href = "/";

    } catch (error) {
      console.error(error);
      alert(error.message || "Google Login Failed");
    }

  });