import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(__dirname, 'gsr.nigrate-dto.ts');

function normalizePrice(price: string): string {
    return price.replace(/\s+/g, '').trim();
}

function fixGsrMigrateDto() {
    console.log('Чтение файла...');
    let content = fs.readFileSync(filePath, 'utf-8');
    let changesCount = 0;

    // Разбиваем на компании
    const companies = content.split(/(?=\s*\{[\s\S]*?id:\s*"[^"]+")/);

    companies.forEach((companyBlock, companyIndex) => {
        if (!companyBlock.includes('products:')) return;

        // Находим блок products
        const productsMatch = companyBlock.match(/products:\s*\[([\s\S]*?)\]/);
        if (!productsMatch) return;

        const productsBlock = productsMatch[1];
        const productsBlockStart = companyBlock.indexOf('products:');
        const productsBlockEnd = productsBlockStart + productsMatch[0].length;

        // Парсим все продукты
        const productRegex = /\{\s*([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
        const products: Array<{
            full: string;
            name: string;
            monthSum: string;
            hasLT: boolean;
            startPos: number;
            endPos: number;
        }> = [];

        let productMatch;
        while ((productMatch = productRegex.exec(productsBlock)) !== null) {
            const productText = productMatch[1];
            const nameMatch = productText.match(/name:\s*"([^"]+)"/);
            const monthSumMatch = productText.match(/monthSum:\s*"([^"]+)"/);

            if (nameMatch && monthSumMatch) {
                const name = nameMatch[1];
                const monthSum = monthSumMatch[1];
                const hasLT = /LT/i.test(name);

                products.push({
                    full: productMatch[0],
                    name,
                    monthSum,
                    hasLT,
                    startPos: productMatch.index,
                    endPos: productMatch.index + productMatch[0].length,
                });
            }
        }

        if (products.length < 2) return;

        // Группируем по нормализованным ценам
        const priceGroups = new Map<string, typeof products>();
        products.forEach(p => {
            const normalizedPrice = normalizePrice(p.monthSum);
            if (!priceGroups.has(normalizedPrice)) {
                priceGroups.set(normalizedPrice, []);
            }
            priceGroups.get(normalizedPrice)!.push(p);
        });

        // Обрабатываем группы с одинаковыми ценами (>= 2 товара)
        for (const [normalizedPrice, group] of priceGroups.entries()) {
            if (group.length >= 2 && normalizedPrice !== '0') {
                const ltProducts = group.filter(p => p.hasLT);
                const nonLtProducts = group.filter(p => !p.hasLT);

                // Если есть и LT и не-LT товары с одинаковой ценой
                if (ltProducts.length > 0 && nonLtProducts.length > 0) {
                    // Устанавливаем цену "0" для товаров с LT
                    ltProducts.forEach(ltProduct => {
                        const oldText = ltProduct.full;
                        const newText = oldText.replace(
                            /monthSum:\s*"[^"]+"/,
                            'monthSum: "0"'
                        );

                        if (oldText !== newText) {
                            // Находим абсолютную позицию в content
                            const companyStart = content.indexOf(companyBlock);
                            const productsStart = companyStart + companyBlock.indexOf('products:');
                            const productStart = productsStart + productsMatch[0].indexOf(productsBlock) + ltProduct.startPos;

                            const before = content.substring(0, productStart);
                            const after = content.substring(productStart + oldText.length);
                            content = before + newText + after;

                            // Обновляем позиции в companyBlock
                            const offset = newText.length - oldText.length;
                            companyBlock = content.substring(companyStart, companyStart + companyBlock.length + offset);

                            changesCount++;
                            console.log(`✓ Цена исправлена: "${ltProduct.name}" -> "0"`);
                        }
                    });
                }
            }
        }

        // Убираем "ОД" из названий товаров с LT
        products.forEach(product => {
            if (product.hasLT && /ОД/i.test(product.name)) {
                const oldName = product.name;
                // Убираем паттерн типа "5ОД", "10ОД", " 5 ОД" и т.д.
                const newName = oldName.replace(/\s*\d+\s*ОД\s*/gi, ' ').trim() + ' ';

                if (oldName !== newName) {
                    const oldText = product.full;
                    const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const newText = oldText.replace(
                        new RegExp(`name:\\s*"${escapedOldName}"`),
                        `name: "${newName}"`
                    );

                    if (oldText !== newText) {
                        const companyStart = content.indexOf(companyBlock);
                        const productsStart = companyStart + companyBlock.indexOf('products:');
                        const productStart = productsStart + productsMatch[0].indexOf(productsBlock) + product.startPos;

                        const before = content.substring(0, productStart);
                        const after = content.substring(productStart + oldText.length);
                        content = before + newText + after;

                        // Обновляем companyBlock
                        const offset = newText.length - oldText.length;
                        companyBlock = content.substring(companyStart, companyStart + companyBlock.length + offset);

                        changesCount++;
                        console.log(`✓ Название исправлено: "${oldName}" -> "${newName}"`);
                    }
                }
            }
        });
    });

    if (changesCount > 0) {
        console.log(`\nВсего изменений: ${changesCount}`);
        console.log('Сохранение файла...');
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('✓ Файл сохранен!');
    } else {
        console.log('Изменений не требуется.');
    }
}

// Запуск
fixGsrMigrateDto();

