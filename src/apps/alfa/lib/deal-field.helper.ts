// import { dealData } from "../bx-data/bx-data";
// import { AlfaBxField } from "../type/bx-deal-field.type";
// import { DealFieldsTemplate } from "../type/deal-field.type";

// export function updateDealDataFromBitrixResponse(bitrixResponse: AlfaBxField[]): DealFieldsTemplate {
//     // Создаем глубокую копию dealData
//     const updatedDealData = JSON.parse(JSON.stringify(dealData));

//     // Рекурсивная функция для обновления list в объекте
//     function updateLists(obj: any, path: string = '') {
//         if (!obj || typeof obj !== 'object') return;

//         // Если это объект с полем type === 'enumeration', обновляем его list
//         if (obj.type === 'enumeration' && obj.bitrixId) {
//             // console.log(`Found enumeration field at path: ${path}`);
//             const bitrixField = bitrixResponse.find(field => field.bitrixId === obj.bitrixId);
//             if (bitrixField?.list) {
//                 obj.list = bitrixField.list;
//             }
//         }

//         // Рекурсивно обходим все свойства объекта
//         Object.entries(obj).forEach(([key, value]) => {
//             if (value && typeof value === 'object') {
//                 const newPath = path ? `${path}.${key}` : key;
//                 updateLists(value, newPath);
//             }
//         });
//     }

//     // Запускаем рекурсивное обновление
//     updateLists(updatedDealData);

//     return updatedDealData;
// }
// export function getBxFieldsIdsForSelect(data: DealFieldsTemplate): string[] {
//     // после обновления полей собираем bitrixId филдов чтобы потом взять сделку с Этими полями
//     const bxFieldsIds = ['ID', 'NAME'] as string[]

//     // Рекурсивная функция для обхода объекта
//     function traverseObject(obj: Record<string, any>) {
//         if (!obj || typeof obj !== 'object') return;

//         // Проверяем, является ли текущий объект полем с bitrixId
//         if ('bitrixId' in obj && typeof obj.bitrixId === 'string') {
//             bxFieldsIds.push(obj.bitrixId);
//         }

//         // Рекурсивно обходим все свойства объекта
//         Object.entries(obj).forEach(([key, value]) => {
//             // Пропускаем массив list, так как нам не нужны bitrixId из него
//             if (key === 'list') return;

//             if (value && typeof value === 'object') {
//                 traverseObject(value);
//             }
//         });
//     }

//     // Запускаем рекурсивный обход
//     traverseObject(data);

//     return bxFieldsIds;
// }

// // interface DealValueListItem {
// //     name: string;
// //     bitrixId: string;
// //     code?: string;
// // }
// // export interface DealValue {
// //     code: string;
// //     bitrixId: string;
// //     name: string;
// //     value: string | number | boolean | string[] | number[];
// //     listItem?: DealValueListItem | DealValueListItem[];
// // }

// //  function getDealValues(deal: IBXDeal, fieldsTemplate: typeof dealData): DealValue[] {
// //     const values: DealValue[] = [];

// //     // Рекурсивная функция для обхода объекта dealData
// //     function traverseObject(obj: Record<string, any>, path: string = '') {
// //         if (!obj || typeof obj !== 'object') return;

// //         // Если это объект с bitrixId и у него есть значение в сделке
// //         if ('bitrixId' in obj && typeof obj.bitrixId === 'string') {
// //             const dealValue = deal[obj.bitrixId];

// //             // Проверяем, что значение существует и не является пустым массивом
// //             if (dealValue !== undefined && dealValue !== null && !(Array.isArray(dealValue) && dealValue.length === 0)) {
// //                 // Проверяем, что у нас есть все необходимые данные
// //                 if (!obj.name) {
// //                     console.log(`Missing name for field with bitrixId: ${obj.bitrixId}`);
// //                     return;
// //                 }

// //                 const result: DealValue = {
// //                     code: obj.code || '',
// //                     bitrixId: obj.bitrixId,
// //                     name: obj.name,
// //                     value: dealValue
// //                 };

// //                 // Если это enumeration, ищем соответствующий элемент в списке
// //                 if (obj.type === 'enumeration' && obj.list) {

// //                     if (!obj.multiple) {
// //                         const listItem = obj.list.find(item => item.bitrixId === dealValue);

// //                         if (listItem) {
// //                             result.value = listItem.name;
// //                             result.listItem = {
// //                                 name: listItem.name,
// //                                 // code: listItem.code,
// //                                 bitrixId: listItem.bitrixId
// //                             };
// //                         }
// //                     } else {
// //                         if (Array.isArray(dealValue)) {

// //                             const listItems = obj.list.filter((item: DealValueListItem) => (dealValue as number[]).includes(Number(item.bitrixId)));
// //                             console.log('listItems')
// //                             console.log(listItems)
// //                             if (listItems.length > 0) {
// //                                 result.value = listItems.map(item => item.name).join(', ');
// //                                 result.listItem = listItems.map(item => ({
// //                                     name: item.name,
// //                                     // code: item.code,
// //                                     bitrixId: item.bitrixId
// //                                 }));
// //                             }
// //                             console.log('result.listItem')
// //                             console.log(result.listItem)
// //                             console.log('result')
// //                             console.log(result)
// //                         }
// //                     }
// //                     // } else {
// //                     //     // console.log(`No matching list item found for enumeration field: ${obj.bitrixId}, value: ${dealValue}`);
// //                     // }
// //                 }

// //                 // Проверяем, что у нас есть все необходимые данные перед добавлением
// //                 if (result.bitrixId && result.name && result.value) {
// //                     values.push(result);
// //                 } else {
// //                     // console.log('Skipping field due to missing required data:', {
// //                     //     bitrixId: result.bitrixId,
// //                     //     name: result.name,
// //                     //     value: result.value,
// //                     //     path
// //                     // });
// //                 }
// //             }
// //         }

// //         // Рекурсивно обходим все свойства объекта
// //         Object.entries(obj).forEach(([key, value]) => {
// //             if (value && typeof value === 'object') {
// //                 const newPath = path ? `${path}.${key}` : key;
// //                 traverseObject(value, newPath);
// //             }
// //         });
// //     }

// //     // Запускаем рекурсивный обход
// //     traverseObject(fieldsTemplate);

// //     return values;
// // }