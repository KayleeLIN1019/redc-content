import { BarChart3, Image as ImageIcon, Package } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  fetchAssets,
  fetchDashboard,
  fetchPackages,
  fetchTags,
  publishPackage,
  tagsOfKind,
  type Asset,
  type ContentPackage,
  type Dashboard,
  type Tag,
} from './api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHint,
  CardTitle,
  Chip,
  cx,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from './ui'

type SliceKind = 'primary' | 'secondary'

type RevenueSlice = {
  key: string
  ipName: string
  kind: SliceKind
  label: string
  count: number
  amount: number
  color: string
}

const UNASSIGNED_IP = '未打 IP'

const IP_SLICE_COLORS: Record<string, { primary: string; secondary: string }> = {
  桃子: { primary: '#1E293B', secondary: '#8AA0B8' },
  佳佳: { primary: '#C2410C', secondary: '#F5A524' },
  [UNASSIGNED_IP]: { primary: '#57534E', secondary: '#A8A29E' },
}

function sliceColors(ipName: string): { primary: string; secondary: string } {
  return IP_SLICE_COLORS[ipName] ?? { primary: '#334155', secondary: '#94A3B8' }
}

function slicesFromDashboard(stats: Dashboard): RevenueSlice[] {
  const slices: RevenueSlice[] = []
  for (const row of stats.revenue_by_ip ?? []) {
    const colors = sliceColors(row.ip_name)
    if (row.primary_count > 0) {
      slices.push({
        key: `${row.ip_name}-primary`,
        ipName: row.ip_name,
        kind: 'primary',
        label: `${row.ip_name} · 主图`,
        count: row.primary_count,
        amount: row.primary_revenue,
        color: colors.primary,
      })
    }
    if (row.secondary_count > 0) {
      slices.push({
        key: `${row.ip_name}-secondary`,
        ipName: row.ip_name,
        kind: 'secondary',
        label: `${row.ip_name} · 次图`,
        count: row.secondary_count,
        amount: row.secondary_revenue,
        color: colors.secondary,
      })
    }
  }
  return slices
}

function kindLabel(kind: SliceKind) {
  return kind === 'primary' ? '主图' : '次图'
}

function countByName(values: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
}

function assetHasIp(asset: Asset, ipName: string, ipNames: string[]) {
  const tags = asset.category_tags || []
  if (ipName === UNASSIGNED_IP) return !ipNames.some((name) => tags.includes(name))
  return tags.includes(ipName)
}

function RevenueDonut({
  slices,
  total,
  selectedKey,
  onSelect,
}: {
  slices: RevenueSlice[]
  total: number
  selectedKey: string | null
  onSelect: (slice: RevenueSlice) => void
}) {
  const size = 168
  const radius = 58
  const stroke = 22
  const circumference = 2 * Math.PI * radius
  const summary = slices
    .map((item) => `${item.label} ${item.count} 张 ${item.amount.toFixed(2)} 元`)
    .join('；')

  let offset = 0
  const arcs = slices.map((item) => {
    const fraction = total > 0 ? item.amount / total : 0
    const length = fraction * circumference
    const dashoffset = circumference / 4 - offset
    offset += length
    return { ...item, length, dashoffset, fraction }
  })

  const selected = slices.find((item) => item.key === selectedKey) ?? null
  const centerValue = selected ? selected.amount : total

  if (slices.length === 0 || total <= 0) {
    return (
      <p className="text-sm text-muted-foreground">还没有计入收益的素材，环形图会在计费张数大于 0 后出现。</p>
    )
  }

  return (
    <div className="flex min-w-0 items-start gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`预计总收入 ${total.toFixed(2)} 元。${summary}`}
        className="shrink-0"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
        />
        {arcs.map((item) => {
          const active = selectedKey === item.key
          const dimmed = selectedKey !== null && !active
          return (
            <circle
              key={item.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={active ? stroke + 4 : stroke}
              strokeDasharray={`${item.length} ${circumference - item.length}`}
              strokeDashoffset={item.dashoffset}
              strokeLinecap="butt"
              pointerEvents="stroke"
              className="cursor-pointer transition-[opacity,stroke-width] duration-200"
              style={{ opacity: dimmed ? 0.22 : 1 }}
              onClick={() => onSelect(item)}
            >
              <title>{`${item.label} ${item.count} 张 ¥ ${item.amount.toFixed(2)}`}</title>
            </circle>
          )
        })}
        <text
          x={size / 2}
          y={size / 2 - 8}
          textAnchor="middle"
          fill="#64748B"
          fontSize="11"
        >
          {selected ? kindLabel(selected.kind) : '收入'}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 12}
          textAnchor="middle"
          fill="#0F172A"
          fontSize="13"
          fontFamily="Fira Code, ui-monospace, monospace"
          fontWeight="600"
        >
          {centerValue >= 1000 ? `${(centerValue / 1000).toFixed(1)}k` : centerValue.toFixed(0)}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {arcs.map((item) => {
          const active = selectedKey === item.key
          const dimmed = selectedKey !== null && !active
          return (
            <li key={item.key}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(item)}
                className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? 'bg-muted' : 'hover:bg-muted/70'
                }`}
                style={{ opacity: dimmed ? 0.45 : 1 }}
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: item.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-foreground/80">{item.label}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {item.count} 张 · ¥ {item.amount.toFixed(2)} · {Math.round(item.fraction * 100)}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'published') return '已发布'
  if (status === 'exported') return '已导出'
  return '草稿'
}

function statusTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'published') return 'success'
  if (status === 'exported') return 'warning'
  return 'neutral'
}

function BarList({
  items,
  empty,
  tone,
  unit,
  target,
}: {
  items: { name: string; count: number }[]
  empty: string
  tone: 'accent' | 'foreground' | 'muted' | 'sky'
  unit: string
  target?: number
}) {
  const maxCount = Math.max(0, ...items.map((item) => item.count))
  const scale = Math.max(1, maxCount, target ?? 0)
  const targetPct = target ? (target / scale) * 100 : null
  const barClass =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'foreground'
        ? 'bg-foreground/80'
        : tone === 'sky'
          ? 'bg-sky-500'
          : 'bg-stone-400/90'
  const belowItems = target ? items.filter((item) => item.count < target) : []
  const metItems = target ? items.filter((item) => item.count >= target) : items
  const showGroupLabels = Boolean(target && belowItems.length > 0 && metItems.length > 0)
  const groups = target
    ? [
        { key: 'below', label: `未满 ${target} ${unit}`, items: belowItems, unmet: true },
        { key: 'met', label: `已达 ${target} ${unit}`, items: metItems, unmet: false },
      ]
    : [{ key: 'all', label: null, items, unmet: false }]

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div>
      {target ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {belowItems.length > 0 ? (
            <>
              <span className="font-medium text-amber-800">{belowItems.length} 项未满</span>
              <span>
                {' '}
                {target} {unit}
              </span>
            </>
          ) : (
            <>全部已达 {target} {unit}</>
          )}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,5.75rem)_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto]">
        {targetPct !== null ? (
          <div className="col-span-3 mb-1 grid grid-cols-subgrid" aria-hidden="true">
            <div />
            <div className="relative h-5">
              <span className="absolute left-0 top-0 font-mono text-[10px] text-muted-foreground">0</span>
              <span
                className="absolute top-0 -translate-x-1/2 font-mono text-[10px] font-medium text-foreground"
                style={{ left: `${targetPct}%` }}
              >
                {target}
              </span>
              {scale !== target && targetPct < 86 ? (
                <span className="absolute right-0 top-0 font-mono text-[10px] text-muted-foreground">{scale}</span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
              <div
                className="absolute bottom-0 h-1.5 w-px -translate-x-1/2 bg-slate-800"
                style={{ left: `${targetPct}%` }}
              />
            </div>
            <div />
          </div>
        ) : null}

        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <ul key={group.key} className="col-span-3 grid grid-cols-subgrid">
              {showGroupLabels && group.label ? (
                <li
                  className={cx(
                    'col-span-3 pb-1 text-[11px] font-medium',
                    group.unmet ? 'pt-2 text-amber-800' : 'pt-4 text-muted-foreground',
                  )}
                >
                  {group.label}
                </li>
              ) : null}
              {group.items.map((item, index) => {
                const gap = target !== undefined ? Math.max(0, target - item.count) : 0
                return (
                  <li
                    key={item.name}
                    className={cx(
                      'col-span-3 grid grid-cols-subgrid items-center gap-x-3 py-1.5',
                      index > 0 && 'border-t border-border/70',
                    )}
                  >
                    <span className="min-w-0 truncate text-xs text-foreground" title={item.name}>
                      {item.name}
                    </span>
                    <div
                      className="relative h-2 rounded-full bg-muted"
                      role="img"
                      aria-label={
                        target !== undefined
                          ? `${item.name} ${item.count} ${unit}，目标 ${target} ${unit}${
                              group.unmet ? `，差 ${gap} ${unit}` : '，已达目标'
                            }`
                          : `${item.name} ${item.count} ${unit}`
                      }
                    >
                      {targetPct !== null ? (
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-sky-100"
                          style={{ width: `${targetPct}%` }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <div
                        className={cx(
                          'relative h-full rounded-full',
                          group.unmet ? 'bg-sky-400' : barClass,
                          'motion-safe:transition-[width] motion-safe:duration-200',
                        )}
                        style={{ width: `${(item.count / scale) * 100}%` }}
                      />
                      {targetPct !== null ? (
                        <span
                          className="absolute top-1/2 z-[1] h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-slate-800"
                          style={{ left: `${targetPct}%` }}
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center justify-end gap-1.5">
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {item.count}
                        <span className="ml-0.5 text-muted-foreground">{unit}</span>
                      </span>
                      {group.unmet ? <Badge tone="warning">差 {gap}</Badge> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          ),
        )}
      </div>
    </div>
  )
}

function CoverThumb({ url, title }: { url?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <div
        className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <ImageIcon size={18} />
      </div>
    )
  }

  return (
    <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted">
      <img
        src={url}
        alt={`${title} 主图`}
        className="absolute inset-0 h-full w-full max-w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function openDatePicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget
  if (typeof input.showPicker !== 'function') return
  try {
    input.showPicker()
  } catch {
    /* already open or unsupported */
  }
}

function DashboardPage() {
  const [stats, setStats] = useState<Dashboard | null>(null)
  const [packages, setPackages] = useState<ContentPackage[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [noteIds, setNoteIds] = useState<Record<number, string>>({})
  const [times, setTimes] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [ipFilter, setIpFilter] = useState('')
  const [publishIpFilter, setPublishIpFilter] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [dashboard, items, assetItems, tagItems] = await Promise.all([
        fetchDashboard(),
        fetchPackages(),
        fetchAssets({}),
        fetchTags(),
      ])
      setStats(dashboard)
      setPackages(items)
      setAssets(assetItems)
      setTags(tagItems)
      setNoteIds(Object.fromEntries(items.map((item) => [item.id, item.note_id || ''])))
      setTimes(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            item.publish_time ? item.publish_time.slice(0, 10) : '',
          ]),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const slices = useMemo(() => (stats ? slicesFromDashboard(stats) : []), [stats])
  const selectedSlice = slices.find((item) => item.key === selectedKey) ?? null
  const ipNames = useMemo(() => tagsOfKind(tags, 'ip').map((tag) => tag.name), [tags])
  const hasUnassignedAssets = useMemo(
    () => assets.some((asset) => assetHasIp(asset, UNASSIGNED_IP, ipNames)),
    [assets, ipNames],
  )
  const ipOptions = useMemo(() => {
    const names = [...ipNames]
    if (hasUnassignedAssets || slices.some((item) => item.ipName === UNASSIGNED_IP)) {
      names.push(UNASSIGNED_IP)
    }
    return names
  }, [hasUnassignedAssets, ipNames, slices])

  const filteredPackages = useMemo(
    () => (ipFilter ? packages.filter((item) => item.ip_name === ipFilter) : packages),
    [ipFilter, packages],
  )
  const publishedBenefits = useMemo(
    () => countByName(filteredPackages.filter((item) => item.status === 'published').map((item) => item.benefit_point)),
    [filteredPackages],
  )
  const allBenefits = useMemo(
    () => countByName(filteredPackages.map((item) => item.benefit_point)),
    [filteredPackages],
  )
  const publishIpOptions = useMemo(() => {
    const names = new Set(ipNames)
    for (const item of packages) {
      const name = item.ip_name.trim()
      if (name) names.add(name)
    }
    return [...names]
  }, [ipNames, packages])
  const publishPackages = useMemo(
    () =>
      publishIpFilter ? packages.filter((item) => item.ip_name === publishIpFilter) : packages,
    [packages, publishIpFilter],
  )
  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  )
  const filteredTagStats = useMemo(() => {
    const skip = new Set(ipNames)
    if (!ipFilter) {
      return (stats?.assets_by_tag ?? [])
        .filter((item) => !skip.has(item.tag))
        .map((item) => ({ name: item.tag, count: item.count }))
    }
    const scoped = assets.filter((asset) => assetHasIp(asset, ipFilter, ipNames))
    const values: string[] = []
    for (const asset of scoped) {
      for (const tag of asset.category_tags || []) {
        if (!skip.has(tag)) values.push(tag)
      }
    }
    return countByName(values)
  }, [assets, ipFilter, ipNames, stats])

  async function onPublish(packageId: number) {
    setSavingId(packageId)
    setError('')
    try {
      const time = times[packageId]
      const updated = await publishPackage(packageId, {
        note_id: noteIds[packageId] || '',
        publish_time: time ? `${time}T00:00:00` : undefined,
      })
      setPackages((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      const dashboard = await fetchDashboard()
      setStats(dashboard)
      setNotice(`已标记 #${packageId} 为已发布`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingId(null)
    }
  }

  function selectSlice(slice: RevenueSlice) {
    if (selectedKey === slice.key) {
      setSelectedKey(null)
      setIpFilter('')
      return
    }
    setSelectedKey(slice.key)
    setIpFilter(slice.ipName === UNASSIGNED_IP ? UNASSIGNED_IP : slice.ipName)
  }

  function selectIp(name: string) {
    if (!name) {
      setIpFilter('')
      setSelectedKey(null)
      return
    }
    if (ipFilter === name) {
      setIpFilter('')
      setSelectedKey(null)
      return
    }
    setIpFilter(name)
    if (selectedSlice && selectedSlice.ipName !== name) setSelectedKey(null)
  }

  const focusedAmount = selectedSlice?.amount ?? stats?.estimated_revenue ?? 0
  const focusedCount = selectedSlice?.count
  const focusedPrice =
    selectedSlice?.kind === 'primary' ? stats?.primary_price : stats?.secondary_price

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="数据看板与收益"
        description="追踪素材消耗、产出分布与预计收入。发布信息可在下方补全。"
      />

      {(notice || error) && <Alert tone={error ? 'error' : 'success'}>{error || notice}</Alert>}

      <section aria-busy={loading}>
        {loading || !stats ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="glass h-24 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard label="素材库主图" value={`${stats.inventory_primary} 张`} />
              <StatCard label="素材库次图" value={`${stats.inventory_secondary} 张`} />
              <StatCard label="总产出" value={`${stats.total_packages} 篇`} />
              <StatCard
                label="已发布 / 未发布"
                value={`${stats.published_count} / ${stats.unpublished_count}`}
              />
              <StatCard label="主图消耗" value={`${stats.primary_used} 张`} />
              <StatCard label="次图使用" value={`${stats.secondary_used} 张`} />
            </div>
            <Card className="mt-3 border-accent/25">
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selectedSlice ? `${selectedSlice.label}收入` : '预计总收入'}
                  </p>
                  <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-accent">
                    ¥ {focusedAmount.toFixed(2)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selectedSlice
                      ? `${focusedCount} × ${focusedPrice}`
                      : `${stats.billable_primary ?? 0} × ${stats.primary_price} + ${stats.billable_secondary ?? 0} × ${stats.secondary_price}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedSlice
                      ? `占总收入 ${stats.estimated_revenue > 0 ? Math.round((selectedSlice.amount / stats.estimated_revenue) * 100) : 0}% · 再点一次看全部`
                      : `按素材库计入收益的张数计费${stats.excluded_count > 0 ? ` · 已排除 ${stats.excluded_count} 张不计入` : ''}`}
                  </p>
                </div>
                <RevenueDonut
                  slices={slices}
                  total={stats.estimated_revenue}
                  selectedKey={selectedKey}
                  onSelect={selectSlice}
                />
              </div>
            </Card>
            <div className="mt-3 mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">按 IP 看分布</span>
              <Chip active={ipFilter === ''} onClick={() => selectIp('')}>
                全部 IP
              </Chip>
              {ipOptions.map((name) => (
                <Chip key={name} active={ipFilter === name} onClick={() => selectIp(name)}>
                  {name}
                </Chip>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <Card>
                <CardTitle>已发布 · 按利益点</CardTitle>
                <CardHint>
                  {ipFilter ? `${ipFilter} · 只统计已发布` : '只统计状态为已发布的篇数'}
                </CardHint>
                <div className="mt-4">
                  <BarList
                    items={publishedBenefits}
                    empty={ipFilter ? `还没有${ipFilter}的已发布内容。` : '还没有已发布内容。'}
                    tone="accent"
                    unit="篇"
                  />
                </div>
              </Card>
              <Card>
                <CardTitle>全部产出 · 按利益点</CardTitle>
                <CardHint>
                  {ipFilter ? `${ipFilter} · 含草稿、已导出、已发布` : '含草稿、已导出、已发布'}
                </CardHint>
                <div className="mt-4">
                  <BarList
                    items={allBenefits}
                    empty={ipFilter ? `还没有${ipFilter}的套件。` : '暂无套件。'}
                    tone="sky"
                    unit="篇"
                    target={10}
                  />
                </div>
              </Card>
              <Card>
                <CardTitle>素材库 · 按标签</CardTitle>
                <CardHint>
                  {ipFilter ? `${ipFilter} · 只看内容标签` : '只看内容标签，不含 IP'}
                </CardHint>
                <div className="mt-4">
                  <BarList
                    items={filteredTagStats}
                    empty={ipFilter ? `这个 IP 下还没有内容标签。` : '素材尚未打标。'}
                    tone="sky"
                    unit="张"
                    target={10}
                  />
                </div>
              </Card>
            </div>
          </>
        )}
      </section>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-accent" aria-hidden="true" />
            <div>
              <CardTitle>发布补全</CardTitle>
              <CardHint>填写笔记 ID、发布时间后标记为已发布。</CardHint>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={publishIpFilter === ''} onClick={() => setPublishIpFilter('')}>
              全部 IP
            </Chip>
            {publishIpOptions.map((name) => (
              <Chip
                key={name}
                active={publishIpFilter === name}
                onClick={() => setPublishIpFilter(publishIpFilter === name ? '' : name)}
              >
                {name}
              </Chip>
            ))}
          </div>
        </div>
        {packages.length === 0 ? (
          <EmptyState
            icon={Package}
            title="还没有内容套件"
            description="先到内容打包组成套件，再回到这里补发布信息。"
          />
        ) : publishPackages.length === 0 ? (
          <EmptyState
            icon={Package}
            title={`还没有${publishIpFilter}的套件`}
            description="换一个 IP，或先去内容打包组成套件。"
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {publishPackages.map((item) => {
              const primary = assetsById.get(item.primary_asset_id)
              return (
                <li key={item.id} className="rounded-xl border border-border bg-muted/50 p-4">
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-stretch gap-3">
                    <CoverThumb url={primary?.url} title={item.title} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.ip_name} · {item.benefit_point}
                          </p>
                        </div>
                        <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                      </div>
                      <label className="mt-3 block text-xs text-muted-foreground">
                        笔记 ID
                        <Input
                          value={noteIds[item.id] || ''}
                          onChange={(event) =>
                            setNoteIds((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          className="mt-1"
                        />
                      </label>
                      <label className="mt-2 block text-xs text-muted-foreground">
                        发布日期
                        <Input
                          type="date"
                          value={times[item.id] || ''}
                          onChange={(event) =>
                            setTimes((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          onClick={openDatePicker}
                          onFocus={openDatePicker}
                          className="mt-1 cursor-pointer"
                        />
                      </label>
                      <Button
                        disabled={savingId === item.id}
                        onClick={() => void onPublish(item.id)}
                        className="mt-3"
                      >
                        {item.status === 'published' ? '更新发布信息' : '标记为已发布'}
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default DashboardPage
