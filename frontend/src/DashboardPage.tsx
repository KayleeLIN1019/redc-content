import { BarChart3, Package } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  fetchDashboard,
  fetchPackages,
  publishPackage,
  type ContentPackage,
  type Dashboard,
} from './api'
import { Alert, Badge, Button, Card, CardHint, CardTitle, EmptyState, Input, PageHeader, StatCard } from './ui'

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
}: {
  items: { name: string; count: number }[]
  empty: string
  tone: 'accent' | 'foreground' | 'muted'
  unit: string
}) {
  const max = Math.max(1, ...items.map((item) => item.count))
  const barClass =
    tone === 'accent' ? 'bg-accent' : tone === 'foreground' ? 'bg-foreground/80' : 'bg-sky-400/80'

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name}>
          <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate text-foreground/80">{item.name}</span>
            <span className="shrink-0 font-mono">
              {item.count} {unit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function DashboardPage() {
  const [stats, setStats] = useState<Dashboard | null>(null)
  const [packages, setPackages] = useState<ContentPackage[]>([])
  const [noteIds, setNoteIds] = useState<Record<number, string>>({})
  const [times, setTimes] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [dashboard, items] = await Promise.all([fetchDashboard(), fetchPackages()])
      setStats(dashboard)
      setPackages(items)
      setNoteIds(Object.fromEntries(items.map((item) => [item.id, item.note_id || ''])))
      setTimes(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            item.publish_time ? item.publish_time.slice(0, 16) : '',
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

  async function onPublish(packageId: number) {
    setSavingId(packageId)
    setError('')
    try {
      const time = times[packageId]
      const updated = await publishPackage(packageId, {
        note_id: noteIds[packageId] || '',
        publish_time: time ? new Date(time).toISOString() : undefined,
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
              <p className="text-xs text-muted-foreground">预计总收入</p>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-accent">
                ¥ {stats.estimated_revenue.toFixed(2)}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {stats.primary_used} × {stats.primary_price} + {stats.secondary_used} × {stats.secondary_price}
              </p>
            </Card>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <Card>
                <CardTitle>已发布 · 按利益点</CardTitle>
                <CardHint>只统计状态为已发布的篇数</CardHint>
                <div className="mt-4">
                  <BarList
                    items={stats.published_by_benefit.map((item) => ({
                      name: item.benefit_point,
                      count: item.count,
                    }))}
                    empty="还没有已发布内容。"
                    tone="accent"
                    unit="篇"
                  />
                </div>
              </Card>
              <Card>
                <CardTitle>全部产出 · 按利益点</CardTitle>
                <CardHint>含草稿、已导出、已发布</CardHint>
                <div className="mt-4">
                  <BarList
                    items={stats.benefit_distribution.map((item) => ({
                      name: item.benefit_point,
                      count: item.count,
                    }))}
                    empty="暂无套件。"
                    tone="foreground"
                    unit="篇"
                  />
                </div>
              </Card>
              <Card>
                <CardTitle>素材库 · 按标签</CardTitle>
                <CardHint>主图、次图合计；一张图多标签会分别计入</CardHint>
                <div className="mt-4">
                  <BarList
                    items={stats.assets_by_tag.map((item) => ({ name: item.tag, count: item.count }))}
                    empty="素材尚未打标。"
                    tone="muted"
                    unit="张"
                  />
                </div>
              </Card>
            </div>
          </>
        )}
      </section>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-accent" aria-hidden="true" />
          <div>
            <CardTitle>发布补全</CardTitle>
            <CardHint>填写笔记 ID、发布时间后标记为已发布。</CardHint>
          </div>
        </div>
        {packages.length === 0 ? (
          <EmptyState
            icon={Package}
            title="还没有内容套件"
            description="先到内容打包组成套件，再回到这里补发布信息。"
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {packages.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-muted/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.ip_name} · {item.benefit_point}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.title}</p>
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
                  发布时间
                  <Input
                    type="datetime-local"
                    value={times[item.id] || ''}
                    onChange={(event) =>
                      setTimes((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    className="mt-1"
                  />
                </label>
                <Button
                  disabled={savingId === item.id}
                  onClick={() => void onPublish(item.id)}
                  className="mt-3"
                >
                  {item.status === 'published' ? '更新发布信息' : '标记为已发布'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default DashboardPage
