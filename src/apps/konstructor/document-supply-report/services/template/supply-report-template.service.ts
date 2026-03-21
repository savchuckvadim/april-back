import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService, StorageType } from '@/core/storage';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { SupplyReportTemplateData } from '../data/supply-report-data.service';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';

@Injectable()
export class SupplyReportTemplateService {
    private readonly logger = new Logger(SupplyReportTemplateService.name);

    constructor(private readonly storageService: StorageService) {}

    /**
     * Создает Word документ из шаблона
     */
    async createWordDocument(
        templateData: SupplyReportTemplateData,
        domain: string,
        userId: number,
        isNewTemplate: boolean = true,
    ): Promise<{ filePath: string; fileName: string }> {
        // Определяем путь к шаблону
        const templatePath = this.getTemplatePath(isNewTemplate);

        // Проверяем существование шаблона
        if (!(await this.storageService.fileExists(templatePath))) {
            throw new NotFoundException(`Template not found: ${templatePath}`);
        }

        // Читаем шаблон
        const templateBuffer = await this.storageService.readFile(templatePath);

        // Создаем документ из шаблона
        const doc = new Docxtemplater(new PizZip(templateBuffer), {
            paragraphLoop: true,
            linebreaks: true,
        });

        // Заполняем шаблон данными
        this.fillTemplate(doc, templateData, domain);

        // Генерируем файл
        const buffer = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        // Сохраняем файл
        const currentYear = dayjs().format('YYYY');
        const hash = randomUUID().replace(/-/g, '').substring(0, 8);
        const fileName = 'Отчет_о_продаже.docx';
        const subPath = `konstructor/supply/${currentYear}/${domain}/${userId}/${hash}`;

        const filePath = await this.storageService.saveFile(
            buffer,
            fileName,
            StorageType.PUBLIC,
            subPath,
        );

        this.logger.log(`Word document created: ${filePath}`);

        return { filePath, fileName };
    }

    /**
     * Получает путь к шаблону
     */
    private getTemplatePath(isNewTemplate: boolean): string {
        const basePath = 'konstructor/templates/supply';
        if (isNewTemplate) {
            return this.storageService.getFilePath(
                StorageType.APP,
                basePath,
                'sales_report.docx',
            );
        } else {
            return this.storageService.getFilePath(
                StorageType.APP,
                basePath,
                'supply_report_gsr.docx',
            );
        }
    }

    /**
     * Заполняет шаблон данными
     */
    private fillTemplate(
        doc: Docxtemplater,
        data: SupplyReportTemplateData,
        domain: string,
    ): void {
        const withRq =
            domain === 'april-dev.bitrix24.ru' ||
            domain === 'april-garant.bitrix24.ru';

        // Базовые поля клиента
        doc.setData({
            client_company_name: data.client_company_name || '',
            client_inn: data.client_inn || '',
            client_company_registred_address:
                data.client_company_registred_address || '',
            client_company_primary_address:
                data.client_company_primary_address || '',
            region: data.region || '',
            contract_type: data.contract_type || '',
            provider_fullname: data.provider_fullname || '',
            bx_deal: data.bx_deal || '',
            total_sum: data.total_sum || 0,
            prepayment_sum: data.prepayment_sum || 0,
            prepayment_quantity: data.prepayment_quantity || 0,
            contract_start: data.contract_start || '',
            contract_end: data.contract_end || '',
            present_period: data.present_period || '',
            garant_client_assigned_name: data.garant_client_assigned_name || '',
            garant_client_assigned_phone:
                data.garant_client_assigned_phone || '',
            email_garant: data.email_garant || '',
        });

        // Обрабатываем блок реквизитов клиента
        // В docxtemplater блоки обрабатываются через теги в шаблоне: {#client_rq_block}{client_rq}{/client_rq_block}
        if (withRq && data.client_rq) {
            const formattedRq = data.client_rq.replace(
                /\n/g,
                '</w:t><w:br/><w:t>',
            );
            doc.setData({
                client_rq: formattedRq,
                client_rq_block: [{ client_rq: formattedRq }], // Массив для клонирования блока
            });
        } else {
            doc.setData({ client_rq_block: [] }); // Пустой массив удалит блок
        }

        // Обрабатываем строки продуктов
        // В docxtemplater строки таблицы клонируются через: {#productRows}{productNumber}...{/productRows}
        if (data.productRows && data.productRows.length > 0) {
            doc.setData({ productRows: data.productRows });
        } else {
            doc.setData({ productRows: [] });
        }

        // Обрабатываем итоговые данные
        if (data.totalData) {
            doc.setData(data.totalData);
        }

        // Обрабатываем спецификацию
        const formattedIblocks = data.complect_fields_left.replace(
            /\n/g,
            '</w:t><w:br/><w:t>',
        );
        const formattedIfree = data.complect_fields_right.replace(
            /\n/g,
            '</w:t><w:br/><w:t>',
        );
        const formattedLtFree = data.complect_lt_left.replace(
            /\n/g,
            '</w:t><w:br/><w:t>',
        );
        const formattedLtPacket = data.complect_lt_right.replace(
            /\n/g,
            '</w:t><w:br/><w:t>',
        );
        const formattedPk = data.complect_pk.replace(
            /\n/g,
            '</w:t><w:br/><w:t>',
        );

        doc.setData({
            complect_fields_left: formattedIblocks,
            complect_fields_right: formattedIfree,
            complect_lt_left: formattedLtFree,
            complect_lt_right: formattedLtPacket,
            complect_pk: formattedPk,
        });

        // Обрабатываем контакты
        // В docxtemplater контакты клонируются через: {#contacts}{contact_name}...{/contacts}
        if (data.contacts && data.contacts.length > 0) {
            doc.setData({ contacts: data.contacts });
        } else {
            doc.setData({ contacts: [] });
        }

        // Обрабатываем элементы компании
        if (data.companyItems) {
            for (const [key, value] of Object.entries(data.companyItems)) {
                doc.setData({ [key]: value || '' });
            }
        }

        // Обрабатываем элементы сделки
        if (data.dealItems) {
            for (const [key, value] of Object.entries(data.dealItems)) {
                doc.setData({ [key]: value || '' });
            }
        }

        // Обрабатываем элементы отчета о поставке
        if (data.supplyReportItems) {
            for (const [key, value] of Object.entries(data.supplyReportItems)) {
                doc.setData({ [key]: value || '' });
            }
        }

        // Рендерим документ
        try {
            doc.render();
        } catch (error) {
            this.logger.error('Error rendering template:', error);
            throw new Error(`Template rendering failed: ${error.message}`);
        }
    }
}
