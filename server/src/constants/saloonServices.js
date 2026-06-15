const SALOON_PRESET_SERVICES = [
  'Haircut',
  'Beard',
  'Shave',
  'Facial',
  'Hair wash',
  'Hair styling',
];

const PRESET_LOOKUP = new Set(SALOON_PRESET_SERVICES.map((s) => s.toLowerCase()));

function normalizeSaloonServices(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of input) {
    const name = String(raw?.name || raw || '').trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const isPreset = PRESET_LOOKUP.has(key);
    const isCustom =
      typeof raw?.isCustom === 'boolean' ? raw.isCustom : !isPreset;
    result.push({ name, isCustom });
  }
  return result;
}

module.exports = {
  SALOON_PRESET_SERVICES,
  normalizeSaloonServices,
};
