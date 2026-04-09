// import {
//     WordTemplate,
//     WordTemplateService,
// } from '@/modules/offer-template/word';
// import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { StorageService, StorageType } from '@/core/storage';
// import Docxtemplater from 'docxtemplater';
// import PizZip from 'pizzip';
// import { FileLinkService } from '@/core/file-link/file-link.service';
// import dayjs from 'dayjs';
// import { randomUUID } from 'crypto';
// import { ConfigService } from '@nestjs/config';
// import { OfferWordPdfExportService } from './offer-word-pdf-export.service';
// import { OfferRenderDataService } from './render-data-services/render-data.service';
// import { InnerDealService } from '@/modules/inner-deal/services/inner-deal.service';

// const RESULT_PATH = `konstructor/offer-word/${dayjs().format('YYYY')}`;

// type SavedDocxResult = {
//     docxLink: string;
//     docxPath: string;
//     resultFileName: string;
// };

// @Injectable()
// export class OfferWordGenerateByTemplateService {
//     constructor(
//         private readonly configService: ConfigService,
//         private readonly wordTemplateService: WordTemplateService,
//         private readonly storageService: StorageService,
//         private readonly fileLinkService: FileLinkService,
//         private readonly offerWordPdfExportService: OfferWordPdfExportService,
//         private readonly documentRenderDataService: OfferRenderDataService,
//         private readonly innerDealService: InnerDealService,
//     ) {}

//     public async generateOfferWord(
//         dto: OfferWordByTemplateGenerateDto,
//     ): Promise<any> {
//         // 1. Решаем формат ответа: PDF, если клиент не запросил чистый Word (isWord = false).
//         const isPdf = !dto.isWord;
//         const dealId = Number(dto.dealId);
//         const domain = dto.domain;
//         const userId = dto.userId;
//         const templateId = BigInt(dto.templateId);

//         // 2. Загружаем метаданные шаблона из БД (путь к файлу .docx в хранилище).
//         const template = await this.wordTemplateService.findById(
//             BigInt(dto.templateId),
//         );
//         if (!template) {
//             throw new NotFoundException(
//                 `Word template with ID ${dto.templateId} not found`,
//             );
//         }

//         // 3. Читаем файл шаблона с диска и собираем объект Docxtemplater.
//         const doc = await this.getTemplateDocument(template);

//         // 4. Собираем данные для плейсхолдеров (инфоблоки, цены, реквизиты и т.д.).
//         const renderData =
//             await this.documentRenderDataService.getOfferRenderData(dto);
//         // 5. Подставляем данные в документ в памяти.
//         doc.render(renderData);

//         // 6. Сохраняем готовый DOCX в public storage и регистрируем публичную ссылку на него.
//         const saved = await this.saveRenderedDocx(
//             dto.domain,
//             userId.toString(),
//             doc,
//         );

//         const year = dayjs().format('YYYY');
//         // 7. Либо отдаём ссылку на DOCX, либо конвертируем в PDF и отдаём ссылку на PDF (файлы остаются на сервере).
//         const link =
//             isPdf === true
//                 ? await this.offerWordPdfExportService.buildPublicPdfLink({
//                       docxAbsolutePath: saved.docxPath,
//                       docxFileName: saved.resultFileName,
//                       domain: dto.domain,
//                       userId: userId,
//                       year,
//                   })
//                 : saved.docxLink;
//         // 8. Сохраняем в сделке, какой шаблон оферты использовался (ошибку логируем, генерацию не рвём).
//         try {
//             await this.innerDealService.setOfferTemplateByDomainAndDealId(
//                 domain,
//                 dealId,
//                 templateId,
//             );
//         } catch (error) {
//             console.error('Error in setOfferTemplateByDomainAndDealId:', error);
//         }

//         return {
//             template,
//             link,
//             renderData,
//         };
//     }

//     private async saveRenderedDocx(
//         domain: string,
//         userId: string,
//         doc: Docxtemplater,
//     ): Promise<SavedDocxResult> {
//         // Папка вида konstructor/offer-word/{год}/{domain}/{userId}.
//         const resultPath = `${RESULT_PATH}/${domain}/${userId}`;
//         const uuid = randomUUID();
//         const resultFileName = `offer-${uuid}.docx`;

//         // Записываем бинарник DOCX на диск (public).
//         const buf = doc.toBuffer();
//         const docxPath = await this.storageService.saveFile(
//             buf,
//             resultFileName,
//             StorageType.PUBLIC,
//             resultPath,
//         );
//         // Строим относительный URL-путь для скачивания/просмотра через file-link.
//         const rootLink = await this.fileLinkService.createPublicLink(
//             domain,
//             Number(userId),
//             'konstructor',
//             'offer-word',
//             dayjs().format('YYYY'),
//             resultFileName,
//         );
//         const baseUrl = this.configService.get('APP_URL') as string;
//         const docxLink = `${baseUrl}${rootLink}`;
//         return { docxLink, docxPath, resultFileName };
//     }

//     /**
//      * «Эфемерный» сценарий: всегда итог в PDF (флаг isWord в dto не смотрим).
//      * На диске не оставляем ни DOCX, ни PDF — только временно для конвертации.
//      */
//     public async generateEphemeralPdfBuffer(
//         dto: OfferWordByTemplateGenerateDto,
//     ): Promise<{ pdfBuffer: Buffer; pdfFileName: string }> {
//         const dealId = Number(dto.dealId);
//         const domain = dto.domain;
//         const userId = dto.userId;
//         const templateId = BigInt(dto.templateId);

//         // 1. Находим шаблон в БД.
//         const template = await this.wordTemplateService.findById(
//             BigInt(dto.templateId),
//         );
//         if (!template) {
//             throw new NotFoundException(
//                 `Word template with ID ${dto.templateId} not found`,
//             );
//         }

//         // 2. Открываем .docx шаблона с диска.
//         const doc = await this.getTemplateDocument(template);
//         // 3. Собираем данные и рендерим плейсхолдеры (как в обычной генерации).
//         const renderData =
//             await this.documentRenderDataService.getOfferRenderData(dto);
//         doc.render(renderData);

//         // 4. Пишем DOCX только на диск, без публичной ссылки (нужен путь для LibreOffice).
//         const saved = await this.saveRenderedDocxDiskOnly(
//             domain,
//             userId.toString(),
//             doc,
//         );

//         const pdfFileName = saved.resultFileName.replace(/\.docx$/i, '.pdf');
//         let pdfPath: string | null = null;
//         // 5. Конвертируем DOCX → PDF (рядом с исходником появляется .pdf).
//         try {
//             pdfPath = await this.offerWordPdfExportService.convertDocxToPdfPath(
//                 saved.docxPath,
//             );
//         } finally {
//             // 6. Исходный DOCX с диска удаляем — он больше не нужен.
//             await this.safeUnlink(saved.docxPath);
//         }

//         let pdfBuffer: Buffer;
//         // 7. Читаем PDF в память.
//         try {
//             pdfBuffer = await this.storageService.readFile(pdfPath);
//         } finally {
//             // 8. Файл PDF с диска удаляем — отдадим байты через Redis на API.
//             await this.safeUnlink(pdfPath);
//         }

//         // 9. Фиксируем выбранный шаблон в сделке (как в синхронном эндпоинте).
//         try {
//             await this.innerDealService.setOfferTemplateByDomainAndDealId(
//                 domain,
//                 dealId,
//                 templateId,
//             );
//         } catch (error) {
//             console.error('Error in setOfferTemplateByDomainAndDealId:', error);
//         }

//         return { pdfBuffer, pdfFileName };
//     }

//     private async saveRenderedDocxDiskOnly(
//         domain: string,
//         userId: string,
//         doc: Docxtemplater,
//     ): Promise<{ docxPath: string; resultFileName: string }> {
//         const resultPath = `${RESULT_PATH}/${domain}/${userId}`;
//         const uuid = randomUUID();
//         const resultFileName = `offer-${uuid}.docx`;
//         const buf = doc.toBuffer();
//         // Только физический файл; createPublicLink не вызываем — URL пользователю не нужен.
//         const docxPath = await this.storageService.saveFile(
//             buf,
//             resultFileName,
//             StorageType.PUBLIC,
//             resultPath,
//         );
//         return { docxPath, resultFileName };
//     }

//     /** Удаление файла по полному пути; ошибки глушим (удаление — best-effort). */
//     private async safeUnlink(filePath: string | null): Promise<void> {
//         if (!filePath) {
//             return;
//         }
//         try {
//             if (await this.storageService.fileExists(filePath)) {
//                 await this.storageService.deleteFile(filePath);
//             }
//         } catch {
//             /* ignore */
//         }
//     }

//     private async getTemplateDocument(
//         template: WordTemplate,
//     ): Promise<Docxtemplater> {
//         // Проверяем, что файл шаблона по пути из БД существует.
//         const isFileExist = await this.storageService.fileExists(
//             template.file_path,
//         );

//         if (!isFileExist) {
//             throw new NotFoundException(`File ${template.file_path} not found`);
//         }
//         const fileBuffer = await this.storageService.readFile(
//             template.file_path,
//         );
//         // PizZip разбирает zip-структуру docx, Docxtemplater — шаблонизатор.
//         const doc = new Docxtemplater(new PizZip(fileBuffer));
//         return doc;
//     }
// }
