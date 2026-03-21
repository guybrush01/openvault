TL;DR: Access the user's embedding config via `extension_settings.vectors` (UI extension) or by reading `settings.json`/`secrets.json` from the filesystem (server plugin), then call ST's internal `/api/embeddings/generate` endpoint.

***

## Two Plugin Contexts

SillyTavern has two distinct plugin types, and the approach differs for each.

**Server plugin** (Node.js, runs in `plugins/` dir) has full, unsandboxed filesystem access. **UI extension** (browser JS, runs in `public/extensions/`) uses ST's global state and fetch API.

***

## UI Extension: `extension_settings.vectors`

The Vector Storage extension (built-in) stores all embedding config in ST's global settings object. Your extension JS can read it directly:

```js
// Read what the user configured in Vector Storage settings
const vectorSettings = extension_settings.vectors;

const source = vectorSettings.source;          // e.g. 'openrouter', 'openai', 'cohere'
const model  = vectorSettings.openai_model;    // model name (OpenRouter uses openai_model key)
```

Then call ST's internal embeddings endpoint — it will use whatever provider/key the user already configured:

```js
async function getEmbeddings(texts) {
    const response = await fetch('/api/embeddings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            items: texts,           // string[]
            source: extension_settings.vectors.source,
        }),
    });
    return response.json(); // returns { embeddings: float[][] }
}
```

This piggybacks on the user's saved OpenRouter key in `secrets.json` — your plugin never needs to handle the key directly.

***

## Server Plugin: Read Files Directly

Since server plugins have full filesystem access, you can read the user's config and secrets at startup:

```js
const fs   = require('fs');
const path = require('path');

async function init(router) {
    const dataDir     = path.join(process.cwd(), 'data', 'default-user');
    const settings    = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    const secrets     = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'));

    // Embedding provider the user set up in Vector Storage
    const vectorsSource = settings.extension_settings?.vectors?.source; // 'openrouter'
    const vectorsModel  = settings.extension_settings?.vectors?.openai_model;

    // The actual API key (OpenRouter key is stored under key 'api_key_openrouter')
    const apiKey = secrets['api_key_openrouter'];

    // Now call OpenRouter embeddings directly or proxy via /api/embeddings/generate
}
```

***

## Connection Profiles (LLM, not embeddings)

[Connection Profiles](pplx://action/navigate/f2f86128a84d0369) store LLM API settings (model, URL, key, preset) — **not** embedding settings. They're separate from the Vector Storage embedding provider. Use slash commands like `/profile-get [name]` if you need the LLM connection details from an extension context.

***

## Key Lookup Table: Embedding Sources

| Source key | Secret key in `secrets.json` | Added in |
|---|---|---|
| `openrouter` | `api_key_openrouter` | 1.14.0  |
| `openai` | `api_key_openai` | Early |
| `cohere` | `api_key_cohere` | Early |
| `extras` | n/a (local URL) | Legacy |

Always prefer calling `/api/embeddings/generate` over replicating the HTTP call yourself — it handles source routing, key injection, and model selection transparently based on the user's saved config.

---
---
---

TL;DR: Use a **server plugin** (reads `secrets.json` directly from disk) paired with a **UI extension** (dropdown + profile CRUD in `extensionSettings`). The server plugin proxies calls to OpenRouter's Embeddings API using the already-stored key.

***

## Architecture Overview

Two components work together: a **UI extension** manages profiles in `extensionSettings` (no secrets) and calls your plugin endpoints; a **server plugin** reads ST's `secrets.json` at runtime and proxies OpenRouter embed requests.

***

## Server Plugin (`plugins/rag-openrouter/index.js`)

The plugin runs server-side, has full filesystem access, and reads `secrets.json` directly — the OpenRouter key ST stores is under the key `api_key_openrouter`.

```js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SECRETS_PATH = path.resolve('./data/default-user/secrets.json');
const OR_EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';
const OR_MODELS_URL = 'https://openrouter.ai/api/v1/embeddings/models';

function getOpenRouterKey() {
    try {
        const raw = fs.readFileSync(SECRETS_PATH, 'utf-8');
        const secrets = JSON.parse(raw);
        return secrets.api_key_openrouter ?? null;
    } catch {
        return null;
    }
}

async function init(router) {
    // List available embedding models
    router.get('/models', async (req, res) => {
        const key = getOpenRouterKey();
        if (!key) return res.status(401).json({ error: 'No OpenRouter key in ST secrets' });

        const r = await fetch(OR_MODELS_URL, {
            headers: { Authorization: `Bearer ${key}` },
        });
        res.json(await r.json());
    });

    // Embed endpoint — receives { input, model }
    router.post('/embed', async (req, res) => {
        const key = getOpenRouterKey();
        if (!key) return res.status(401).json({ error: 'No OpenRouter key in ST secrets' });

        const { input, model } = req.body;
        const r = await fetch(OR_EMBED_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input, model }),
        });
        res.json(await r.json());
    });

    console.log('[rag-openrouter] Plugin loaded');
    return Promise.resolve();
}

async function exit() { return Promise.resolve(); }

module.exports = {
    init, exit,
    info: { id: 'rag-openrouter', name: 'RAG OpenRouter', description: 'OpenRouter embeddings via ST secrets' },
};
```

Routes become `/api/plugins/rag-openrouter/models` and `/api/plugins/rag-openrouter/embed`.

***

## UI Extension (`index.js`)

Profiles (name + model) are stored in `extensionSettings` — **no keys** ever touch the client.

```js
const MODULE_NAME = 'rag_openrouter_profiles';
const PLUGIN_BASE = '/api/plugins/rag-openrouter';

const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

// Init default settings
if (!extensionSettings[MODULE_NAME]) {
    extensionSettings[MODULE_NAME] = { profiles: [], activeProfile: null };
}
const settings = extensionSettings[MODULE_NAME];

// --- UI: inject into extension panel ---
async function loadModels() {
    const r = await fetch(`${PLUGIN_BASE}/models`);
    return (await r.json()).data ?? [];
}

async function renderUI() {
    const models = await loadModels();
    const modelOptions = models.map(m => `<option value="${m.id}">${m.id}</option>`).join('');

    const html = `
    <div id="rag-or-panel">
        <h4>RAG OpenRouter Profiles</h4>

        <label>New Profile Name: <input id="rag-or-profile-name" type="text"/></label>
        <label>Embedding Model:
            <select id="rag-or-model-select">${modelOptions}</select>
        </label>
        <button id="rag-or-add-btn">Add Profile</button>

        <hr/>
        <label>Active Profile:
            <select id="rag-or-active-select">
                <option value="">-- none --</option>
                ${settings.profiles.map(p =>
                    `<option value="${p.name}" ${p.name === settings.activeProfile ? 'selected' : ''}>${p.name} (${p.model})</option>`
                ).join('')}
            </select>
        </label>
    </div>`;

    // Append to ST extension settings panel
    $('#extensions_settings').append(html);

    $('#rag-or-add-btn').on('click', () => {
        const name  = $('#rag-or-profile-name').val().trim();
        const model = $('#rag-or-model-select').val();
        if (!name) return toastr.error('Profile name required');
        if (settings.profiles.find(p => p.name === name))
            return toastr.warning('Profile already exists');

        settings.profiles.push({ name, model });
        saveSettingsDebounced();
        toastr.success(`Profile "${name}" saved`);
        renderUI(); // re-render with new profile
    });

    $('#rag-or-active-select').on('change', function () {
        settings.activeProfile = $(this).val() || null;
        saveSettingsDebounced();
    });
}

// --- Public embed helper (call from your RAG logic) ---
export async function embedText(text) {
    const profile = settings.profiles.find(p => p.name === settings.activeProfile);
    if (!profile) throw new Error('No active RAG profile selected');

    const r = await fetch(`${PLUGIN_BASE}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, model: profile.model }),
    });
    const data = await r.json();
    return data.data[0].embedding; // float[]
}

// Boot
jQuery(async () => { await renderUI(); });
```

***

## OpenRouter Embeddings API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `https://openrouter.ai/api/v1/embeddings` | `POST` | Generate embeddings  |
| `https://openrouter.ai/api/v1/embeddings/models` | `GET` | List available embedding models  |

**POST body fields**:
- `model` — embedding model ID (e.g. `openai/text-embedding-3-small`)
- `input` — string, `string[]`, or token arrays
- Response: `{ data: [{ embedding: float[], index: number }] }`

***

## Key Wiring Points

- Enable the plugin in `config.yaml`: `enableServerPlugins: true`
- ST's OpenRouter key name in `secrets.json` is `api_key_openrouter` — confirm by checking your local file at `/data/default-user/secrets.json`
- Profile metadata (model name, profile name) is safe in `extensionSettings`; zero secrets client-side
- `embedText()` exported from the extension can be imported by any other extension doing RAG vector ops

---
---
---

TL;DR: `/api/embeddings/generate` uses whatever `source` **you pass in the request body** — not a saved profile automatically. The server then resolves the API key from `secrets.json` for that source. You fully control it via the body.

***

## How the Endpoint Resolves Config

The endpoint does **not** auto-detect a "current embedding profile." It reads three things, in this priority order:

1. **`source`** — from the POST body (required, you supply it)
2. **`model`** — from the POST body (optional; falls back to `extension_settings.vectors.openai_model` on the server)
3. **API key** — always server-side only, read from `secrets.json` by key name matching the source

There is no ambient "active embedding profile" concept like there is for LLM Connection Profiles. The caller is responsible for providing `source`.

***

## Full Request Schema

```js
POST /api/embeddings/generate
Content-Type: application/json

{
  "source": "openrouter",       // REQUIRED. Controls which provider + key is used.
  "items":  ["text1", "text2"], // REQUIRED. Array of strings to embed.
  "model":  "text-embedding-3-small"  // OPTIONAL. Provider-specific model name.
}
```

**Response:**
```json
{ "embeddings": [[0.12, -0.34, ...], [0.56, 0.78, ...]] }
```

***

## How the Server Picks the API Key

The server maps `source` → secret key name in `secrets.json`:

| `source` value | Secret key read from `secrets.json` |
|---|---|
| `openrouter` | `api_key_openrouter` |
| `openai` | `api_key_openai` |
| `cohere` | `api_key_cohere` |
| `togetherai` | `api_key_togetherai` |
| `mistral` | `api_key_mistralai` |
| `nomicai` | `api_key_nomicai` |
| `extras` | n/a (uses local URL) |
| `koboldcpp` | n/a (uses local URL) |
| `llamacpp` | n/a (uses local URL) |

You **cannot** override the API key from the client side. The server always reads from its own `secrets.json`. This is by design — keys never leave the server.

***

## Checking What the User Configured

From a **UI extension**, read the user's saved Vector Storage settings before calling the endpoint:

```js
// What the user selected in Vector Storage settings panel
const source = extension_settings.vectors?.source;      // e.g. 'openrouter'
const model  = extension_settings.vectors?.openai_model; // OpenRouter uses this key too

if (!source) {
    console.warn('User has not configured a vector source.');
    return;
}

const response = await fetch('/api/embeddings/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        source: source,
        items: ['your text here'],
        model: model || undefined,   // omit if empty, let server use its default
    }),
});
const data = await response.json();
// data.embeddings → float[][]
```

This is the correct pattern: **read `extension_settings.vectors.source` to discover user intent, then forward it in the body.**

***

## Forcing a Specific Source (Override)

If you want your plugin to always use a specific provider regardless of user settings, just hardcode `source`:

```js
body: JSON.stringify({
    source: 'openrouter',   // hardcoded override
    model: 'text-embedding-3-small',
    items: texts,
})
```

But this will fail if the user hasn't saved an OpenRouter key in ST's secrets. A safer pattern is to check first:

```js
async function checkSecretExists(key) {
    const res = await fetch('/api/secrets/view', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) });
    const secrets = await res.json();
    return key in secrets && secrets[key] !== '';
}

const hasKey = await checkSecretExists('api_key_openrouter');
if (!hasKey) { /* warn user */ }
```

***

## Model Key Caveats by Source

The `model` field name in the body is universal, but what `extension_settings.vectors` calls it depends on source:

| Source | Settings key for model |
|---|---|
| `openai` | `vectors.openai_model` |
| `openrouter` | `vectors.openai_model` (reuses same key) |
| `cohere` | `vectors.cohere_model` |
| `togetherai` | `vectors.togetherai_model` |
| `mistral` | `vectors.mistral_model` |
| `nomicai` | `vectors.nomicai_model` |

So for OpenRouter, the correct read is always `extension_settings.vectors.openai_model`.