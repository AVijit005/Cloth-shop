import { getItem, setItem, STORAGE_KEYS } from "../utils/storage.js";

class WishlistStore {
  constructor() {
    this._listeners = new Set();
    this._items = getItem(STORAGE_KEYS.WISHLIST, []);
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => fn(this._items));
  }

  getItems() {
    return this._items;
  }

  has(productId) {
    return (this._items || []).includes(productId);
  }

  toggle(productId) {
    this._items = this._items || [];
    const idx = this._items.indexOf(productId);
    if (idx >= 0) {
      this._items.splice(idx, 1);
    } else {
      this._items.push(productId);
    }
    setItem(STORAGE_KEYS.WISHLIST, this._items);
    this._notify();
    return this.has(productId);
  }

  remove(productId) {
    this._items = this._items.filter(id => id !== productId);
    setItem(STORAGE_KEYS.WISHLIST, this._items);
    this._notify();
  }
}

export const wishlistStore = new WishlistStore();
