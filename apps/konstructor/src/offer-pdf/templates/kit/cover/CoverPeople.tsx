import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import {
    managerContactsLine,
    recipientInnLine,
} from '../lib/cover-details.util';
import type { OfferCoverContent } from '../lib/cover.util';
import type { BrandCoverStyles } from './brand-cover.styles';
import { CoverPerson } from './CoverPerson';

export interface CoverPeopleProps {
    cover: OfferCoverContent;
    styles: Pick<
        BrandCoverStyles,
        'bottom' | 'person' | 'label' | 'value' | 'detail'
    >;
}

/** Низ титульника: для кого (с ИНН) и кто подготовил (с контактами) */
export const CoverPeople: FC<CoverPeopleProps> = ({ cover, styles }) => (
    <View style={styles.bottom}>
        {cover.recipient ? (
            <CoverPerson
                label="Подготовлено для"
                value={cover.recipient}
                detail={recipientInnLine(cover)}
                styles={styles}
            />
        ) : null}
        {cover.manager ? (
            <CoverPerson
                label="Подготовил"
                value={cover.manager.name}
                detail={managerContactsLine(cover)}
                styles={styles}
            />
        ) : null}
    </View>
);
