import type { FC } from 'react';
import { IInfblockRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { DescriptionRow } from './DescriptionRow';
import { NamesRows } from './NamesRows';

export interface TableRowsProps {
    items: IInfblockRenderData[];
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
}

/** Строки таблицы: без описаний — названия в две колонки, иначе «название | описание». */
export const TableRows: FC<TableRowsProps> = ({ items, mode, theme }) =>
    mode === DocumentFieldDescriptionMode.NO ? (
        <NamesRows items={items} theme={theme} />
    ) : (
        <>
            {items.map((infoblock, index) => (
                <DescriptionRow
                    key={index}
                    infoblock={infoblock}
                    mode={mode}
                    theme={theme}
                />
            ))}
        </>
    );
