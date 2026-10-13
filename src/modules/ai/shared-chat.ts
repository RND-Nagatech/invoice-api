/** Remove WhatsApp export metadata while preserving the customer's order text. */
export function normalizeSharedChat(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(
          /^\[\d{1,2}[:.]\d{2}(?::\d{2})?,?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\]\s*[^:]{1,80}:\s*/,
          '',
        )
        .replace(
          /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}[:.]\d{2}\s*[-–]\s*[^:]{1,80}:\s*/,
          '',
        ),
    )
    .filter(
      (line) =>
        line.trim() &&
        !/^(?:<Media omitted>|<Media tidak disertakan>)$/.test(line.trim()),
    )
    .join('\n')
    .trim();
}
