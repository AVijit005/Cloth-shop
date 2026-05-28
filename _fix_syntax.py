with open('static/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the broken section
old = '''    if (cartBtn) cartBtn.addEventListener("click", function() {
        console.log("[DEBUG] cartIconBtn CLICKED");
        if (window.openCartDrawer) { console.log("[DEBUG] calling openCartDrawer"); window.openCartDrawer(); }
    });) => { console.log("[DEBUG] cartIconBtn CLICKED"); if (window.openCartDrawer) { console.log("[DEBUG] calling openCartDrawer"); window.openCartDrawer(); } else { console.log("[DEBUG] openCartDrawer NOT DEFINED"); } });
    const mobileCartBtn'''

new = '''    if (cartBtn) cartBtn.addEventListener("click", function() {
        console.log("[DEBUG] cartIconBtn CLICKED");
        if (window.openCartDrawer) { console.log("[DEBUG] calling openCartDrawer"); window.openCartDrawer(); }
    });
    const mobileCartBtn'''

if old in content:
    content = content.replace(old, new)
    with open('static/main.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed broken syntax")
else:
    # Find what's actually there
    idx = content.find('cartBtn.addEventListener("click", function()')
    if idx >= 0:
        print(repr(content[idx:idx+400]))
    else:
        print("Could not find broken section")
