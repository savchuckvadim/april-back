import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class InitSupplyFileService {
    public async downloadFileAndConvertToBase64(
        url: string,
        name?: string,
    ): Promise<[string, string]> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // получить как бинарный буфер
        });

        const fileBuffer = Buffer.from(response.data, 'binary');

        // Получаем имя файла из URL
        const urlParts = url.split('/');
        const filename =
            name || decodeURIComponent(urlParts[urlParts.length - 1]);

        const base64 = fileBuffer.toString('base64');

        return [filename, base64];
    }

    public async downloadBitrixFileAndConvertToBase64(
        url: string,
        name?: string,
    ): Promise<[string, string]> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // 👈 обязательно!
        });
        const contentDisposition = response.headers['content-disposition'];
        const filename =
            this.getFilenameFromDisposition(contentDisposition) ||
            `${name}.docx`;

        const fileBuffer = Buffer.from(response.data);

        const base64 = fileBuffer.toString('base64');

        return [filename, base64];
    }

    /**
     * Файл, который уже лежит в поле сделки: фронт присылает относительный
     * `downloadUrl`. Bitrix отдаёт такие ссылки по GET, но легаси-версия на
     * питоне ходила POST-ом — оставляем его запасным вариантом.
     */
    public async downloadPortalFileAndConvertToBase64(
        domain: string,
        downloadUrl: string,
        name?: string,
    ): Promise<[string, string]> {
        const url = downloadUrl.startsWith('http')
            ? downloadUrl
            : `https://${domain}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;

        try {
            return await this.downloadBitrixFileAndConvertToBase64(url, name);
        } catch {
            const response = await axios.post(
                url,
                {},
                { responseType: 'arraybuffer' },
            );
            const filename =
                this.getFilenameFromDisposition(
                    response.headers['content-disposition'],
                ) || `${name ?? 'file'}.docx`;
            return [filename, Buffer.from(response.data).toString('base64')];
        }
    }

    private getFilenameFromDisposition(
        header: string | undefined,
    ): string | undefined {
        if (!header) {
            return undefined;
        }
        // Пробуем сначала filename*=utf-8''
        const utf8Match = header.match(/filename\*\=utf-8''([^;]+)/i);
        if (utf8Match) {
            return decodeURIComponent(utf8Match[1]);
        }

        // Иначе обычный filename="..."
        const asciiMatch = header.match(/filename="([^"]+)"/i);
        if (asciiMatch) {
            return asciiMatch[1];
        }

        return undefined;
    }
}
