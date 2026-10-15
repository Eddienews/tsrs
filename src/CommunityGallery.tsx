import { Check, Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { COMMUNITY_CATEGORIES, communityPrompts, matchesQuery, type CommunityCategory } from './communityPrompts'
import { t, type Language } from './i18n'
import type { SavedPrompt } from './types'

export function categoryName(category: CommunityCategory): string {
  switch (category) {
    case 'escrita':
      return t('Escrita')
    case 'trabalho':
      return t('Trabalho')
    case 'estudo':
      return t('Estudo')
    case 'programacao':
      return t('Programação')
    case 'marketing':
      return t('Marketing e redes')
    case 'dados':
      return t('Dados e planilhas')
    case 'criacao':
      return t('Vídeo, imagem e páginas')
    case 'dia-a-dia':
      return t('Dia a dia')
  }
}

// The community's prompts, to add to the library one by one or a whole
// category at once.
export default function CommunityGallery(props: {
  language: Language
  prompts: SavedPrompt[]
  onAdd: (prompts: SavedPrompt[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CommunityCategory | ''>('')
  const all = useMemo(() => communityPrompts(props.language), [props.language])
  const has = (id: string) => props.prompts.some((p) => p.id === id)
  const shown = all.filter((p) => (!category || p.category === category) && matchesQuery(p, query))
  const missing = shown.filter((p) => !has(p.id))
  const strip = ({ category: _c, ...prompt }: (typeof all)[number]): SavedPrompt => prompt

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Users className="size-3.5" />
        {t('Galeria da comunidade ({count} prompts)', { count: all.length })}
      </Button>
    )
  }

  return (
    <section className="community-gallery space-y-2 rounded-md border p-3" aria-label={t('Galeria da comunidade')}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-medium">{t('Galeria da comunidade')}</h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
          {t('Fechar')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t('Buscar na galeria')}
          placeholder={t('Buscar na galeria…')}
          className="h-8 min-w-40 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={t('Categoria')}
          className="select-native h-8"
          value={category}
          onChange={(e) => setCategory(e.target.value as CommunityCategory | '')}
        >
          <option value="">{t('Todas as categorias')}</option>
          {COMMUNITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryName(c)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={!missing.length}
          onClick={() => props.onAdd(missing.map(strip))}
        >
          <Plus className="size-3.5" />
          {t('Adicionar os {count} mostrados', { count: missing.length })}
        </Button>
      </div>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {shown.map((prompt) => (
          <li key={prompt.id} className="flex items-start gap-2 rounded-md border p-2" data-community={prompt.id}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {prompt.title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{categoryName(prompt.category)}</span>
                {prompt.steps?.length ? (
                  <span className="ml-2 text-xs font-normal text-primary">{t('{count} etapas', { count: prompt.steps.length + 1 })}</span>
                ) : null}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{prompt.text}</p>
            </div>
            {has(prompt.id) ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" />
                {t('na biblioteca')}
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-xs"
                aria-label={t('Adicionar "{title}"', { title: prompt.title })}
                onClick={() => props.onAdd([strip(prompt)])}
              >
                {t('Adicionar')}
              </Button>
            )}
          </li>
        ))}
        {!shown.length && <li className="text-xs text-muted-foreground">{t('Nenhum prompt encontrado.')}</li>}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t('Tem um prompt bom? Mande para a galeria por um pull request no GitHub; o CONTRIBUTING.md explica como.')}
      </p>
    </section>
  )
}
