import { useEffect, useState } from 'react'

import { fetchSettings, testLlmConnection, updateSettings } from './api'
import { Alert, Button, Card, CardHint, CardTitle, FieldLabel, Input, PageHeader, Textarea } from './ui'

type SkillRow = {
  key: string
  name: string
  prompt: string
}

let skillKey = 0

function nextSkillKey(): string {
  skillKey += 1
  return `skill-${skillKey}`
}

function SettingsPage() {
  const [apiKey, setApiKey] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [maxConcurrency, setMaxConcurrency] = useState(8)
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [primaryPrice, setPrimaryPrice] = useState('0')
  const [secondaryPrice, setSecondaryPrice] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function flash(message: string, isError = false) {
    setError(isError ? message : '')
    setNotice(isError ? '' : message)
  }

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await fetchSettings()
      setApiKey('')
      setApiKeyMasked(data.api_key_masked)
      setHasApiKey(data.has_api_key)
      setApiBaseUrl(data.api_base_url)
      setLlmModel(data.llm_model)
      setMaxConcurrency(data.max_concurrency)
      const rows = Object.entries(data.prompt_skills).map(([name, prompt]) => ({
        key: nextSkillKey(),
        name,
        prompt,
      }))
      setSkills(rows.length > 0 ? rows : [{ key: nextSkillKey(), name: '', prompt: '' }])
      setPrimaryPrice(String(data.primary_price))
      setSecondaryPrice(String(data.secondary_price))
    } catch (err) {
      flash(err instanceof Error ? err.message : '加载失败', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  function updateSkill(key: string, patch: Partial<Pick<SkillRow, 'name' | 'prompt'>>) {
    setSkills((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  async function onSave() {
    const prompt_skills: Record<string, string> = {}
    for (const row of skills) {
      const name = row.name.trim()
      if (!name && !row.prompt.trim()) continue
      if (!name) {
        flash('技能库中的 IP 名不能为空', true)
        return
      }
      if (name in prompt_skills) {
        flash(`IP「${name}」重复`, true)
        return
      }
      prompt_skills[name] = row.prompt
    }

    const primary = Number(primaryPrice)
    const secondary = Number(secondaryPrice)
    if (!Number.isFinite(primary) || primary < 0 || !Number.isFinite(secondary) || secondary < 0) {
      flash('单价必须是大于等于 0 的数字', true)
      return
    }

    setSaving(true)
    try {
      const saved = await updateSettings({
        api_key: apiKey,
        api_base_url: apiBaseUrl.trim(),
        llm_model: llmModel.trim(),
        max_concurrency: maxConcurrency,
        prompt_skills,
        primary_price: primary,
        secondary_price: secondary,
      })
      setApiKey('')
      setApiKeyMasked(saved.api_key_masked)
      setHasApiKey(saved.has_api_key)
      setApiBaseUrl(saved.api_base_url)
      setLlmModel(saved.llm_model)
      setMaxConcurrency(saved.max_concurrency)
      const rows = Object.entries(saved.prompt_skills).map(([name, prompt]) => ({
        key: nextSkillKey(),
        name,
        prompt,
      }))
      setSkills(rows.length > 0 ? rows : [{ key: nextSkillKey(), name: '', prompt: '' }])
      setPrimaryPrice(String(saved.primary_price))
      setSecondaryPrice(String(saved.secondary_price))
      flash('设置已保存')
    } catch (err) {
      flash(err instanceof Error ? err.message : '保存失败', true)
    } finally {
      setSaving(false)
    }
  }

  async function onTestConnection() {
    setTesting(true)
    try {
      const result = await testLlmConnection({
        api_key: apiKey,
        api_base_url: apiBaseUrl.trim(),
        llm_model: llmModel.trim(),
      })
      flash(`连接成功 · ${result.model} · ${result.latency_ms}ms · ${result.reply}`)
    } catch (err) {
      flash(err instanceof Error ? err.message : '连接测试失败', true)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="系统设置"
        description="配置模型接口、IP 技能 Prompt 与素材结算单价。"
        actions={
          <Button disabled={saving || loading} onClick={() => void onSave()}>
            {saving ? '保存中…' : '保存设置'}
          </Button>
        }
      />

      {(notice || error) && <Alert tone={error ? 'error' : 'success'}>{error || notice}</Alert>}

      <Card>
        <CardTitle>LLM 配置</CardTitle>
        <CardHint>
          兼容 OpenAI Chat Completions。Key 不会明文回显；留空保存表示沿用已有密钥。可先测试再保存。改写最多同时发出 8
          路请求。
        </CardHint>
        {loading ? (
          <div className="mt-4 h-32 animate-pulse rounded-xl bg-muted" aria-busy="true" />
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <FieldLabel>API Key</FieldLabel>
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  hasApiKey
                    ? `已保存${apiKeyMasked ? `（${apiKeyMasked}）` : ''}，留空不修改`
                    : '输入 API Key'
                }
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm">
              <FieldLabel>Base URL</FieldLabel>
              <Input
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.deepseek.com/v1"
              />
            </label>
            <label className="block text-sm">
              <FieldLabel>模型名</FieldLabel>
              <Input
                value={llmModel}
                onChange={(event) => setLlmModel(event.target.value)}
                placeholder="deepseek-chat"
              />
            </label>
            <label className="block text-sm">
              <FieldLabel>最大并发请求数</FieldLabel>
              <Input
                type="number"
                min={1}
                max={8}
                value={maxConcurrency}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  setMaxConcurrency(Math.min(8, Math.max(1, Math.round(next))))
                }}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                批量改写时同时调用模型的路数，上限 8。
              </span>
            </label>
            <div className="block text-sm">
              <FieldLabel>&nbsp;</FieldLabel>
              <Button variant="secondary" disabled={testing || loading} onClick={() => void onTestConnection()}>
                {testing ? '测试中…' : '测试 API 连接'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>技能库</CardTitle>
            <CardHint>每个 IP 一条 Prompt，改写时作为 Skill Rules。</CardHint>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => setSkills((rows) => [...rows, { key: nextSkillKey(), name: '', prompt: '' }])}
            >
              新增 IP
            </Button>
            <Button disabled={saving || loading} onClick={() => void onSave()}>
              {saving ? '保存中…' : '保存技能库'}
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {skills.map((row) => (
            <div key={row.key} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.name}
                  onChange={(event) => updateSkill(row.key, { name: event.target.value })}
                  placeholder="IP 名，如 桃子"
                  className="min-w-40 flex-1"
                />
                <Button
                  variant="danger"
                  onClick={() =>
                    setSkills((rows) =>
                      rows.length === 1
                        ? [{ key: nextSkillKey(), name: '', prompt: '' }]
                        : rows.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  删除
                </Button>
              </div>
              <Textarea
                value={row.prompt}
                onChange={(event) => updateSkill(row.key, { prompt: event.target.value })}
                rows={10}
                placeholder="把该 IP 的改写 Skill Prompt 粘贴到这里，点右上角「保存技能库」"
                className="mt-3"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>素材单价</CardTitle>
        <CardHint>按素材库里计入收益的主图、次图张数核算看板预计收入，可随时调整。</CardHint>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <FieldLabel>主图单价</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={primaryPrice}
              onChange={(event) => setPrimaryPrice(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <FieldLabel>次图单价</FieldLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={secondaryPrice}
              onChange={(event) => setSecondaryPrice(event.target.value)}
            />
          </label>
        </div>
      </Card>
    </div>
  )
}

export default SettingsPage
