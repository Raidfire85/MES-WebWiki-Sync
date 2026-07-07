export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function contentEquals(a: string, b: string): boolean {
  return normalizeContent(a) === normalizeContent(b);
}
