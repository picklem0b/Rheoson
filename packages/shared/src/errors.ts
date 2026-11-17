/**
 * Error codes: DCCNN, five characters.
 *
 *   D  domain    one letter, the subsystem that raised it (A auth, C core)
 *   CC category  shared vocabulary for what went wrong (VA validation, NF not found)
 *   NN number    two digits, sequential inside that domain and category
 *
 * `UNF01` reads as user / not found / first one. Grepping a code lands on its
 * single raise site, which is the whole point: a user quoting `[ERROR_CODE:
 * UNF01]` sends you to one line of code.
 *
 * Two things differ from a plain string registry:
 *
 *   1. The HTTP status lives here with the code. Passing it at every raise site
 *      lets the same code return 400 in one router and 404 in another, which
 *      makes the code only half a contract.
 *   2. The domain letter is enforced by the type system. `defineDomain('A', ...)`
 *      will not accept a code that does not start with A, so the mistake is a
 *      compile error instead of an assertion at import.
 *
 * Registration is checked at runtime too, because a duplicate code inside one
 * domain is a typo that types cannot see. Domains are added with the milestone
 * that needs them; this file holds only what the tree can actually raise.
 */

/** One letter per subsystem, and the first character of every code. */
export type DomainLetter = 'A' | 'U' | 'T' | 'R' | 'S' | 'P' | 'L' | 'E' | 'F' | 'W' | 'V' | 'C'

const CODE_PATTERN = /^[A-Z]{3}\d{2}$/

type Spec = readonly [code: string, status: number, message: string]
type CodeBook<S extends Record<string, Spec>> = { readonly [K in keyof S]: S[K][0] }

interface Domain<L extends DomainLetter, S extends Record<string, Spec>> {
  readonly letter: L
  readonly codes: CodeBook<S>
  readonly spec: S
}

function defineDomain<L extends DomainLetter, S extends Record<string, readonly [`${L}${string}`, number, string]>>(
  letter: L,
  spec: S,
): Domain<L, S> {
  const seen = new Set<string>()

  for (const [name, [code, status, message]] of Object.entries(spec) as [string, Spec][]) {
    if (!CODE_PATTERN.test(code)) {
      throw new Error(`${letter}.${name}: ${code} is not DCCNN`)
    }
    if (!code.startsWith(letter)) {
      throw new Error(`${letter}.${name}: ${code} is outside domain ${letter}`)
    }
    if (seen.has(code)) {
      throw new Error(`${letter}.${name}: ${code} is declared twice in domain ${letter}`)
    }
    if (status < 400 || status > 599) {
      throw new Error(`${letter}.${name}: ${code} carries non-error status ${status}`)
    }
    if (!message.trim()) {
      throw new Error(`${letter}.${name}: ${code} has no message`)
    }
    seen.add(code)
  }

  const codes = Object.fromEntries(
    Object.entries(spec).map(([name, [code]]) => [name, code]),
  ) as CodeBook<S>

  return { letter, codes, spec }
}

const AUTH = defineDomain('A', {
  NOT_SIGNED_IN: ['ASE01', 401, 'Not signed in'],
  SESSION_INVALID: ['ASE02', 401, 'Session expired or invalid'],
  FORBIDDEN: ['ACF01', 403, "You don't have access to this"],
})

const USER = defineDomain('U', {
  NOT_FOUND: ['UNF01', 404, 'Profile not found'],
  UPDATE_FAILED: ['UEX01', 500, 'Could not save your profile'],
})

const PROVIDER = defineDomain('P', {
  NOT_FOUND: ['PNF01', 404, 'That track is not available from the provider'],
  UNSUPPORTED: ['PNF02', 404, 'That music provider is not wired up on this deployment'],
  UNAVAILABLE: ['PEX01', 503, 'The music provider is not answering right now'],
})

const CORE = defineDomain('C', {
  NOT_FOUND: ['CNF01', 404, 'No such endpoint'],
  INVALID_REQUEST: ['CVA01', 400, 'That request is not valid'],
  DB_UNAVAILABLE: ['CEN01', 503, 'The database is not configured on this deployment'],
  RATE_LIMITED: ['CLM01', 429, 'Too many requests, slow down a moment'],
  UNEXPECTED: ['CEX01', 500, 'Something went wrong on our side'],
})

/** Raise sites read `ERRORS.CORE.RATE_LIMITED`, never a bare string. */
export const ERRORS = {
  AUTH: AUTH.codes,
  USER: USER.codes,
  PROVIDER: PROVIDER.codes,
  CORE: CORE.codes,
} as const

const DOMAIN_LIST = [AUTH, USER, PROVIDER, CORE] as const

const SPEC_BY_CODE = new Map<string, { status: number; message: string }>()

for (const domain of DOMAIN_LIST) {
  for (const [code, status, message] of Object.values(domain.spec) as Spec[]) {
    if (SPEC_BY_CODE.has(code)) {
      // Two domains cannot collide because the letters differ, but a copy-pasted
      // code inside one domain can, and that sends two reports to one line.
      throw new Error(`duplicate error code ${code}`)
    }
    SPEC_BY_CODE.set(code, { status, message })
  }
}

/** A failure ready to be turned into a response by the API layer. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: string, options: { append?: string; details?: Record<string, unknown> } = {}) {
    const spec = SPEC_BY_CODE.get(code)
    if (!spec) {
      throw new Error(`error code ${code} is not registered`)
    }
    super(options.append ? `${spec.message}${options.append}` : spec.message)
    this.name = 'ApiError'
    this.code = code
    this.status = spec.status
    this.details = options.details
  }
}

export function fail(
  code: string,
  options?: { append?: string; details?: Record<string, unknown> },
): ApiError {
  return new ApiError(code, options)
}

export function messageFor(code: string): string {
  return SPEC_BY_CODE.get(code)?.message ?? 'Something went wrong on our side'
}

/** Every registered code, sorted, for docs generation and contract checks. */
export const ERROR_CODES: readonly string[] = [...SPEC_BY_CODE.keys()].sort()
