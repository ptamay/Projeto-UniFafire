const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.resolve(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, '../src/app'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/color:\s*'(#334155|#1e293b)'/g, "color: 'var(--text-heavy)'");
    content = content.replace(/color:\s*'#64748b'/g, "color: 'var(--text-muted)'");
    content = content.replace(/color:\s*'#(94a3b8|cbd5e1)'/g, "color: 'var(--text-light)'");
    content = content.replace(/borderColor:\s*'#cbd5e1'/g, "borderColor: 'var(--border)'");
    content = content.replace(/backgroundColor:\s*'#e2e8f0'/g, "backgroundColor: 'var(--card-alt)'");
    fs.writeFileSync(file, content);
});

console.log('Replaced hardcoded colors!');
