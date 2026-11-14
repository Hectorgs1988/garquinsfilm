// Las mismas reglas que `profile.validation.ts` en la API: puntos de código,
// NFC y recorte de espacios. Evita viajes al servidor para errores previsibles.

export function textLength(value: string): number {
  return Array.from(normalizeText(value)).length;
}

export function normalizeText(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n');
}

export function normalizeNameInput(value: string): string {
  return normalizeText(value).trim();
}

export function normalizeBioInput(value: string): string | null {
  return normalizeText(value).trim() || null;
}

/**
 * Iniciales del avatar: una por cada una de las dos primeras palabras.
 * Recurre al correo cuando no hay nombre y nunca devuelve una cadena vacía.
 */
export function getInitials(name: string, email = ''): string {
  const source = name.trim() || email.split('@')[0]?.trim() || '';
  const words = source.split(/[\s._-]+/u).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return letters ? letters.toLocaleUpperCase('es-ES') : '·';
}
