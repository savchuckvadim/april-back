import type { FC } from 'react';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ComplectHead } from './ComplectHead';
import { estimateComplectHeadHeight } from './complect-head.util';
import { joinLeads, type InfoblocksLead } from './infoblocks-lead';
import { InfoblocksView } from './InfoblocksView';
import type { PrintedComplectSection } from './printed-section.util';

export interface ComplectInfoblocksProps {
    section: PrintedComplectSection;
    settings: Pick<OfferPdfSettings, 'descriptionMode' | 'viewMode'>;
    theme: OfferPdfTheme;
    /**
     * Блок перед заголовком комплекта (плашка набора для сравнения): держится
     * вместе с ним и с первой группой
     */
    before?: InfoblocksLead;
}

/**
 * Наполнение одного комплекта: заголовок (название и поставка) и группы в
 * том же виде и режиме описаний, что выбраны настройками PDF. Заголовок
 * идёт перед первой группой в связке с её первым пунктом. Комплект без
 * названия и поставки печатается без заголовка. Блок перед комплектом
 * (`before`) встаёт в ту же связку.
 */
export const ComplectInfoblocks: FC<ComplectInfoblocksProps> = ({
    section,
    settings,
    theme,
    before,
}) => {
    const { title, supplyName, groups } = section;
    const underSet = before !== undefined;
    const head: InfoblocksLead | undefined =
        title || supplyName
            ? {
                  node: (
                      <ComplectHead
                          title={title}
                          supplyName={supplyName}
                          underSet={underSet}
                          theme={theme}
                      />
                  ),
                  height: estimateComplectHeadHeight(
                      theme,
                      title,
                      supplyName,
                      underSet,
                  ),
              }
            : undefined;

    return (
        <InfoblocksView
            groups={groups}
            settings={settings}
            theme={theme}
            lead={joinLeads(before, head)}
        />
    );
};
