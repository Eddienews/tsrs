// The phonemizer built with Emscripten ships without types.
declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
  const createPiperPhonemize: (module: Record<string, unknown>) => Promise<{ callMain: (args: string[]) => void }>
  export default createPiperPhonemize
}
