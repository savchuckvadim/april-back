// src/pdf/pdf.service.ts
import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { Offer } from './components/Offer';
import ReactDOMServer from 'react-dom/server';

@Injectable()
export class PdfService {
  async generatePdf(): Promise<Buffer> {
    const content = ReactDOMServer.renderToStaticMarkup(<Offer />);

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">

        </head>
        <style>
          body {
            padding: 20px;
            font-family: 'Roboto', sans-serif;
          }

          .title {
            font-size: 24px;
            font-weight: bold;
            color: #ea580c;
          }

          .paragraph {
            font-size: 16px;
            font-weight: 700;
            color:rgb(234, 12, 204);
          }
        </style>
        <body class="bg-white text-black">
          ${content}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}
