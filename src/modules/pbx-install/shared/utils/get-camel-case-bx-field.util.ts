export function getCamelBxFieldIdCase(str: string) {
    console.log('getCamelBxFieldIdCase str', str);
    // Удаляем только префикс UF_CRM_ но сохраняем цифры и добавляем ufCrm
    const cleanStr = str.replace(/^UF_CRM_/, '');

    // Разбиваем по подчеркиваниям и преобразуем в camelCase
    const camelCase = cleanStr
        .toLowerCase()
        .split('_')
        .map((word, index) => {
            // Первое слово остается в нижнем регистре, остальные с заглавной буквы
            return index === 0
                ? word
                : word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join('');

    // Добавляем ufCrm в начало
    return 'ufCrm' + camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}
