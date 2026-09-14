import { FilePenLine, PenLine } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  confirmNote,
  createNote,
  deleteNote,
  fetchNotes,
  fetchSettings,
  parseNoteLink,
  rewriteNote,
  rewriteNotesBatch,
  type Note,
} from './api'
import { formatPublishCopy, looksLikePublishDraft } from './noteCopy'
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
  Textarea,
} from './ui'

const MAX_REWRITE_BATCH = 40

function splitRewriteJobs(
  rawLink: string,
  rawContent: string,
): { raw_link?: string; raw_content?: string }[] {
  const links = rawLink
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const content = rawContent.trim()
  const blocks = content
    ? content.split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean)
    : []
  if (blocks.length === 0 && links.length === 0) return []
  if (blocks.length <= 1 && links.length <= 1) {
    const job: { raw_link?: string; raw_content?: string } = {}
    if (links[0]) job.raw_link = links[0]
    if (blocks[0]) job.raw_content = blocks[0]
    return [job]
  }
  const count = Math.max(blocks.length, links.length)
  return Array.from({ length: count }, (_, index) => {
    const job: { raw_link?: string; raw_content?: string } = {}
    if (links[index]) job.raw_link = links[index]
    if (blocks[index]) job.raw_content = blocks[index]
    return job
  })
}

function snippet(text: string | null, max = 80): string {
  const value = formatPublishCopy(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return '（无正文）'
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function sourceCopy(note: Note): string {
  return formatPublishCopy(note.ai_draft || note.raw_content || '')
}

function editableCopy(note: Note): string {
  return formatPublishCopy(note.final_content || note.ai_draft || note.raw_content || '')
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function RewritePage() {
  const [ipNames, setIpNames] = useState<string[]>([])
  const [ipName, setIpName] = useState('')
  const [rawLink, setRawLink] = useState('')
  const [rawContent, setRawContent] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [current, setCurrent] = useState<Note | null>(null)
  const [draftEdit, setDraftEdit] = useState('')
  const [loading, setLoading] = useState(true)
  const [rewriting, setRewriting] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [maxConcurrency, setMaxConcurrency] = useState(8)
  const [parsing, setParsing] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function flash(message: string, isError = false) {
    setError(isError ? message : '')
    setNotice(isError ? '' : message)
  }

  async function loadPage() {
    setLoading(true)
    try {
      const [settings, items] = await Promise.all([fetchSettings(), fetchNotes()])
      const names = Object.keys(settings.prompt_skills)
      setHasApiKey(settings.has_api_key)
      setMaxConcurrency(settings.max_concurrency)
      setIpNames(names)
      setIpName((currentName) => currentName || names[0] || '')
      setNotes(items)
    } catch (err) {
      flash(err instanceof Error ? err.message : '加载失败', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage()
  }, [])

  function openNote(note: Note) {
    setCurrent(note)
    setDraftEdit(editableCopy(note))
    setIpName(note.ip_name)
    setRawLink(note.raw_link || '')
    setRawContent(note.raw_content || '')
  }

  async function collectSource(): Promise<{ link: string; content: string } | null> {
    if (!ipName) {
      flash('请先在设置中添加 IP 技能 Prompt', true)
      return null
    }
    const link = rawLink.trim()
    const content = rawContent.trim()
    if (!link && !content) {
      flash('请粘贴竞品链接或正文', true)
      return null
    }
    return { link, content }
  }

  async function onParseLinks() {
    const links = rawLink
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (links.length === 0) {
      flash('请先粘贴竞品链接', true)
      return
    }
    setParsing(true)
    try {
      const chunks: string[] = []
      const failed: string[] = []
      for (const url of links) {
        try {
          const parsed = await parseNoteLink(url)
          chunks.push(parsed.content)
        } catch (err) {
          failed.push(err instanceof Error ? err.message : url)
        }
      }
      if (chunks.length > 0) {
        setRawContent(chunks.join('\n\n---\n\n'))
      }
      if (failed.length > 0 && chunks.length === 0) {
        flash(failed[0], true)
        return
      }
      flash(
        failed.length
          ? `已解析 ${chunks.length} 条，失败 ${failed.length} 条：${failed[0]}`
          : `已解析 ${chunks.length} 条正文，可检查后点「AI 一键改写」`,
      )
    } finally {
      setParsing(false)
    }
  }

  async function onRewrite() {
    if (!ipName) {
      flash('请先在设置中添加 IP 技能 Prompt', true)
      return
    }
    if (!hasApiKey) {
      flash('未配置 API Key，请到设置填写，或改用「保存原文」', true)
      return
    }
    const jobs = splitRewriteJobs(rawLink, rawContent)
    if (jobs.length === 0) {
      flash('请粘贴竞品链接或正文', true)
      return
    }
    if (jobs.length > MAX_REWRITE_BATCH) {
      flash(`一次最多改写 ${MAX_REWRITE_BATCH} 条`, true)
      return
    }
    setRewriting(true)
    try {
      if (jobs.length === 1) {
        const note = await rewriteNote({
          ip_name: ipName,
          raw_link: jobs[0].raw_link,
          raw_content: jobs[0].raw_content,
        })
        setCurrent(note)
        setDraftEdit(formatPublishCopy(note.ai_draft || ''))
        setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)])
        flash('改写完成，可在右侧微调后保存定稿')
        return
      }
      const result = await rewriteNotesBatch({ ip_name: ipName, items: jobs })
      const created = [...result.items].sort((a, b) => b.id - a.id)
      setNotes((items) => {
        const ids = new Set(created.map((item) => item.id))
        return [...created, ...items.filter((item) => !ids.has(item.id))]
      })
      if (created[0]) {
        setCurrent(created[0])
        setDraftEdit(formatPublishCopy(created[0].ai_draft || ''))
      }
      const failed = result.errors.length
      flash(
        failed
          ? `已并发生成 ${created.length} 条，失败 ${failed} 条：${result.errors.map((item) => `#${item.index + 1} ${item.detail}`).join('；')}`
          : `已并发改写 ${created.length} 条（最多 ${maxConcurrency} 路），可点开记录微调定稿`,
      )
    } catch (err) {
      flash(err instanceof Error ? err.message : '改写失败', true)
    } finally {
      setRewriting(false)
    }
  }

  async function onSaveManual() {
    const source = await collectSource()
    if (!source) return
    setSavingManual(true)
    try {
      const note = await createNote({
        ip_name: ipName,
        raw_link: source.link || undefined,
        raw_content: source.content || undefined,
      })
      setCurrent(note)
      setDraftEdit(editableCopy(note))
      setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)])
      flash('已保存原文。可把 ChatGPT 结果贴进右侧编辑框后确认定稿')
    } catch (err) {
      flash(err instanceof Error ? err.message : '保存失败', true)
    } finally {
      setSavingManual(false)
    }
  }

  async function onConfirm() {
    if (!current) {
      flash('请先改写或保存原文', true)
      return
    }
    const finalContent = formatPublishCopy(draftEdit).trim()
    if (!finalContent) {
      flash('定稿不能为空', true)
      return
    }
    setSaving(true)
    try {
      const updated = await confirmNote(current.id, finalContent)
      setCurrent(updated)
      setDraftEdit(formatPublishCopy(updated.final_content || finalContent))
      setNotes((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      flash('已保存定稿')
    } catch (err) {
      flash(err instanceof Error ? err.message : '保存失败', true)
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteNote(note: Note) {
    const ok = window.confirm(
      '确定删除这条改写记录？若已加入内容套件，需要先到「内容打包」删除对应套件。',
    )
    if (!ok) return
    try {
      await deleteNote(note.id)
      setNotes((items) => items.filter((item) => item.id !== note.id))
      if (current?.id === note.id) {
        setCurrent(null)
        setDraftEdit('')
      }
      flash(`已删除改写记录 #${note.id}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '删除失败', true)
    }
  }

  const confirmedCount = useMemo(
    () => notes.filter((item) => Boolean(item.final_content?.trim())).length,
    [notes],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rewrite"
        title="竞品改写"
        description="解析小红书链接或粘贴原文，按 IP 技能生成初稿，再人工确认定稿。"
      />

      {(notice || error) && <Alert tone={error ? 'error' : 'success'}>{error || notice}</Alert>}

      <Card>
        <CardTitle>输入竞品</CardTitle>
        <CardHint>
          选择 IP，粘贴小红书链接后点「解析链接」。多条正文用单独一行的{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">---</code> 分隔，多条链接每行一个。解析失败时再手动粘贴原文。
        </CardHint>

        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : ipNames.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={PenLine}
              title="还没有 IP 技能"
              description="先到设置添加 Prompt，再回来改写竞品。"
              action={
                <Link to="/settings" className="btn btn-primary">
                  去设置
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <FieldLabel>IP</FieldLabel>
              <Select value={ipName} onChange={(event) => setIpName(event.target.value)}>
                {ipNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <FieldLabel>竞品链接</FieldLabel>
              <Input
                value={rawLink}
                onChange={(event) => setRawLink(event.target.value)}
                placeholder="小红书笔记链接，多条请每行一个"
              />
            </label>
            <Button variant="secondary" disabled={parsing || !rawLink.trim()} onClick={() => void onParseLinks()}>
              {parsing ? '解析中…' : '解析链接'}
            </Button>
            <label className="block text-sm">
              <FieldLabel>正文（解析后可改，也可手贴）</FieldLabel>
              <Textarea
                value={rawContent}
                onChange={(event) => setRawContent(event.target.value)}
                rows={8}
                placeholder="点「解析链接」自动填入，或自己粘贴原文。多条请用单独一行 --- 隔开"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={rewriting || !hasApiKey} onClick={() => void onRewrite()}>
                {rewriting ? `改写中（最多 ${maxConcurrency} 路）…` : 'AI 一键改写'}
              </Button>
              <Button variant="secondary" disabled={savingManual} onClick={() => void onSaveManual()}>
                {savingManual ? '保存中…' : '保存原文（不调用 AI）'}
              </Button>
              {!hasApiKey && (
                <span className="text-xs text-muted-foreground">未配置 API Key，请到设置填写，或改用手动保存</span>
              )}
            </div>
          </div>
        )}
      </Card>

      {current && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>初稿与定稿</CardTitle>
            <Badge tone={current.final_content?.trim() ? 'success' : 'warning'}>
              {current.final_content?.trim() ? '已确认' : current.ai_draft ? '仅初稿' : '待编辑'}
            </Badge>
          </div>
          <p className="mt-1 min-w-0 wrap-anywhere text-sm text-muted-foreground">
            {current.ip_name}
            {current.raw_link ? ` · ${current.raw_link}` : ''}
          </p>
          <div className="mt-4 grid items-stretch gap-4 md:grid-cols-2">
            <label className="flex min-w-0 flex-col text-sm">
              <FieldLabel>{current.ai_draft ? 'AI 初稿（只读）' : '原文（只读）'}</FieldLabel>
              <Textarea
                readOnly
                value={sourceCopy(current)}
                rows={16}
                className="min-h-80 flex-1 bg-muted/50"
              />
            </label>
            <label className="flex min-w-0 flex-col text-sm">
              <FieldLabel>人工修改 / 粘贴 ChatGPT 结果（将保存为定稿）</FieldLabel>
              <Textarea
                value={draftEdit}
                onChange={(event) => setDraftEdit(event.target.value)}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text')
                  if (!looksLikePublishDraft(pasted)) return
                  event.preventDefault()
                  setDraftEdit(formatPublishCopy(pasted))
                }}
                rows={16}
                className="min-h-80 flex-1"
                placeholder={'标题：\n正文：\n话题：'}
              />
            </label>
          </div>
          <Button disabled={saving} onClick={() => void onConfirm()} className="mt-4">
            {saving ? '保存中…' : '确认保存定稿'}
          </Button>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CardTitle>改写记录</CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {notes.length} 条{confirmedCount ? ` · ${confirmedCount} 条已确认` : ''}
          </span>
        </div>
        {notes.length === 0 ? (
          <EmptyState icon={FilePenLine} title="暂无记录" description="解析或粘贴竞品后，改写结果会出现在这里。" />
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => {
              const confirmed = Boolean(note.final_content?.trim())
              const statusLabel = confirmed ? '已确认' : note.ai_draft ? '仅初稿' : '待编辑'
              const active = current?.id === note.id
              return (
                <li key={note.id} className="relative">
                  <button
                    type="button"
                    onClick={() => openNote(note)}
                    className={`w-full cursor-pointer rounded-xl border px-4 py-3 pr-16 text-left transition-colors duration-200 ${
                      active
                        ? 'border-cta/40 bg-cta/5'
                        : 'border-border bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{note.ip_name}</span>
                      <Badge tone={confirmed ? 'success' : 'warning'}>{statusLabel}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {snippet(note.final_content || note.ai_draft || note.raw_content)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {formatTime(note.updated_at || note.created_at)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteNote(note)}
                    className="btn btn-danger absolute right-3 top-3 px-2 py-1 text-xs"
                  >
                    删除
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default RewritePage
