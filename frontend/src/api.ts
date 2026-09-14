export type AssetType = 'primary' | 'secondary'

export type Asset = {
  id: number
  type: AssetType
  file_path: string
  original_filename: string
  storage_path: string
  category_tags: string[]
  is_used: boolean
  billable: boolean
  selectable: boolean
  type_locked: boolean
  url: string
  created_at: string
}

export type TagKind = 'ip' | 'content'

export type Tag = {
  id: number
  name: string
  kind: TagKind
  created_at: string
}

export function tagsOfKind(tags: Tag[], kind: TagKind): Tag[] {
  return tags.filter((tag) => (tag.kind || 'content') === kind)
}

export type Settings = {
  api_key_masked: string
  has_api_key: boolean
  api_base_url: string
  llm_model: string
  max_concurrency: number
  prompt_skills: Record<string, string>
  primary_price: number
  secondary_price: number
}

export type SettingsUpdate = {
  api_key?: string
  api_base_url: string
  llm_model: string
  max_concurrency: number
  prompt_skills: Record<string, string>
  primary_price: number
  secondary_price: number
}

export type Note = {
  id: number
  raw_link: string | null
  raw_content: string | null
  ai_draft: string | null
  final_content: string | null
  ip_name: string
  created_at: string
  updated_at: string
}

async function parseError(response: Response): Promise<string> {
  const data: unknown = await response.json().catch(() => null)
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const first = detail[0]
      if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
        return first.msg
      }
    }
  }
  return `请求失败 (${response.status})`
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeSettings(data: Record<string, unknown>): Settings {
  const skills = data.prompt_skills
  return {
    api_key_masked: typeof data.api_key_masked === 'string' ? data.api_key_masked : '',
    has_api_key: Boolean(data.has_api_key),
    api_base_url: typeof data.api_base_url === 'string' ? data.api_base_url : '',
    llm_model: typeof data.llm_model === 'string' ? data.llm_model : '',
    max_concurrency: Math.min(8, Math.max(1, Math.round(toNumber(data.max_concurrency, 8)))),
    prompt_skills:
      skills && typeof skills === 'object' && !Array.isArray(skills)
        ? Object.fromEntries(
            Object.entries(skills as Record<string, unknown>).map(([key, value]) => [
              key,
              typeof value === 'string' ? value : '',
            ]),
          )
        : {},
    primary_price: toNumber(data.primary_price),
    secondary_price: toNumber(data.secondary_price),
  }
}

export async function fetchTags(): Promise<Tag[]> {
  const response = await fetch('/api/tags')
  if (!response.ok) throw new Error(await parseError(response))
  const data = (await response.json()) as { items: Tag[] }
  return data.items
}

export async function createTag(name: string, kind: TagKind = 'content'): Promise<Tag> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Tag
}

export async function deleteTag(id: number): Promise<void> {
  const response = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function fetchAssets(params: {
  type?: AssetType | 'all'
  tag?: string
  availableOnly?: boolean
}): Promise<Asset[]> {
  const query = new URLSearchParams()
  if (params.type && params.type !== 'all') query.set('type', params.type)
  if (params.tag) query.set('tag', params.tag)
  if (params.availableOnly) query.set('available_only', 'true')
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const response = await fetch(`/api/assets${suffix}`)
  if (!response.ok) throw new Error(await parseError(response))
  const data = (await response.json()) as { items: Asset[] }
  return data.items
}

export async function uploadAsset(input: {
  file: File
  type: AssetType
  tags: string[]
}): Promise<Asset> {
  const body = new FormData()
  body.append('file', input.file)
  body.append('type', input.type)
  body.append('category_tags', JSON.stringify(input.tags))
  const response = await fetch('/api/assets', { method: 'POST', body })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Asset
}

export async function deleteAsset(id: number): Promise<void> {
  const response = await fetch(`/api/assets/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function updateAsset(
  id: number,
  input: { tags?: string[]; type?: AssetType; billable?: boolean },
): Promise<Asset> {
  const body: { category_tags?: string[]; type?: AssetType; billable?: boolean } = {}
  if (input.tags !== undefined) body.category_tags = input.tags
  if (input.type !== undefined) body.type = input.type
  if (input.billable !== undefined) body.billable = input.billable
  const response = await fetch(`/api/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Asset
}

export async function updateAssetTags(id: number, tags: string[]): Promise<Asset> {
  return updateAsset(id, { tags })
}

export async function batchUpdateAssets(input: {
  assetIds: number[]
  type?: AssetType
  billable?: boolean
  addTags?: string[]
  removeTags?: string[]
}): Promise<Asset[]> {
  const response = await fetch('/api/assets/batch', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_ids: input.assetIds,
      type: input.type,
      billable: input.billable,
      add_tags: input.addTags || [],
      remove_tags: input.removeTags || [],
    }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const data = (await response.json()) as { items: Asset[] }
  return data.items
}

export async function fetchSettings(): Promise<Settings> {
  const response = await fetch('/api/settings')
  if (!response.ok) throw new Error(await parseError(response))
  return normalizeSettings((await response.json()) as Record<string, unknown>)
}

export async function updateSettings(body: SettingsUpdate): Promise<Settings> {
  const payload: SettingsUpdate = {
    api_base_url: body.api_base_url,
    llm_model: body.llm_model,
    max_concurrency: body.max_concurrency,
    prompt_skills: body.prompt_skills,
    primary_price: body.primary_price,
    secondary_price: body.secondary_price,
  }
  if (body.api_key !== undefined) payload.api_key = body.api_key
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return normalizeSettings((await response.json()) as Record<string, unknown>)
}

export async function testLlmConnection(input: {
  api_key?: string
  api_base_url: string
  llm_model: string
}): Promise<{ ok: boolean; model: string; latency_ms: number; reply: string }> {
  const response = await fetch('/api/settings/test-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: input.api_key || '',
      api_base_url: input.api_base_url,
      llm_model: input.llm_model,
    }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as {
    ok: boolean
    model: string
    latency_ms: number
    reply: string
  }
}

export async function fetchNotes(): Promise<Note[]> {
  const response = await fetch('/api/notes')
  if (!response.ok) throw new Error(await parseError(response))
  const data = (await response.json()) as { items: Note[] }
  return data.items
}

export async function createNote(input: {
  ip_name: string
  raw_link?: string
  raw_content?: string
}): Promise<Note> {
  const body: { ip_name: string; raw_link?: string; raw_content?: string } = {
    ip_name: input.ip_name,
  }
  if (input.raw_link) body.raw_link = input.raw_link
  if (input.raw_content) body.raw_content = input.raw_content
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Note
}

export async function parseNoteLink(url: string): Promise<{ url: string; content: string }> {
  const response = await fetch('/api/notes/parse-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as { url: string; content: string }
}

export async function rewriteNote(input: {
  ip_name: string
  raw_link?: string
  raw_content?: string
}): Promise<Note> {
  const body: { ip_name: string; raw_link?: string; raw_content?: string } = {
    ip_name: input.ip_name,
  }
  if (input.raw_link) body.raw_link = input.raw_link
  if (input.raw_content) body.raw_content = input.raw_content
  const response = await fetch('/api/notes/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Note
}

export async function rewriteNotesBatch(input: {
  ip_name: string
  items: { raw_link?: string; raw_content?: string }[]
}): Promise<{ items: Note[]; errors: { index: number; detail: string }[] }> {
  const response = await fetch('/api/notes/rewrite/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as {
    items: Note[]
    errors: { index: number; detail: string }[]
  }
}

export async function confirmNote(id: number, final_content: string): Promise<Note> {
  const response = await fetch(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ final_content }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Note
}

export async function deleteNote(id: number): Promise<void> {
  const response = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseError(response))
}

export type ContentPackage = {
  id: number
  title: string
  ip_name: string
  benefit_point: string
  primary_asset_id: number
  secondary_asset_ids: number[]
  competitor_note_id: number
  export_folder_name: string | null
  status: string
  publish_time: string | null
  note_id: string | null
  created_at: string
}

export async function fetchPackages(): Promise<ContentPackage[]> {
  const response = await fetch('/api/packages')
  if (!response.ok) throw new Error(await parseError(response))
  const data = (await response.json()) as { items: ContentPackage[] }
  return data.items
}

export async function deletePackage(id: number): Promise<void> {
  const response = await fetch(`/api/packages/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function createPackage(input: {
  title: string
  ip_name: string
  benefit_point: string
  primary_asset_id: number
  secondary_asset_ids: number[]
  competitor_note_id: number
}): Promise<ContentPackage> {
  const response = await fetch('/api/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as ContentPackage
}

export async function exportPackages(packageIds: number[]): Promise<void> {
  const response = await fetch('/api/packages/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_ids: packageIds }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/i)
  const filename = match?.[1] || 'export.zip'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export type Dashboard = {
  total_packages: number
  published_count: number
  unpublished_count: number
  inventory_primary: number
  inventory_secondary: number
  billable_primary: number
  billable_secondary: number
  excluded_count: number
  primary_used: number
  secondary_used: number
  primary_price: number
  secondary_price: number
  estimated_revenue: number
  revenue_by_ip: {
    ip_name: string
    primary_count: number
    secondary_count: number
    primary_revenue: number
    secondary_revenue: number
  }[]
  benefit_distribution: { benefit_point: string; count: number }[]
  published_by_benefit: { benefit_point: string; count: number }[]
  assets_by_tag: { tag: string; count: number }[]
}

export async function fetchDashboard(): Promise<Dashboard> {
  const response = await fetch('/api/dashboard')
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as Dashboard
}

export async function publishPackage(
  id: number,
  input: { note_id: string; publish_time?: string },
): Promise<ContentPackage> {
  const response = await fetch(`/api/packages/${id}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return (await response.json()) as ContentPackage
}
