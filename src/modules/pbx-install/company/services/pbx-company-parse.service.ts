// import { StorageService, StorageType } from '@/core/storage';
// import { Injectable, Logger, NotFoundException } from '@nestjs/common';
// import * as ExcelJS from 'exceljs';
// import { ParseFieldsService } from '@/modules/install/shared/parse-field-excel/services/parse-fields.service';
// import { Field } from '@/modules/install/shared/parse-field-excel/type/parse-field.type';
// import { PbxEntityType } from '@/shared';

// export type CompanyParseData = {
//     count: number;
//     fields: Field[];
// };

// const COMANY_FOLDER_NAME = 'entity-fields';
// export enum CompanyAppName {
//     EVENT = 'event',
//     KONSTRUCTOR = 'konstructor',
//     ALL = 'all',
// }
// export enum PbxCompanyGroupEnum {
//     SALES = 'sales',
//     SERVICE = 'service',
// }
// @Injectable()
// export class ParseCompanyService {
//     private readonly logger = new Logger(ParseCompanyService.name);
//     private readonly installPath = 'install';
//     constructor(
//         private readonly storageService: StorageService,
//         private readonly parseFieldsService: ParseFieldsService,
//     ) {}

//     async getParsedData(
//         appName: CompanyAppName,
//         group: PbxCompanyGroupEnum,
//     ): Promise<CompanyParseData> {
//         const fullPath = `${this.installPath}/${group}/${COMANY_FOLDER_NAME}/`;
//         const fileName = 'data.xlsx';
//         const path = this.storageService.getFilePath(
//             StorageType.APP,
//             fullPath,
//             fileName,
//         );
//         const exists = await this.storageService.fileExistsByType(
//             StorageType.APP,
//             fullPath,
//             fileName,
//         );
//         if (!exists) {
//             throw new NotFoundException('File not found');
//         }
//         const data = await this.parseData(path, appName);
//         return data;
//     }

//     private async parseData(
//         path: string,
//         appName: CompanyAppName,
//     ): Promise<CompanyParseData> {
//         const workbook = new ExcelJS.Workbook();
//         await workbook.xlsx.readFile(path);
//         // const colorsSheet = workbook.worksheets[0];
//         const eventFieldsSheet = workbook.worksheets[1];
//         const konstructorFieldsSheet = workbook.worksheets[2];
//         const fieldItemsSheet = workbook.worksheets[3];
//         const fields = this.createCompanyFields(
//             eventFieldsSheet,
//             konstructorFieldsSheet,
//             fieldItemsSheet,
//             appName,
//         );
//         return { count: fields.length || 0, fields };
//     }

//     private createCompanyFields(
//         eventFieldsSheet: ExcelJS.Worksheet,
//         konstructorFieldsSheet: ExcelJS.Worksheet,
//         fieldItemsSheet: ExcelJS.Worksheet,
//         appName: CompanyAppName,
//     ): Field[] {
//         let resultFields: Field[] = [];

//         if (appName === CompanyAppName.EVENT) {
//             resultFields = this.parseFieldsService.getFieldsData(
//                 eventFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_COMPANY,
//             );
//         }
//         if (appName === CompanyAppName.KONSTRUCTOR) {
//             resultFields = this.parseFieldsService.getFieldsData(
//                 konstructorFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_COMPANY,
//             );
//         }
//         if (appName === CompanyAppName.ALL) {
//             const eventFields = this.parseFieldsService.getFieldsData(
//                 eventFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_COMPANY,
//             );
//             const konstructorFields = this.parseFieldsService.getFieldsData(
//                 konstructorFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_COMPANY,
//             );
//             resultFields = [...eventFields, ...konstructorFields];
//         }
//         return resultFields;
//     }
// }
