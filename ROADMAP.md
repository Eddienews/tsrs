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
- [x] Mais provedores: DeepSeek, Mistral, xAI, Groq, Perplexity, LM Studio e Command Code
- [x] Ramificar a conversa a partir de uma mensagem
- [x] Fixar mensagens, com atalhos no topo da conversa
- [x] Ler a resposta em voz alta (vozes do sistema)
- [x] Ditar a mensagem (OpenAI, Groq ou reconhecimento do navegador)
- [x] Exportar a conversa como um arquivo HTML único
- [x] Fontes citadas pelo Perplexity e pela busca do OpenRouter
- [x] Opção de abrir o preview sozinho
- [x] Tokens de cache dos provedores no formato OpenAI (o desconto só entra no
      custo quando o preço de cache do provedor é conhecido)

## Próximos: médios

- [ ] OpenCode Zen e OpenCode Go: as APIs não aceitam chamadas do navegador (sem
      CORS no endpoint de chat), e o plano gratuito do Zen só funciona dentro do
      OpenCode. Precisariam de um proxy local opcional, que também serviria a
      outros provedores sem CORS
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
- [ ] Os provedores novos, incluindo Command Code (CORS verificado; conversa ainda não)
- [ ] Botão de instalar o app (PWA)
- [ ] Ditado com a OpenAI ou o Groq e leitura em voz alta (no Linux, o navegador
      precisa de vozes instaladas, por exemplo pelo speech-dispatcher)

## Fora do escopo

Recursos de equipe (workspace compartilhado, gestão de usuários, análises por
pessoa) e compartilhamento por link: exigem servidor e contas, o oposto da
proposta local do TSRS.
