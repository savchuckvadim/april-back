import { Injectable } from '@nestjs/common';
import { MigrateToBxDto, Product, Contact, Contract } from '../dto/migrate-to-bx.dto';
import { SheetData, SheetDataProduct, SheetDataContact } from '../dto/sheet-data.dto';

@Injectable()
export class SheetDataToMigrateConverter {
    /**
     * Преобразует Product из SheetData в формат MigrateToBxDto
     */
    private convertProduct(product: SheetDataProduct): Product {
        return {
            id: product.id,
            name: product.name,
            quantity: product.quantity,
            monthSum: product.monthSum,
            armId: product.armId,
            contractEndDate: product.contractEndDate,
            contractType: product.contractType,
            contractPrepayment: product.contractPrepayment,
        };
    }

    /**
     * Преобразует Contact из SheetData в формат MigrateToBxDto
     */
    private convertContact(contact: SheetDataContact): Contact {
        return {
            name: contact.name,
            position: contact.position,
            phone: contact.phone,
            email: contact.email,
            communicationsRate: '',
            contactFirstEdu: '',
            contactFirstEduComment: '',
            contactEdu: '',
            contactEduComment: '',
            contactExamination: '',
            contactQualification: '',
            contactSkap: '',
            conmtactGl: '',
            contactGarantClub: '',
        };
    }

    /**
     * Создает Contract из данных продукта
     * Берет данные из первого продукта, у которого есть информация о договоре
     */
    private createContract(products: SheetDataProduct[]): Contract {
        // Ищем первый продукт с данными о договоре
        const productWithContract = products.find(
            p => p.contractEndDate || p.contractType || p.contractPrepayment,
        );

        if (productWithContract) {
            return {
                contractEndDate: productWithContract.contractEndDate || '',
                contractType: productWithContract.contractType || '',
                contractPrepayment: productWithContract.contractPrepayment?.toString() || '',
            };
        }

        return {
            contractEndDate: '',
            contractType: '',
            contractPrepayment: '',
        };
    }

    /**
     * Преобразует один SheetData в MigrateToBxDto
     */
    convertSheetToMigrate(sheetData: SheetData): MigrateToBxDto {
        const dto = new MigrateToBxDto();

        // Основные поля
        dto.id = sheetData.company.armId || '';
        dto.company = sheetData.company.clientName || '';
        dto.document = ''; // Не заполняется в SheetData
        dto.payinfo = ''; // Можно собрать из contacts, но обычно пусто
        dto.complectInfo = sheetData.company.complectName || '';
        dto.concurent = ''; // Не заполняется в SheetData
        dto.supplyDate = ''; // Не заполняется в SheetData

        // Продукты
        dto.products = sheetData.company.products.map(p => this.convertProduct(p));

        // Контакты
        dto.contacts = sheetData.company.contacts.map(c => this.convertContact(c));

        // Договор (берем из первого продукта с данными о договоре)
        dto.contract = this.createContract(sheetData.company.products);

        return dto;
    }

    /**
     * Преобразует массив SheetData в массив MigrateToBxDto
     */
    convertSheetsToMigrate(sheetsData: SheetData[]): MigrateToBxDto[] {
        return sheetsData
            .filter(sheet => sheet.company.armId) // Фильтруем только те, у которых есть armId
            .map(sheet => this.convertSheetToMigrate(sheet));
    }
}

