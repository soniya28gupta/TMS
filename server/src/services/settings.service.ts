import { prisma } from '../db';
import { DEFAULT_SETTINGS, type SettingsShape } from '../constants';
import { readJson, writeJson } from '../lib/json';

let cache: SettingsShape | null = null;

/** Settings are read on nearly every request; cache them until a write lands. */
export async function getSettings(): Promise<SettingsShape> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = readJson<unknown>(row.value, merged[row.key]);
  cache = merged as SettingsShape;
  return cache;
}

export async function updateSettings(patch: Partial<SettingsShape>): Promise<SettingsShape> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: writeJson(value) },
        update: { value: writeJson(value) },
      }),
    ),
  );
  cache = null;
  return getSettings();
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Company timezone — the reference clock for every "day" in the system. */
export async function getTimezone(): Promise<string> {
  return (await getSettings()).timezone;
}
