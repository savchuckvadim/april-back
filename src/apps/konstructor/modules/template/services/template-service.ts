import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { renderTemplateHtml } from '../render/template.html';

@Injectable()
export class TemplateService {
    async generatePdf(data: any): Promise<Buffer> {
        const cssPath = path.resolve(__dirname, 'styles/tailwind.dist.css');
        const css = fs.readFileSync(cssPath, 'utf-8');
        const html = renderTemplateHtml(data, css);

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        return Buffer.from(pdf);
    }
}
