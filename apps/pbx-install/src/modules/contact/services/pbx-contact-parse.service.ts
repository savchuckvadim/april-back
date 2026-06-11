// import { StorageService, StorageType } from '@/core/storage';
// import { Injectable, Logger, NotFoundException } from '@nestjs/common';
// import * as ExcelJS from 'exceljs';
// import { ParseFieldsService } from '@app/pbx-install/shared/parse-field-excel/services/parse-fields.service';
// import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
// import { PbxEntityType } from '@/shared';

// export type ContactParseData = {
//     count: number;
//     fields: Field[];
// };

// const CONTACT_FOLDER_NAME = 'entity-fields';
// export enum ContactAppName {
//     EVENT = 'event',
//     KONSTRUCTOR = 'konstructor',
//     ALL = 'all',
// }
// export enum PbxContactGroupEnum {
//     SALES = 'sales',
//     SERVICE = 'service',
// }
// @Injectable()
// export class ParseContactService {
//     private readonly logger = new Logger(ParseContactService.name);
//     private readonly installPath = 'install';
//     constructor(
//         private readonly storageService: StorageService,
//         private readonly parseFieldsService: ParseFieldsService,
//     ) {}

//     async getParsedData(
//         appName: ContactAppName,
//         group: PbxContactGroupEnum,
//     ): Promise<ContactParseData> {
//         const fullPath = `${this.installPath}/${group}/${CONTACT_FOLDER_NAME}/`;
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
//         appName: ContactAppName,
//     ): Promise<ContactParseData> {
//         const workbook = new ExcelJS.Workbook();
//         await workbook.xlsx.readFile(path);
//         // const colorsSheet = workbook.worksheets[0];
//         const eventFieldsSheet = workbook.worksheets[1];
//         const konstructorFieldsSheet = workbook.worksheets[2];
//         const fieldItemsSheet = workbook.worksheets[3];
//         const fields = this.createContactFields(
//             eventFieldsSheet,
//             konstructorFieldsSheet,
//             fieldItemsSheet,
//             appName,
//         );
//         return { count: fields.length || 0, fields };
//     }

//     private createContactFields(
//         eventFieldsSheet: ExcelJS.Worksheet,
//         konstructorFieldsSheet: ExcelJS.Worksheet,
//         fieldItemsSheet: ExcelJS.Worksheet,
//         appName: ContactAppName,
//     ): Field[] {
//         let resultFields: Field[] = [];

//         if (appName === ContactAppName.EVENT) {
//             resultFields = this.parseFieldsService.getFieldsData(
//                 eventFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_CONTACT,
//             );
//         }
//         if (appName === ContactAppName.KONSTRUCTOR) {
//             resultFields = this.parseFieldsService.getFieldsData(
//                 konstructorFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_CONTACT,
//             );
//         }
//         if (appName === ContactAppName.ALL) {
//             const eventFields = this.parseFieldsService.getFieldsData(
//                 eventFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_CONTACT,
//             );
//             const konstructorFields = this.parseFieldsService.getFieldsData(
//                 konstructorFieldsSheet,
//                 fieldItemsSheet,
//                 PbxEntityType.BTX_CONTACT,
//             );
//             resultFields = [...eventFields, ...konstructorFields];
//         }
//         return resultFields;
//     }
// }
