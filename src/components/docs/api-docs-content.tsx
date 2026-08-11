const createGenerationsTaskExample = `curl -X POST "https://web-production-14606.up.railway.app/v1/async/images/generations" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "A beautiful colorful sunset over the ocean",
    "size": "16:9",
    "quality": "medium",
    "n": 1,
    "callback_url": "https://your-domain.com/webhooks/image-task-completed"
  }'`

const createEditsTaskExample = `curl -X POST "https://web-production-14606.up.railway.app/v1/async/images/edits" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "Add a sunset background to this image",
    "image": ["https://example.com/input-image.png"],
    "size": "1024x1024",
    "n": 1,
    "callback_url": "https://your-domain.com/webhooks/image-task-completed"
  }'`

const queryTaskExample = `curl "https://web-production-14606.up.railway.app/v1/async/images/tasks/task_xxx" \\
  -H "Authorization: Bearer YOUR_API_KEY"`

const callbackExample = `{
  "created": 1757156493,
  "id": "task_xxx",
  "model": "gpt-image-2",
  "object": "image.generation.task",
  "progress": 100,
  "status": "completed",
  "task_info": {
    "type": "image"
  },
  "usage": {
    "cost": 0.30,
    "cost_status": "CHARGED",
    "currency": "CNY"
  },
  "data": [
    {
      "url": "https://example.com/final-image.png",
      "revised_prompt": "A beautiful colorful sunset over the ocean with golden reflections..."
    }
  ],
  "size": "1536x960",
  "image_type": "generate",
  "error": null
}`

const callbackNote = `The callback response body matches the task query response format.
The \`object\` field is \`"image.generation.task"\` for text-to-image tasks and \`"image.edit.task"\` for image editing tasks.`

const syncGenerationsExample = `curl -X POST "https://web-production-14606.up.railway.app/v1/images/generations" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "A beautiful colorful sunset over the ocean",
    "size": "16:9",
    "quality": "medium",
    "n": 1
  }'`

const syncEditsExample = `curl -X POST "https://web-production-14606.up.railway.app/v1/images/edits" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "Add a sunset background to this image",
    "image": ["https://example.com/input-image.png"],
    "size": "1024x1024",
    "n": 1
  }'`

const syncSuccessExample = `{
  "created": 1757156493,
  "id": "task_sync_xxx",
  "object": "image.generation",
  "model": "gpt-image-2",
  "data": [
    {
      "url": "https://example.com/final-image.png",
      "revised_prompt": "A beautiful colorful sunset over the ocean with golden reflections..."
    }
  ],
  "size": "1536x960",
  "usage": {
    "sku": "image_16_9",
    "unit_price": 0.30,
    "unit_price_fen": 30,
    "price_version": 1,
    "cost": 0.30,
    "cost_fen": 30,
    "cost_status": "CHARGED",
    "currency": "CNY"
  },
  "task": {
    "id": "task_sync_xxx",
    "status": "completed"
  },
  "idempotent": false
}`

const syncRetryableErrorExample = `{
  "error": "Selected provider failed. Retry to reselect another provider.",
  "code": "provider_retry_recommended",
  "request_id": "task_sync_xxx"
}`

const createGenerationsRequestFields = [
  ['model', 'Required. Supported: `gpt-image-2`, `agnes-image-2.1-flash`.'],
  ['prompt', 'Required. Up to 32000 characters.'],
  ['size', 'Optional. Supports `auto`, aspect ratios such as `3:4`, `3:5`, and `16:9`, or explicit sizes like `1152x1536`.'],
  ['quality', 'Optional. `low`, `medium`, `high`. Default `medium`. Only supported by `gpt-image-2`.'],
  ['n', 'Optional. Currently only `1` is supported.'],
  ['callback_url', 'Optional. HTTPS callback URL triggered when the task completes or fails.'],
]

const createEditsRequestFields = [
  ['model', 'Required. Supported: `gpt-image-2`, `agnes-image-2.1-flash`.'],
  ['prompt', 'Required. Up to 32000 characters. Describes the edit to apply.'],
  ['image', 'Required. 1-16 reference image URLs (HTTP/HTTPS). The source images to edit.'],
  ['size', 'Optional. Supports `auto`, aspect ratios such as `3:4`, `3:5`, and `16:9`, or explicit sizes like `1152x1536`.'],
  ['n', 'Optional. Currently only `1` is supported.'],
  ['callback_url', 'Optional. HTTPS callback URL triggered when the task completes or fails.'],
]

const createResponseFields = [
  ['created', 'Unix timestamp when the task was created.'],
  ['id', 'Task ID. Use this value to query task status later.'],
  ['model', 'Actual model used for generation.'],
  ['object', '`image.generation.task` for text-to-image, `image.edit.task` for image editing.'],
  ['progress', 'Task progress from `0` to `100`.'],
  ['status', '`pending`, `processing`, `completed`, or `failed`.'],
  ['task_info', 'Task metadata. `type` is always `image`.'],
  ['usage', 'Billing information including unit price / total cost at submission time.'],
]

const syncResponseFields = [
  ['created', 'Unix timestamp when the request completed.'],
  ['id', 'Persisted internal request/task ID for tracing and support.'],
  ['object', '`image.generation` for text-to-image, `image.edit` for image editing.'],
  ['model', 'Selected upstream provider model for the successful result.'],
  ['data', 'Final image output list. Currently always a single image.'],
  ['usage', 'Pricing and charged cost information.'],
  ['task.id', 'Internal persisted task ID, same as top-level `id`.'],
  ['task.status', '`completed` on success.'],
  ['idempotent', 'Whether this response reuses a prior request via `idempotency-key`.'],
]

const modeCompareRows = [
  ['Sync', '`POST /v1/images/*`', 'Returns the final image result directly in the same request.', 'No server-side failover inside the same request. Retry on `520`.'],
  ['Async', '`/v1/async/images/*`', 'Returns a task first, then poll `/v1/async/images/tasks/:id` or wait for callback.', 'Worker may switch to backup providers automatically.'],
]

const queryResponseFields = [
  ['model', 'Model used for generation. `gpt-image-2` or the actual upstream provider model.'],
  ['object', '`image.generation.task` for text-to-image, `image.edit.task` for image editing.'],
  ['status', '`pending`, `processing`, `completed`, or `failed`.'],
  ['progress', 'Current task progress.'],
  ['usage.cost', 'Final charged cost for the task, if available.'],
  ['usage.cost_status', '`CHARGED` or `REFUNDED`.'],
  ['data', 'Completed image output list. Only present on success.'],
  ['error', 'Failure details when task status is `failed`.'],
]

const syncErrorRows = [
  ['400', 'Invalid request parameters, unsupported size, or unsupported `mask_url`.'],
  ['401', 'Missing or invalid Bearer token.'],
  ['402', 'Insufficient balance for the owning user account.'],
  ['429', 'Quota exceeded for the API key.'],
  ['503', 'No provider available or the selected provider is currently at capacity.'],
  ['520', 'The selected provider failed or timed out after 240 seconds. Retry to trigger a fresh provider selection.'],
]

const asyncErrorRows = [
  ['400', 'Invalid request parameters, unsupported size, unsupported `mask_url` (edits endpoint), or missing pricing configuration.'],
  ['401', 'Missing or invalid Bearer token.'],
  ['402', 'Insufficient balance for the owning user account.'],
  ['429', 'Quota exceeded for the API key.'],
  ['503', 'Task was accepted but failed to enqueue into the worker queue.'],
  ['500', 'Internal server error.'],
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold text-gray-900">{children}</h2>
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-gray-950 p-4 text-sm leading-6 text-gray-100">
      <code>{children}</code>
    </pre>
  )
}

function FieldTable({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">Field</th>
            <th className="px-4 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, description]) => (
            <tr key={name} className="border-t border-gray-100 align-top">
              <td className="px-4 py-3 font-mono text-gray-900">{name}</td>
              <td className="px-4 py-3 text-gray-700">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompareTable({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">Mode</th>
            <th className="px-4 py-3 font-medium">Endpoints</th>
            <th className="px-4 py-3 font-medium">Response</th>
            <th className="px-4 py-3 font-medium">Provider Behavior</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([mode, endpoint, response, providerBehavior]) => (
            <tr key={mode} className="border-t border-gray-100 align-top">
              <td className="px-4 py-3 font-medium text-gray-900">{mode}</td>
              <td className="px-4 py-3 font-mono text-gray-900">{endpoint}</td>
              <td className="px-4 py-3 text-gray-700">{response}</td>
              <td className="px-4 py-3 text-gray-700">{providerBehavior}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateTaskSection({ title, endpoint, description, fields, example }: {
  title: string
  endpoint: string
  description: string
  fields: string[][]
  example: string
}) {
  return (
    <section className="space-y-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <div className="font-mono text-gray-950">POST {endpoint}</div>
        <p className="mt-2">{description}</p>
      </div>
      <FieldTable rows={fields} />
      <CodeBlock>{example}</CodeBlock>
      <FieldTable rows={createResponseFields} />
    </section>
  )
}

function SimpleEndpointSection({ title, endpoint, description, fields, example, responseRows, responseExample }: {
  title: string
  endpoint: string
  description: string
  fields: string[][]
  example: string
  responseRows: string[][]
  responseExample: string
}) {
  return (
    <section className="space-y-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <div className="font-mono text-gray-950">POST {endpoint}</div>
        <p className="mt-2">{description}</p>
      </div>
      <FieldTable rows={fields} />
      <CodeBlock>{example}</CodeBlock>
      <FieldTable rows={responseRows} />
      <CodeBlock>{responseExample}</CodeBlock>
    </section>
  )
}

export function ApiDocsContent() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">API Documentation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-950">Image Generation API</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
          The service now exposes synchronous and asynchronous image APIs. Use{' '}
          <code>https://web-production-14606.up.railway.app/v1/images/generations</code> or{' '}
          <code>https://web-production-14606.up.railway.app/v1/images/edits</code> for direct synchronous results,
          and use <code>/v1/async/images/*</code> for task-based asynchronous generation with polling and callbacks.
        </p>
      </div>

      <div className="mt-8 grid gap-4 rounded-3xl border border-blue-100 bg-blue-50 p-6 text-sm text-blue-950 sm:grid-cols-3">
        <div>
          <p className="font-semibold">Authentication</p>
          <p className="mt-1 text-blue-900/80">Bearer token required for every request.</p>
        </div>
        <div>
          <p className="font-semibold">Charging Model</p>
          <p className="mt-1 text-blue-900/80">Cost is charged to the owning user balance of the API key.</p>
        </div>
        <div>
          <p className="font-semibold">Dual Modes</p>
          <p className="mt-1 text-blue-900/80">`/v1/images/*` is sync, `/v1/async/images/*` is task-based async.</p>
        </div>
      </div>

      <div className="mt-12 space-y-12">
        <section className="space-y-4">
          <SectionTitle>Base URL</SectionTitle>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Use the production API domain below:
            <div className="mt-2 font-mono text-gray-900">https://web-production-14606.up.railway.app</div>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Authentication</SectionTitle>
          <p className="text-gray-700">All API requests require Bearer token authentication.</p>
          <CodeBlock>{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
        </section>

        <section className="space-y-4">
          <SectionTitle>Sync vs Async</SectionTitle>
          <p className="text-gray-700">
            Choose sync when you want the final image in one request. Choose async when you prefer task-based delivery,
            polling, callbacks, and automatic worker-side provider failover.
          </p>
          <CompareTable rows={modeCompareRows} />
        </section>

        <SimpleEndpointSection
          title="Create Sync Image Generation"
          endpoint="https://web-production-14606.up.railway.app/v1/images/generations"
          description="Create a synchronous text-to-image request. The server selects one provider using the current smart-routing score, executes it inline, and returns the final image result directly."
          fields={createGenerationsRequestFields}
          example={syncGenerationsExample}
          responseRows={syncResponseFields}
          responseExample={syncSuccessExample}
        />

        <SimpleEndpointSection
          title="Create Sync Image Edit"
          endpoint="https://web-production-14606.up.railway.app/v1/images/edits"
          description="Create a synchronous image edit request. The server downloads the remote reference images, selects one provider using smart routing, and returns the final edited image directly."
          fields={createEditsRequestFields}
          example={syncEditsExample}
          responseRows={syncResponseFields}
          responseExample={syncSuccessExample}
        />

        <section className="space-y-4">
          <SectionTitle>Sync Failure Semantics</SectionTitle>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-950">
            <p>Sync requests use smart routing to rank providers, but they only execute the top-ranked provider for that request.</p>
            <p className="mt-2">If the selected provider fails or times out after 240 seconds, the server does not automatically switch to a backup provider inside the same request.</p>
            <p className="mt-2">Instead the API returns HTTP <code>520</code>. Retry the same request to trigger a fresh provider selection.</p>
          </div>
          <FieldTable rows={syncErrorRows} />
          <CodeBlock>{syncRetryableErrorExample}</CodeBlock>
        </section>

        <CreateTaskSection
          title="Create Async Image Generation Task"
          endpoint="https://web-production-14606.up.railway.app/v1/async/images/generations"
          description="Create an asynchronous text-to-image generation task. Use this endpoint when no reference image is provided."
          fields={createGenerationsRequestFields}
          example={createGenerationsTaskExample}
        />

        <CreateTaskSection
          title="Create Async Image Edit Task"
          endpoint="https://web-production-14606.up.railway.app/v1/async/images/edits"
          description="Create an asynchronous image editing task. Use this endpoint when one or more reference images are provided."
          fields={createEditsRequestFields}
          example={createEditsTaskExample}
        />

        <section className="space-y-4">
          <SectionTitle>Query Task Status</SectionTitle>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="font-mono text-gray-950">GET https://web-production-14606.up.railway.app/v1/async/images/tasks/:id</div>
            <p className="mt-2">Query the current status and final output of a previously created task. Works for both generation and edit tasks.</p>
          </div>
          <CodeBlock>{queryTaskExample}</CodeBlock>
          <FieldTable rows={queryResponseFields} />
        </section>

        <section className="space-y-4">
          <SectionTitle>Callback Delivery</SectionTitle>
          <p className="text-gray-700">
            If <code>callback_url</code> is provided, the server sends a POST request to that HTTPS URL after
            the task completes or fails. {callbackNote}
          </p>
          <CodeBlock>{callbackExample}</CodeBlock>
        </section>

        <section className="space-y-4">
          <SectionTitle>Billing Notes</SectionTitle>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-700">
            <p>Billing is tied to the user account that owns the API key.</p>
            <p className="mt-2">The service checks balance before task creation.</p>
            <p className="mt-2">If the task is accepted, cost is charged immediately and recorded in usage history.</p>
            <p className="mt-2">If generation ultimately fails, the charged amount is automatically refunded.</p>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Async Error Codes</SectionTitle>
          <FieldTable rows={asyncErrorRows} />
        </section>

        <section className="space-y-4">
          <SectionTitle>Compatibility Notes</SectionTitle>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-950">
            <p>Use <code>POST https://web-production-14606.up.railway.app/v1/images/generations</code> and <code>POST https://web-production-14606.up.railway.app/v1/images/edits</code> for synchronous generation.</p>
            <p className="mt-2">
              Use <code>/v1/async/images/generations</code>, <code>/v1/async/images/edits</code>, and poll <code>/v1/async/images/tasks/:id</code> for the asynchronous task lifecycle.
            </p>
            <p className="mt-2">Both sync and async modes support <code>callback_url</code>. In sync mode, callback delivery is still attempted after the request reaches a terminal state.</p>
            <p className="mt-2"><code>mask_url</code> is intentionally not supported on the edits endpoint.</p>
            <p className="mt-2">`n` is currently fixed to <code>1</code> for all endpoints.</p>
            <p className="mt-2">Supported public models are <code>gpt-image-2</code> and <code>agnes-image-2.1-flash</code>.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
