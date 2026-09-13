import { apiFetch, throwIfNotOk } from "@/api/client"

export interface AuthProfile {
  username: string
}

export async function login(username: string, password: string): Promise<void> {
  const response = await apiFetch("/_devtools/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  })

  throwIfNotOk(response, "Failed to sign in")
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/_devtools/api/auth/logout", {
    method: "POST",
  })

  throwIfNotOk(response, "Failed to sign out")
}

export async function getProfile(): Promise<AuthProfile> {
  const response = await apiFetch("/_devtools/api/auth/profile")

  throwIfNotOk(response, "Failed to load profile")
  return response.json()
}
