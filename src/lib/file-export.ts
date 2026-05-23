export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadText(
  text: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType });
  triggerDownload(blob, filename);
}
