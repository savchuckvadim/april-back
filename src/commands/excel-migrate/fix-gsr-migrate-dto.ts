import * as fs from 'fs';
import * as path from 'path';

/**
 * Скрипт для исправления данных в gsr.nigrate-dto.ts
 * 1. Если есть две одинаковые цены и одно название содержит "LT", то у товара с "LT" цена = "0"
 * 2. Убирает "ОД" из названий товаров, содержащих "LT"
 */

const filePath = path.join(__dirname, 'gsr.nigrate-dto.ts');

function normalizePrice(price: string): string {
    return price.replace(/\s+/g, '').trim();
}

function processFile() {
    console.log('Чтение файла...');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Находим все блоки с products
    const productsRegex = /products:\s*\[([\s\S]*?)\]/g;
    let match;
    let changesCount = 0;

    while ((match = productsRegex.exec(content)) !== null) {
        const productsBlock = match[1];
        const fullMatch = match[0];
        const matchIndex = match.index;

        // Парсим продукты из блока
        const productRegex = /\{\s*([^}]+)\}/g;
        const products: Array<{ full: string; name: string; monthSum: string; startIndex: number; endIndex: number }> = [];
        let productMatch;

        while ((productMatch = productRegex.exec(productsBlock)) !== null) {
            const productText = productMatch[1];
            const nameMatch = productText.match(/name:\s*"([^"]+)"/);
            const monthSumMatch = productText.match(/monthSum:\s*"([^"]+)"/);

            if (nameMatch && monthSumMatch) {
                products.push({
                    full: productMatch[0],
                    name: nameMatch[1],
                    monthSum: monthSumMatch[1],
                    startIndex: productMatch.index,
                    endIndex: productMatch.index + productMatch[0].length,
                });
            }
        }

        if (products.length < 2) continue;

        // Проверяем, есть ли одинаковые цены
        const priceGroups: { [key: string]: typeof products } = {};
        products.forEach(p => {
            const normalizedPrice = normalizePrice(p.monthSum);
            if (!priceGroups[normalizedPrice]) {
                priceGroups[normalizedPrice] = [];
            }
            priceGroups[normalizedPrice].push(p);
        });

        // Обрабатываем группы с одинаковыми ценами
        for (const [price, group] of Object.entries(priceGroups)) {
            if (group.length >= 2 && price !== '0') {
                // Проверяем, есть ли товар с LT
                const ltProducts = group.filter(p => /LT/i.test(p.name));
                const nonLtProducts = group.filter(p => !/LT/i.test(p.name));

                if (ltProducts.length > 0 && nonLtProducts.length > 0) {
                    // У товаров с LT устанавливаем цену "0"
                    ltProducts.forEach(ltProduct => {
                        const oldPrice = ltProduct.monthSum;
                        const newPrice = '"0"';
                        const productText = ltProduct.full;
                        const newProductText = productText.replace(
                            new RegExp(`monthSum:\\s*"${oldPrice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
                            `monthSum: ${newPrice}`
                        );

                        // Заменяем в content
                        const absoluteIndex = matchIndex + match[0].indexOf(productsBlock) + ltProduct.startIndex;
                        const oldFull = ltProduct.full;
                        const newFull = oldFull.replace(ltProduct.full, newProductText);

                        // Находим точную позицию для замены
                        const beforeProducts = content.substring(0, matchIndex);
                        const inProducts = content.substring(matchIndex, matchIndex + fullMatch.length);
                        const afterProducts = content.substring(matchIndex + fullMatch.length);

                        const productIndexInBlock = inProducts.indexOf(ltProduct.full, inProducts.indexOf('products:'));
                        if (productIndexInBlock !== -1) {
                            const beforeProduct = inProducts.substring(0, productIndexInBlock);
                            const afterProduct = inProducts.substring(productIndexInBlock + oldFull.length);
                            const newInProducts = beforeProduct + newProductText + afterProduct;
                            content = beforeProducts + newInProducts + afterProducts;
                            changesCount++;
                            console.log(`Исправлена цена для товара "${ltProduct.name}": "${oldPrice}" -> "0"`);
                        }
                    });
                }
            }
        }

        // Убираем "ОД" из названий товаров с LT
        products.forEach(product => {
            if (/LT/i.test(product.name) && /ОД/i.test(product.name)) {
                const oldName = product.name;
                const newName = oldName.replace(/\s*\d*\s*ОД\s*/gi, ' ').trim() + ' ';

                if (oldName !== newName) {
                    const productText = product.full;
                    const newProductText = productText.replace(
                        new RegExp(`name:\\s*"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
                        `name: "${newName}"`
                    );

                    const beforeProducts = content.substring(0, matchIndex);
                    const inProducts = content.substring(matchIndex, matchIndex + fullMatch.length);
                    const afterProducts = content.substring(matchIndex + fullMatch.length);

                    const productIndexInBlock = inProducts.indexOf(product.full, inProducts.indexOf('products:'));
                    if (productIndexInBlock !== -1) {
                        const beforeProduct = inProducts.substring(0, productIndexInBlock);
                        const afterProduct = inProducts.substring(productIndexInBlock + product.full.length);
                        const newInProducts = beforeProduct + newProductText + afterProduct;
                        content = beforeProducts + newInProducts + afterProducts;
                        changesCount++;
                        console.log(`Исправлено название: "${oldName}" -> "${newName}"`);
                    }
                }
            }
        });
    }

    if (changesCount > 0) {
        console.log(`\nВсего изменений: ${changesCount}`);
        console.log('Сохранение файла...');
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('Готово!');
    } else {
        console.log('Изменений не требуется.');
    }
}

// Более простой подход - читаем файл как модуль и обрабатываем данные
async function processDataDirectly() {
    console.log('Загрузка модуля...');
    const modulePath = path.join(__dirname, 'gsr.nigrate-dto.ts');

    // Читаем файл как текст
    let content = fs.readFileSync(modulePath, 'utf-8');
    let changesCount = 0;

    // Обрабатываем каждую компанию
    const companyRegex = /\{\s*id:\s*"[^"]+",[\s\S]*?products:\s*\[([\s\S]*?)\]/g;
    let companyMatch;

    while ((companyMatch = companyRegex.exec(content)) !== null) {
        const productsBlock = companyMatch[1];
        const fullCompanyBlock = companyMatch[0];
        const companyIndex = companyMatch.index;

        // Находим все продукты
        const productMatches: Array<{ full: string; name: string; monthSum: string; hasLT: boolean; index: number }> = [];
        const productRegex = /\{\s*([^}]+)\}/g;
        let productMatch;
        let productIndex = 0;

        while ((productMatch = productRegex.exec(productsBlock)) !== null) {
            const productText = productMatch[1];
            const nameMatch = productText.match(/name:\s*"([^"]+)"/);
            const monthSumMatch = productText.match(/monthSum:\s*"([^"]+)"/);

            if (nameMatch && monthSumMatch) {
                const name = nameMatch[1];
                const monthSum = monthSumMatch[1];
                const hasLT = /LT/i.test(name);

                productMatches.push({
                    full: productMatch[0],
                    name,
                    monthSum,
                    hasLT,
                    index: productMatch.index,
                });
            }
            productIndex++;
        }

        if (productMatches.length < 2) continue;

        // Группируем по ценам (нормализованным)
        const priceMap = new Map<string, typeof productMatches>();
        productMatches.forEach(p => {
            const normalizedPrice = normalizePrice(p.monthSum);
            if (!priceMap.has(normalizedPrice)) {
                priceMap.set(normalizedPrice, []);
            }
            priceMap.get(normalizedPrice)!.push(p);
        });

        // Обрабатываем группы с одинаковыми ценами
        for (const [normalizedPrice, group] of priceMap.entries()) {
            if (group.length >= 2 && normalizedPrice !== '0') {
                const ltProducts = group.filter(p => p.hasLT);
                const nonLtProducts = group.filter(p => !p.hasLT);

                if (ltProducts.length > 0 && nonLtProducts.length > 0) {
                    // Устанавливаем цену "0" для товаров с LT
                    ltProducts.forEach(ltProduct => {
                        const oldText = ltProduct.full;
                        const newText = oldText.replace(
                            /monthSum:\s*"[^"]+"/,
                            'monthSum: "0"'
                        );

                        if (oldText !== newText) {
                            // Находим позицию в content
                            const blockStart = companyIndex + fullCompanyBlock.indexOf(productsBlock);
                            const productStart = blockStart + ltProduct.index;
                            const before = content.substring(0, productStart);
                            const after = content.substring(productStart + oldText.length);
                            content = before + newText + after;
                            changesCount++;
                            console.log(`Цена исправлена: "${ltProduct.name}" -> "0"`);
                        }
                    });
                }
            }
        }

        // Убираем "ОД" из названий товаров с LT
        productMatches.forEach(product => {
            if (product.hasLT && /ОД/i.test(product.name)) {
                const oldName = product.name;
                const newName = oldName.replace(/\s*\d*\s*ОД\s*/gi, ' ').trim() + ' ';

                if (oldName !== newName) {
                    const oldText = product.full;
                    const newText = oldText.replace(
                        new RegExp(`name:\\s*"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
                        `name: "${newName}"`
                    );

                    if (oldText !== newText) {
                        const blockStart = companyIndex + fullCompanyBlock.indexOf(productsBlock);
                        const productStart = blockStart + product.index;
                        const before = content.substring(0, productStart);
                        const after = content.substring(productStart + oldText.length);
                        content = before + newText + after;
                        changesCount++;
                        console.log(`Название исправлено: "${oldName}" -> "${newName}"`);
                    }
                }
            }
        });
    }

    if (changesCount > 0) {
        console.log(`\nВсего изменений: ${changesCount}`);
        fs.writeFileSync(modulePath, content, 'utf-8');
        console.log('Файл сохранен!');
    } else {
        console.log('Изменений не требуется.');
    }
}

// Запуск
processDataDirectly().catch(console.error);

