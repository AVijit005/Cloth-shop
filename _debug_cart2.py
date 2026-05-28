with open('static/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add debug to _initCartIconTrigger
old = "function _initCartIconTrigger() {\n    const cartBtn = document.getElementById(\"cartIconBtn\");\n    if (cartBtn) cartBtn.addEventListener(\"click\", () => { if (window.openCartDrawer) window.openCartDrawer(); });"
new = "function _initCartIconTrigger() {\n    console.log(\"[DEBUG] _initCartIconTrigger called\");\n    const cartBtn = document.getElementById(\"cartIconBtn\");\n    console.log(\"[DEBUG] cartIconBtn element:\", cartBtn);\n    if (cartBtn) cartBtn.addEventListener(\"click\", () => { console.log(\"[DEBUG] cartIconBtn CLICKED\"); if (window.openCartDrawer) window.openCartDrawer(); });"

if old in content:
    content = content.replace(old, new, 1)
    print("Applied log for _initCartIconTrigger")
else:
    print("NOT FOUND for _initCartIconTrigger")

# Also add debug to initGlobal cart calls
old2 = "    _initCartDrawer();\n    _initCartIconTrigger();"
new2 = "    console.log(\"[DEBUG] about to call _initCartDrawer\");\n    _initCartDrawer();\n    console.log(\"[DEBUG] _initCartDrawer done, about to call _initCartIconTrigger\");\n    _initCartIconTrigger();\n    console.log(\"[DEBUG] _initCartIconTrigger done\");"

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Applied log for initGlobal calls")
else:
    print("NOT FOUND for initGlobal calls")

with open('static/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("File written")
