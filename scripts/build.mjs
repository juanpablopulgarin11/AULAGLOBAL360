// Genera dist/ con solo los archivos que necesita el sitio publicado.
// Data/ (PDFs de referencia) y codigodelsalto.py quedan fuera del despliegue.
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const FILES = [
    'index.html',
    'landing.html',
    'preview.html',
    'script.js',
    'styles.css',
    'landing.css',
    'preview_styles.css',
    'logo.svg',
    'logo-icon.svg',
    '.nojekyll',
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

for (const file of FILES) {
    const src = join(root, file);
    if (!existsSync(src)) {
        console.error(`Falta el archivo requerido: ${file}`);
        process.exit(1);
    }
    cpSync(src, join(dist, file));
}

// Verifica que todo recurso local referenciado en los HTML exista en dist/.
const missing = [];
for (const page of FILES.filter(f => f.endsWith('.html'))) {
    const html = readFileSync(join(dist, page), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#?]+)/g)) {
        if (/^(https?:|mailto:|data:|\/\/)/.test(ref)) continue;
        if (!existsSync(join(dist, ref))) missing.push(`${page} -> ${ref}`);
    }
}
if (missing.length) {
    console.error('Referencias rotas:\n  ' + missing.join('\n  '));
    process.exit(1);
}

console.log(`dist/ listo con ${FILES.length} archivos.`);
