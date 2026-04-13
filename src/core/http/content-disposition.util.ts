/**
 * Safe `Content-Disposition: attachment` for Node.js `setHeader`.
 * Unicode in `filename="..."` throws "Invalid character in header content".
 * Uses RFC 5987 `filename*=UTF-8''` plus an ASCII `filename` fallback.
 */
export function buildContentDispositionAttachment(fileName: string): string {
    const raw = fileName.trim() || 'download';

    let ascii = '';
    for (const c of raw) {
        const code = c.charCodeAt(0);
        if (code >= 0x20 && code < 0x7f && c !== '"' && c !== '\\') {
            ascii += c;
        } else {
            ascii += '_';
        }
    }
    ascii = ascii.replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 200);

    const extMatch = raw.match(/\.[a-zA-Z0-9]{1,15}$/);
    const ext = extMatch ? extMatch[0] : '';
    if (!ascii || /^_+$/.test(ascii)) {
        ascii = ext ? `file${ext}` : 'download';
    }

    const encoded = encodeURIComponent(raw);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
