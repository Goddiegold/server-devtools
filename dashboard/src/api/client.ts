export class ApiError extends Error {
  readonly status: number

  constructor(
    status: number,
    message: string
  ) {
    super(message)
    this.status = status
    this.name = "ApiError"
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  })

  if (response.status === 401) {
    unauthorizedHandler?.()
  }

  return response
}

export function throwIfNotOk(response: Response, message: string): void {
  if (!response.ok) {
    throw new ApiError(response.status, `${message}: ${response.status}`)
  }
}
