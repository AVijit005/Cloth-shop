with open('static/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add debug to _initCartDrawer
old1 = "function _initCartDrawer() {\n    const drawer = document.getElementById(\"cartDrawer\");"
new1 = "function _initCartDrawer() {\n    console.log(\"[DEBUG] _initCartDrawer called\");\n    const drawer = document.getElementById(\"cartDrawer\");"

# Add debug for the early return
old2 = "    if (!drawer || !panel) return;\n\n    let closeTimer = null;\n\n    const open = async () => {"
new2 = "    console.log(\"[DEBUG] drawer:\", !!drawer, \"panel:\", !!panel);\n    if (!drawer || !panel) { console.log(\"[DEBUG] EARLY RETURN - drawer or panel missing\"); return; }\n\n    let closeTimer = null;\n\n    const open = async () => {\n        console.log(\"[DEBUG] open() called\");"

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("DEBUG 1 applied")
else:
    print("DEBUG 1 NOT FOUND - checking index...")
    idx = content.find('function _initCartDrawer()')
    print("found at", idx)
    print(repr(content[idx:idx+120]))

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("DEBUG 2 applied")
else:
    print("DEBUG 2 NOT FOUND")

with open('static/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("File written")
