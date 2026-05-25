import { api } from "./client.js";

export async function createOrder(data) {
  return api("/api/orders", { method: "POST", body: data });
}

export async function fetchMyOrders() {
  return api("/api/orders/my");
}

export async function fetchAllOrders() {
  return api("/api/orders");
}

export async function cancelOrder(id) {
  return api(`/api/orders/${id}/cancel`, { method: "PUT" });
}

export async function updateOrderStatus(id, status) {
  return api(`/api/orders/${id}/status`, { method: "PATCH", body: { status } });
}
