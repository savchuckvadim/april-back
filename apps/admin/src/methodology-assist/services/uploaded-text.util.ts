import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { FileLoaderService } from '@lib/ai-rag/infrastructure/file-loader/file-loader.service';

/** Расширения, которые понимает загрузчик текста базы знаний. */
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/**
 * Текст из загруженного файла: FileLoaderService читает с диска, поэтому
 * буфер кладётся во временную папку и удаляется сразу после разбора.
 * Неподдерживаемое расширение — 400 с перечнем допустимых.
 */
export async function extractUploadedText(
    loader: Pick<FileLoaderService, 'extractText'>,
    file: { buffer: Buffer; originalName: string },
): Promise<string> {
    const extension = extname(file.originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new BadRequestException(
            `Файл ${file.originalName}: нужен документ docx, pdf, txt или md`,
        );
    }
    const dir = await mkdtemp(join(tmpdir(), 'methodology-assist-'));
    const path = join(dir, `${randomUUID()}${extension}`);
    try {
        await writeFile(path, file.buffer);
        return (await loader.extractText(path)).trim();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
