import { Injectable } from "@nestjs/common";
import axios from "axios";



@Injectable()
export class InitSupplyFileService {

    public async downloadFileAndConvertToBase64(url: string, name?: string): Promise<[string, string]> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', // получить как бинарный буфер
        });

        const fileBuffer = Buffer.from(response.data, 'binary');

        // Получаем имя файла из URL
        const urlParts = url.split('/');
        const filename = name || decodeURIComponent(urlParts[urlParts.length - 1]);

        const base64 = fileBuffer.toString('base64');

        return [filename, base64];
    }

    public async downloadBitrixFileAndConvertToBase64(url: string, name?: string): Promise<[string, string]> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer' // 👈 обязательно!
        });
        const contentDisposition = response.headers['content-disposition'];
        const filename = this.getFilenameFromDisposition(contentDisposition) || `${name}.docx`;

        const fileBuffer = Buffer.from(response.data);


        const base64 = fileBuffer.toString('base64');

        return [filename, base64];
    }

    private getFilenameFromDisposition(header: string): string | undefined {
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