import { resolve } from 'node:path'

export const port = parseInt(process.env.RANKWRANGLER_PORT || '') || 3303
export const r = (...args: string[]) => resolve(__dirname, '..', ...args)
export const isDev = process.env.NODE_ENV !== 'production'
