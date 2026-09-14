import { Images } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'

import {
  batchUpdateAssets,
  createTag,
  deleteAsset,
  deleteTag,
  fetchAssets,
  fetchTags,
  updateAsset,
  updateAssetTags,
  uploadAsset,
  tagsOfKind,
  type Asset,
  type AssetType,
  type Tag,
  type TagKind,
} from './api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHint,
  CardTitle,
  Chip,
  Combobox,
  EmptyState,
  Input,
  PageHeader,
} from './ui'

type TypeFilter = 'all' | AssetType

const UNTAGGED_CONTENT = '__untagged_content__'

function typeLabel(type: AssetType) {
  return type === 'primary' ? '主图' : '次图'
}

function AssetsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [tagFilter, setTagFilter] = useState('')
  const [ipFilter, setIpFilter] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [excludedOnly, setExcludedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [uploadType, setUploadType] = useState<AssetType>('primary')
  const [uploadTags, setUploadTags] = useState<string[]>([])
  const [newIpTagName, setNewIpTagName] = useState('')
  const [newContentTagName, setNewContentTagName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cardTagDraft, setCardTagDraft] = useState<Record<number, string>>({})
  const [openTagCardId, setOpenTagCardId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchNewTag, setBatchNewTag] = useState('')
  const [pendingTags, setPendingTags] = useState<string[]>([])
  const [pendingBillable, setPendingBillable] = useState<boolean | null>(null)
  const [batchSaving, setBatchSaving] = useState(false)

  useEffect(() => {
    if (files.length === 0) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(files[0])
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [files])

  async function loadTags() {
    const items = await fetchTags()
    setTags(items)
  }

  async function loadAssets(showSpinner = false) {
    if (showSpinner) setLoading(true)
    try {
      const items = await fetchAssets({
        type: typeFilter,
        tag: ipFilter || (tagFilter && tagFilter !== UNTAGGED_CONTENT ? tagFilter : undefined),
        availableOnly,
      })
      setAssets(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTags().catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    void loadAssets(assets.length === 0)
  }, [typeFilter, tagFilter, ipFilter, availableOnly])

  const ipTags = useMemo(() => tagsOfKind(tags, 'ip'), [tags])
  const contentTags = useMemo(() => tagsOfKind(tags, 'content'), [tags])
  const contentTagNames = useMemo(() => new Set(contentTags.map((tag) => tag.name)), [contentTags])

  function flash(message: string, isError = false) {
    setError(isError ? message : '')
    setNotice(isError ? '' : message)
  }

  function takeFiles(list: FileList | File[] | undefined) {
    if (!list) return
    const images = Array.from(list).filter((item) => item.type.startsWith('image/'))
    if (images.length === 0) {
      flash('请选择图片文件', true)
      return
    }
    setFiles(images)
    setError('')
  }

  function toggleUploadTag(name: string) {
    setUploadTags((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    )
  }

  async function addCatalogTag(name: string, kind: TagKind = 'content'): Promise<Tag | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    const existing = tags.find((item) => item.name === trimmed)
    if (existing) return existing
    const created = await createTag(trimmed, kind)
    setTags((current) => [...current, created])
    return created
  }

  async function onCreateTag(kind: TagKind, rawName: string, clear: () => void) {
    const trimmed = rawName.trim()
    if (!trimmed) {
      flash('请输入标签名称', true)
      return
    }
    const existing = tags.find((item) => item.name === trimmed)
    if (existing) {
      flash(`标签「${trimmed}」已存在`, true)
      return
    }
    try {
      const created = await createTag(trimmed, kind)
      setTags((current) => [...current, created])
      clear()
      if (!uploadTags.includes(created.name)) {
        setUploadTags((current) => [...current, created.name])
      }
      flash(`已添加${kind === 'ip' ? ' IP' : '内容'}标签「${created.name}」`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '添加标签失败', true)
    }
  }

  async function onDeleteTag(tag: Tag) {
    try {
      await deleteTag(tag.id)
      setTags((current) => current.filter((item) => item.id !== tag.id))
      setUploadTags((current) => current.filter((item) => item !== tag.name))
      if (tagFilter === tag.name) setTagFilter('')
      if (ipFilter === tag.name) setIpFilter('')
      await loadAssets()
      flash(`已删除标签「${tag.name}」`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '删除标签失败', true)
    }
  }

  async function onUpload() {
    if (files.length === 0) {
      flash('请先选择图片', true)
      return
    }
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of files) {
        const created = await uploadAsset({ file, type: uploadType, tags: uploadTags })
        uploaded.push(created.storage_path)
      }
      setFiles([])
      flash(`已保存 ${uploaded.length} 张，例如 ${uploaded[0]}`)
      await loadAssets()
    } catch (err) {
      flash(err instanceof Error ? err.message : '上传失败', true)
    } finally {
      setUploading(false)
    }
  }

  async function onDeleteAsset(asset: Asset) {
    const ok = window.confirm(
      asset.type === 'primary'
        ? '确定删除这张主图？已被套件占用的主图无法删除。'
        : '确定删除这张次图？套件不会占用次图，删除后导出会跳过缺失文件，发布记录仍保留。',
    )
    if (!ok) return
    try {
      await deleteAsset(asset.id)
      setAssets((current) => current.filter((item) => item.id !== asset.id))
      setSelectedIds((current) => current.filter((id) => id !== asset.id))
      flash(`已删除 ${asset.original_filename || `#${asset.id}`}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '删除失败', true)
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
      flash(`已复制路径：${path}`)
    } catch {
      flash(path)
    }
  }

  async function removeAssetTag(asset: Asset, name: string) {
    try {
      const updated = await updateAssetTags(
        asset.id,
        asset.category_tags.filter((item) => item !== name),
      )
      setAssets((current) => current.map((item) => (item.id === asset.id ? updated : item)))
    } catch (err) {
      flash(err instanceof Error ? err.message : '更新标签失败', true)
    }
  }

  async function addAssetTag(asset: Asset, name: string) {
    const trimmed = name.trim()
    if (!trimmed) {
      flash('请输入标签名称', true)
      return
    }
    if (asset.category_tags.includes(trimmed)) {
      flash(`该素材已有标签「${trimmed}」`, true)
      return
    }
    try {
      let catalog: Tag | undefined = tags.find((item) => item.name === trimmed)
      if (!catalog) {
        catalog = (await addCatalogTag(trimmed)) ?? undefined
      }
      if (!catalog) return
      const updated = await updateAssetTags(asset.id, [...asset.category_tags, catalog.name])
      setAssets((current) => current.map((item) => (item.id === asset.id ? updated : item)))
      setCardTagDraft((current) => ({ ...current, [asset.id]: '' }))
    } catch (err) {
      flash(err instanceof Error ? err.message : '更新标签失败', true)
    }
  }

  function matchesFilters(item: Asset) {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (availableOnly && item.type === 'primary' && item.is_used) return false
    if (excludedOnly && item.billable !== false) return false
    if (ipFilter && !item.category_tags.includes(ipFilter)) return false
    if (tagFilter === UNTAGGED_CONTENT) {
      return !(item.category_tags || []).some((tag) => contentTagNames.has(tag))
    }
    if (tagFilter && !item.category_tags.includes(tagFilter)) return false
    return true
  }

  const visibleAssets = useMemo(
    () => assets.filter((item) => matchesFilters(item)),
    [assets, typeFilter, availableOnly, excludedOnly, ipFilter, tagFilter, contentTagNames],
  )
  const stats = useMemo(
    () => ({
      total: visibleAssets.length,
      used: visibleAssets.filter((item) => item.type === 'primary' && item.is_used).length,
    }),
    [visibleAssets],
  )

  function applyUpdates(updated: Asset[]) {
    const byId = new Map(updated.map((item) => [item.id, item]))
    setAssets((current) =>
      current
        .map((item) => byId.get(item.id) ?? item)
        .filter((item) => !byId.has(item.id) || matchesFilters(item)),
    )
  }

  function toggleSelect(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleSelectAllVisible() {
    const visibleIds = visibleAssets.map((item) => item.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    )
  }

  const selectedAssets = useMemo(
    () => assets.filter((item) => selectedIds.includes(item.id)),
    [assets, selectedIds],
  )

  function tagPresence(name: string): 'all' | 'some' | 'none' {
    if (selectedAssets.length === 0) return 'none'
    const count = selectedAssets.filter((item) => item.category_tags.includes(name)).length
    if (count === 0) return 'none'
    if (count === selectedAssets.length) return 'all'
    return 'some'
  }

  function clearSelection() {
    setSelectedIds([])
    setPendingTags([])
    setPendingBillable(null)
    setBatchNewTag('')
  }

  function togglePendingTag(name: string) {
    setPendingTags((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    )
  }

  function stageTypedTag() {
    const typed = batchNewTag.trim()
    if (!typed) {
      flash('请输入标签名称', true)
      return
    }
    setPendingTags((current) => (current.includes(typed) ? current : [...current, typed]))
    setBatchNewTag('')
  }

  async function onChangeType(asset: Asset, next: AssetType) {
    if (asset.type === next) return
    if (next === 'secondary' && asset.type_locked) {
      flash('该图已被套件用作主图，不能改成次图。请先到内容打包删除对应套件。', true)
      return
    }
    try {
      const updated = await updateAsset(asset.id, { type: next })
      applyUpdates([updated])
      flash(`${asset.original_filename || `#${asset.id}`} 已改为${typeLabel(next)}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '修改主次图失败', true)
      await loadAssets()
    }
  }

  async function onBatchChangeType(next: AssetType) {
    if (selectedIds.length === 0) {
      flash('请先勾选要改的图片', true)
      return
    }
    if (next === 'secondary' && selectedAssets.some((item) => item.type_locked)) {
      flash('选中的图里有套件主图，不能改成次图。请先到内容打包删除对应套件。', true)
      return
    }
    setBatchSaving(true)
    try {
      const updated = await batchUpdateAssets({ assetIds: selectedIds, type: next })
      applyUpdates(updated)
      flash(`已将 ${updated.length} 张改为${typeLabel(next)}`)
      await loadAssets()
    } catch (err) {
      flash(err instanceof Error ? err.message : '批量改主次图失败', true)
      await loadAssets()
    } finally {
      setBatchSaving(false)
    }
  }

  function stageBillable(next: boolean) {
    setPendingBillable((current) => (current === next ? null : next))
  }

  async function onApplyBatch() {
    if (selectedIds.length === 0) {
      flash('请先勾选要改的图片', true)
      return
    }
    if (pendingTags.length === 0 && pendingBillable === null) {
      flash('请先勾选要应用的标签，或选择计入 / 不计入收益', true)
      return
    }
    setBatchSaving(true)
    try {
      const names: string[] = []
      for (const name of pendingTags) {
        const catalog = await addCatalogTag(name)
        if (catalog) names.push(catalog.name)
      }
      const updated = await batchUpdateAssets({
        assetIds: selectedIds,
        addTags: names,
        billable: pendingBillable ?? undefined,
      })
      applyUpdates(updated)
      const parts: string[] = []
      if (names.length > 0) {
        parts.push(`加上 ${names.map((name) => `「${name}」`).join('、')}`)
      }
      if (pendingBillable === false) parts.push('标为不计入收益')
      if (pendingBillable === true) parts.push('标为计入收益')
      flash(`已给 ${updated.length} 张${parts.join('，')}，已取消选中`)
      await loadAssets()
      clearSelection()
    } catch (err) {
      flash(err instanceof Error ? err.message : '批量修改失败', true)
      await loadAssets()
    } finally {
      setBatchSaving(false)
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    takeFiles(event.dataTransfer.files)
  }

  return (
    <div className={`space-y-6 ${selectedIds.length > 0 ? 'pb-72' : ''}`}>
      <PageHeader
        eyebrow="Library"
        title="素材库"
        description="上传、打标、筛选主次图。已被套件占用的主图会禁选。"
      />

      {(notice || error) && <Alert tone={error ? 'error' : 'success'}>{error || notice}</Alert>}

      <Card>
        <CardTitle>上传素材</CardTitle>
        <CardHint>
          文件在 <code className="rounded bg-muted px-1 font-mono text-xs">uploads/</code>
          。一次可多选。主图进过「内容打包」就会被占用（没下载 Zip 也算），要删主图请先到打包页删掉对应套件。次图可复用，也可直接删除或替换，不会删掉套件。
        </CardHint>
        <div className="mt-4 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="self-start w-full">
            <label
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed text-sm transition-colors duration-200 ${
                dragging ? 'border-cta bg-cta/10 text-cta' : 'border-border bg-muted/70 text-muted-foreground'
              }`}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="预览" className="h-full w-full object-cover" />
              ) : (
                <span className="px-3 text-center">拖入或点击，可多选</span>
              )}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => takeFiles(event.target.files ?? undefined)}
              />
            </label>
            {files.length > 0 && (
              <span className="mt-2 block max-w-full truncate text-xs text-muted-foreground">
                {files.length === 1 ? files[0].name : `已选 ${files.length} 张，预览第一张`}
              </span>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex gap-2">
              {(['primary', 'secondary'] as const).map((value) => (
                <Chip key={value} active={uploadType === value} onClick={() => setUploadType(value)}>
                  {value === 'primary' ? '主图' : '次图'}
                </Chip>
              ))}
            </div>

            <div className="mt-3 min-h-[132px] rounded-xl bg-muted/70 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {uploadType === 'primary'
                  ? '主图也可打标；绑定内容后将自动禁选。'
                  : '上传时可直接选标签，也可稍后在素材卡片上补标。'}
              </p>
              <p className="mb-1 text-xs font-medium text-muted-foreground">IP 标签</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {ipTags.map((tag) => (
                  <Chip
                    key={tag.id}
                    active={uploadTags.includes(tag.name)}
                    onClick={() => toggleUploadTag(tag.name)}
                  >
                    {tag.name}
                  </Chip>
                ))}
                {ipTags.length === 0 && (
                  <span className="text-xs text-muted-foreground">还没有 IP 标签，在下方新增</span>
                )}
              </div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">素材内容标签</p>
              <div className="flex flex-wrap gap-2">
                {contentTags.map((tag) => (
                  <Chip
                    key={tag.id}
                    active={uploadTags.includes(tag.name)}
                    onClick={() => toggleUploadTag(tag.name)}
                  >
                    {tag.name}
                  </Chip>
                ))}
                {contentTags.length === 0 && (
                  <span className="text-xs text-muted-foreground">还没有内容标签，在下方新增</span>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={uploading} onClick={() => void onUpload()}>
                {uploading ? '上传中…' : '上传到素材库'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>标签库</CardTitle>
        <CardHint>IP 标签用于按账号筛选素材；素材内容标签描述画面类型。删除会从所有素材上移除该标签。</CardHint>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">IP 标签</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newIpTagName}
                onChange={(event) => setNewIpTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onCreateTag('ip', newIpTagName, () => setNewIpTagName(''))
                  }
                }}
                placeholder="如：桃子"
                className="max-w-xs"
              />
              <Button onClick={() => void onCreateTag('ip', newIpTagName, () => setNewIpTagName(''))}>
                新增 IP 标签
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ipTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground/80"
                >
                  {tag.name}
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground hover:text-destructive"
                    onClick={() => void onDeleteTag(tag)}
                    aria-label={`删除 ${tag.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">素材内容标签</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newContentTagName}
                onChange={(event) => setNewContentTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onCreateTag('content', newContentTagName, () => setNewContentTagName(''))
                  }
                }}
                placeholder="如：清单式报价"
                className="max-w-xs"
              />
              <Button onClick={() => void onCreateTag('content', newContentTagName, () => setNewContentTagName(''))}>
                新增内容标签
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {contentTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground/80"
                >
                  {tag.name}
                  <button
                    type="button"
                    className="cursor-pointer text-muted-foreground hover:text-destructive"
                    onClick={() => void onDeleteTag(tag)}
                    aria-label={`删除 ${tag.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">素材列表</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {stats.total} 张{stats.used ? ` · ${stats.used} 张主图已占用` : ''}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {(['all', 'primary', 'secondary'] as const).map((value) => (
              <Chip key={value} active={typeFilter === value} onClick={() => setTypeFilter(value)}>
                {value === 'all' ? '全部' : value === 'primary' ? '主图' : '次图'}
              </Chip>
            ))}
            <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="cursor-pointer accent-cta"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
              />
              仅显示可用主图
            </label>
            <Chip
              className="whitespace-nowrap"
              active={tagFilter === UNTAGGED_CONTENT}
              aria-pressed={tagFilter === UNTAGGED_CONTENT}
              onClick={() => {
                if (tagFilter === UNTAGGED_CONTENT) {
                  setTagFilter('')
                  return
                }
                setTagFilter(UNTAGGED_CONTENT)
                setTypeFilter('secondary')
                setAvailableOnly(false)
              }}
            >
              未打内容标签
            </Chip>
            <Chip
              className="whitespace-nowrap"
              active={excludedOnly}
              aria-pressed={excludedOnly}
              onClick={() => setExcludedOnly((current) => !current)}
            >
              仅不计入
            </Chip>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">IP 标签</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={ipFilter === ''} onClick={() => setIpFilter('')}>
              全部 IP
            </Chip>
            {ipTags.map((tag) => (
              <Chip
                key={tag.id}
                active={ipFilter === tag.name}
                onClick={() => setIpFilter(tag.name === ipFilter ? '' : tag.name)}
              >
                {tag.name}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mb-4 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">内容标签</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={tagFilter === ''} onClick={() => setTagFilter('')}>
              全部内容
            </Chip>
            {contentTags.map((tag) => (
              <Chip
                key={tag.id}
                active={tagFilter === tag.name}
                onClick={() => setTagFilter(tag.name === tagFilter ? '' : tag.name)}
              >
                {tag.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Chip disabled={visibleAssets.length === 0} onClick={toggleSelectAllVisible}>
            {visibleAssets.length > 0 && visibleAssets.every((item) => selectedIds.includes(item.id))
              ? '取消全选'
              : '全选当前列表'}
          </Chip>
          <span>勾选或点图片后，底部栏点主次图 / 标签会立刻改到卡片上。</span>
        </div>
        {loading && assets.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="glass aspect-[3/4] animate-pulse rounded-xl" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState icon={Images} title="暂无素材" description="先上传主图或次图，再开始组装内容。" />
        ) : visibleAssets.length === 0 ? (
          <EmptyState
            icon={Images}
            title={
              tagFilter === UNTAGGED_CONTENT
                ? '没有未打内容标签的次图'
                : excludedOnly
                  ? '没有不计入收益的素材'
                  : '没有符合筛选的素材'
            }
            description={
              tagFilter === UNTAGGED_CONTENT
                ? '这些次图都已经打过内容标签。点「全部内容」查看全部。'
                : excludedOnly
                  ? '当前没有剔除的旧图。勾选次图后，底部栏点「不计入收益」。'
                  : '换一个 IP 或内容标签再试。'
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {visibleAssets.map((asset) => {
              const disabled = !asset.selectable
              const selected = selectedIds.includes(asset.id)
              return (
                <li
                  key={asset.id}
                  className={`rounded-xl border bg-card/80 shadow-sm ${
                    selected ? 'border-cta ring-2 ring-cta/30' : 'border-border'
                  } ${openTagCardId === asset.id ? 'relative z-30' : 'relative'}`}
                >
                  <div
                    className="relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-t-xl"
                    onClick={() => toggleSelect(asset.id)}
                  >
                    <img
                      src={asset.url}
                      alt={asset.original_filename || `${asset.type}-${asset.id}`}
                      className={`h-full w-full object-cover ${disabled ? 'grayscale' : ''}`}
                      loading="lazy"
                    />
                    <label
                      className="absolute left-3 top-3 z-10 flex cursor-pointer items-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-cta"
                        checked={selected}
                        onChange={() => toggleSelect(asset.id)}
                        aria-label={`选择 ${asset.original_filename || asset.id}`}
                      />
                    </label>
                    {disabled && (
                      <span className="absolute left-10 top-3 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                        已使用，禁选
                      </span>
                    )}
                    {asset.billable === false && (
                      <span className="absolute left-3 bottom-3">
                        <Badge tone="warning">不计入</Badge>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void onDeleteAsset(asset)
                      }}
                      className="absolute right-3 top-3 z-10 cursor-pointer rounded-full bg-black/70 px-2 py-1 text-xs text-white hover:bg-red-600"
                    >
                      删除
                    </button>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {(['primary', 'secondary'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={value === 'secondary' && asset.type_locked}
                            onClick={() => void onChangeType(asset, value)}
                            className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
                              asset.type === value
                                ? 'bg-cta text-cta-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                            title={
                              value === 'secondary' && asset.type_locked
                                ? '套件主图不能改成次图'
                                : undefined
                            }
                          >
                            {typeLabel(value)}
                          </button>
                        ))}
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {asset.original_filename || `#${asset.id}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPath(asset.storage_path)}
                      className="block w-full cursor-pointer truncate text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      title="点击复制路径"
                    >
                      {asset.storage_path}
                    </button>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {asset.category_tags.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80"
                          >
                            {name}
                            <button
                              type="button"
                              className="cursor-pointer hover:text-red-600"
                              onClick={() => void removeAssetTag(asset, name)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Combobox
                          value={cardTagDraft[asset.id] || ''}
                          options={tags
                            .filter((tag) => !asset.category_tags.includes(tag.name))
                            .map((tag) => tag.name)}
                          onChange={(next) =>
                            setCardTagDraft((current) => ({
                              ...current,
                              [asset.id]: next,
                            }))
                          }
                          onSelect={(next) => void addAssetTag(asset, next)}
                          onOpenChange={(open) => setOpenTagCardId(open ? asset.id : null)}
                          placeholder="加标签"
                        />
                        <button
                          type="button"
                          onClick={() => void addAssetTag(asset, cardTagDraft[asset.id] || '')}
                          className="btn btn-primary rounded-xl px-2 text-xs"
                        >
                          加
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selectedIds.length > 0 && (
        <div className="glass-strong fixed inset-x-0 bottom-0 z-40 border-t border-border md:left-56">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-sm font-medium">已选 {selectedIds.length} 张</span>
            <span className="text-xs text-muted-foreground">
              勾选标签或不计入收益后，点右上角应用。标签区可向下滚动。
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={batchSaving} onClick={clearSelection}>
                取消选中
              </Button>
              <Button
                disabled={batchSaving || (pendingTags.length === 0 && pendingBillable === null)}
                onClick={() => void onApplyBatch()}
              >
                {batchSaving
                  ? '应用中…'
                  : `应用${pendingTags.length || pendingBillable !== null ? `（${pendingTags.length + (pendingBillable !== null ? 1 : 0)}）` : ''}`}
              </Button>
            </div>
          </div>
          <div className="max-h-[min(36vh,18rem)] overflow-y-auto px-4 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">主次图</span>
            {(['primary', 'secondary'] as const).map((value) => (
              <Chip
                key={value}
                disabled={
                  batchSaving ||
                  (value === 'secondary' && selectedAssets.some((item) => item.type_locked))
                }
                active={selectedAssets.length > 0 && selectedAssets.every((item) => item.type === value)}
                onClick={() => void onBatchChangeType(value)}
              >
                改成{typeLabel(value)}
              </Chip>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">收益</span>
            <Chip
              disabled={batchSaving}
              active={
                pendingBillable === true ||
                (pendingBillable === null &&
                  selectedAssets.length > 0 &&
                  selectedAssets.every((item) => item.billable !== false))
              }
              aria-pressed={pendingBillable === true}
              onClick={() => stageBillable(true)}
            >
              计入收益
            </Chip>
            <Chip
              disabled={batchSaving}
              active={
                pendingBillable === false ||
                (pendingBillable === null &&
                  selectedAssets.length > 0 &&
                  selectedAssets.every((item) => item.billable === false))
              }
              aria-pressed={pendingBillable === false}
              onClick={() => stageBillable(false)}
            >
              不计入收益
            </Chip>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">IP 标签</span>
            {ipTags.map((tag) => {
              const pending = pendingTags.includes(tag.name)
              const presence = tagPresence(tag.name)
              return (
                <label
                  key={tag.id}
                  className={`chip cursor-pointer gap-1.5 ${pending ? 'chip-active' : ''} ${
                    !pending && presence === 'some' ? 'border-cta bg-cta/10 text-foreground' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer accent-cta"
                    checked={pending}
                    disabled={batchSaving}
                    onChange={() => togglePendingTag(tag.name)}
                  />
                  {tag.name}
                  {presence === 'all' ? ' · 已有' : presence === 'some' ? ' · 部分' : ''}
                </label>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">内容标签</span>
            {[...contentTags.map((tag) => tag.name), ...pendingTags.filter((name) => !tags.some((tag) => tag.name === name))].map(
              (name) => {
              const pending = pendingTags.includes(name)
              const presence = tagPresence(name)
              return (
                <label
                  key={name}
                  className={`chip cursor-pointer gap-1.5 ${pending ? 'chip-active' : ''} ${
                    !pending && presence === 'some' ? 'border-cta bg-cta/10 text-foreground' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer accent-cta"
                    checked={pending}
                    disabled={batchSaving}
                    onChange={() => togglePendingTag(name)}
                  />
                  {name}
                  {presence === 'all' ? ' · 已有' : presence === 'some' ? ' · 部分' : ''}
                </label>
              )
            },
            )}
            <Input
              value={batchNewTag}
              onChange={(event) => setBatchNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  stageTypedTag()
                }
              }}
              placeholder="新内容标签回车加入待应用"
              className="max-w-44 px-2 py-1 text-xs"
            />
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssetsPage
