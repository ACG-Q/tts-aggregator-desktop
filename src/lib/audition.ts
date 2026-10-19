let current: HTMLAudioElement | null = null;

export function stopAudition(): void {
  if (current) {
    current.pause();
    current = null;
  }
}

export async function playAudition(bytes: ArrayBuffer): Promise<void> {
  stopAudition();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  const a = new Audio(url);
  current = a;
  a.onended = () => {
    URL.revokeObjectURL(url);
    if (current === a) current = null;
  };
  await a.play();
}
