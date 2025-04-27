import vine from '@vinejs/vine'

export const Permissive = {
  nullable(schema = vine.any()) {
    return schema.optional().transform((value) => {
      if (value === 'null') {
        return null
      }
      return value
    })
  },

  optional(schema = vine.any()) {
    return schema.optional().transform((value) => {
      if (value === 'undefined') {
        return undefined
      }
      return value
    })
  },

  number() {
    return vine.number().transform((value) => {
      if (typeof value === 'string' && !isNaN(Number(value))) {
        return Number(value)
      }
      return value
    })
  },

  boolean() {
    return vine.boolean().transform((value) => {
      if (typeof value === 'string') {
        if (value === 'true') return true
        if (value === 'false') return false
      }
      return value
    })
  },

  array(schema = vine.array(vine.any())) {
    return schema.parse((value) => {
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) {
              return parsed
            }
          } catch {
            // ignore JSON parse errors
          }
        }
        return value
      })
  }
}
