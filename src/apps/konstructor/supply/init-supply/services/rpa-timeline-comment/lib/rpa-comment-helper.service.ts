// export type ListItem = string | { title: string; children: ListItem[] };
import { IconHelper } from './icon-helper.service';
export enum RpaIconEnum {
    ARM = 'arm',
    PROVIDER = 'provider',
    CLIENT = 'client',
    CONSULTING = 'consulting',
    COMPLECT = 'complect',
    INFOBLOCK = 'infoblock',
    CONTRACT = 'contract',
    TOTAL_SUM = 'total_sum',
}
export class RpaCommentHelper {
    public static getBoldString(string: string): string {
        return `<b>${string}</b>`;
    }

    public static getList(
        list: string[],
        withMarginTop: boolean = false,
    ): string {
        return `<ul style="margin-top: ${withMarginTop ? '10px' : '0px'}">${list.map(item => (item ? `<li>${item}</li>` : '')).join('')}</ul>`;
    }

    public static getListWithBold(
        list: { head: string; value: string }[],
        withMarginTop: boolean = false,
    ): string {
        return `<ul style="margin-top: ${withMarginTop ? '10px' : '0px'}">${list.map(item => `<li>${this.getBoldString(item.head)} ${item.value}</li>`).join('')}</ul>`;
    }

    public static getHeaderWithIcon(
        iconType: RpaIconEnum,
        text: string,
    ): string {
        let icon = IconHelper.getArmIcon();
        if (iconType === RpaIconEnum.ARM) {
            icon = IconHelper.getArmIcon();
        } else if (iconType === RpaIconEnum.PROVIDER) {
            icon = IconHelper.getProviderIcon();
        } else if (iconType === RpaIconEnum.CLIENT) {
            icon = IconHelper.getClientIcon();
        } else if (iconType === RpaIconEnum.CONSULTING) {
            icon = IconHelper.getConsultingIcon();
        } else if (iconType === RpaIconEnum.COMPLECT) {
            icon = IconHelper.getComplectIcon();
        } else if (iconType === RpaIconEnum.INFOBLOCK) {
            icon = IconHelper.getInfoblockIcon();
        } else if (iconType === RpaIconEnum.CONTRACT) {
            icon = IconHelper.getContractIcon();
        } else if (iconType === RpaIconEnum.TOTAL_SUM) {
            icon = IconHelper.getTotalSumIcon();
        }
        const color = IconHelper.getColor();
        const style = `color: ${color};`;
        return this.getBoldString(
            `<div style="${style} display: flex; align-items: center; gap: 5px;">${icon} ${text}</div>`,
        );
    }

    // public static getListWithNested(list: ListItem[]): string {
    //     return `<ul>${list.map(item => {
    //         if (typeof item === 'string') {
    //             return `<li>${item}</li>`;
    //         }
    //         const nested = this.getListWithNested(item.children);
    //         return `<li>${this.getBoldString(item.title)}${nested}</li>`;
    //     }).join('')}</ul>`;
    // }
}
