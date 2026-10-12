import { Injectable, Logger } from '@nestjs/common';
import { StorageService, StorageType } from '@lib/core/storage';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { SupplyReportTemplateData } from '../data/supply-report-data.service';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { getErrorString } from '@lib/shared';

/** Домены, у которых в документ добавляется блок реквизитов клиента. */
const DOMAINS_WITH_CLIENT_RQ = [
    'april-dev.bitrix24.ru',
    'april-garant.bitrix24.ru',
];

@Injectable()
export class SupplyReportTemplateService {
    private readonly logger = new Logger(SupplyReportTemplateService.name);

    constructor(private readonly storageService: StorageService) {}

    /**
     * Собирает docx отчёта из шаблона.
     *
     * Файл кладётся в `konstructor/supply/{year}/{domain}/{userId}` — ровно
     * туда, куда потом смотрит `FileLinkService.getFilePath`. Уникальность
     * живёт в ИМЕНИ файла, а не в подпапке с хэшем: иначе ссылка
     * `/api/files/<token>` отдаёт 404, и init-supply не скачивает отчёт.
     *
     * `templatePath` приходит готовым: выбор файла (БД или зонд по storage)
     * — ответственность `SupplyReportTemplateSourceService`. Здесь остаётся
     * только сборка документа, поэтому прежний флаг `isNewTemplate` ушёл
     * вместе с веткой, которая его читала.
     */
    async createWordDocument(
        templateData: SupplyReportTemplateData,
        domain: string,
        userId: number,
        templatePath: string,
    ): Promise<{ filePath: string; fileName: string; subPath: string }> {
        const templateBuffer = await this.storageService.readFile(templatePath);

        const doc = new Docxtemplater(new PizZip(templateBuffer), {
            paragraphLoop: true,
            linebreaks: true,
        });

        // ОДИН объект и ОДИН render: doc.setData() заменяет весь набор данных
        // целиком, поэтому серия вызовов оставляла в документе только последний
        this.renderTemplate(doc, this.buildRenderData(templateData, domain));

        const buffer = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
        });

        const currentYear = dayjs().format('YYYY');
        const hash = randomUUID().replace(/-/g, '').substring(0, 8);
        const fileName = `Отчет_о_продаже_${hash}.docx`;
        const subPath = `konstructor/supply/${currentYear}/${domain}/${userId}`;

        const filePath = await this.storageService.saveFile(
            buffer,
            fileName,
            StorageType.PUBLIC,
            subPath,
        );

        this.logger.log(`Отчёт о поставке собран: ${filePath}`);

        return { filePath, fileName, subPath };
    }

    /**
     * Плоский набор данных для docxtemplater.
     *
     * Ключи компании, сделки и формы отчёта раскладываются в корень: в шаблоне
     * они стоят тегами по коду поля ({sale_date}, {supply_information}, …).
     */
    private buildRenderData(
        data: SupplyReportTemplateData,
        domain: string,
    ): Record<string, unknown> {
        const withRq = DOMAINS_WITH_CLIENT_RQ.includes(domain);

        return {
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

            complect_fields_left: data.complect_fields_left || '',
            complect_fields_right: data.complect_fields_right || '',
            complect_lt_left: data.complect_lt_left || '',
            complect_lt_right: data.complect_lt_right || '',
            complect_pk: data.complect_pk || '',

            client_rq: withRq ? (data.client_rq ?? '') : '',
            // пустой массив схлопывает блок {#client_rq_block}…{/client_rq_block}
            client_rq_block:
                withRq && data.client_rq ? [{ client_rq: data.client_rq }] : [],

            productRows: data.productRows ?? [],
            contacts: data.contacts ?? [],
            complects: data.complects ?? [],

            ...(data.totalData ?? {}),
            ...(data.companyItems ?? {}),
            ...(data.dealItems ?? {}),
            ...(data.supplyReportItems ?? {}),
        };
    }

    /** Единственный render: падение шаблона — ошибка генерации. */
    private renderTemplate(
        doc: Docxtemplater,
        renderData: Record<string, unknown>,
    ): void {
        try {
            doc.render(renderData);
        } catch (error) {
            this.logger.error(
                `Не удалось отрендерить шаблон отчёта: ${getErrorString(error)}`,
            );
            throw error;
        }
    }
}
