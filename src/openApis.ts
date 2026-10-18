import type { ToolCall, ToolDef, ToolResult } from './stream'

// Free APIs a page made here can call straight from the browser: each one was
// checked on 2026-10-17 to answer without a key, over HTTPS, with JSON (or an
// image) and an Access-Control-Allow-Origin header. Picked by hand from
// github.com/public-apis/public-apis (MIT), which lists over 2,000 of uneven
// quality. `use` says what the provider's own pages allow:
//   free           any use, commercial included, as their terms say
//   attribution    any use with a visible credit (the `credit` line)
//   non-commercial free only for non-commercial work; a paid plan otherwise
//   per-item       each item (photo, icon set, record) carries its own licence
//   check          terms not confirmed: read them before commercial work
export interface OpenApi {
  id: string
  name: string
  category: string
  // What it gives, in a line; the words the search looks at.
  about: string
  // A request that worked when checked.
  example: string
  docs: string
  use: 'free' | 'attribution' | 'non-commercial' | 'per-item' | 'check'
  credit?: string
  limits?: string
  note?: string
}

export const OPEN_APIS: OpenApi[] = [
  // Weather and sky
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    category: 'weather',
    about: 'Weather forecast, current conditions and history for any latitude/longitude, hourly and daily; temperature, rain, wind.',
    example: 'https://api.open-meteo.com/v1/forecast?latitude=-23.55&longitude=-46.63&current=temperature_2m,weather_code',
    docs: 'https://open-meteo.com/en/docs',
    use: 'non-commercial',
    credit: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    limits: '10,000 calls a day; sites with ads or subscriptions need a paid plan',
  },
  {
    id: 'open-meteo-air',
    name: 'Open-Meteo Air Quality',
    category: 'weather',
    about: 'Air quality and pollen: PM2.5, PM10, ozone, UV index for any latitude/longitude.',
    example: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=-23.55&longitude=-46.63&current=pm2_5,uv_index',
    docs: 'https://open-meteo.com/en/docs/air-quality-api',
    use: 'non-commercial',
    credit: 'Air quality data by Open-Meteo.com (CC BY 4.0)',
    limits: 'same as Open-Meteo',
  },
  {
    id: 'nws',
    name: 'US National Weather Service',
    category: 'weather',
    about: 'Official US forecasts and weather alerts by point (United States only).',
    example: 'https://api.weather.gov/points/40.71,-74.0',
    docs: 'https://www.weather.gov/documentation/services-web-api',
    use: 'free',
    note: 'Open data, free for any purpose; US locations only.',
  },
  {
    id: 'sunrise-sunset',
    name: 'Sunrise-Sunset',
    category: 'weather',
    about: 'Sunrise, sunset, golden hour and day length for a latitude/longitude and date.',
    example: 'https://api.sunrise-sunset.org/json?lat=-23.55&lng=-46.63&formatted=0',
    docs: 'https://sunrise-sunset.org/api',
    use: 'attribution',
    credit: 'A visible link to sunrise-sunset.org next to the data',
  },
  // Money
  {
    id: 'frankfurter',
    name: 'Frankfurter',
    category: 'money',
    about: 'Currency exchange rates from central banks, latest and historical, e.g. USD to BRL and EUR.',
    example: 'https://api.frankfurter.app/latest?from=USD&to=BRL,EUR',
    docs: 'https://frankfurter.dev/',
    use: 'free',
    note: 'Its blended rates are free to use.',
  },
  {
    id: 'currency-api',
    name: 'Exchange API (fawazahmed0)',
    category: 'money',
    about: 'Daily exchange rates for 200+ currencies and crypto, served from a CDN.',
    example: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    docs: 'https://github.com/fawazahmed0/exchange-api',
    use: 'check',
  },
  {
    id: 'bcb-sgs',
    name: 'Banco Central do Brasil (SGS)',
    category: 'money',
    about: 'Brazilian economic series: IPCA inflation (433), Selic rate (432), dollar (1); latest values or ranges.',
    example: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json',
    docs: 'https://dadosabertos.bcb.gov.br/',
    use: 'check',
    note: 'Brazilian government open data.',
  },
  // Places
  {
    id: 'restcountries',
    name: 'REST Countries',
    category: 'places',
    about: 'Countries: names, capitals, population, area, currencies, languages, flags (SVG/PNG).',
    example: 'https://restcountries.com/v3.1/alpha/br',
    docs: 'https://restcountries.com/',
    use: 'check',
  },
  {
    id: 'ibge',
    name: 'IBGE Localidades',
    category: 'places',
    about: 'Brazilian states, cities and regions with official codes (IBGE).',
    example: 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios',
    docs: 'https://servicodados.ibge.gov.br/api/docs',
    use: 'check',
    note: 'Brazilian government open data.',
  },
  {
    id: 'brasilapi',
    name: 'BrasilAPI',
    category: 'places',
    about: 'Brazilian data in one place: CEP (postal code) address, national holidays, banks, DDD area codes.',
    example: 'https://brasilapi.com.br/api/cep/v1/01001000',
    docs: 'https://brasilapi.com.br/docs',
    use: 'check',
    note: 'Holidays: https://brasilapi.com.br/api/feriados/v1/2026',
  },
  {
    id: 'zippopotam',
    name: 'Zippopotam.us',
    category: 'places',
    about: 'Postal code to place name and coordinates, for about 60 countries.',
    example: 'https://api.zippopotam.us/us/90210',
    docs: 'https://www.zippopotam.us/',
    use: 'check',
  },
  {
    id: 'nager',
    name: 'Nager.Date',
    category: 'places',
    about: 'Public holidays by country and year, 100+ countries.',
    example: 'https://date.nager.at/api/v3/PublicHolidays/2026/BR',
    docs: 'https://date.nager.at/',
    use: 'check',
  },
  {
    id: 'geojs',
    name: 'GeoJS',
    category: 'places',
    about: "The visitor's approximate country and city from their IP address.",
    example: 'https://get.geojs.io/v1/ip/geo.json',
    docs: 'https://www.geojs.io/',
    use: 'check',
    note: "Sends the visitor's IP to GeoJS: say so on the page.",
  },
  // Art, images and icons
  {
    id: 'met',
    name: 'The Met Collection',
    category: 'art',
    about: 'Metropolitan Museum of Art: 470,000+ artworks with data and public-domain high-resolution images.',
    example: 'https://collectionapi.metmuseum.org/public/collection/v1/objects/436535',
    docs: 'https://metmuseum.github.io/',
    use: 'free',
    note: 'Open Access data is CC0; use images of works marked isPublicDomain. Object ids come from /public/collection/v1/search?q=…',
    limits: '80 requests a second',
  },
  {
    id: 'cleveland',
    name: 'Cleveland Museum of Art',
    category: 'art',
    about: 'Cleveland Museum of Art: 64,000 artworks, 37,000 with CC0 images.',
    example: 'https://openaccess-api.clevelandart.org/api/artworks/?q=cat&limit=5&cc0&has_image=1',
    docs: 'https://openaccess-api.clevelandart.org/',
    use: 'free',
    note: 'CC0 data and images, for commercial and non-commercial use.',
  },
  {
    id: 'artic',
    name: 'Art Institute of Chicago',
    category: 'art',
    about: 'Art Institute of Chicago artworks; images through IIIF (https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg).',
    example: 'https://api.artic.edu/api/v1/artworks/search?q=cats&limit=3&fields=id,title,image_id,is_public_domain',
    docs: 'https://api.artic.edu/docs/',
    use: 'per-item',
    note: 'Use only images of works with is_public_domain true.',
    limits: '60 requests a minute',
  },
  {
    id: 'nasa-images',
    name: 'NASA Image and Video Library',
    category: 'art',
    about: 'NASA photos and videos: space, missions, astronauts, planets.',
    example: 'https://images-api.nasa.gov/search?q=apollo%2011&media_type=image',
    docs: 'https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf',
    use: 'per-item',
    note: 'Generally not copyrighted, but no NASA logos or implied endorsement in commercial work, and people shown need their consent.',
  },
  {
    id: 'picsum',
    name: 'Lorem Picsum',
    category: 'art',
    about: 'Placeholder photos of any size: https://picsum.photos/800/600 (add ?random=1 or /id/10/).',
    example: 'https://picsum.photos/v2/list?limit=5',
    docs: 'https://picsum.photos/',
    use: 'check',
    note: 'For layouts and mock-ups, not as final art.',
  },
  {
    id: 'iconify',
    name: 'Iconify',
    category: 'art',
    about: 'Search and serve 200,000+ open-source icons as SVG: https://api.iconify.design/{set}/{name}.svg',
    example: 'https://api.iconify.design/search?query=star&limit=5',
    docs: 'https://iconify.design/docs/api/',
    use: 'per-item',
    note: "Each icon set has its own licence: check the set's licence in the search result.",
  },
  {
    id: 'dicebear',
    name: 'DiceBear',
    category: 'art',
    about: 'Generated avatars as SVG from any seed: https://api.dicebear.com/9.x/{style}/svg?seed=name',
    example: 'https://api.dicebear.com/9.x/shapes/svg?seed=tsrs',
    docs: 'https://www.dicebear.com/licenses/',
    use: 'per-item',
    note: 'Licence depends on the style (42 styles are CC0, others CC BY 4.0).',
  },
  {
    id: 'qrserver',
    name: 'QR Code Generator (goqr.me)',
    category: 'art',
    about: 'QR code image for any text or link: https://api.qrserver.com/v1/create-qr-code/?data=TEXT&size=300x300',
    example: 'https://api.qrserver.com/v1/create-qr-code/?data=https%3A%2F%2Fexample.com&size=200x200',
    docs: 'https://goqr.me/api/',
    use: 'check',
  },
  {
    id: 'colorapi',
    name: 'The Color API',
    category: 'art',
    about: 'Colour names, conversions and colour schemes from a hex value.',
    example: 'https://www.thecolorapi.com/scheme?hex=dc5000&mode=analogic&count=5',
    docs: 'https://www.thecolorapi.com/',
    use: 'check',
  },
  // Science and nature
  {
    id: 'usgs',
    name: 'USGS Earthquakes',
    category: 'science',
    about: 'Earthquakes worldwide in GeoJSON: past hour, day, week or month, by magnitude.',
    example: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
    docs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    use: 'attribution',
    credit: 'Credit: U.S. Geological Survey',
  },
  {
    id: 'inaturalist',
    name: 'iNaturalist',
    category: 'science',
    about: 'Observations of plants and animals with photos, by place, species or date.',
    example: 'https://api.inaturalist.org/v1/observations?taxon_name=Panthera%20onca&photos=true&per_page=5',
    docs: 'https://api.inaturalist.org/v1/docs/',
    use: 'per-item',
    note: 'Each photo has its own licence (many are CC BY-NC): read license_code.',
  },
  {
    id: 'gbif',
    name: 'GBIF',
    category: 'science',
    about: 'Global Biodiversity Information Facility: species names, taxonomy and occurrence records.',
    example: 'https://api.gbif.org/v1/species/match?name=Puma%20concolor',
    docs: 'https://techdocs.gbif.org/en/openapi/',
    use: 'per-item',
    note: 'Each dataset carries its own licence (CC0, CC BY or CC BY-NC).',
  },
  {
    id: 'wheretheiss',
    name: 'Where the ISS at?',
    category: 'science',
    about: 'Live position, altitude and speed of the International Space Station.',
    example: 'https://api.wheretheiss.at/v1/satellites/25544',
    docs: 'https://wheretheiss.at/w/developer',
    use: 'check',
    limits: 'about one request a second',
  },
  {
    id: 'launchlibrary',
    name: 'Launch Library 2',
    category: 'science',
    about: 'Upcoming and past rocket launches, agencies and astronauts.',
    example: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5',
    docs: 'https://thespacedevs.com/llapi',
    use: 'check',
    limits: '15 requests an hour without a key',
  },
  {
    id: 'spaceflightnews',
    name: 'Spaceflight News',
    category: 'science',
    about: 'Latest spaceflight news articles, blogs and reports, with links to the sources.',
    example: 'https://api.spaceflightnewsapi.net/v4/articles/?limit=5',
    docs: 'https://www.spaceflightnewsapi.net/',
    use: 'check',
  },
  // Knowledge, books and words
  {
    id: 'wikipedia',
    name: 'Wikipedia (summary)',
    category: 'knowledge',
    about: 'Summary, image and link of a Wikipedia article in any language (en., pt., es.…).',
    example: 'https://pt.wikipedia.org/api/rest_v1/page/summary/Albert_Einstein',
    docs: 'https://en.wikipedia.org/api/rest_v1/',
    use: 'attribution',
    credit: 'Text from Wikipedia, CC BY-SA, with a link to the article',
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    category: 'knowledge',
    about: 'Structured facts about people, places and things (dates, population, relations); search by name.',
    example: 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Einstein&language=en&format=json&origin=*',
    docs: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
    use: 'check',
    note: 'Needs origin=* in the address for browser calls.',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    category: 'knowledge',
    about: 'Books: search by title or author, editions, covers (https://covers.openlibrary.org/b/id/{cover_i}-L.jpg).',
    example: 'https://openlibrary.org/search.json?q=dom+casmurro&limit=5',
    docs: 'https://openlibrary.org/developers/api',
    use: 'check',
    limits: 'one request a second',
  },
  {
    id: 'poetrydb',
    name: 'PoetryDB',
    category: 'knowledge',
    about: 'Classic English poems by title, author or line.',
    example: 'https://poetrydb.org/title/Ozymandias',
    docs: 'https://github.com/thundercomb/poetrydb',
    use: 'attribution',
    credit: 'Poetry data from PoetryDB (https://poetrydb.org), licensed under CC BY 4.0',
  },
  {
    id: 'dictionaryapi',
    name: 'Free Dictionary API',
    category: 'knowledge',
    about: 'English word definitions, phonetics, audio pronunciation, synonyms.',
    example: 'https://api.dictionaryapi.dev/api/v2/entries/en/light',
    docs: 'https://dictionaryapi.dev/',
    use: 'check',
  },
  {
    id: 'opentdb',
    name: 'Open Trivia DB',
    category: 'knowledge',
    about: 'Trivia and quiz questions by category and difficulty, multiple choice or true/false.',
    example: 'https://opentdb.com/api.php?amount=5&type=multiple',
    docs: 'https://opentdb.com/api_config.php',
    use: 'attribution',
    credit: 'Questions from Open Trivia DB, CC BY-SA 4.0',
  },
  // Music
  {
    id: 'radio-browser',
    name: 'Radio Browser',
    category: 'music',
    about: 'Internet radio stations worldwide with stream URLs, by country, language or tag.',
    example: 'https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/BR?limit=5&order=votes&reverse=true',
    docs: 'https://api.radio-browser.info/',
    use: 'free',
    note: 'Free and open source, usable in free and non-free software.',
  },
  {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    category: 'music',
    about: 'Music metadata: artists, albums, recordings, release dates.',
    example: 'https://musicbrainz.org/ws/2/artist/?query=beatles&limit=5&fmt=json',
    docs: 'https://musicbrainz.org/doc/MusicBrainz_API',
    use: 'check',
    limits: 'one request a second (faster gets HTTP 503)',
  },
  // Data and statistics
  {
    id: 'worldbank',
    name: 'World Bank Indicators',
    category: 'data',
    about: 'Country statistics over time: population, GDP, life expectancy, CO2, education.',
    example: 'https://api.worldbank.org/v2/country/BR/indicator/SP.POP.TOTL?format=json&per_page=20',
    docs: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392',
    use: 'attribution',
    credit: 'Source: World Bank (CC BY 4.0)',
  },
  {
    id: 'openfoodfacts',
    name: 'Open Food Facts',
    category: 'data',
    about: 'Food products by barcode: ingredients, nutrition facts, Nutri-Score, photos.',
    example: 'https://world.openfoodfacts.org/api/v2/product/737628064502.json',
    docs: 'https://openfoodfacts.github.io/openfoodfacts-server/api/',
    use: 'attribution',
    credit: 'Data from Open Food Facts (ODbL); photos CC BY-SA',
  },
]

const USE_TEXT: Record<OpenApi['use'], string> = {
  free: 'free for any use, commercial included',
  attribution: 'free with a visible credit',
  'non-commercial': 'free for non-commercial work only',
  'per-item': 'licence per item',
  check: 'terms not confirmed: read them before commercial work',
}

const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)

// The catalogue entries that best match a few words, best first.
export function findOpenApis(query: string, category?: string, limit = 6): OpenApi[] {
  const asked = words(query)
  const pool = category ? OPEN_APIS.filter((a) => a.category === category) : OPEN_APIS
  if (!asked.length) return pool.slice(0, limit)
  return pool
    .map((api) => {
      const name = words(`${api.name} ${api.id}`)
      const text = words(`${api.about} ${api.category} ${api.note ?? ''}`)
      let score = 0
      for (const w of asked) {
        if (name.some((n) => n.startsWith(w))) score += 3
        if (text.some((n) => n.startsWith(w) || (w.length > 4 && n.startsWith(w.slice(0, -1))))) score += 1
      }
      return { api, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.api)
}

export function describeOpenApi(api: OpenApi): string {
  return [
    `${api.name} [${api.category}] — ${api.about}`,
    `  example: ${api.example}`,
    `  docs: ${api.docs}`,
    `  use: ${USE_TEXT[api.use]}${api.credit ? `; credit: ${api.credit}` : ''}`,
    ...(api.limits ? [`  limits: ${api.limits}`] : []),
    ...(api.note ? [`  note: ${api.note}`] : []),
  ].join('\n')
}

// Only the catalogue's own hosts are fetched for the model.
export function catalogHost(url: string): OpenApi | null {
  let host: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    host = parsed.hostname
  } catch {
    return null
  }
  return OPEN_APIS.find((api) => new URL(api.example).hostname === host) ?? null
}

const CATEGORIES = [...new Set(OPEN_APIS.map((a) => a.category))]

export const OPEN_API_TOOLS: ToolDef[] = [
  {
    name: 'open_api_find',
    description:
      'Find free public APIs (no key, HTTPS, callable from the browser) for live data in a page, dashboard ' +
      'or app: weather, exchange rates, countries and Brazilian data, holidays, museum art and images, ' +
      'icons, science, books, words, radio, statistics. Returns example requests that work, the docs and ' +
      'what the terms allow (some are non-commercial or need a visible credit: say so and add the credit). ' +
      'Prefer these over inventing data or asking the user for a key.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What data is needed, in a few words, such as "weather forecast" or "dollar to real".' },
        category: { type: 'string', enum: CATEGORIES },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_api_fetch',
    description:
      "Fetch a URL of one of open_api_find's APIs now and read the reply; with save_as, also save it in " +
      "the project's midia/ folder. A motion video must never call an API while it renders (the MP4 would " +
      'change from one render to the next): fetch the data once with save_as, then load midia/<file> in ' +
      'the composition. Pages may call the APIs live.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: "An https URL on the host of one of the catalogue's APIs." },
        save_as: { type: 'string', description: 'Optional file name inside midia/, such as clima-sp.json.' },
      },
      required: ['url'],
    },
  },
]

const MAX_SHOWN = 12_000
const MAX_SAVED = 5 * 1024 * 1024

// Runs the two tools; `save` writes a file into the project with its credit line (and says where).
export async function runOpenApiTool(
  call: ToolCall,
  save: (name: string, content: string, encoding: 'base64' | undefined, credit: string) => Promise<string>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const input = (call.input ?? {}) as { query?: string; category?: string; url?: string; save_as?: string }
  if (call.name === 'open_api_find') {
    const found = findOpenApis(String(input.query ?? ''), input.category)
    return found.length
      ? { content: found.map(describeOpenApi).join('\n\n'), isError: false }
      : { content: `Nothing in the catalogue for that. Categories: ${CATEGORIES.join(', ')}.`, isError: false }
  }
  if (call.name !== 'open_api_fetch') return { content: `No tool named ${call.name}.`, isError: true }
  const url = String(input.url ?? '')
  const api = catalogHost(url)
  if (!api) return { content: 'Only https URLs of the APIs open_api_find lists can be fetched.', isError: true }
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return { content: `${api.name} answered HTTP ${res.status}.`, isError: true }
    const type = res.headers.get('content-type') ?? ''
    const textual = /json|text|xml|svg|javascript/i.test(type)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_SAVED) return { content: `The reply has ${bytes.length} bytes; ask for less.`, isError: true }
    const text = textual ? new TextDecoder().decode(bytes) : ''
    let saved = ''
    if (input.save_as) {
      const name = `midia/${String(input.save_as).replace(/^midia\//, '').replace(/[^\w.-]+/g, '-')}`
      const content = textual ? text : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
      const credit = `${name}: ${api.credit ?? api.name} (${api.docs})`
      saved = `Saved as ${await save(name, content, textual ? undefined : 'base64', credit)}. `
    }
    const shown = textual
      ? text.length > MAX_SHOWN
        ? `${text.slice(0, MAX_SHOWN)}\n[… ${text.length - MAX_SHOWN} more characters${input.save_as ? ' in the saved file' : ''}]`
        : text
      : `(${type || 'binary'}, ${bytes.length} bytes)`
    const credit = api.credit ? `\nCredit to show: ${api.credit}` : ''
    return { content: `${saved}${api.name}, ${type || 'unknown type'}:${credit}\n${shown}`, isError: false }
  } catch (error) {
    return { content: `${api.name} could not be reached: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}
