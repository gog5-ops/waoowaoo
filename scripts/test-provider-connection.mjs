#!/usr/bin/env node

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function buildCompatibleProbeUrls(baseUrl, paths) {
  const normalizedBase = sanitizeBaseUrl(baseUrl)
  const baseVariants = new Set([normalizedBase])
  if (normalizedBase.endsWith('/v1')) {
    const rootBase = normalizedBase.slice(0, -3)
    if (rootBase) baseVariants.add(rootBase)
  } else {
    baseVariants.add(`${normalizedBase}/v1`)
  }

  const urls = new Set()
  for (const baseVariant of baseVariants) {
    for (const path of paths) {
      urls.add(`${baseVariant}${path}`)
    }
  }
  return Array.from(urls)
}

async function fetchTextJson(url, init) {
  const response = await fetch(url, init)
  const text = await response.text().catch(() => '')
  let json = null
  if (text.trim()) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }
  return { response, text, json }
}

function summarizePayload(payload) {
  if (payload == null) return null
  try {
    return JSON.stringify(payload).slice(0, 500)
  } catch {
    return String(payload).slice(0, 500)
  }
}

function parseModelCount(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (Array.isArray(payload.data)) return payload.data.length
  if (Array.isArray(payload.models)) return payload.models.length
  return null
}

async function runCompatibleProviderProbe(baseUrl, apiKey, options) {
  const headers = { Authorization: `Bearer ${apiKey}` }
  const results = {
    apiType: 'openai-compatible',
    baseUrl,
    models: [],
    credits: [],
    templateImageProbe: null,
  }

  for (const url of buildCompatibleProbeUrls(baseUrl, ['/models'])) {
    try {
      const { response, text, json } = await fetchTextJson(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      })
      results.models.push({
        url,
        status: response.status,
        ok: response.ok,
        modelCount: parseModelCount(json),
        body: summarizePayload(json ?? text),
      })
    } catch (error) {
      results.models.push({
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const url of buildCompatibleProbeUrls(baseUrl, ['/credits', '/user/info', '/dashboard/billing/credit_grants'])) {
    try {
      const { response, text, json } = await fetchTextJson(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      })
      results.credits.push({
        url,
        status: response.status,
        ok: response.ok,
        body: summarizePayload(json ?? text),
      })
    } catch (error) {
      results.credits.push({
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (options.probeImageTemplate) {
    const url = `${sanitizeBaseUrl(baseUrl).endsWith('/v1') ? sanitizeBaseUrl(baseUrl) : `${sanitizeBaseUrl(baseUrl)}/v1`}/images/generations`
    try {
      const { response, text, json } = await fetchTextJson(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-3.1-flash-image-square',
          prompt: 'waoowaoo provider smoke test',
        }),
        signal: AbortSignal.timeout(20000),
      })
      results.templateImageProbe = {
        url,
        status: response.status,
        ok: response.ok,
        body: summarizePayload(json ?? text),
      }
    } catch (error) {
      results.templateImageProbe = {
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return results
}

async function runFlowBridgeProbe(baseUrl, apiKey) {
  const url = `${sanitizeBaseUrl(baseUrl)}/health`
  try {
    const { response, text, json } = await fetchTextJson(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    return {
      apiType: 'flow-bridge',
      baseUrl,
      health: {
        url,
        status: response.status,
        ok: response.ok,
        body: summarizePayload(json ?? text),
      },
    }
  } catch (error) {
    return {
      apiType: 'flow-bridge',
      baseUrl,
      health: {
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

async function runGeminiCompatibleProbe(baseUrl, apiKey, options) {
  const result = {
    apiType: 'gemini-compatible',
    baseUrl,
    models: [],
    imageProbe: null,
  }

  const modelsUrl = `${sanitizeBaseUrl(baseUrl)}/models`
  try {
    const { response, text, json } = await fetchTextJson(modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    result.models.push({
      url: modelsUrl,
      status: response.status,
      ok: response.ok,
      modelCount: parseModelCount(json),
      body: summarizePayload(json ?? text),
    })
  } catch (error) {
    result.models.push({
      url: modelsUrl,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (options.probeImageGeneration) {
    const model = options.model || 'gemini-3.1-flash-image'
    const generateUrl = `${sanitizeBaseUrl(baseUrl)}/v1beta/models/${encodeURIComponent(model)}:generateContent`
    try {
      const { response, text, json } = await fetchTextJson(generateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: options.prompt || 'Generate a simple blue circle icon on white background.' }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
        signal: AbortSignal.timeout(120000),
      })

      let inlineDataCount = 0
      let fileDataCount = 0
      if (json && typeof json === 'object' && Array.isArray(json.candidates)) {
        for (const candidate of json.candidates) {
          const parts = candidate?.content?.parts
          if (!Array.isArray(parts)) continue
          for (const part of parts) {
            if (part?.inlineData?.data || part?.inline_data?.data) inlineDataCount += 1
            if (part?.fileData?.fileUri || part?.file_data?.file_uri) fileDataCount += 1
          }
        }
      }

      result.imageProbe = {
        url: generateUrl,
        model,
        status: response.status,
        ok: response.ok,
        inlineDataCount,
        fileDataCount,
        body: summarizePayload(json ?? text),
      }
    } catch (error) {
      result.imageProbe = {
        url: generateUrl,
        model,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return result
}

async function main() {
  const [apiType, baseUrl, apiKey, ...flags] = process.argv.slice(2)
  if (!apiType || !baseUrl || !apiKey) {
    console.error('Usage: node scripts/test-provider-connection.mjs <apiType> <baseUrl> <apiKey> [--probe-image-template]')
    process.exit(1)
  }

  let result
  if (apiType === 'openai-compatible') {
    result = await runCompatibleProviderProbe(baseUrl, apiKey, {
      probeImageTemplate: flags.includes('--probe-image-template'),
    })
  } else if (apiType === 'gemini-compatible') {
    const probeImageGeneration = flags.includes('--probe-image-generation')
    const modelIndex = flags.indexOf('--model')
    const promptIndex = flags.indexOf('--prompt')
    result = await runGeminiCompatibleProbe(baseUrl, apiKey, {
      probeImageGeneration,
      model: modelIndex >= 0 ? flags[modelIndex + 1] : undefined,
      prompt: promptIndex >= 0 ? flags[promptIndex + 1] : undefined,
    })
  } else if (apiType === 'flow-bridge') {
    result = await runFlowBridgeProbe(baseUrl, apiKey)
  } else {
    console.error(`Unsupported apiType: ${apiType}`)
    process.exit(1)
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
