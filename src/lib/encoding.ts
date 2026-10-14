export function decodeTextBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf);
  }
}

export async function readTextFile(file: File): Promise<string> {
  return decodeTextBuffer(await file.arrayBuffer());
}
