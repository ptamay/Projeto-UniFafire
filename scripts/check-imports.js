// Verifica que todo import de pacote externo existe em package.json.
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

const builtins = new Set(['fs','path','crypto','http','https','os','util','stream','events','child_process','url','querystring','zlib','buffer','process']);
const missing = new Set();
const exts = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'build'].includes(entry.name)) walk(full);
    } else if (exts.includes(path.extname(entry.name))) {
      const code = fs.readFileSync(full, 'utf8');
      const re = /(?:import|from|require\()\s*['"]([^'".][^'"]*)['"]/g;
      let m;
      while ((m = re.exec(code))) {
        let dep = m[1];
        if (dep.startsWith('.') || dep.startsWith('@/') || dep.startsWith('~/')) continue;
        if (dep.startsWith('@')) dep = dep.split('/').slice(0, 2).join('/');
        else dep = dep.split('/')[0];
        if (!declared.has(dep) && !builtins.has(dep) && !dep.startsWith('node:')) missing.add(dep);
      }
    }
  }
}

['src', 'app', 'lib', 'components'].forEach(walk);
if (missing.size) { console.log([...missing].join('\n')); process.exit(0); }
