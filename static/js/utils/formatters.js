export function formatPrice(amount) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  try { return new Date(dateStr).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return dateStr; }
}

export function parseProductImages(fallbackImg, imagesJson) {
  let images = [];
  try { images = JSON.parse(imagesJson || "[]"); }
  catch { images = []; }
  if (!Array.isArray(images) || images.length === 0) images = [];
  const all = [];
  if (fallbackImg) all.push(fallbackImg);
  images.forEach((img) => { if (img && !all.includes(img)) all.push(img); });
  return all.length > 0 ? all : ["https://via.placeholder.com/400x500?text=No+Image"];
}
