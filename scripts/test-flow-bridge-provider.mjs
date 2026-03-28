#!/usr/bin/env node

const baseUrl = process.argv[2] || 'http://127.0.0.1:8320'
const apiKey = process.argv[3] || ''

if (!apiKey) {
  console.error('Missing bridge apiKey')
  process.exit(1)
}

async function main() {
  const healthRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`)
  const health = await healthRes.json()

  const createRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/images/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      project_id: 'waoowaoo-script-project',
      model: 'gemini-3.1-flash-image-square',
      prompt: 'waoowaoo flow-bridge smoke',
      metadata: {
        simulate_completed: true,
        mock_public_url: 'https://cdn.example.com/waoo-smoke-image.png',
        mock_gcs_uri: 'gs://mock-bucket/projects/waoowaoo-script-project/images/waoo-smoke-image.png',
      },
    }),
  })

  const created = await createRes.json()
  const taskId = created.task_id
  if (!taskId) {
    throw new Error('task_id missing')
  }

  const taskRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const task = await taskRes.json()

  let asset = null
  const assetId = task?.result?.asset_id
  if (assetId) {
    const assetRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/assets/${encodeURIComponent(assetId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    asset = await assetRes.json()
  }

  console.log(JSON.stringify({
    health,
    created,
    task,
    asset,
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
