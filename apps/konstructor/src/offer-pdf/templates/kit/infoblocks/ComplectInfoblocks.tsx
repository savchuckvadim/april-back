import type { FC } from 'react';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ComplectHead } from './ComplectHead';
import { estimateComplectHeadHeight } from './complect-head.util';
import type { PrintedComplectSection } from './complect-sections.util';
import { InfoblocksView } from './InfoblocksView';

export interface ComplectInfoblocksProps {
    section: PrintedComplectSection;
    settings: Pick<OfferPdfSettings, 'descriptionMode' | 'viewMode'>;
    theme: OfferPdfTheme;
}

/**
 * Наполнение одного комплекта: заголовок (название и поставка) и группы в
 * том же виде и режиме описаний, что выбраны настройками PDF. Заголовок
 * идёт перед первой группой в связке с её первым пунктом. Комплект без
 * названия и поставки печатается без заголовка.
 */
export const ComplectInfoblocks: FC<ComplectInfoblocksProps> = ({
    section,
    settings,
    theme,
}) => {
    const { title, supplyName, groups } = section;
    const lead =
        title || supplyName
            ? {
                  node: (
                      <ComplectHead
                          title={title}
                          supplyName={supplyName}
                          theme={theme}
                      />
                  ),
                  height: estimateComplectHeadHeight(theme, title, supplyName),
              }
            : undefined;

    return (
        <InfoblocksView
            groups={groups}
            settings={settings}
            theme={theme}
            lead={lead}
        />
    );
};
