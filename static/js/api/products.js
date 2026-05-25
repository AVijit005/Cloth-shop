import { api } from "./client.js";

export async function fetchProducts(params = {}) {
  return api("/api/products", { params });
}

export async function fetchProduct(id) {
  return api(`/api/products/${id}`);
}

export async function createProduct(data) {
  return api("/api/products", { method: "POST", body: data });
}

export async function updateProduct(id, data) {
  return api(`/api/products/${id}`, { method: "PUT", body: data });
}

export async function deleteProduct(id) {
  return api(`/api/products/${id}`, { method: "DELETE" });
}
