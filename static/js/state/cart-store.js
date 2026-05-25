import { getItem, setItem, STORAGE_KEYS } from "../utils/storage.js";

/**
 * CartStore — singleton state manager with localStorage persistence.
 *
 * State events: listeners are notified on every mutation so UI
 * components can react without polling.
 */
class CartStore {
  constructor() {
    this._listeners = new Set();
    this._cart = getItem(STORAGE_KEYS.CART, []);
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => fn(this._cart));
  }

  getCart() {
    return this._cart;
  }

  setCart(cart) {
    this._cart = cart;
    setItem(STORAGE_KEYS.CART, cart);
    this._notify();
  }

  addItem(productId, quantity = 1, size = "M", color = "Default") {
    const idx = this._cart.findIndex(item => item.product_id === productId && item.size === size);
    if (idx >= 0) {
      this._cart[idx].quantity += quantity;
    } else {
      this._cart.push({ product_id: productId, quantity, size, color });
    }
    setItem(STORAGE_KEYS.CART, this._cart);
    this._notify();
    return this._cart;
  }

  adjustQty(index, amount) {
    if (index < 0 || index >= this._cart.length) return this._cart;
    this._cart[index].quantity = Math.max(1, (this._cart[index].quantity || 1) + amount);
    setItem(STORAGE_KEYS.CART, this._cart);
    this._notify();
    return this._cart;
  }

  removeItem(index) {
    if (index < 0 || index >= this._cart.length) return this._cart;
    const removed = this._cart.splice(index, 1)[0];
    setItem(STORAGE_KEYS.CART, this._cart);
    this._notify();
    return removed;
  }

  clear() {
    this._cart = [];
    setItem(STORAGE_KEYS.CART, []);
    this._notify();
  }

  get count() {
    return this._cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }
}

export const cartStore = new CartStore();
