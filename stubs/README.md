# Stubs

`@huggingface/transformers` lists `onnxruntime-node` and `sharp` as
dependencies for its Node.js build. TSRS only uses its browser build (local
Whisper runs in the browser, with `onnxruntime-web`), so `package.json`
overrides those two with these empty packages: `npm ci` then downloads no native
binaries (about 200 MB less) and runs no install scripts for them.
