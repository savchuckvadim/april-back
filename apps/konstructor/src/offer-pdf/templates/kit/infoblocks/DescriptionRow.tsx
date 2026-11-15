import type { FC } from 'react';
import { IInfblockRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import {
    isLongDescription,
    pickInfoblockDescription,
} from './infoblock-description.util';
import { TABLE_DESC_CHARS } from './infoblocks.layout';
import { LongDescriptionRow } from './LongDescriptionRow';
import { ShortDescriptionRow } from './ShortDescriptionRow';

export interface DescriptionRowProps {
    infoblock: IInfblockRenderData;
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Своя метка разрыва для длинной строки; у первой строки группы — нет */
    gate?: boolean;
}

/** Строка «название | описание»: короткая целиком, длинная — с разрывом. */
export const DescriptionRow: FC<DescriptionRowProps> = ({
    infoblock,
    mode,
    theme,
    gate = true,
}) => {
    const description = pickInfoblockDescription(infoblock, mode) ?? '';

    return isLongDescription(description, TABLE_DESC_CHARS) ? (
        <LongDescriptionRow
            name={infoblock.name}
            description={description}
            theme={theme}
            gate={gate}
        />
    ) : (
        <ShortDescriptionRow
            name={infoblock.name}
            description={description}
            theme={theme}
        />
    );
};
