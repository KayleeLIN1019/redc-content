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
  type Asset,
  type ContentPackage,
  type Note,
} from './api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHint,
  CardTitle,
  EmptyState,
  FieldLabel,
  Input,
  PageHeader,
  Select,
} from './ui'

function AssemblePage() {
  const [ipNames, setIpNames] = useState<string[]>([])
  const [ipName, setIpName] = useState('')
  const [title, setTitle] = useState('')
  const [benefitPoint, setBenefitPoint] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [primaries, setPrimaries] = useState<Asset[]>([])
  const [secondaries, setSecondaries] = useState<Asset[]>([])
  const [packages, setPackages] = useState<ContentPackage[]>([])
  const [noteId, setNoteId] = useState<number | null>(null)
  const [primaryId, setPrimaryId] = useState<number | null>(null)
  const [secondaryIds, setSecondaryIds] = useState<number[]>([])
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

  async function loadAll() {
    setLoading(true)
    try {
      const [settings, noteItems, primaryItems, secondaryItems, packageItems] = await Promise.all([
        fetchSettings(),
        fetchNotes(),
        fetchAssets({ type: 'primary', availableOnly: true }),
        fetchAssets({ type: 'secondary' }),
        fetchPackages(),
      ])
      const names = Object.keys(settings.prompt_skills)
      setIpNames(names)
      setIpName((current) => current || names[0] || '')
      setNotes(noteItems)
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
          Zip）；不想用了请在下方删除套件。
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
            <div className="grid gap-4 md:grid-cols-3">
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
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="text-sm">
                <FieldLabel>利益点</FieldLabel>
                <Input
                  value={benefitPoint}
                  onChange={(event) => setBenefitPoint(event.target.value)}
                  placeholder="装企承诺"
                />
              </label>
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
                  {confirmedNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setNoteId(note.id)}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200 ${
                        noteId === note.id
                          ? 'border-cta/40 bg-cta/5'
                          : 'border-border hover:border-slate-300'
                      }`}
                    >
                      #{note.id} {note.final_content?.slice(0, 80)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">可用主图（选 1 张）</p>
              {primaries.length === 0 ? (
                <EmptyState icon={Images} title="没有未使用的主图" description="上传主图或释放已被套件占用的主图后再选。" />
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {primaries.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => setPrimaryId(asset.id)}
                        className={`w-full cursor-pointer overflow-hidden rounded-xl border transition-colors duration-200 ${
                          primaryId === asset.id
                            ? 'border-cta ring-2 ring-cta/30'
                            : 'border-border hover:border-slate-300'
                        }`}
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                          <img src={asset.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">次图（可多选）</p>
              {secondaries.length === 0 ? (
                <EmptyState icon={Images} title="还没有次图" description="到素材库上传次图后，可在这里多选复用。" />
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {secondaries.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => toggleSecondary(asset.id)}
                        className={`w-full cursor-pointer overflow-hidden rounded-xl border transition-colors duration-200 ${
                          secondaryIds.includes(asset.id)
                            ? 'border-cta ring-2 ring-cta/30'
                            : 'border-border hover:border-slate-300'
                        }`}
                      >
                        <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                          <img src={asset.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button disabled={saving} onClick={() => void onCreate()}>
              {saving ? '保存中…' : '加入待导出套件'}
            </Button>
          </div>
        )}
      </Card>

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
