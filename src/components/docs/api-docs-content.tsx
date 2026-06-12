const createGenerationsTaskExample = `curl -X POST "$BASE_URL/v1/images/generations" \\
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

const createEditsTaskExample = `curl -X POST "$BASE_URL/v1/images/edits" \\
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

const queryTaskExample = `curl "$BASE_URL/v1/images/tasks/task_xxx" \\
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
    "cost": 0.04,
    "cost_status": "CHARGED",
    "currency": "USD"
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

const createGenerationsRequestFields = [
  ['model', '`gpt-image-2` only. Required.'],
  ['prompt', 'Required. Up to 32000 characters.'],
  ['size', 'Optional. Supports `auto`, aspect ratios like `16:9`, or explicit sizes like `1024x1024`.'],
  ['quality', 'Optional. `low`, `medium`, `high`. Default `medium`.'],
  ['n', 'Optional. Currently only `1` is supported.'],
  ['callback_url', 'Optional. HTTPS callback URL triggered when the task completes or fails.'],
]

const createEditsRequestFields = [
  ['model', '`gpt-image-2` only. Required.'],
  ['prompt', 'Required. Up to 32000 characters. Describes the edit to apply.'],
  ['image', 'Required. 1-16 reference image URLs (HTTP/HTTPS). The source images to edit.'],
  ['size', 'Optional. Supports `auto`, aspect ratios like `16:9`, or explicit sizes like `1024x1024`.'],
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

const errorRows = [
  ['400', 'Invalid request parameters, unsupported size, unsupported `mask_url` (edits endpoint), or missing pricing configuration.'],
  ['401', 'Missing or invalid Bearer token.'],
  ['402', 'Insufficient balance for the owning user account.'],
  ['404', 'Task not found or inaccessible.'],
  ['429', 'Quota exceeded for the API key.'],
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

export function ApiDocsContent() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">API Documentation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-950">Image Generation API</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
          Unified asynchronous image generation API. Submit text-to-image tasks with{' '}
          <code>/v1/images/generations</code> or image editing tasks with{' '}
          <code>/v1/images/edits</code>, then poll <code>/v1/images/tasks/:id</code> or
          receive a webhook callback when the task completes.
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
          <p className="font-semibold">Async Flow</p>
          <p className="mt-1 text-blue-900/80">Create task first, then query status or wait for callback.</p>
        </div>
      </div>

      <div className="mt-12 space-y-12">
        <section className="space-y-4">
          <SectionTitle>Base URL</SectionTitle>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Use your deployment domain as the API base, for example:
            <div className="mt-2 font-mono text-gray-900">https://your-domain.com</div>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Authentication</SectionTitle>
          <p className="text-gray-700">All API requests require Bearer token authentication.</p>
          <CodeBlock>{`Authorization: Bearer YOUR_API_KEY`}</CodeBlock>
        </section>

        <CreateTaskSection
          title="Create Image Generation Task"
          endpoint="/v1/images/generations"
          description="Create an asynchronous text-to-image generation task."
          fields={createGenerationsRequestFields}
          example={createGenerationsTaskExample}
        />

        <CreateTaskSection
          title="Create Image Edit Task"
          endpoint="/v1/images/edits"
          description="Create an asynchronous image editing task. Provide one or more reference images to edit using a text prompt."
          fields={createEditsRequestFields}
          example={createEditsTaskExample}
        />

        <section className="space-y-4">
          <SectionTitle>Query Task Status</SectionTitle>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="font-mono text-gray-950">GET /v1/images/tasks/:id</div>
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
          <SectionTitle>Error Codes</SectionTitle>
          <FieldTable rows={errorRows} />
        </section>

        <section className="space-y-4">
          <SectionTitle>Compatibility Notes</SectionTitle>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-950">
            <p>The recommended public API surface uses two endpoints: <code>POST /v1/images/generations</code> for text-to-image and <code>POST /v1/images/edits</code> for image-to-image editing.</p>
            <p className="mt-2">
              Both endpoints share the same async task lifecycle: submit → poll <code>/v1/images/tasks/:id</code> → receive result.
            </p>
            <p className="mt-2"><code>mask_url</code> is intentionally not supported on the edits endpoint.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
