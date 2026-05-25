import { api } from "./client.js";

export async function login(username, password, remember = false) {
  return api("/api/login", { method: "POST", body: { username, password, remember } });
}

export async function register(data) {
  return api("/api/register", { method: "POST", body: data });
}

export async function logout() {
  return api("/api/logout", { method: "POST" });
}

export async function forgotPassword(email) {
  return api("/api/forgot-password", { method: "POST", body: { email } });
}

export async function resetPassword(token, password) {
  return api("/api/reset-password", { method: "POST", body: { token, password } });
}

export async function googleLogin(idToken) {
  return api("/api/login/google", { method: "POST", body: { id_token: idToken } });
}

export async function fetchProfile() {
  return api("/api/profile");
}

export async function updateProfile(data) {
  return api("/api/profile", { method: "PUT", body: data });
}

export async function fetchMe() {
  return api("/api/me");
}
