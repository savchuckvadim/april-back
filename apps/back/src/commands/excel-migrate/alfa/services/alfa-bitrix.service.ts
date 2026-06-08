import { EBXEntity, EBxMethod, EBxNamespace } from 'src/modules/bitrix/core';
import { Injectable } from '@nestjs/common';

import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

import { BitrixService, IBXCompany } from 'src/modules/bitrix';
import { PBXService } from '@/modules/pbx/pbx.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { AlfaMigrateBitrixCompanyService } from './bitrix/alfa-migrate-bxcompany.service';
import { IAlfaParse } from './alfa-parse.service';
import { Cell, Column, Workbook } from 'exceljs';
import { StorageService, StorageType } from 'src/core/storage';
import { delay } from '@/shared/lib';
import { getCompanies, getDoubles, ICompany } from '../data/get-companies';

@Injectable()
export class AlfaBitrixService {
    private portal: PortalModel;
    private bitrix: BitrixService;
    constructor(
        private readonly pbx: PBXService,

        private readonly companyService: AlfaMigrateBitrixCompanyService,
        private readonly storageService: StorageService,
    ) {}

    async migrateToBitrix(domain: string, data: IAlfaParse[]) {
        const { bitrix } = await this.pbx.init(domain);

        const fieldsResponse = await bitrix.api.callType(
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.USER_FIELD_LIST,
            {
                filter: {
                    FIELD_NAME: 'UF_CRM_1632896396',
                },
            },
        );
        const isWorkField = fieldsResponse.result.filter(
            field => field.FIELD_NAME === 'UF_CRM_1632896396',
        );
        const innField = fieldsResponse.result.find(
            field => field.FIELD_NAME === 'UF_CRM_1539345538',
        );
        console.log(isWorkField, innField);
        let count = 0 as number;
        const results = [] as IBitrixBatchResponseResult[][];
        for (let i = 0; i < data.length; i += 3) {
            const chunk = data.slice(i, i + 3);

            for (const item of chunk) {
                bitrix.batch.company.getList(
                    `${item.inn}_${count}`,
                    {
                        [`UF_CRM_1539345538`]: `${item.inn}`,
                    },
                    ['TITLE', 'UF_CRM_1632896396', 'UF_CRM_1539345538'],
                );
                count += 1;
            }

            const result = await bitrix.api.callBatchWithConcurrency(1);
            results.push(result);
            await delay(1000);
        }
        const bxCompanies = [] as IBXCompany[];
        const doubles = [] as IBXCompany[][];
        results.forEach(result => {
            result.map(item => {
                for (const resultKey in item.result) {
                    const innComaniesData = item.result[
                        resultKey
                    ] as IBXCompany[];

                    innComaniesData.map(company => {
                        bxCompanies.push(company);
                    });
                    if (innComaniesData.length > 1) {
                        doubles.push(innComaniesData);
                    }
                }
            });
        });
        const commands = bitrix.api.getCmdBatch();
        // console.log(commands)

        // void await this.getDoublesExcel(doubles, domain)
        return {
            bxCompaniesCount: bxCompanies.length,
            doublesCount: doubles.length,
            isWorkField,
            innField,
            commands: commands,
            bxCompanies,
            doubles,

            // result,
            // doublesExcel
        };
        // // передаём shared context
        // this.companyService.setContext(this.bitrix, this.portal, userId);

        // const results = [] as IBitrixBatchResponseResult[][]
        // let count = 0
        // // for (let i = 0; i < data.length; i += 1) {
        // //     const chunk = data.slice(i, i + 1)

        //     // chunk.
        //     data.forEach((element, index) => {
        //         // console.log(index)
        //         // if (index > 1) {

        //         const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.ADD}.${element.id}`
        //         this.companyService.getCompanyCommand(element, companyCmd)

        //         // }
        //     });

        //     const result = await this.bitrix.api.callBatchWithConcurrency(1)
        //     console.log(result)
        //     results.push(result)
        //     // count += 1
        //     // await new Promise(resolve => {
        //     //     console.log('wait')
        //     //     console.log(chunk)
        //     //     console.log(count)
        //     //     setTimeout(resolve, 700)
        //     // })
        // // }
        // return {
        //     // commands,
        //     // portal: this.portal,
        //     count: data.length,
        //     results,

        // }
    }

    async migrate(domain: string, data: IAlfaParse[]) {
        const { bitrix } = await this.pbx.init(domain);
        const companies = getCompanies();
        const doubles = getDoubles();
        // void await this.getDoublesExcel(doubles, domain)
        let noParsed = 0;
        const migrated = [] as IAlfaParse[][];
        companies.forEach(company => {
            const parsedCompany = data.find(
                item => `${item.inn}` === `${company.UF_CRM_1539345538}`,
            );
            if (!parsedCompany) {
                console.log(
                    `Company ${company.UF_CRM_1539345538} not found in parsed data`,
                );
                console.log(company);
                noParsed += 1;
                return;
            }
            const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.UPDATE}.${company.ID}`;
            bitrix.batch.company.update(companyCmd, company.ID, {
                [`UF_CRM_1632896396`]: parsedCompany.isWork,
            });
            if (
                !migrated.find(group =>
                    group.find(item => item.inn === parsedCompany.inn),
                )
            ) {
                migrated.push([parsedCompany]);
            }
        });
        const result = await bitrix.api.callBatchWithConcurrency(2);
        // const result = bitrix.api.getCmdBatch()
        // console.log(result)
        void (await this.getMigratedExcel(
            migrated.map(item =>
                item.filter(item => ({
                    ...item,
                    id: item.id,
                    companyName: item.companyName,
                    inn: item.inn,
                    isWork: item.isWork,
                })),
            ),
            domain,
        ));
        void (await this.getDoublesExcel(doubles, domain));
        return {
            noParsed,
            count: companies.length,
            companies,
            doubles,
            result,
        };
    }
    private async getDoublesExcel(
        doubles: ICompany[][],
        domain: string,
    ): Promise<Buffer> {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet('Дубли компаний');

        // Заголовок
        const headerRow = worksheet.addRow([
            '#',
            'ID',
            'Название',
            'ИНН',
            'Ссылка',
        ]);
        worksheet.getRow(1).font = { bold: true };
        headerRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' }, // чёрный цвет
            };
            cell.font = {
                color: { argb: 'FFFFFFFF' }, // белый текст
                bold: true, // опционально
            };
        });

        doubles.forEach((group, groupIndex) => {
            group.forEach(company => {
                const row = worksheet.addRow([
                    groupIndex + 1,
                    company.ID,
                    company.TITLE,
                    company.UF_CRM_1539345538,
                    // `https://${domain}/company/details/${company.ID}/`
                ]);

                // Ссылка (последняя ячейка)
                const linkCell = row.getCell(5); // Пятая колонка
                linkCell.value = {
                    text: 'Открыть в Bitrix',
                    hyperlink: `https://${domain}/crm/company/details/${company.ID}/`,
                };
                linkCell.font = {
                    color: { argb: 'FF0000FF' },
                    underline: true,
                };
            });

            const separatorRow = worksheet.addRow(['', '', '', '', '']);
            separatorRow.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'BEE7FB' }, // чёрный цвет
                };
            });
            separatorRow.height = 5; // сделать полоску тонкой
        });

        // Автоширина
        worksheet.columns.forEach((col, _index) => {
            const column = col as Column;
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, (cell: Cell) => {
                const v = cell.value;
                const len =
                    v !== null && v !== undefined ? String(v).length : 0;
                maxLength = Math.max(maxLength, len + 2);
            });

            column.width =
                _index === 0 || _index === 1 ? 10 : _index === 2 ? 160 : 30;
        });

        // Генерация буфера
        const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
        const fileName = `doubles_${Date.now()}.xlsx`;
        await this.storageService.saveFile(
            buffer,
            fileName,
            StorageType.PRIVATE,
            'doubles',
        );
        return buffer;
    }

    private async getMigratedExcel(
        migrated: IAlfaParse[][],
        domain: string,
    ): Promise<Buffer> {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet('Дубли компаний');

        // Заголовок
        const headerRow = worksheet.addRow([
            '#',
            'ID',
            'Название',
            'ИНН',
            'Ссылка',
        ]);
        worksheet.getRow(1).font = { bold: true };
        headerRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' }, // чёрный цвет
            };
            cell.font = {
                color: { argb: 'FFFFFFFF' }, // белый текст
                bold: true, // опционально
            };
        });

        migrated.forEach((group, groupIndex) => {
            group.forEach(company => {
                const row = worksheet.addRow([
                    groupIndex + 1,
                    company.id,
                    company.companyName,
                    company.inn,
                    // `https://${domain}/company/details/${company.ID}/`
                ]);

                // Ссылка (последняя ячейка)
                const linkCell = row.getCell(5); // Пятая колонка
                linkCell.value = {
                    text: 'Открыть в Bitrix',
                    hyperlink: `https://${domain}/crm/company/details/${company.id}/`,
                };
                linkCell.font = {
                    color: { argb: 'FF0000FF' },
                    underline: true,
                };
            });

            const separatorRow = worksheet.addRow(['', '', '', '', '']);
            separatorRow.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'BEE7FB' }, // чёрный цвет
                };
            });
            separatorRow.height = 5; // сделать полоску тонкой
        });

        // Автоширина
        worksheet.columns.forEach((col, _index) => {
            const column = col as Column;
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, (cell: Cell) => {
                const v = cell.value;
                const len =
                    v !== null && v !== undefined ? String(v).length : 0;
                maxLength = Math.max(maxLength, len + 2);
            });

            column.width =
                _index === 0 || _index === 1 ? 10 : _index === 2 ? 160 : 30;
        });

        // Генерация буфера
        const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
        const fileName = `migrated_${Date.now()}.xlsx`;
        await this.storageService.saveFile(
            buffer,
            fileName,
            StorageType.PRIVATE,
            'migrated',
        );
        return buffer;
    }
}
