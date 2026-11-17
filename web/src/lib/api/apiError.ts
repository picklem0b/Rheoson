import { messageFor } from '@rheoson/shared'

export interface ApiFailureInit {
  code: string
  status: number
  message?: string
}

/**
 * A failed request, with the code intact.
 *
 * The code is the part a person can quote, so it travels from the envelope into
 * every surface that shows an error instead of being flattened into a string.
 */
export class ApiFailure extends Error {
  readonly code: string
  readonly status: number

  constructor({ code, status, message }: ApiFailureInit) {
    super(message ?? messageFor(code))
    this.name = 'ApiFailure'
    this.code = code
    this.status = status
  }
}
