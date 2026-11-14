export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes the text, then shows **words** in bold and *words* in italic. Stars that don't wrap words stay as typed. */
export function formatEmphasis(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^\s*](?:[^*\n]*[^\s*])?)\*/g, '<em>$1</em>');
}
