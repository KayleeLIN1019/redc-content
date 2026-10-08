import { ChevronLeft, ChevronRight, GripVertical, Images, Package, PenLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createPackage,
  deleteImageSet,
  deletePackage,
  exportPackages,
  fetchAssets,
  fetchImageSets,
  fetchNotes,
  fetchPackages,
  fetchSettings,
  fetchTags,
  recommendSecondaries,
  updatePackageImages,
  tagsOfKind,
  type Asset,
  type ContentPackage,
  type ImageSet,
  type Note,
  type Tag,
} from './api'
import { extractPublishTitle } from './noteCopy'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHint,
  CardTitle,
  Chip,
  DropdownSelect,
  EmptyState,
  FieldLabel,
  Input,
  PageHeader,
  Select,
} from './ui'

const UNTAGGED = '__untagged__'
const ASSET_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'

function noteDisplayTitle(note: Note): string {
  return extractPublishTitle(note.final_content || '')
}

function matchesTagFilter(asset: Asset, filter: string): boolean {
  if (!filter) return true
  const tags = asset.category_tags || []
  if (filter === UNTAGGED) return tags.length === 0
  return tags.includes(filter)
}

function AssetTile({
  asset,
  selected,
  onClick,
  disabled = false,
}: {
  asset: Asset
  selected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <li>
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={`relative w-full overflow-hidden rounded-xl border transition-colors duration-200 ${
          disabled
            ? 'cursor-not-allowed border-border'
            : `cursor-pointer ${
                selected ? 'border-cta ring-2 ring-cta/30' : 'border-border hover:border-slate-300'
              }`
        }`}
      >
        <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
          <img
            src={asset.url}
            alt={asset.original_filename || `素材 ${asset.id}`}
            className={`h-full w-full max-w-full object-cover ${disabled ? 'opacity-50 grayscale' : ''}`}
            loading="lazy"
          />
        </div>
        {disabled && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
            已使用
          </span>
        )}
      </button>
    </li>
  )
}

function AssemblePage() {
  const [ipNames, setIpNames] = useState<string[]>([])
  const [ipName, setIpName] = useState('')
  const [title, setTitle] = useState('')
  const [benefitPoint, setBenefitPoint] = useState('')
  const [benefitDraft, setBenefitDraft] = useState('')
  const [extraBenefits, setExtraBenefits] = useState<string[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [primaries, setPrimaries] = useState<Asset[]>([])
  const [secondaries, setSecondaries] = useState<Asset[]>([])
  const [packages, setPackages] = useState<ContentPackage[]>([])
  const [imageSets, setImageSets] = useState<ImageSet[]>([])
  const [noteId, setNoteId] = useState<number | null>(null)
  const [primaryId, setPrimaryId] = useState<number | null>(null)
  const [secondaryIds, setSecondaryIds] = useState<number[]>([])
  const [secondaryFilter, setSecondaryFilter] = useState('')
  const [selectedExport, setSelectedExport] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ urls: { src: string; name: string }[]; index: number } | null>(
    null,
  )
  const suppressPreview = useRef(false)
  const imageSectionRef = useRef<HTMLDivElement>(null)
  const [showUsedNotes, setShowUsedNotes] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  function flash(message: string, isError = false) {
    setError(isError ? message : '')
    setNotice(isError ? '' : message)
  }

  const confirmedNotes = useMemo(
    () => notes.filter((item) => item.ip_name === ipName && Boolean(item.final_content?.trim())),
    [notes, ipName],
  )

  const usedNoteIds = useMemo(
    () => new Set(packages.map((pkg) => pkg.competitor_note_id)),
    [packages],
  )

  const usedNoteCount = useMemo(
    () => confirmedNotes.filter((note) => usedNoteIds.has(note.id)).length,
    [confirmedNotes, usedNoteIds],
  )

  const visibleNotes = useMemo(
    () => confirmedNotes.filter((note) => showUsedNotes || !usedNoteIds.has(note.id)),
    [confirmedNotes, showUsedNotes, usedNoteIds],
  )

  const benefitOptions = useMemo(() => {
    const names = new Set<string>()
    for (const item of packages) {
      const name = item.benefit_point.trim()
      if (name) names.add(name)
    }
    for (const name of extraBenefits) names.add(name)
    const current = benefitPoint.trim()
    if (current) names.add(current)
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [packages, extraBenefits, benefitPoint])

  const contentTags = useMemo(() => tagsOfKind(tags, 'content'), [tags])
  const contentTagNames = useMemo(() => new Set(contentTags.map((tag) => tag.name)), [contentTags])

  const editingPackage = useMemo(
    () => packages.find((item) => item.id === editingId) ?? null,
    [packages, editingId],
  )

  const visiblePrimaries = useMemo(() => {
    const filtered = primaries.filter((asset) => matchesTagFilter(asset, ipName))
    const current = editingPackage
      ? primaries.find((asset) => asset.id === editingPackage.primary_asset_id)
      : undefined
    if (current && !filtered.some((asset) => asset.id === current.id)) return [current, ...filtered]
    return filtered
  }, [primaries, ipName, editingPackage])

  const availablePrimaryCount = useMemo(
    () =>
      visiblePrimaries.filter(
        (asset) => asset.selectable || asset.id === editingPackage?.primary_asset_id,
      ).length,
    [visiblePrimaries, editingPackage],
  )

  const ipSecondaryCount = useMemo(
    () => secondaries.filter((asset) => matchesTagFilter(asset, ipName)).length,
    [secondaries, ipName],
  )

  const visibleSecondaries = useMemo(() => {
    const filtered = secondaries.filter((asset) => {
      if (!matchesTagFilter(asset, ipName)) return false
      if (!secondaryFilter) return true
      const tags = asset.category_tags || []
      if (secondaryFilter === UNTAGGED) {
        return !tags.some((tag) => contentTagNames.has(tag))
      }
      return tags.includes(secondaryFilter)
    })
    if (!editingPackage) return filtered
    const extra = editingPackage.secondary_asset_ids
      .map((id) => secondaries.find((asset) => asset.id === id))
      .filter((asset): asset is Asset => Boolean(asset && !filtered.some((item) => item.id === asset.id)))
    return [...extra, ...filtered]
  }, [secondaries, ipName, secondaryFilter, contentTagNames, editingPackage])

  const untaggedCount = useMemo(
    () =>
      secondaries.filter((asset) => {
        if (!matchesTagFilter(asset, ipName)) return false
        return !(asset.category_tags || []).some((tag) => contentTagNames.has(tag))
      }).length,
    [secondaries, ipName, contentTagNames],
  )

  const assetById = useMemo(() => {
    const map = new Map<number, Asset>()
    for (const asset of [...primaries, ...secondaries]) map.set(asset.id, asset)
    return map
  }, [primaries, secondaries])

  const selectedNote = useMemo(
    () => notes.find((item) => item.id === noteId) ?? null,
    [notes, noteId],
  )

  const selectedPrimary = primaryId === null ? null : (assetById.get(primaryId) ?? null)

  const selectedSecondaries = useMemo(
    () =>
      secondaryIds
        .map((id) => assetById.get(id))
        .filter((asset): asset is Asset => Boolean(asset)),
    [secondaryIds, assetById],
  )

  async function loadAll() {
    setLoading(true)
    try {
      const [settings, noteItems, tagItems, primaryItems, secondaryItems, packageItems, setItems] = await Promise.all([
        fetchSettings(),
        fetchNotes(),
        fetchTags(),
        fetchAssets({ type: 'primary' }),
        fetchAssets({ type: 'secondary' }),
        fetchPackages(),
        fetchImageSets(),
      ])
      const names = Object.keys(settings.prompt_skills)
      setIpNames(names)
      setIpName((current) => current || names[0] || '')
      setNotes(noteItems)
      setTags(tagItems)
      setPrimaries(primaryItems)
      setSecondaries(secondaryItems)
      setPackages(packageItems)
      setImageSets(setItems)
    } catch (err) {
      flash(err instanceof Error ? err.message : '加载失败', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (noteId === null) return
    const stillVisible = confirmedNotes.some((item) => item.id === noteId)
    if (!stillVisible) {
      setNoteId(null)
      setTitle('')
    }
  }, [confirmedNotes, noteId])

  useEffect(() => {
    if (!ipName) return
    const keepPrimary = editingPackage?.primary_asset_id
    const keepSecondaries = new Set(editingPackage?.secondary_asset_ids || [])
    setPrimaryId((current) => {
      if (current === null) return null
      if (keepPrimary !== undefined && current === keepPrimary) return current
      const asset = primaries.find((item) => item.id === current)
      return asset && matchesTagFilter(asset, ipName) ? current : null
    })
    setSecondaryIds((current) =>
      current.filter((id) => {
        if (keepSecondaries.has(id)) return true
        const asset = secondaries.find((item) => item.id === id)
        return Boolean(asset && matchesTagFilter(asset, ipName))
      }),
    )
  }, [ipName, primaries, secondaries, editingPackage])

  useEffect(() => {
    setSubmitError('')
  }, [title, benefitPoint, noteId, primaryId])

  useEffect(() => {
    if (!preview) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreview(null)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setPreview((current) =>
          current && current.urls.length > 1
            ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length }
            : current,
        )
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setPreview((current) =>
          current && current.urls.length > 1
            ? { ...current, index: (current.index + 1) % current.urls.length }
            : current,
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  function selectNote(note: Note) {
    setNoteId(note.id)
    setTitle(noteDisplayTitle(note))
  }

  function addBenefit() {
    const name = benefitDraft.trim()
    if (!name) {
      flash('请输入利益点名称', true)
      return
    }
    setExtraBenefits((current) => (current.includes(name) ? current : [...current, name]))
    setBenefitPoint(name)
    setBenefitDraft('')
  }

  function openPreview(urls: { src: string; name: string }[], index: number) {
    if (suppressPreview.current) return
    setPreview({ urls, index })
  }

  function toggleSecondary(id: number) {
    setSecondaryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function onRecommendSecondaries() {
    if (!ipName) {
      flash('请先选择 IP', true)
      return
    }
    if (ipSecondaryCount === 0) {
      flash('当前 IP 下没有可用次图', true)
      return
    }
    setRecommending(true)
    try {
      const result = await recommendSecondaries({
        ip_name: ipName,
        benefit_point: benefitPoint.trim(),
      })
      if (result.asset_ids.length === 0) {
        flash(result.summary || '当前 IP 下没有可用次图', true)
        return
      }
      setSecondaryIds(result.asset_ids)
      flash(result.summary)
    } catch (err) {
      flash(err instanceof Error ? err.message : '推荐次图失败', true)
    } finally {
      setRecommending(false)
    }
  }

  function moveSecondary(draggedId: number, targetId: number) {
    if (draggedId === targetId) return
    setSecondaryIds((current) => {
      const from = current.indexOf(draggedId)
      const to = current.indexOf(targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      next.splice(from, 1)
      next.splice(to, 0, draggedId)
      return next
    })
  }

  function toggleImageSet(set: ImageSet) {
    const existing = set.asset_ids.filter((id) => secondaries.some((item) => item.id === id))
    if (existing.length === 0) {
      flash(`套图「${set.name}」里的次图都已删除，可移除这套图`, true)
      return
    }
    setSecondaryIds((current) => {
      const allSelected = existing.every((id) => current.includes(id))
      return allSelected
        ? current.filter((id) => !existing.includes(id))
        : [...new Set([...current, ...existing])]
    })
  }

  async function onDeleteImageSet(set: ImageSet) {
    const ok = window.confirm(`确定删除套图「${set.name}」？素材本身不受影响。`)
    if (!ok) return
    try {
      await deleteImageSet(set.id)
      setImageSets((current) => current.filter((item) => item.id !== set.id))
      flash(`已删除套图「${set.name}」`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '删除套图失败', true)
    }
  }

  function toggleExport(id: number) {
    setSelectedExport((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function onCreate() {
    const fail = (message: string) => {
      setSubmitError(message)
      flash(message, true)
    }
    if (!ipName) {
      fail('请先在设置中添加 IP 技能')
      return
    }
    if (!title.trim()) {
      fail('请填写标题：点选已定稿文案会自动带入，也可以手动输入')
      return
    }
    if (!benefitPoint.trim()) {
      fail('请点选一个利益点，或在输入框新增')
      return
    }
    if (!noteId) {
      fail('请选择一条已确认的改写文案')
      return
    }
    if (!primaryId) {
      fail('请选择一张可用主图')
      return
    }
    setSubmitError('')
    setSaving(true)
    try {
      const created = await createPackage({
        title: title.trim(),
        ip_name: ipName,
        benefit_point: benefitPoint.trim(),
        primary_asset_id: primaryId,
        secondary_asset_ids: secondaryIds,
        competitor_note_id: noteId,
      })
      setPackages((items) => [created, ...items])
      setSelectedExport((items) => [...items, created.id])
      setPrimaryId(null)
      setPrimaries((items) =>
        items.map((item) =>
          item.id === created.primary_asset_id
            ? { ...item, is_used: true, selectable: false }
            : item,
        ),
      )
      flash('已组成套件。主图和改写会被占用，直到你删除这个套件。可勾选后一键打包下载 Zip')
    } catch (err) {
      flash(err instanceof Error ? err.message : '创建失败', true)
    } finally {
      setSaving(false)
    }
  }

  function startEditPackage(item: ContentPackage) {
    if (item.status !== 'draft') {
      flash('只有未导出的草稿可以修改主图和次图', true)
      return
    }
    setEditingId(item.id)
    setIpName(item.ip_name)
    setTitle(item.title)
    setBenefitPoint(item.benefit_point)
    setNoteId(item.competitor_note_id)
    setPrimaryId(item.primary_asset_id)
    setSecondaryIds(item.secondary_asset_ids)
    setSubmitError('')
    flash(`正在编辑草稿「${item.title}」，可更换主图和次图`)
    window.setTimeout(() => {
      imageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function cancelEditPackage() {
    setEditingId(null)
    setPrimaryId(null)
    setSecondaryIds([])
    setSubmitError('')
  }

  async function onSaveEdit() {
    if (!editingPackage) return
    if (!primaryId) {
      const message = '请选择一张主图'
      setSubmitError(message)
      flash(message, true)
      return
    }
    setSaving(true)
    try {
      const updated = await updatePackageImages(editingPackage.id, {
        primary_asset_id: primaryId,
        secondary_asset_ids: secondaryIds,
      })
      const previousPrimaryId = editingPackage.primary_asset_id
      setPackages((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setPrimaries((items) =>
        items.map((item) => {
          if (item.id === updated.primary_asset_id) return { ...item, is_used: true, selectable: false }
          if (item.id === previousPrimaryId && item.id !== updated.primary_asset_id) {
            return { ...item, is_used: false, selectable: true }
          }
          return item
        }),
      )
      setEditingId(null)
      setPrimaryId(null)
      setSecondaryIds([])
      flash(`已更新草稿「${updated.title}」的主图和次图`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '保存失败', true)
    } finally {
      setSaving(false)
    }
  }

  async function onExport() {
    if (selectedExport.length === 0) {
      flash('请勾选要导出的套件', true)
      return
    }
    setExporting(true)
    try {
      await exportPackages(selectedExport)
      await loadAll()
      flash('已开始下载 Zip')
    } catch (err) {
      flash(err instanceof Error ? err.message : '导出失败', true)
    } finally {
      setExporting(false)
    }
  }

  async function onDeletePackage(item: ContentPackage) {
    const ok = window.confirm(
      `确定删除套件「${item.title}」？删除后主图会重新可用，绑定的改写也可以删。`,
    )
    if (!ok) return
    try {
      await deletePackage(item.id)
      setPackages((items) => items.filter((pkg) => pkg.id !== item.id))
      setSelectedExport((items) => items.filter((id) => id !== item.id))
      await loadAll()
      flash(`已删除套件「${item.title}」，素材和改写已释放`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '删除失败', true)
    }
  }

  const assembleReady = !loading && ipNames.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assemble"
        title="内容打包"
        description="把已确认文案、主图和次图组装成套件，再一键导出 Zip。"
      />

      {(notice || error) && <Alert tone={error ? 'error' : 'success'}>{error || notice}</Alert>}

      <Card>
        <CardTitle>组装内容套件</CardTitle>
        <CardHint>
          选择已确认文案 + 1 张可用主图 + 多张次图 + 利益点。点「加入待导出套件」就会占用主图和改写（即使还没下载
          Zip）；次图可复用，也可在素材库直接删掉换新图。不想用整套请在下方删除套件。
        </CardHint>
        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : ipNames.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Package}
              title="还没有 IP"
              description="先到设置添加 IP 技能，再回来组装套件。"
              action={
                <Link to="/settings" className="btn btn-primary">
                  去设置
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <FieldLabel>IP</FieldLabel>
                <Select value={ipName} onChange={(event) => setIpName(event.target.value)}>
                  {ipNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <FieldLabel>标题</FieldLabel>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="选定稿后自动填入，也可手改"
                />
              </label>
            </div>

            <div>
              <FieldLabel>利益点</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {benefitOptions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">还没有利益点，在右侧新增</span>
                ) : (
                  benefitOptions.map((name) => (
                    <Chip key={name} active={benefitPoint === name} onClick={() => setBenefitPoint(name)}>
                      {name}
                    </Chip>
                  ))
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  value={benefitDraft}
                  onChange={(event) => setBenefitDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addBenefit()
                    }
                  }}
                  placeholder="输入新利益点，回车添加"
                  className="max-w-xs"
                />
                <Button variant="secondary" onClick={addBenefit}>
                  新增
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">已确认文案</p>
                <span className="font-mono text-xs text-muted-foreground">
                  {visibleNotes.length} 条
                  {!showUsedNotes && usedNoteCount > 0 ? ` · 已隐藏 ${usedNoteCount} 条已用` : ''}
                </span>
                {usedNoteCount > 0 && (
                  <Chip onClick={() => setShowUsedNotes((current) => !current)}>
                    {showUsedNotes ? '隐藏已用' : `显示已用（${usedNoteCount}）`}
                  </Chip>
                )}
              </div>
              {confirmedNotes.length === 0 ? (
                <EmptyState
                  icon={PenLine}
                  title="暂无定稿"
                  description="先到竞品改写确认保存，再回到这里组装。"
                  action={
                    <Link to="/rewrite" className="btn btn-secondary">
                      去改写
                    </Link>
                  }
                />
              ) : visibleNotes.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  {confirmedNotes.length} 条定稿都已组过套件。
                  <button
                    type="button"
                    className="cursor-pointer text-cta underline underline-offset-2"
                    onClick={() => setShowUsedNotes(true)}
                  >
                    点击查看
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {visibleNotes.map((note) => {
                    const extracted = noteDisplayTitle(note)
                    const used = usedNoteIds.has(note.id)
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => selectNote(note)}
                        className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                          noteId === note.id
                            ? 'border-cta/40 bg-cta/5'
                            : 'border-border hover:border-slate-300'
                        } ${used ? 'opacity-60' : ''}`}
                      >
                        <span className="font-mono text-xs text-muted-foreground">#{note.id}</span>{' '}
                        {extracted || '（未识别到标题）'}
                        {used && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            已用
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {assembleReady ? (
        <div ref={imageSectionRef} className="space-y-6">
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>主图</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">
                  选 1 张 · {availablePrimaryCount} 张可用 / 共 {visiblePrimaries.length} 张
                </span>
              </div>
              {ipNames.length > 0 ? (
                <DropdownSelect
                  label="IP"
                  className="w-full sm:w-64"
                  value={ipName}
                  onChange={setIpName}
                  options={ipNames.map((name) => ({ value: name, label: name }))}
                />
              ) : null}
            </div>
            {primaries.length === 0 ? (
              <EmptyState icon={Images} title="还没有主图" description="到素材库上传主图后再回来选。" />
            ) : visiblePrimaries.length === 0 ? (
              <EmptyState
                icon={Images}
                title="这个 IP 下没有主图"
                description="换一个 IP 标签，或到素材库给主图打上 IP 标签。"
              />
            ) : (
              <>
                {visiblePrimaries.every(
                  (asset) => !asset.selectable && asset.id !== editingPackage?.primary_asset_id,
                ) && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    这些主图都已被套件占用。删除对应套件可释放，或到素材库上传新主图。
                  </p>
                )}
                <div className="max-h-[36rem] overflow-auto">
                  <ul className={ASSET_GRID}>
                    {visiblePrimaries.map((asset) => (
                      <AssetTile
                        key={asset.id}
                        asset={asset}
                        selected={primaryId === asset.id}
                        disabled={!asset.selectable && asset.id !== editingPackage?.primary_asset_id}
                        onClick={() => setPrimaryId(asset.id)}
                      />
                    ))}
                  </ul>
                </div>
              </>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>次图</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">
                  可多选 · 已选 {secondaryIds.length} 张
                </span>
                {secondaryIds.length > 0 && (
                  <Chip onClick={() => setSecondaryIds([])}>清除所选</Chip>
                )}
                <Button
                  variant="secondary"
                  disabled={recommending || ipSecondaryCount === 0}
                  onClick={() => void onRecommendSecondaries()}
                >
                  {recommending ? '推荐中…' : '推荐次图'}
                </Button>
                {ipSecondaryCount === 0 && (
                  <span className="text-xs text-muted-foreground">当前 IP 下没有次图</span>
                )}
              </div>
              {secondaries.length > 0 ? (
                <DropdownSelect
                  label="内容标签"
                  className="w-full sm:w-64"
                  value={secondaryFilter}
                  onChange={setSecondaryFilter}
                  options={[
                    { value: '', label: '全部内容' },
                    ...contentTags.map((tag) => ({ value: tag.name, label: tag.name })),
                    ...(untaggedCount > 0 ? [{ value: UNTAGGED, label: '未打内容标签' }] : []),
                  ]}
                />
              ) : null}
            </div>
            {imageSets.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">套图</span>
                {imageSets.map((set) => {
                  const existing = set.asset_ids.filter((id) =>
                    secondaries.some((item) => item.id === id),
                  )
                  const active =
                    existing.length > 0 && existing.every((id) => secondaryIds.includes(id))
                  return (
                    <span
                      key={set.id}
                      className={`chip cursor-pointer gap-1 ${active ? 'chip-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="cursor-pointer"
                        onClick={() => toggleImageSet(set)}
                        title={active ? '再点一次取消整套' : '一键选中整套次图'}
                      >
                        {set.name}（{existing.length}）
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-muted-foreground hover:text-red-600"
                        onClick={() => void onDeleteImageSet(set)}
                        aria-label={`删除套图 ${set.name}`}
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            {secondaries.length === 0 ? (
              <EmptyState icon={Images} title="还没有次图" description="到素材库上传次图后，可在这里多选复用。次图不会被套件锁住。" />
            ) : visibleSecondaries.length === 0 ? (
              <EmptyState
                icon={Images}
                title="这个标签下没有次图"
                description="换一个标签，或到素材库给次图打标。"
              />
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <ul className={ASSET_GRID}>
                  {visibleSecondaries.map((asset) => (
                    <AssetTile
                      key={asset.id}
                      asset={asset}
                      selected={secondaryIds.includes(asset.id)}
                      onClick={() => toggleSecondary(asset.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CardTitle>已选内容</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">
                  提交前确认 · 点击次图预览，拖拽或方向键调整顺序
                </span>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground">文案</dt>
                <dd className="min-w-0 truncate">
                  {selectedNote ? (
                    <>
                      <span className="font-mono text-xs text-muted-foreground">
                        #{selectedNote.id}
                      </span>{' '}
                      {noteDisplayTitle(selectedNote) || '（未识别到标题）'}
                    </>
                  ) : (
                    <span className="text-muted-foreground">未选择</span>
                  )}
                </dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground">标题</dt>
                <dd className="min-w-0 truncate">
                  {title.trim() || <span className="text-muted-foreground">未填写</span>}
                </dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground">利益点</dt>
                <dd className="min-w-0 truncate">
                  {benefitPoint.trim() || <span className="text-muted-foreground">未选择</span>}
                </dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <dt className="shrink-0 text-muted-foreground">主图</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {selectedPrimary ? (
                    <>
                      <img
                        src={selectedPrimary.url}
                        alt={selectedPrimary.original_filename || `主图 ${selectedPrimary.id}`}
                        className="h-10 w-8 cursor-pointer rounded-md border border-border object-cover"
                        onClick={() =>
                          openPreview(
                            [
                              {
                                src: selectedPrimary.url,
                                name: selectedPrimary.original_filename || `主图 ${selectedPrimary.id}`,
                              },
                            ],
                            0,
                          )
                        }
                      />
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {selectedPrimary.original_filename || `素材 ${selectedPrimary.id}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">未选择</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                次图顺序（{selectedSecondaries.length} 张）· 导出 Zip 按此顺序命名 次图1、次图2…
              </p>
              {selectedSecondaries.length === 0 ? (
                <p className="text-sm text-muted-foreground">未选择次图</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {selectedSecondaries.map((asset, index) => (
                    <li
                      key={asset.id}
                      draggable
                      onDragStart={() => {
                        suppressPreview.current = true
                        setDragId(asset.id)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        if (dragId !== null && dragId !== asset.id) setDragOverId(asset.id)
                      }}
                      onDragLeave={() => setDragOverId((current) => (current === asset.id ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragId !== null) moveSecondary(dragId, asset.id)
                        setDragId(null)
                        setDragOverId(null)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setDragOverId(null)
                        window.setTimeout(() => {
                          suppressPreview.current = false
                        }, 0)
                      }}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('button')) return
                        openPreview(
                          selectedSecondaries.map((item) => ({
                            src: item.url,
                            name: item.original_filename || `次图 ${item.id}`,
                          })),
                          index,
                        )
                      }}
                      tabIndex={0}
                      aria-label={`次图 ${index + 1}，点击预览，拖拽或左右方向键调整顺序`}
                      onKeyDown={(event) => {
                        if (preview) return
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          openPreview(
                            selectedSecondaries.map((item) => ({
                              src: item.url,
                              name: item.original_filename || `次图 ${item.id}`,
                            })),
                            index,
                          )
                          return
                        }
                        if (event.key === 'ArrowLeft' && index > 0) {
                          event.preventDefault()
                          moveSecondary(asset.id, secondaryIds[index - 1])
                        } else if (event.key === 'ArrowRight' && index < secondaryIds.length - 1) {
                          event.preventDefault()
                          moveSecondary(asset.id, secondaryIds[index + 1])
                        } else if (event.key === 'Delete' || event.key === 'Backspace') {
                          event.preventDefault()
                          toggleSecondary(asset.id)
                        }
                      }}
                      className={`relative w-16 cursor-pointer rounded-lg border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta ${
                        dragOverId === asset.id
                          ? 'border-cta ring-2 ring-cta/30'
                          : 'border-border hover:border-slate-300'
                      } ${dragId === asset.id ? 'opacity-40' : ''}`}
                    >
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
                        <img
                          src={asset.url}
                          alt={asset.original_filename || `次图 ${asset.id}`}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <span className="absolute left-1 top-1 rounded bg-white/90 px-1 font-mono text-[10px] leading-4 text-foreground shadow-sm">
                        {index + 1}
                      </span>
                      <span className="absolute bottom-1 left-1 rounded bg-white/90 p-0.5 text-muted-foreground shadow-sm">
                        <GripVertical size={12} aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleSecondary(asset.id)}
                        aria-label={`移除次图 ${index + 1}`}
                        className="absolute right-1 top-1 cursor-pointer rounded bg-white/90 px-1 font-mono text-[10px] leading-4 text-muted-foreground shadow-sm hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            {editingPackage ? (
              <>
                <Button disabled={saving} onClick={() => void onSaveEdit()}>
                  {saving ? '保存中…' : '保存套件修改'}
                </Button>
                <Button variant="secondary" disabled={saving} onClick={cancelEditPackage}>
                  取消编辑
                </Button>
                <span className="text-sm text-muted-foreground">
                  正在改草稿「{editingPackage.title}」的主图和次图
                </span>
              </>
            ) : (
              <Button disabled={saving} onClick={() => void onCreate()}>
                {saving ? '保存中…' : '加入待导出套件'}
              </Button>
            )}
            {submitError && (
              <span role="alert" className="text-sm text-red-600">
                {submitError}
              </span>
            )}
          </div>
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>待导出 / 已导出</CardTitle>
            <CardHint>勾选套件后打包下载。草稿可以改主图和次图；已导出、已发布不能改。</CardHint>
          </div>
          <Button disabled={exporting} onClick={() => void onExport()}>
            {exporting ? '打包中…' : '一键打包下载 Zip'}
          </Button>
        </div>
        {packages.length === 0 ? (
          <EmptyState icon={Package} title="还没有套件" description="上方组好一套内容后，会出现在这里等待导出。" />
        ) : (
          <ul className="space-y-2">
            {packages.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                  editingId === item.id ? 'border-cta bg-cta/5' : 'border-border bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-cta"
                  checked={selectedExport.includes(item.id)}
                  onChange={() => toggleExport(item.id)}
                />
                <span className="font-medium">
                  {item.ip_name} · {item.benefit_point}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">{item.title}</span>
                <span className="ml-auto">
                  <Badge
                    tone={
                      item.status === 'published' ? 'success' : item.status === 'exported' ? 'warning' : 'neutral'
                    }
                  >
                    {item.status === 'draft'
                      ? '草稿'
                      : item.status === 'exported'
                        ? '已导出'
                        : item.status === 'published'
                          ? '已发布'
                          : item.status}
                  </Badge>
                </span>
                {item.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => startEditPackage(item)}
                    className="btn btn-secondary px-2 py-1 text-xs"
                  >
                    编辑套件
                  </button>
                )}
                {item.status === 'published' ? (
                  <span className="text-xs text-muted-foreground">已发布不可删</span>
                ) : (
                  <button type="button" onClick={() => void onDeletePackage(item)} className="btn btn-danger px-2 py-1 text-xs">
                    删除套件
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {preview && preview.urls[preview.index] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            className="glass-strong flex max-h-[90vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-border p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {preview.urls.length > 1 ? `${preview.index + 1} / ${preview.urls.length} · ` : ''}
                {preview.urls[preview.index].name}
              </p>
              <button
                type="button"
                className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setPreview(null)}
                aria-label="关闭预览"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <img
              src={preview.urls[preview.index].src}
              alt={preview.urls[preview.index].name}
              className="max-h-[75vh] w-full rounded-lg bg-muted object-contain"
            />
            {preview.urls.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPreview((current) =>
                      current
                        ? {
                            ...current,
                            index: (current.index - 1 + current.urls.length) % current.urls.length,
                          }
                        : current,
                    )
                  }
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  上一张
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPreview((current) =>
                      current
                        ? { ...current, index: (current.index + 1) % current.urls.length }
                        : current,
                    )
                  }
                >
                  下一张
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AssemblePage
