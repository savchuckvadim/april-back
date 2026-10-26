import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { ZPR_FIELD_DEF_BY_CODE } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { buildCrmLinkValue } from '@lib/portal-lib/pbx/const-smart-registry';
import { zprSetUf } from '../../../zpr-flow/services/zpr-element-fields.builder';
import { dealFailStageId } from '../../../shared/deal-stage';
import { IJoinSatellites } from './join-satellites.reader';
import { JoinOp } from './join-to-main.plan';

type BxRow = Record<string, unknown>;

export interface IJoinSatellitesPlan {
    ops: JoinOp[];
    xoClosed: number;
    presentationsRelinked: number;
    zprRelinked: number;
    warnings: string[];
}

/**
 * Спутники сделки-дубля при «Присоединить сюда» (предложение 22.10,
 * «да» владельца 26.10.2026) — чистая функция:
 *  - открытые сделки ХО дубля закрываются в fail-стадию («Не состоялся»),
 *    как при передаче работы;
 *  - сделки презентаций, открытые и закрытые, переходят к основной
 *    (`to_base_sales`): презентация — факт работы с клиентом и считается
 *    в основной;
 *  - открытые ЗПР переходят к основной: наша связь и родитель-сделка.
 * KPI и история не трогаются — это запись того, кто что делал.
 */
export function buildJoinSatellitesPlan(
    portal: PortalModel,
    satellites: IJoinSatellites,
    mainId: number,
): IJoinSatellitesPlan {
    const ops: JoinOp[] = [];
    const warnings: string[] = [];
    let xoClosed = 0;
    let presentationsRelinked = 0;

    const xoFail = dealFailStageId(portal, PbxDealCategoryCodeEnum.sales_xo);
    const linkField = portal.getEntityFieldByCode(
        'deal',
        PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
    );
    const linkKey = linkField ? portal.getFieldBitrixId(linkField) : null;

    for (const deal of satellites.deals) {
        if (deal.categoryCode === PbxDealCategoryCodeEnum.sales_xo) {
            if (deal.closed) continue;
            if (!xoFail) {
                warnings.push(
                    `Fail-стадия ХО не сопоставлена — сделка ХО ${deal.id} не закрыта`,
                );
                continue;
            }
            ops.push({
                kind: 'dealUpdate',
                dealId: deal.id,
                fields: { STAGE_ID: xoFail },
            });
            xoClosed += 1;
            continue;
        }
        if (!linkKey) continue;
        // Формат — голый id, как у ХО и сделки-дубля (DealFlowService).
        ops.push({
            kind: 'dealUpdate',
            dealId: deal.id,
            fields: { [linkKey]: String(mainId) },
        });
        presentationsRelinked += 1;
    }

    const { zpr } = satellites;
    let zprRelinked = 0;
    if (zpr) {
        for (const itemId of satellites.zprItemIds) {
            const fields: BxRow = { parentId2: mainId };
            zprSetUf(
                zpr,
                fields,
                'ZPR_BASE_DEAL',
                buildCrmLinkValue(
                    ZPR_FIELD_DEF_BY_CODE.ZPR_BASE_DEAL,
                    'D',
                    mainId,
                ),
            );
            ops.push({
                kind: 'itemUpdate',
                entityTypeId: zpr.entityTypeId,
                itemId,
                fields,
            });
            zprRelinked += 1;
        }
    }

    const summary = [
        xoClosed ? `сделок ХО закрыто: ${xoClosed}` : '',
        presentationsRelinked
            ? `презентаций перенесено: ${presentationsRelinked}`
            : '',
        zprRelinked ? `ЗПР перенесено: ${zprRelinked}` : '',
    ].filter(Boolean);
    if (summary.length) {
        ops.push({
            kind: 'timeline',
            dealId: mainId,
            key: `jm_tl_sat_${mainId}`,
            comment: `🔗 Спутники сделки-дубля: ${summary.join('; ')}.`,
        });
    }

    return {
        ops,
        xoClosed,
        presentationsRelinked,
        zprRelinked,
        warnings: [...satellites.warnings, ...warnings],
    };
}
