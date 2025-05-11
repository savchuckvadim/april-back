import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileService {

    async downloadFile(domain: string, downloadUrl: string): Promise<any> {
        try {
            const url = `https://${domain}${downloadUrl}`;
            const response = await axios.post(url, {}, { responseType: 'arraybuffer' });
            const contentDisposition = response.headers['content-disposition'];
            let filename = 'downloaded_file';

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            const filePath = path.join(__dirname, filename);
            fs.writeFileSync(filePath, response.data);

            const fileContent = fs.readFileSync(filePath);
            const fileBase64 = Buffer.from(fileContent).toString('base64');

            return { filename, fileBase64 };
        } catch (error) {
            console.error('Error downloading file:', error);
            return null;
        }
    }

    async processUploadedFile(file: any): Promise<any> {
        try {
            const fileContent = await file.buffer();
            const fileBase64 = Buffer.from(fileContent).toString('base64');
            return { filename: file.originalname, fileBase64 };
        } catch (error) {
            console.error('Error processing uploaded file:', error);
            return null;
        }
    }

    async getFileInField(url: string): Promise<[string, string]> {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentDisposition = response.headers['content-disposition'];
        let filename = 'downloaded_file';

        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename\*=(.+?)(;|$)/);
            if (filenameMatch) {
                const encodedString = filenameMatch[1].split("''")[1];
                filename = decodeURIComponent(encodedString);
            }
        }

        const fileBase64 = Buffer.from(response.data).toString('base64');
        return [filename, fileBase64];
    }
} 