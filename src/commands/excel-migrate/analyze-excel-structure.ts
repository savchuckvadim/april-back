import * as ExcelJS from 'exceljs';
import * as path from 'path';

async function analyzeExcelStructure(filePath: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets = workbook.worksheets;
    console.log(`\n=== АНАЛИЗ СТРУКТУРЫ EXCEL ФАЙЛА ===\n`);
    console.log(`Всего листов: ${sheets.length}\n`);

    // Анализируем первые 3 листа детально
    const sheetsToAnalyze = Math.min(3, sheets.length);

    for (let i = 0; i < sheetsToAnalyze; i++) {
        const sheet = sheets[i];
        console.log(`\n--- ЛИСТ ${i + 1}: "${sheet.name}" ---`);
        console.log(`Всего строк: ${sheet.rowCount}`);
        console.log(`Всего колонок: ${sheet.columnCount}\n`);

        // Анализируем первые 15 строк
        const rowsToAnalyze = Math.min(15, sheet.rowCount);

        for (let rowNum = 1; rowNum <= rowsToAnalyze; rowNum++) {
            const row = sheet.getRow(rowNum);
            const rowData: any[] = [];

            // Собираем данные из первых 10 колонок
            for (let col = 1; col <= 10; col++) {
                const cell = row.getCell(col);
                let value = '';

                if (cell.value !== null && cell.value !== undefined) {
                    if (typeof cell.value === 'object' && 'richText' in cell.value) {
                        value = cell.value.richText.map((rt: any) => rt.text || '').join('');
                    } else if (cell.value instanceof Date) {
                        value = cell.value.toISOString();
                    } else {
                        value = String(cell.value);
                    }
                }

                if (value.trim()) {
                    rowData.push(`[${col}]:${value.substring(0, 50)}`);
                }
            }

            if (rowData.length > 0) {
                console.log(`Строка ${rowNum}: ${rowData.join(' | ')}`);
            }
        }
    }
}

// Запуск
const filePath = path.join(__dirname, '../../../uploads/NEW_мигрция_sheets_1.xlsx');
analyzeExcelStructure(filePath)
    .then(() => {
        console.log('\n=== АНАЛИЗ ЗАВЕРШЕН ===\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Ошибка:', error);
        process.exit(1);
    });

