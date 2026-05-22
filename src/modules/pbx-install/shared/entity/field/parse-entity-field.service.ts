import { StorageService, StorageType } from '@/core/storage';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ParseFieldsService } from '@/modules/pbx-install/shared/parse-field-excel/services/parse-fields.service';
import { Field } from '@/modules/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { PbxEntityType } from '@/shared';

export type EntityParseData = {
    count: number;
    fields: Field[];
};

const ENTITY_FIELDS_FOLDER_NAME = 'entity-fields';
export enum ParseEntityFieldsAppName {
    EVENT = 'event',
    KONSTRUCTOR = 'konstructor',
    ALL = 'all',
}
export enum PbxEntityGroupEnum {
    SALES = 'sales',
    SERVICE = 'service',
}
@Injectable()
export class ParseEntityFieldsService {
    private readonly logger = new Logger(ParseEntityFieldsService.name);
    private readonly installPath = 'install';
    constructor(
        private readonly storageService: StorageService,
        private readonly parseFieldsService: ParseFieldsService,
    ) { }

    async getParsedData(
        entity: PbxEntityType,
        appName: ParseEntityFieldsAppName,
        group: PbxEntityGroupEnum,
    ): Promise<EntityParseData> {
        const fullPath = `${this.installPath}/${group}/${ENTITY_FIELDS_FOLDER_NAME}/`;
        const fileName = 'data.xlsx';
        const path = this.storageService.getFilePath(
            StorageType.APP,
            fullPath,
            fileName,
        );
        const exists = await this.storageService.fileExistsByType(
            StorageType.APP,
            fullPath,
            fileName,
        );
        if (!exists) {
            throw new NotFoundException('File not found');
        }
        const data = await this.parseData(path, appName, entity);
        return data;
    }

    private async parseData(
        path: string,
        appName: ParseEntityFieldsAppName,
        entity: PbxEntityType,
    ): Promise<EntityParseData> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        // const colorsSheet = workbook.worksheets[0];
        const eventFieldsSheet = workbook.worksheets[1];
        const konstructorFieldsSheet = workbook.worksheets[2];
        const fieldItemsSheet = workbook.worksheets[3];
        const fields = this.createCompanyFields(
            eventFieldsSheet,
            konstructorFieldsSheet,
            fieldItemsSheet,
            appName,
            entity,
        );
        return { count: fields.length || 0, fields };
    }

    private createCompanyFields(
        eventFieldsSheet: ExcelJS.Worksheet,
        konstructorFieldsSheet: ExcelJS.Worksheet,
        fieldItemsSheet: ExcelJS.Worksheet,
        appName: ParseEntityFieldsAppName,
        entity: PbxEntityType,
    ): Field[] {
        let resultFields: Field[] = [];

        if (appName === ParseEntityFieldsAppName.EVENT) {
            resultFields = this.parseFieldsService.getFieldsData(
                eventFieldsSheet,
                fieldItemsSheet,
                entity,
            );
        }
        if (appName === ParseEntityFieldsAppName.KONSTRUCTOR) {
            resultFields = this.parseFieldsService.getFieldsData(
                konstructorFieldsSheet,
                fieldItemsSheet,
                entity,
            );
        }
        if (appName === ParseEntityFieldsAppName.ALL) {
            const eventFields = this.parseFieldsService.getFieldsData(
                eventFieldsSheet,
                fieldItemsSheet,
                entity,
            );
            const konstructorFields = this.parseFieldsService.getFieldsData(
                konstructorFieldsSheet,
                fieldItemsSheet,
                entity,
            );
            resultFields = [...eventFields, ...konstructorFields];
        }
        return resultFields;
    }
}
