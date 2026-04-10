/** Generate a short random share code like "X7K2PQ" */
export function genShareCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Copy text to clipboard, returns true on success */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Build a shareable URL for a quiz or flashcard set */
export function shareUrl(type, id) {
  return `${window.location.origin}/${type}/${id}`;
}
