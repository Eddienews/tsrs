import { describe, expect, it } from 'vitest'
import { fileTranscriber, dictationSource } from './dictation'
import { defaultPiperVoice, parseVoices, piperPath, voicesFor, whisperRepo } from './localVoiceInfo'
import { defaultModel, readerSource } from './media'
import { defaultSettings } from './storage'
import { pcmToWav, sentenceGroups } from './wav'

describe('local voices', () => {
  it('finds a Piper voice file from its name, and Whisper by size', () => {
    expect(piperPath('pt_BR-faber-medium')).toBe('pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx')
    expect(piperPath('en_US-hfc_female-x_low')).toBe('en/en_US/hfc_female/x_low/en_US-hfc_female-x_low.onnx')
    expect(() => piperPath('../../etc')).toThrow('Unknown Piper voice')
    expect(whisperRepo('small')).toBe('onnx-community/whisper-small')
    expect(whisperRepo(undefined)).toBe('onnx-community/whisper-base')
    expect(defaultPiperVoice('pt-BR')).toBe('pt_BR-faber-medium')
    expect(defaultPiperVoice('de')).toBe('en_US-lessac-medium')
  })

  it("lists Piper's catalog for the interface language", () => {
    const voices = parseVoices({
      'pt_BR-faber-medium': {
        name: 'faber',
        quality: 'medium',
        language: { code: 'pt_BR' },
        files: { 'pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx': { size_bytes: 63_000_000 }, 'x.onnx.json': {} },
      },
      'pt_PT-tugao-medium': { name: 'tugao', quality: 'medium', language: { code: 'pt_PT' }, files: { 'a.onnx': {} } },
      'en_US-amy-low': { name: 'amy', quality: 'low', language: { code: 'en_US' }, files: { 'b.onnx': {} } },
      broken: { files: {} },
    })
    expect(voices).toHaveLength(3)
    expect(voicesFor(voices, 'pt-BR').map((v) => v.key)).toEqual(['pt_BR-faber-medium', 'pt_PT-tugao-medium'])
    expect(voices[0]).toMatchObject({ locale: 'pt_BR', bytes: 63_000_000 })
  })

  it('writes 16-bit WAV and says long texts in groups of sentences', () => {
    const wav = new DataView(pcmToWav([Float32Array.from([0, 1]), Float32Array.from([-1])], 22050))
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(at + i)))
    expect([tag(0), tag(8), tag(36)]).toEqual(['RIFF', 'WAVE', 'data'])
    expect(wav.getUint32(24, true)).toBe(22050)
    expect(wav.getUint32(40, true)).toBe(6)
    expect([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true)]).toEqual([0, 32767, -32768])
    expect(sentenceGroups('Um. Dois! Três?', 8)).toEqual(['Um.', 'Dois!', 'Três?'])
    expect(sentenceGroups('Um. Dois.', 400)).toEqual(['Um. Dois.'])
    expect(sentenceGroups('  ')).toEqual([])
  })

  it('makes Piper a reading voice that needs no key, and Whisper a dictation source', () => {
    const settings = defaultSettings()
    settings.readAloud = { source: 'piper', model: '', options: '' }
    expect(readerSource(settings, true)).toBeNull()
    expect(readerSource(settings, false)).toMatchObject({ source: 'piper', model: defaultModel('piper', 'audio') })
    settings.dictation = 'local'
    expect(dictationSource(settings, true)).toBe('local')
    expect(fileTranscriber(settings, true)).toBe('local')
  })
})
