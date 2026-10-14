# Roadmap

O que já existe, o que vem a seguir e o que ficou de fora. A ordem dentro de
cada seção é a ordem sugerida.

## Feito

- [x] Chat com streaming, Markdown, anexos, versões, edição e regeneração
- [x] Conversas com busca, pastas, fixar, renomear e título automático
- [x] Seis provedores iniciais (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, Custom)
- [x] Tokens e custo por resposta e por conversa; aviso de contexto cheio
- [x] Chaves de API protegidas por senha
- [x] Personas e prompts salvos com campos `{{nome}}`
- [x] Ferramentas: MCP remoto e busca na web / leitura de páginas do provedor
- [x] PWA (instalável, abre sem conexão)
- [x] Interface em português e inglês
- [x] Novo design (Tailwind + shadcn/ui), tema claro/escuro e aparência
- [x] Painel de preview: HTML, SVG, JavaScript, Markdown, React e Mermaid
- [x] Paleta de comandos (Ctrl/⌘+K)
- [x] Tela de uso por dia e por modelo
- [x] Comparação com até três modelos ao mesmo tempo
- [x] Raciocínio do modelo, recolhido acima da resposta
- [x] Apagar tudo
- [x] Cache de prompt automático na Anthropic, com custo calculado à parte
- [x] Mais provedores: DeepSeek, Mistral, xAI, Groq, Perplexity e LM Studio

## Próximos: rápidos

- [ ] Ramificar a conversa ("fork") a partir de uma mensagem
- [ ] Fixar mensagens dentro da conversa
- [ ] Ler a resposta em voz alta (voz do sistema, sem internet)
- [ ] Ditar a mensagem (Whisper da OpenAI ou reconhecimento do navegador)
- [ ] Exportar a conversa como um arquivo HTML único
- [ ] Mostrar as fontes que o Perplexity devolve junto com a resposta
- [ ] Opção de abrir o preview sozinho quando a resposta trouxer uma página
- [ ] Contar os tokens de cache dos provedores no formato OpenAI (cada um tem
      um preço diferente para eles)

## Próximos: médios

- [ ] Memória: o modelo guarda fatos sobre você numa lista que você vê e edita
- [ ] Agentes: personas com modelo, ferramentas, arquivos e sugestões iniciais
- [ ] Resumo do contexto quando a conversa se aproxima do limite do modelo
- [ ] Geração de imagens (OpenAI gpt-image e Gemini)
- [ ] Chat lateral: perguntar sobre um trecho da resposta sem poluir a conversa
- [ ] Dividir o pacote do app (hoje ~900 kB) para abrir mais rápido

## Próximos: grandes

- [ ] Base de conhecimento (RAG) local: começar com busca por palavras, sem API,
      e acrescentar embeddings depois
- [ ] Canvas: editar um documento ou código junto com o modelo
- [ ] Sincronização entre dispositivos

## A confirmar com provedor real

- [ ] MCP com um servidor remoto de verdade (só rodou com o servidor de teste)
- [ ] Resumo do raciocínio na Anthropic
- [ ] Cache de prompt na Anthropic (conferir "do cache" no rodapé da resposta)
- [ ] Os seis provedores novos (CORS verificado; conversa ainda não)
- [ ] Botão de instalar o app (PWA)

## Fora do escopo

Recursos de equipe (workspace compartilhado, gestão de usuários, análises por
pessoa) e compartilhamento por link: exigem servidor e contas, o oposto da
proposta local do TSRS.
