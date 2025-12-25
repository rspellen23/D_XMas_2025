const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function dataUri(filePath) {
  const abs = path.join(root, filePath);
  const b64 = fs.readFileSync(abs).toString('base64');
  const ext = path.extname(filePath).slice(1);
  const mime = ext === 'png' ? 'image/png' : 'application/octet-stream';
  return `data:${mime};base64,${b64}`;
}

function inlineFile(htmlPath, cssPath, jsPath, outPath) {
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  const jsRaw = fs.readFileSync(jsPath, 'utf8')
    .replace(
      "loadTexture('aesSedai', 'assets/deedra.png');",
      `loadTexture('aesSedai', '${dataUri('assets/deedra.png')}');`
    )
    .replace(
      "loadTexture('warder', 'assets/ray.png');",
      `loadTexture('warder', '${dataUri('assets/ray.png')}');`
    )
    .replace(
      "loadTexture('trolloc', 'assets/trolloc.png');",
      `loadTexture('trolloc', '${dataUri('assets/trolloc.png')}');`
    );

  const safeJs = jsRaw.replace(/<\/script>/g, '<\\/script>');
  const safeCss = css.replace(/<\/style>/g, '<\\/style>');

  const html = rawHtml
    .replace('<link rel="stylesheet" href="style.css">', `<style>\n${safeCss}\n</style>`)
    .replace('<script src="main.js"></script>', `<script>\n${safeJs}\n</script>`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`Built ${outPath}`);
}

inlineFile(
  path.join(root, 'index.html'),
  path.join(root, 'style.css'),
  path.join(root, 'main.js'),
  path.join(root, 'dist', 'snowbound-vow-embed.html')
);
