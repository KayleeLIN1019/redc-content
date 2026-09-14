import { Images, Package, PenLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createPackage,
  deletePackage,
  exportPackages,
  fetchAssets,
  fetchNotes,
  fetchPackages,
  fetchSettings,
  fetchTags,
  tagsOfKind,
  type Asset,
  type ContentPackage,
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
const ASSET_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

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
}: {
  asset: Asset
  selected: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`w-full cursor-pointer overflow-hidden rounded-xl border transition-colors duration-200 ${
          selected ? 'border-cta ring-2 ring-cta/30' : 'border-border hover:border-slate-300'
        }`}
      >
        <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
          <img
            src={asset.url}
            alt={asset.original_filename || `素材 ${asset.id}`}
            className="h-full w-full max-w-full object-cover"
            loading="lazy"
          />
        </div>
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
  const [noteId, setNoteId] = useState<number | null>(null)
  const [primaryId, setPrimaryId] = useState<number | null>(null)
  const [secondaryIds, setSecondaryIds] = useState<number[]>([])
  const [ipFilter, setIpFilter] = useState('')
  const [secondaryFilter, setSecondaryFilter] = useState('')
  const [selectedExport, setSelectedExport] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function flash(message: string, isError = false) {
    setError(isError ? message : '')
    setNotice(isError ? '' : message)
  }

  const confirmedNotes = useMemo(
    () => notes.filter((item) => item.ip_name === ipName && Boolean(item.final_content?.trim())),
    [notes, ipName],
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

  const ipTags = useMemo(() => tagsOfKind(tags, 'ip'), [tags])
  const contentTags = useMemo(() => tagsOfKind(tags, 'content'), [tags])
  const contentTagNames = useMemo(() => new Set(contentTags.map((tag) => tag.name)), [contentTags])

  const visiblePrimaries = useMemo(
    () => primaries.filter((asset) => matchesTagFilter(asset, ipFilter)),
    [primaries, ipFilter],
  )

  const visibleSecondaries = useMemo(
    () =>
      secondaries.filter((asset) => {
        if (!matchesTagFilter(asset, ipFilter)) return false
        if (!secondaryFilter) return true
        const tags = asset.category_tags || []
        if (secondaryFilter === UNTAGGED) {
          return !tags.some((tag) => contentTagNames.has(tag))
        }
        return tags.includes(secondaryFilter)
      }),
    [secondaries, ipFilter, secondaryFilter, contentTagNames],
  )

  const untaggedCount = useMemo(
    () =>
      secondaries.filter((asset) => {
        if (!matchesTagFilter(asset, ipFilter)) return false
        return !(asset.category_tags || []).some((tag) => contentTagNames.has(tag))
      }).length,
    [secondaries, ipFilter, contentTagNames],
  )

  async function loadAll() {
    setLoading(true)
    try {
      const [settings, noteItems, tagItems, primaryItems, secondaryItems, packageItems] = await Promise.all([
        fetchSettings(),
        fetchNotes(),
        fetchTags(),
        fetchAssets({ type: 'primary', availableOnly: true }),
        fetchAssets({ type: 'secondary' }),
        fetchPackages(),
      ])
      const names = Object.keys(settings.prompt_skills)
      setIpNames(names)
      setIpName((current) => current || names[0] || '')
      setNotes(noteItems)
      setTags(tagItems)
      setPrimaries(primaryItems)
      setSecondaries(secondaryItems)
      setPackages(packageItems)
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

  function toggleSecondary(id: number) {
    setSecondaryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleExport(id: number) {
    setSelectedExport((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function onCreate() {
    if (!ipName) {
      flash('请先在设置中添加 IP 技能', true)
      return
    }
    if (!title.trim() || !benefitPoint.trim()) {
      flash('请填写标题和利益点', true)
      return
    }
    if (!noteId) {
      flash('请选择已确认的改写文案', true)
      return
    }
    if (!primaryId) {
      flash('请选择一张可用主图', true)
      return
    }
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
      setPrimaries((items) => items.filter((item) => item.id !== created.primary_asset_id))
      flash('已组成套件。主图和改写会被占用，直到你删除这个套件。可勾选后一键打包下载 Zip')
    } catch (err) {
      flash(err instanceof Error ? err.message : '创建失败', true)
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
              <p className="mb-2 text-xs font-medium text-muted-foreground">已确认文案</p>
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
              ) : (
                <div className="grid gap-2">
                  {confirmedNotes.map((note) => {
                    const extracted = noteDisplayTitle(note)
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => selectNote(note)}
                        className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                          noteId === note.id
                            ? 'border-cta/40 bg-cta/5'
                            : 'border-border hover:border-slate-300'
                        }`}
                      >
                        <span className="font-mono text-xs text-muted-foreground">#{note.id}</span>{' '}
                        {extracted || '（未识别到标题）'}
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
        <>
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>可用主图</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">
                  选 1 张 · {ipFilter ? `${visiblePrimaries.length} / ${primaries.length}` : primaries.length} 张可用
                </span>
              </div>
              {ipTags.length > 0 ? (
                <DropdownSelect
                  label="IP 标签"
                  className="w-full sm:w-64"
                  value={ipFilter}
                  onChange={setIpFilter}
                  options={[
                    { value: '', label: '全部 IP' },
                    ...ipTags.map((tag) => ({ value: tag.name, label: tag.name })),
                  ]}
                />
              ) : null}
            </div>
            {primaries.length === 0 ? (
              <EmptyState icon={Images} title="没有未使用的主图" description="上传主图或释放已被套件占用的主图后再选。" />
            ) : visiblePrimaries.length === 0 ? (
              <EmptyState
                icon={Images}
                title="这个 IP 下没有主图"
                description="换一个 IP 标签，或到素材库给主图打上 IP 标签。"
              />
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <ul className={ASSET_GRID}>
                  {visiblePrimaries.map((asset) => (
                    <AssetTile
                      key={asset.id}
                      asset={asset}
                      selected={primaryId === asset.id}
                      onClick={() => setPrimaryId(asset.id)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>次图</CardTitle>
                <span className="font-mono text-xs text-muted-foreground">
                  可多选 · 已选 {secondaryIds.length} 张
                </span>
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

          <Button disabled={saving} onClick={() => void onCreate()}>
            {saving ? '保存中…' : '加入待导出套件'}
          </Button>
        </>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>待导出 / 已导出</CardTitle>
            <CardHint>勾选套件后打包下载。已发布的套件不能删除。</CardHint>
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
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm"
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
    </div>
  )
}

export default AssemblePage
