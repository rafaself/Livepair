export function normalizeTitle(title: string | null | undefined): string | null {
  if (typeof title !== 'string') {
    return title ?? null;
  }

  const trimmedTitle = title.trim();
  return trimmedTitle.length > 0 ? trimmedTitle : null;
}

export function normalizeContentText(contentText: string): string {
  const trimmedContent = contentText.trim();

  if (trimmedContent.length === 0) {
    throw new Error('Chat message content must not be empty');
  }

  return trimmedContent;
}
