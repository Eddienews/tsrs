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
- [x] Imagem, vídeo e áudio por serviços de mídia (ElevenLabs, Runware, fal.ai,
      Replicate, WaveSpeedAI, Higgsfield)
- [x] Pergunta à parte: perguntar sobre um trecho da resposta sem poluir a conversa
- [x] Pacote dividido: o app abre com ~550 kB de JavaScript (eram ~930 kB); o
      Markdown, o realce de sintaxe e as telas chegam logo depois
- [x] Base de conhecimento (RAG) local: PDFs, textos e HTML divididos em trechos
      e buscados por palavras (BM25), sem API, por conversa ou por persona
- [x] Canvas: documento ou código ao lado da conversa, editado pelo modelo (com
      ferramentas) e à mão, com desfazer, preview e pedidos sobre um trecho
- [x] Sincronização entre dispositivos por uma pasta sincronizada (Dropbox,
      Drive, Syncthing…), opcionalmente criptografada, sem servidor do TSRS

## Próximos

- [x] Base de conhecimento com embeddings (busca por sentido, não só por
      palavras), usando a API de embeddings do provedor
- [x] Ferramenta de busca na base para o modelo refinar a pergunta sozinho
- [x] Sincronização da biblioteca item a item, em vez de inteira
- [x] Sincronização sem pasta (WebDAV ou armazenamento S3 do próprio usuário),
      para navegadores sem acesso a pastas, como Firefox e Safari
- [x] Vídeo pelo Veo (chave do Gemini) e voz pela OpenAI (`gpt-4o-mini-tts`)
- [x] Voz pelo Gemini TTS (`gemini-3.8-flash-tts`). O Sora ficou de fora: a
      OpenAI encerrou o Sora 2 e a API de vídeos em 24/09/2026
- [ ] Leitura em voz alta das respostas com uma voz da ElevenLabs
- [ ] Mostrar o custo estimado de um vídeo antes de gerar
- [ ] Mais serviços com API oficial, cada um testado quanto a CORS: Black Forest
      Labs, Stability, Ideogram, Recraft, Luma, Runway, Kling, MiniMax, Cartesia,
      Hume, Deepgram (sem Midjourney, Suno e Udio, que não têm API oficial)

## A confirmar com provedor real

- [ ] MCP com um servidor remoto de verdade (só rodou com o servidor de teste)
- [ ] Resumo do raciocínio na Anthropic
- [ ] Cache de prompt na Anthropic (conferir "do cache" no rodapé da resposta)
- [ ] Os provedores novos, incluindo Command Code (CORS verificado; conversa ainda não)
- [ ] Botão de instalar o app (PWA); no Safari do Mac, "Adicionar ao Dock"
- [ ] Ditado com a OpenAI ou o Groq e leitura em voz alta (só no Linux o
      navegador precisa de vozes instaladas, por exemplo pelo speech-dispatcher;
      o Windows e o macOS já trazem as do sistema)
- [ ] OpenCode Zen e Go pelo proxy local, com uma chave paga
- [ ] Geração de imagens na OpenAI (`gpt-image-2`) e no Gemini
      (`imagen-4.0-generate-001`); os nomes dos modelos podem mudar
- [ ] Veo com uma chave do Gemini (o acesso aos modelos preview pode ser
      limitado) e a voz da OpenAI em português
- [ ] Serviços de mídia com chaves reais (testados só com respostas simuladas):
      ElevenLabs, Runware, fal.ai, Replicate e Higgsfield pelo proxy, WaveSpeedAI;
      conferir os modelos padrão, se o armazenamento do Runware deixa baixar os
      arquivos e o formato exato das respostas
- [ ] Memória com um modelo real: se ele salva fatos úteis sem exagerar
- [ ] Resumo do contexto numa conversa longa de verdade
- [ ] Sincronização entre dois dispositivos reais, por Dropbox, Drive ou Syncthing
- [ ] Canvas com um modelo real: se ele prefere editar trechos a reescrever tudo
- [ ] Qualidade da busca na base de conhecimento com documentos reais
- [ ] Embeddings com chaves reais (OpenAI, Gemini, OpenRouter, Mistral, Ollama)
- [ ] Ferramenta `knowledge_search` com um modelo real: se ele busca de novo
      quando os trechos não bastam
- [ ] WebDAV num Nextcloud de verdade (pelo proxy local) e S3 na AWS ou no R2
      (testados só com WsgiDAV e rclone locais)

## Fora do escopo

Recursos de equipe (workspace compartilhado, gestão de usuários, análises por
pessoa) e compartilhamento por link: exigem servidor e contas, o oposto da
proposta local do TSRS. A sincronização entre dispositivos fica de fora dessa
regra porque usa uma pasta do próprio usuário.
