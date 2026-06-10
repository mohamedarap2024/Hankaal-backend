import { pool } from "../db/database.js";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const { rows } = await pool.query("SELECT value FROM site_settings WHERE key = $1", [key]);
  return rows[0]?.value ?? fallback;
}

export async function getSettings(): Promise<Record<string, string>> {
  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function buildUssdCode(amount: number, prefix: string, suffix: string) {
  return `${prefix}${amount}${suffix}`;
}
