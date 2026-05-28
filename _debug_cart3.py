with open('static/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add debug to _initCartIconTrigger
old = 'function _initCartIconTrigger() {\n    const cartBtn = document.getElementById("cartIconBtn");\n    if (cartBtn) cartBtn.addEventListener("click", () => { if (window.openCartDrawer) window.openCartDrawer(); });'
new = 'function _initCartIconTrigger() {\n    console.log("[DEBUG] _initCartIconTrigger called");\n    const cartBtn = document.getElementById("cartIconBtn");\n    console.log("[DEBUG] cartIconBtn found:", !!cartBtn);\n    if (cartBtn) cartBtn.addEventListener("click", () => { console.log("[DEBUG] cartIconBtn CLICKED"); if (window.openCartDrawer) { console.log("[DEBUG] calling openCartDrawer"); window.openCartDrawer(); } else { console.log("[DEBUG] openCartDrawer NOT DEFINED"); } });'

idx = content.find(old)
print("Index of _initCartIconTrigger:", idx)
if idx >= 0:
    content = content.replace(old, new, 1)
    print("Applied")
else:
    # Try alternate: check whats around _initCartIconTrigger
    idx2 = content.find('_initCartIconTrigger')
    print("Alt index:", idx2)
    print(repr(content[idx2-20:idx2+100]))

with open('static/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
