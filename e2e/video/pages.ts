// The NorthWind Lab page the tutorial builds, shared by several episodes.
export const PAGE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>NorthWind Lab</title>
  <link rel="stylesheet" href="estilo.css">
</head>
<body>
  <header><h1>NorthWind Lab</h1><p>Anúncios e curtas feitos com IA.</p></header>
  <section class="servicos">
    <article><h2>Anúncios</h2><p>15 a 30 segundos, prontos para as redes.</p></article>
    <article><h2>Curtas</h2><p>Séries de animação, do roteiro ao som.</p></article>
  </section>
  <footer>contato@northwindlab.com</footer>
</body>
</html>`

export const PAGE_CSS = `body { margin: 0; font-family: system-ui, sans-serif; background: #0b0d11; color: #efe6d2; }
header { padding: 80px 24px; text-align: center; }
h1 { font-size: 56px; color: #c9a35a; margin: 0; }
.servicos { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 24px; }
article { border: 1px solid #232833; border-radius: 12px; padding: 20px; }
footer { padding: 32px; text-align: center; color: #8b8f98; }`

export const PAGE_REPLY =
  'Aqui está a página inicial, em dois arquivos.\n\n```html index.html\n' + PAGE_HTML + '\n```\n\n```css estilo.css\n' + PAGE_CSS + '\n```\n\n' +
  'Os dois ficaram na pasta do projeto, e o NOTAS.md registra o que foi feito.'

