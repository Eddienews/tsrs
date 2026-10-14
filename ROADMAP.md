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
- [x] Proxy local opcional (`npm run proxy`) e os provedores OpenCode Zen e Go
- [x] Memória: o modelo guarda fatos sobre você numa lista que você vê e edita
- [x] Agentes: personas com modelo, ferramentas, arquivos e sugestões iniciais
- [x] Resumo do contexto quando a conversa se aproxima do limite do modelo
- [x] Geração de imagens (OpenAI GPT Image e Gemini Imagen)
- [x] Pergunta à parte: perguntar sobre um trecho da resposta sem poluir a conversa
- [x] Pacote dividido: o app abre com ~550 kB de JavaScript (eram ~930 kB); o
      Markdown, o realce de sintaxe e as telas chegam logo depois

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
- [ ] OpenCode Zen e Go pelo proxy local, com uma chave paga
- [ ] Geração de imagens na OpenAI (`gpt-image-2`) e no Gemini
      (`imagen-4.0-generate-001`); os nomes dos modelos podem mudar
- [ ] Memória com um modelo real: se ele salva fatos úteis sem exagerar
- [ ] Resumo do contexto numa conversa longa de verdade

## Fora do escopo

Recursos de equipe (workspace compartilhado, gestão de usuários, análises por
pessoa) e compartilhamento por link: exigem servidor e contas, o oposto da
proposta local do TSRS.
