const TITLE_KEYS = ['标题', '备选标题'] as const
const BODY_KEYS = ['正文', '可直接发布正文', '可发布正文'] as const
const TOPIC_KEYS = ['话题', '话题标签'] as const
const DROP_KEYS = [
  '发布区字数',
  '字数统计',
  '字数',
  '封面建议',
  '封面',
  '置顶评论',
  '发布前确认',
  '策略拆解',
  '拆解',
] as const

type SectionKind = 'title' | 'body' | 'topics' | 'drop'

function stripMarkup(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeHeaderLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*{1,2}/, '')
    .replace(/\*{1,2}$/, '')
    .replace(/^\d+[.、)）]\s*/, '')
    .trim()
}

function classifyHeader(line: string): { kind: SectionKind; rest: string } | null {
  const stripped = normalizeHeaderLine(line)
  if (!stripped) return null

  const groups: Array<{ kind: SectionKind; keys: readonly string[] }> = [
    { kind: 'title', keys: TITLE_KEYS },
    { kind: 'body', keys: BODY_KEYS },
    { kind: 'topics', keys: TOPIC_KEYS },
    { kind: 'drop', keys: DROP_KEYS },
  ]

  for (const group of groups) {
    for (const key of group.keys) {
      if (stripped === key) return { kind: group.kind, rest: '' }
      if (stripped.startsWith(`${key}：`) || stripped.startsWith(`${key}:`)) {
        return { kind: group.kind, rest: stripped.slice(key.length + 1).trim() }
      }
    }
  }
  return null
}

function isTitleLabel(line: string): boolean {
  return /^(首选[｜|]?)?(利益点\/?结果型|痛点\/?避坑型|桃子经验型|结果型|避坑型|经验型)$/.test(line)
}

function cleanLine(line: string): string {
  return line
    .replace(/^[0-9]+[.、)）]\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^[ \t]*---+[ \t]*$/, '')
    .trim()
}

function pickTitle(block: string): string {
  const lines = stripMarkup(block)
    .split('\n')
    .map((line) => cleanLine(line))
    .filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/首选/.test(line)) continue
    const after = line
      .replace(/[（(]首选[)）]/g, '')
      .replace(/^首选[：:]\s*/, '')
      .replace(/^首选[｜|].*$/, '')
      .trim()
    if (after && !isTitleLabel(after)) return after
    const next = lines.slice(index + 1).find((item) => !isTitleLabel(item))
    if (next) return next
  }

  return lines.find((line) => !isTitleLabel(line)) || ''
}

function pickBody(block: string): string {
  return stripMarkup(block)
    .split('\n')
    .map((line) => (line.trim() === '---' ? '' : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickTopics(block: string): string {
  const tags = [...block.matchAll(/#[^\s#]+/g)].map((match) => match[0])
  if (tags.length > 0) return tags.join(' ')
  return stripMarkup(block)
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
}

function parseSections(text: string): { title: string; body: string; topics: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const buckets: Record<'title' | 'body' | 'topics', string[]> = {
    title: [],
    body: [],
    topics: [],
  }
  let current: SectionKind | null = null

  for (const line of lines) {
    const header = classifyHeader(line)
    if (header) {
      current = header.kind
      if (header.kind !== 'drop' && header.rest) buckets[header.kind].push(header.rest)
      continue
    }
    if (current && current !== 'drop') buckets[current].push(line)
  }

  return {
    title: buckets.title.join('\n').trim(),
    body: buckets.body.join('\n').trim(),
    topics: buckets.topics.join('\n').trim(),
  }
}

export function extractPublishTitle(text: string): string {
  const source = (text || '').replace(/\r\n/g, '\n').trim()
  if (!source) return ''
  const parsed = parseSections(source)
  if (parsed.title) return pickTitle(parsed.title)
  return ''
}

export function looksLikePublishDraft(text: string): boolean {
  const value = text.trim()
  if (value.length < 20) return false
  return /标题|正文|话题|^#{1,6}\s/m.test(value)
}

export function formatPublishCopy(text: string): string {
  const source = (text || '').replace(/\r\n/g, '\n').trim()
  if (!source) return ''

  const parsed = parseSections(source)
  if (!parsed.title && !parsed.body && !parsed.topics) {
    return stripMarkup(source)
  }

  const title = pickTitle(parsed.title)
  const body = pickBody(parsed.body)
  const topics = pickTopics(parsed.topics)
  const lines = [`标题：${title}`, '正文：']
  if (body) {
    lines.push(body)
    lines.push('')
  }
  lines.push(`话题：${topics}`)
  return lines.join('\n')
}
