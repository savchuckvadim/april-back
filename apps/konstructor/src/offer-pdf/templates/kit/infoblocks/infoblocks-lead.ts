import { createElement, Fragment, type ReactNode } from 'react';

/**
 * Блок перед первой группой наполнения, который остаётся с ней и с её первым
 * пунктом на одном листе: например, заголовок комплекта в разделе по комплектам.
 */
export interface InfoblocksLead {
    node: ReactNode;
    /** Высота блока по оценке, пт: входит в место под начало длинного пункта */
    height: number;
}

/**
 * Блоки перед первой группой по порядку в один: высоты складываются, узлы идут
 * друг за другом. Нет ни одного — undefined. Нужен, когда перед группой стоят
 * плашка набора для сравнения и заголовок комплекта.
 */
export const joinLeads = (
    ...leads: Array<InfoblocksLead | undefined>
): InfoblocksLead | undefined => {
    const present = leads.filter(
        (lead): lead is InfoblocksLead => lead !== undefined,
    );
    if (present.length <= 1) return present[0];
    return {
        node: createElement(Fragment, null, ...present.map(lead => lead.node)),
        height: present.reduce((sum, lead) => sum + lead.height, 0),
    };
};
