// localStorage, wrapped: it can be blocked (private mode), and then nothing is remembered.
export const load = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback } catch { return fallback } }
export const save = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* not remembered */ } }
