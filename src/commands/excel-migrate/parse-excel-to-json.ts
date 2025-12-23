import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';

interface Product {
    id?: number;
    name: string;
    quantity: number;
    monthSum: string;
    armId: string;
    contractEndDate?: string;
    contractType?: string;
    contractPrepayment?: number;
}

interface Contact {
    name: string;
    position: string;
    phone: string;
    email: string;
    payinfo: string;
}

interface Company {
    clientName: string;
    address: string;
    complectName: string;
    price: string;
    email: string;
    complectBlocks: string;
    managerName: string;
    armId: string;
    contacts: Contact[];
    products: Product[];
}

interface SheetData {
    sheetId: number;
    companyName: string;
    sheetData: string;
    contacts: Contact[];
    company: Company;
}

// Функция для извлечения значения из ячейки
function getCellValue(cell: ExcelJS.Cell | null | undefined): string {
    if (!cell || cell.value === null || cell.value === undefined) {
        return '';
    }

    const value = cell.value;

    // Обработка примитивных типов
    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number') {
        // Проверяем, это дата или число
        if (cell.type === ExcelJS.ValueType.Date) {
            return dayjs(new Date((value - 25569) * 86400 * 1000)).format('YYYY-MM-DD');
        }
        // Обычное число
        return String(value);
    }

    if (typeof value === 'boolean') {
        return String(value);
    }

    // Обработка дат
    if (value instanceof Date) {
        return dayjs(value).format('YYYY-MM-DD');
    }

    // Обработка объектов
    if (typeof value === 'object') {
        // Обработка richText
        if ('richText' in value && Array.isArray(value.richText)) {
            return value.richText.map((rt: any) => {
                if (typeof rt === 'string') return rt;
                if (typeof rt === 'object' && rt.text) return rt.text;
                return '';
            }).join('').trim();
        }

        // Обработка формул
        if ('formula' in value) {
            const result = (value as any).result;
            if (result !== null && result !== undefined) {
                if (typeof result === 'object') {
                    return getCellValue({ value: result } as ExcelJS.Cell);
                }
                return String(result);
            }
            return '';
        }

        // Обработка гиперссылок
        if ('text' in value && 'hyperlink' in value) {
            return String(value.text || '');
        }

        // Обработка объектов с полем text
        if ('text' in value) {
            return String(value.text || '');
        }

        // Обработка объектов с полем value
        if ('value' in value) {
            return getCellValue({ value: value.value } as ExcelJS.Cell);
        }

        // Если это объект, но мы не знаем его структуру, пробуем найти текстовое представление
        try {
            // Пробуем получить текстовое представление через cell.text
            if (cell.text) {
                return cell.text.trim();
            }
        } catch (e) {
            // Игнорируем ошибки
        }

        // В крайнем случае возвращаем пустую строку вместо "[object Object]"
        return '';
    }

    // Для всех остальных случаев
    try {
        return String(value).trim();
    } catch (e) {
        return '';
    }
}

// Функция для парсинга даты
function parseDate(value: any): string {
    if (!value) return '';

    if (value instanceof Date) {
        return dayjs(value).format('YYYY-MM-DD');
    }

    if (typeof value === 'number') {
        return dayjs(new Date((value - 25569) * 86400 * 1000)).format('YYYY-MM-DD');
    }

    if (typeof value === 'string') {
        const cleanDate = value.replace(/г\.?/g, '').trim();
        const parts = cleanDate.split('.');
        if (parts.length === 3) {
            const [day, month, year] = parts;
            const fullYear = year.length === 2 ? `20${year}` : year;
            const date = dayjs(`${fullYear}-${month}-${day}`);
            if (date.isValid()) {
                return date.format('YYYY-MM-DD');
            }
        }
        const parsed = dayjs(cleanDate);
        return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
    }

    return '';
}

// Функция для парсинга количества
function parseQuantity(value: string): number {
    if (!value) return 0;
    const match = String(value).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}

// Функция для извлечения armId из строки
function extractArmId(text: string): string {
    // Ищем паттерн типа "61-40762-000053" или подобный
    const match = text.match(/\d{2}-\d{5}-\d{6}/);
    return match ? match[0] : '';
}

// Функция для определения структуры листа
function detectSheetStructure(sheet: ExcelJS.Worksheet): {
    armIdColumn: number;
    productIdColumn: number;
    productNameColumn: number;
    networkColumn: number;
    priceColumn: number;
    monthSumColumn: number;
    monthsColumn: number;
    contractEndDateColumn: number;
    contractTypeColumn: number;
    contractPrepaymentColumn: number;
    contactNameColumn: number;
    contactPositionColumn: number;
    contactPhoneColumn: number;
    contactEmailColumn: number;
} {
    // Анализируем первые строки для определения структуры
    const row1 = sheet.getRow(1);
    const row2 = sheet.getRow(2);

    let armIdColumn = 7; // по умолчанию
    let productIdColumn = 8;
    let productNameColumn = 9;
    let networkColumn = 10;
    let priceColumn = 10;
    let monthSumColumn = 11;
    let monthsColumn = 12;
    let contractEndDateColumn = 13;
    let contractTypeColumn = 14;
    let contractPrepaymentColumn = 15;
    let contactNameColumn = 2;
    let contactPositionColumn = 1;
    let contactPhoneColumn = 3;
    let contactEmailColumn = 6;

    // Проверяем заголовки в первой строке
    for (let col = 1; col <= 20; col++) {
        const cellValue = getCellValue(row1.getCell(col)).toLowerCase();
        if (cellValue.includes('рег.лист') || cellValue.includes('регистр')) {
            armIdColumn = col;
        }
        if (cellValue.includes('id') && !cellValue.includes('клиент')) {
            productIdColumn = col;
        }
        if (cellValue.includes('название комплекта') || cellValue.includes('комплект')) {
            productNameColumn = col;
        }
        if (cellValue.includes('сетевидность') || cellValue.includes('од')) {
            networkColumn = col;
        }
        if (cellValue.includes('сумма в месяц')) {
            monthSumColumn = col;
            priceColumn = col;
        }
        if (cellValue.includes('цена') && !cellValue.includes('сумма')) {
            priceColumn = col;
        }
        if (cellValue.includes('количество месяцев')) {
            monthsColumn = col;
        }
        if (cellValue.includes('дата окончания') || cellValue.includes('окончания обслуживания')) {
            contractEndDateColumn = col;
        }
        if (cellValue.includes('вид') && cellValue.includes('договор')) {
            contractTypeColumn = col;
        }
        if (cellValue.includes('срок') && cellValue.includes('аванс')) {
            contractPrepaymentColumn = col;
        }
    }

    // Проверяем структуру контактов (смотрим строку 8-10)
    for (let rowNum = 8; rowNum <= 10; rowNum++) {
        const row = sheet.getRow(rowNum);
        for (let col = 1; col <= 10; col++) {
            const cellValue = getCellValue(row.getCell(col)).toLowerCase();
            if (cellValue.includes('фио') || cellValue.includes('имя')) {
                contactNameColumn = col;
            }
            if (cellValue.includes('должность') || cellValue.includes('отдел')) {
                contactPositionColumn = col;
            }
            if (cellValue.includes('телефон')) {
                contactPhoneColumn = col;
            }
            if (cellValue.includes('@') || cellValue.includes('почта') || cellValue.includes('email')) {
                contactEmailColumn = col;
            }
        }
    }

    // Дополнительная проверка: если в строке 9 есть заголовки таблицы
    const row9 = sheet.getRow(9);
    const row9Col1 = getCellValue(row9.getCell(1)).toLowerCase();
    const row9Col2 = getCellValue(row9.getCell(2)).toLowerCase();
    const row9Col4 = getCellValue(row9.getCell(4)).toLowerCase();
    const row9Col5 = getCellValue(row9.getCell(5)).toLowerCase();

    if (row9Col1.includes('фио')) {
        contactNameColumn = 1;
    }
    if (row9Col2.includes('телефон')) {
        contactPhoneColumn = 2;
    }
    if (row9Col4.includes('отдел') || row9Col4.includes('должность')) {
        contactPositionColumn = 4;
    }
    if (row9Col5.includes('почта') || row9Col5.includes('email')) {
        contactEmailColumn = 5;
    }

    return {
        armIdColumn,
        productIdColumn,
        productNameColumn,
        networkColumn,
        priceColumn,
        monthSumColumn,
        monthsColumn,
        contractEndDateColumn,
        contractTypeColumn,
        contractPrepaymentColumn,
        contactNameColumn,
        contactPositionColumn,
        contactPhoneColumn,
        contactEmailColumn,
    };
}

// Функция для парсинга одного листа
async function parseSheet(sheet: ExcelJS.Worksheet, sheetIndex: number): Promise<SheetData> {
    const sheetItem: SheetData = {
        sheetId: sheetIndex,
        companyName: sheet.name.trim(),
        sheetData: '',
        contacts: [],
        company: {
            clientName: '',
            address: '',
            complectName: '',
            price: '',
            email: '',
            complectBlocks: '',
            managerName: '',
            armId: '',
            contacts: [],
            products: [],
        },
    };

    const structure = detectSheetStructure(sheet);
    let allSheetText = '';
    let rowNumber = 0;

    // Собираем все данные из первых 7 строк
    const headerRows: string[][] = [];

    // Парсим первые 7 строк для информации о компании
    for (let rowNum = 1; rowNum <= 7; rowNum++) {
        const row = sheet.getRow(rowNum);
        const rowData: string[] = [];

        // Собираем данные из всех ячеек строки
        for (let col = 1; col <= 15; col++) {
            const cell = row.getCell(col);
            const value = getCellValue(cell);
            if (value) {
                rowData.push(value);
                allSheetText += value + ' \n';
            }
        }

        headerRows.push(rowData);

        // Парсим конкретные строки
        switch (rowNum) {
            case 1: {
                // Название компании - обычно во второй колонке после "Клиент"
                let clientName = '';
                for (let col = 2; col <= 6; col++) {
                    const val = getCellValue(row.getCell(col));
                    if (val && !val.toLowerCase().includes('клиент') && val.length > 3) {
                        clientName = val;
                        break;
                    }
                }
                sheetItem.company.clientName = clientName.trim();
                break;
            }
            case 2: {
                // Адрес и armId, первый продукт
                let address = '';
                for (let col = 2; col <= 6; col++) {
                    const val = getCellValue(row.getCell(col));
                    if (val && !val.toLowerCase().includes('адрес') && val.length > 5) {
                        address = val;
                        break;
                    }
                }
                sheetItem.company.address = address.trim();

                // armId
                const armIdCell = row.getCell(structure.armIdColumn);
                const armIdValue = getCellValue(armIdCell);
                if (armIdValue) {
                    sheetItem.company.armId = extractArmId(armIdValue) || armIdValue;
                }

                // Первый продукт
                const productId = getCellValue(row.getCell(structure.productIdColumn));
                const productName = getCellValue(row.getCell(structure.productNameColumn));
                const network = getCellValue(row.getCell(structure.networkColumn));
                const months = getCellValue(row.getCell(structure.monthsColumn)); // Количество месяцев
                const monthSum = getCellValue(row.getCell(structure.monthSumColumn)) || getCellValue(row.getCell(structure.priceColumn));
                const contractEndDate = parseDate(getCellValue(row.getCell(structure.contractEndDateColumn)));
                const contractType = getCellValue(row.getCell(structure.contractTypeColumn));
                const contractPrepayment = parseQuantity(getCellValue(row.getCell(structure.contractPrepaymentColumn)));

                if (productName) {
                    // Объединяем название продукта с сетевидностью (например: "Гарант-Офис+ 5ОД")
                    let fullProductName = productName.trim();
                    if (network) {
                        // Убираем пробелы между числом и "ОД" для единообразия
                        const networkFormatted = network.replace(/\s+ОД/, 'ОД').trim();
                        fullProductName = `${fullProductName} ${networkFormatted}`;
                    }

                    const product: Product = {
                        id: productId ? parseInt(productId) : undefined,
                        name: fullProductName,
                        quantity: parseQuantity(months), // Берем из "Количество месяцев"
                        monthSum: monthSum.replace(/-\w{2}$/, '').trim() || '0',
                        armId: sheetItem.company.armId || '',
                        contractEndDate: contractEndDate || undefined,
                        contractType: contractType || undefined,
                        contractPrepayment: contractPrepayment || undefined,
                    };
                    sheetItem.company.products.push(product);
                    if (productName) {
                        sheetItem.company.complectName += productName + ' ';
                    }
                    if (network) {
                        sheetItem.company.complectName += network + ' ';
                    }
                }
                break;
            }
            case 3: {
                // Возможно, второй продукт
                const productId = getCellValue(row.getCell(structure.productIdColumn));
                const productName = getCellValue(row.getCell(structure.productNameColumn));
                const network = getCellValue(row.getCell(structure.networkColumn));
                const months = getCellValue(row.getCell(structure.monthsColumn)); // Количество месяцев
                const monthSum = getCellValue(row.getCell(structure.monthSumColumn)) || getCellValue(row.getCell(structure.priceColumn));
                const contractEndDate = parseDate(getCellValue(row.getCell(structure.contractEndDateColumn)));
                const contractType = getCellValue(row.getCell(structure.contractTypeColumn));
                const contractPrepayment = parseQuantity(getCellValue(row.getCell(structure.contractPrepaymentColumn)));

                if (productName && productName.length > 2 && !productName.toLowerCase().includes('complectname')) {
                    // Объединяем название продукта с сетевидностью
                    let fullProductName = productName.trim();
                    if (network) {
                        const networkFormatted = network.replace(/\s+ОД/, 'ОД').trim();
                        fullProductName = `${fullProductName} ${networkFormatted}`;
                    }

                    const product: Product = {
                        id: productId ? parseInt(productId) : undefined,
                        name: fullProductName,
                        quantity: parseQuantity(months), // Берем из "Количество месяцев"
                        monthSum: monthSum.replace(/-\w{2}$/, '').trim() || '0',
                        armId: sheetItem.company.armId || '',
                        contractEndDate: contractEndDate || undefined,
                        contractType: contractType || undefined,
                        contractPrepayment: contractPrepayment || undefined,
                    };
                    sheetItem.company.products.push(product);
                    if (productName) {
                        sheetItem.company.complectName += productName + ' ';
                    }
                    if (network) {
                        sheetItem.company.complectName += network + ' ';
                    }
                } else {
                    // Проверяем, может быть armId здесь
                    const armIdCell = row.getCell(structure.armIdColumn);
                    const armIdValue = getCellValue(armIdCell);
                    if (armIdValue && !sheetItem.company.armId) {
                        sheetItem.company.armId = extractArmId(armIdValue) || armIdValue;
                    }
                }
                break;
            }
            case 4: {
                // Возможно, третий продукт или цена
                const productId = getCellValue(row.getCell(structure.productIdColumn));
                const productName = getCellValue(row.getCell(structure.productNameColumn));
                const network = getCellValue(row.getCell(structure.networkColumn));
                const months = getCellValue(row.getCell(structure.monthsColumn)); // Количество месяцев
                const monthSum = getCellValue(row.getCell(structure.monthSumColumn)) || getCellValue(row.getCell(structure.priceColumn));
                const contractEndDate = parseDate(getCellValue(row.getCell(structure.contractEndDateColumn)));
                const contractType = getCellValue(row.getCell(structure.contractTypeColumn));
                const contractPrepayment = parseQuantity(getCellValue(row.getCell(structure.contractPrepaymentColumn)));

                if (productName && productName.length > 2 && !productName.toLowerCase().includes('price')) {
                    // Объединяем название продукта с сетевидностью
                    let fullProductName = productName.trim();
                    if (network) {
                        const networkFormatted = network.replace(/\s+ОД/, 'ОД').trim();
                        fullProductName = `${fullProductName} ${networkFormatted}`;
                    }

                    const product: Product = {
                        id: productId ? parseInt(productId) : undefined,
                        name: fullProductName,
                        quantity: parseQuantity(months), // Берем из "Количество месяцев"
                        monthSum: monthSum.replace(/-\w{2}$/, '').trim() || '0',
                        armId: sheetItem.company.armId || '',
                        contractEndDate: contractEndDate || undefined,
                        contractType: contractType || undefined,
                        contractPrepayment: contractPrepayment || undefined,
                    };
                    sheetItem.company.products.push(product);
                } else {
                    // Возможно, это цена
                    const priceValue = getCellValue(row.getCell(2)) || getCellValue(row.getCell(1));
                    if (priceValue && /[\d\s]/.test(priceValue)) {
                        sheetItem.company.price = priceValue.trim();
                    }
                }
                break;
            }
            case 5: {
                // Email
                let email = '';
                for (let col = 2; col <= 6; col++) {
                    const val = getCellValue(row.getCell(col));
                    if (val && val.includes('@')) {
                        email = val;
                        break;
                    }
                }
                sheetItem.company.email = email.trim();
                break;
            }
            case 6: {
                // complectBlocks (обычно пусто)
                const blocks = getCellValue(row.getCell(2)) || getCellValue(row.getCell(1));
                sheetItem.company.complectBlocks = blocks.trim();
                break;
            }
            case 7: {
                // Менеджер/Руководитель
                let manager = '';
                for (let col = 2; col <= 6; col++) {
                    const val = getCellValue(row.getCell(col));
                    if (val && !val.toLowerCase().includes('руководитель') && val.length > 3) {
                        manager = val;
                        break;
                    }
                }
                sheetItem.company.managerName = manager.trim();
                break;
            }
        }
    }

    // Если armId не найден, ищем во всех заголовках
    if (!sheetItem.company.armId) {
        const allText = headerRows.flat().join(' ');
        sheetItem.company.armId = extractArmId(allText);
    }

    // Если цена не найдена, ищем в других местах
    if (!sheetItem.company.price) {
        for (let rowNum = 2; rowNum <= 4; rowNum++) {
            const row = sheet.getRow(rowNum);
            for (let col = 1; col <= 15; col++) {
                const val = getCellValue(row.getCell(col));
                if (val && /[\d\s]{4,}/.test(val) && !val.includes('-') && !val.includes('@')) {
                    const numVal = val.replace(/\s/g, '');
                    if (numVal.length >= 4 && /^\d+$/.test(numVal)) {
                        sheetItem.company.price = val.trim();
                        break;
                    }
                }
            }
            if (sheetItem.company.price) break;
        }
    }

    // Определяем, с какой строки начинаются контакты
    let contactsStartRow = 8;
    for (let rowNum = 8; rowNum <= 10; rowNum++) {
        const row = sheet.getRow(rowNum);
        const firstCell = getCellValue(row.getCell(1)).toLowerCase();
        if (firstCell.includes('пользователи') || firstCell.includes('фио')) {
            contactsStartRow = rowNum + 1;
            break;
        }
    }

    // Парсим контакты начиная с определенной строки
    sheet.eachRow((row, rowNum) => {
        if (rowNum < contactsStartRow) return;

        const rowData: string[] = [];
        for (let col = 1; col <= 15; col++) {
            const val = getCellValue(row.getCell(col));
            if (val) rowData.push(val);
        }

        // Пропускаем пустые строки и заголовки
        if (rowData.length === 0) return;
        const firstCell = getCellValue(row.getCell(1)).toLowerCase();
        if (firstCell.includes('пользователи') || firstCell.includes('фио') ||
            firstCell.includes('телефон') || firstCell.includes('должность') ||
            firstCell.includes('отдел') || firstCell.includes('почта') ||
            firstCell.includes('email')) {
            return; // Пропускаем заголовки
        }

        // Определяем структуру контакта
        let position = getCellValue(row.getCell(structure.contactPositionColumn));
        let name = getCellValue(row.getCell(structure.contactNameColumn));
        let phone = getCellValue(row.getCell(structure.contactPhoneColumn));
        let email = getCellValue(row.getCell(structure.contactEmailColumn));

        // Если структура нестандартная, пытаемся определить по содержимому
        if (!name || name.length < 3) {
            // Ищем имя в других колонках (обычно это длинная строка без цифр и @)
            for (let col = 1; col <= 10; col++) {
                const val = getCellValue(row.getCell(col));
                if (val && val.length > 5 && !val.includes('@') && !/[\d\s\-\(\)\+]{7,}/.test(val) &&
                    !val.toLowerCase().includes('должность') && !val.toLowerCase().includes('отдел') &&
                    !val.toLowerCase().includes('пользователи') && !val.toLowerCase().includes('фио')) {
                    // Проверяем, что это похоже на имя (содержит пробелы и буквы)
                    if (/[А-Яа-яЁё]/.test(val) && val.split(' ').length >= 2) {
                        name = val;
                        break;
                    }
                }
            }
        }

        if (!phone) {
            // Ищем телефон (паттерн с цифрами, дефисами, скобками)
            for (let col = 1; col <= 10; col++) {
                const val = getCellValue(row.getCell(col));
                if (val && /[\d\s\-\(\)\+]{7,}/.test(val) && !val.includes('@') &&
                    !val.toLowerCase().includes('доб') && !val.toLowerCase().includes('тел')) {
                    phone = val;
                    break;
                }
            }
        }

        // Проверяем следующую колонку после телефона на дополнительный номер
        if (phone) {
            const phoneCol = structure.contactPhoneColumn;
            const nextColVal = getCellValue(row.getCell(phoneCol + 1));
            if (nextColVal && /[\d\s\-\(\)\+]{7,}/.test(nextColVal) && !nextColVal.includes('@')) {
                phone = phone + '#' + nextColVal;
            }
        }

        if (!email) {
            // Ищем email
            for (let col = 1; col <= 10; col++) {
                const val = getCellValue(row.getCell(col));
                if (val && val.includes('@')) {
                    email = val;
                    break;
                }
            }
        }

        if (!position) {
            // Ищем должность в других колонках
            for (let col = 1; col <= 10; col++) {
                const val = getCellValue(row.getCell(col));
                if (val && (val.toLowerCase().includes('директор') ||
                    val.toLowerCase().includes('бухгалтер') ||
                    val.toLowerCase().includes('юрист') ||
                    val.toLowerCase().includes('менеджер') ||
                    val.toLowerCase().includes('администратор'))) {
                    position = val;
                    break;
                }
            }
        }

        // Если есть хотя бы имя, телефон или email - это контакт
        if (name && name.length > 2) {
            const contact: Contact = {
                name: name.trim(),
                position: position.trim(),
                phone: phone.trim(),
                email: email.trim(),
                payinfo: '',
            };

            sheetItem.contacts.push(contact);
            sheetItem.company.contacts.push(contact);
        }
    });

    sheetItem.sheetData = allSheetText;
    sheetItem.company.complectName = sheetItem.company.complectName.trim();

    // Если products пустые, но есть complectName, создаем продукт
    if (sheetItem.company.products.length === 0 && sheetItem.company.complectName) {
        const complectParts = sheetItem.company.complectName.split(/\s+/).filter(p => p && p.length > 2);
        const quantity = parseQuantity(sheetItem.company.complectName);
        const monthSum = sheetItem.company.price.replace(/[^\d\s]/g, '').trim() || '0';

        complectParts.forEach(part => {
            if (part.length > 2 && !/^\d+$/.test(part) && !part.toLowerCase().includes('од')) {
                sheetItem.company.products.push({
                    name: part,
                    quantity: quantity || 1,
                    monthSum: monthSum,
                    armId: sheetItem.company.armId || '',
                });
            }
        });
    }

    return sheetItem;
}

// Главная функция
export async function parseExcelToJson(
    inputFilePath: string,
    outputFilePath: string,
): Promise<void> {
    console.log(`Чтение файла: ${inputFilePath}`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputFilePath);

    const sheets = workbook.worksheets;
    console.log(`Найдено листов: ${sheets.length}`);

    const results: SheetData[] = [];
    const batchSize = 10; // Обрабатываем по 10 листов за раз для стабильности

    for (let i = 0; i < sheets.length; i += batchSize) {
        const batch = sheets.slice(i, i + batchSize);
        console.log(`Обработка листов ${i + 1}-${Math.min(i + batchSize, sheets.length)} из ${sheets.length}`);

        const batchPromises = batch.map((sheet, index) =>
            parseSheet(sheet, i + index).catch((error) => {
                console.error(`Ошибка при обработке листа ${i + index + 1} (${sheet.name}):`, error.message);
                // Возвращаем пустую структуру при ошибке
                return {
                    sheetId: i + index,
                    companyName: sheet.name,
                    sheetData: '',
                    contacts: [],
                    company: {
                        clientName: '',
                        address: '',
                        complectName: '',
                        price: '',
                        email: '',
                        complectBlocks: '',
                        managerName: '',
                        armId: '',
                        contacts: [],
                        products: [],
                    },
                } as SheetData;
            })
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    // Сохраняем результат
    console.log(`Сохранение результата в: ${outputFilePath}`);
    fs.writeFileSync(outputFilePath, JSON.stringify(results, null, 4), 'utf-8');

    console.log(`Готово! Обработано ${results.length} листов.`);
}

// Если запускается напрямую
if (require.main === module) {
    const inputFile = path.join(__dirname, '../../../uploads/NEW_мигрция_sheets_1.xlsx');
    const outputFile = path.join(__dirname, '../../../uploads/gsr.last-migrate.json');

    parseExcelToJson(inputFile, outputFile)
        .then(() => {
            console.log('Парсинг завершен успешно!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Ошибка при парсинге:', error);
            process.exit(1);
        });
}
