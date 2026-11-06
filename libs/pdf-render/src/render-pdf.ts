import type { ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { registerPdfFonts } from './pdf-fonts';

/** Итог рендера: байты PDF и время сборки. */
export interface PdfRenderResult {
    buffer: Buffer;
    durationMs: number;
}

/**
 * Документ react-pdf → байты PDF со встроенными шрифтами. Рендер идёт в
 * процессе приложения (без браузера); типичный отчёт на 5–8 страниц
 * собирается за доли секунды.
 */
export async function renderPdfToBuffer(
    element: ReactElement,
): Promise<PdfRenderResult> {
    registerPdfFonts();
    const started = performance.now();
    // Любой документ react-pdf: корень — <Document>, пропсы корня типизирует он сам.
    const buffer = await renderToBuffer(element as ReactElement<DocumentProps>);
    return {
        buffer: Buffer.from(buffer),
        durationMs: Math.round(performance.now() - started),
    };
}
