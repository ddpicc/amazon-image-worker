type LogLevel = 'info' | 'warn' | 'error'

type LogFields = Record<string, unknown>

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        key === 'error' ? serializeError(value) : value,
      ]),
    ),
  }

  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

export const logger = {
  info(event: string, fields?: LogFields) {
    write('info', event, fields)
  },
  warn(event: string, fields?: LogFields) {
    write('warn', event, fields)
  },
  error(event: string, fields?: LogFields) {
    write('error', event, fields)
  },
}
