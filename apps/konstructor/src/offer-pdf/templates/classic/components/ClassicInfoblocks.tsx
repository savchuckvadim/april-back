import type { FC, ReactElement } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../../../offer/type/offer-settings.type';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { sx } from '../../shared/style.util';
import { classicStyles } from '../classic.styles';
import { CLASSIC_THEME } from '../classic.theme';
import { chunk } from '../classic.util';

const { colors, sizes } = CLASSIC_THEME;

const styles = StyleSheet.create({
    complectName: {
        fontSize: sizes.lg,
        fontWeight: 'bold',
        color: colors.accent,
        marginBottom: 4,
    },
    groupTitle: {
        fontSize: sizes.lg,
        fontWeight: 'bold',
        color: colors.accent,
        marginTop: 10,
        marginBottom: 4,
    },
    item: { marginBottom: 3 },
    itemName: { fontSize: sizes.base },
    itemDesc: { fontSize: sizes.sm, color: colors.muted, textAlign: 'justify' },
    table: {
        marginTop: 6,
        borderWidth: 0.75,
        borderColor: colors.tableBorder,
    },
    tr: { flexDirection: 'row' },
    trGroup: { backgroundColor: colors.shade },
    td: {
        paddingVertical: 3,
        paddingHorizontal: 4,
        borderRightWidth: 0.5,
        borderRightColor: colors.tableBorder,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.tableBorder,
    },
    tdLast: { borderRightWidth: 0 },
    tdHalf: { width: '50%' },
    tdName: { width: '34%' },
    tdDesc: { width: '66%' },
    tdFull: { width: '100%' },
    tdText: { fontSize: sizes.sm },
    tdDescText: { fontSize: sizes.sm, color: colors.muted },
    groupCell: { fontSize: sizes.sm, fontWeight: 'bold', color: colors.accent },
});

/**
 * Описание по режиму. Если нужного размера нет — берём ближайший, чтобы
 * «много» на блоке без длинного текста не превращалось в пустоту.
 */
export const pickInfoblockDescription = (
    infoblock: IInfblockRenderData,
    mode: DocumentFieldDescriptionMode,
): string | null => {
    if (mode === DocumentFieldDescriptionMode.NO) return null;
    const { smallDescription, mediumDescription, bigDescription } = infoblock;
    const order =
        mode === DocumentFieldDescriptionMode.BIG
            ? [bigDescription, mediumDescription, smallDescription]
            : mode === DocumentFieldDescriptionMode.MEDIUM
              ? [mediumDescription, smallDescription, bigDescription]
              : [smallDescription, mediumDescription, bigDescription];
    const found = order.find(text => text?.trim().length);
    return found ? found.trim() : null;
};

const groupsWithItems = (
    groups: IInfblockGroupsRenderData[],
): IInfblockGroupsRenderData[] =>
    groups.filter(group => group.infoblocks.length > 0);

const ListItem: FC<{
    infoblock: IInfblockRenderData;
    mode: DocumentFieldDescriptionMode;
}> = ({ infoblock, mode }) => {
    const description = pickInfoblockDescription(infoblock, mode);
    return (
        <View style={styles.item} wrap={false}>
            <Text
                style={sx(
                    styles.itemName,
                    Boolean(description) && classicStyles.bold,
                )}
            >
                {infoblock.name}
            </Text>
            {description ? (
                <Text style={styles.itemDesc}>{description}</Text>
            ) : null}
        </View>
    );
};

/**
 * Заголовок группы держим вместе с первым пунктом: minPresenceAhead
 * у заголовка не спасал, и «Судебная практика» оставалась одна внизу
 * страницы, а её пункты уезжали на следующую.
 */
const ListView: FC<{
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
}> = ({ groups, mode }) => (
    <>
        {groups.map(group => {
            const [first, ...rest] = group.infoblocks;
            return (
                <View key={group.groupsName}>
                    <View wrap={false}>
                        <Text style={styles.groupTitle}>
                            {group.groupsName}
                        </Text>
                        <ListItem infoblock={first} mode={mode} />
                    </View>
                    {rest.map((infoblock, index) => (
                        <ListItem
                            key={index}
                            infoblock={infoblock}
                            mode={mode}
                        />
                    ))}
                </View>
            );
        })}
    </>
);

const NamesRows: FC<{ items: IInfblockRenderData[] }> = ({ items }) => (
    <>
        {chunk(items, 2).map((pair, index) => (
            <View key={index} style={styles.tr} wrap={false}>
                <View style={[styles.td, styles.tdHalf]}>
                    <Text style={styles.tdText}>{pair[0].name}</Text>
                </View>
                <View style={[styles.td, styles.tdHalf, styles.tdLast]}>
                    <Text style={styles.tdText}>{pair[1]?.name ?? ''}</Text>
                </View>
            </View>
        ))}
    </>
);

const DescriptionRows: FC<{
    items: IInfblockRenderData[];
    mode: DocumentFieldDescriptionMode;
}> = ({ items, mode }) => (
    <>
        {items.map((infoblock, index) => (
            <View key={index} style={styles.tr} wrap={false}>
                <View style={[styles.td, styles.tdName]}>
                    <Text style={[styles.tdText, classicStyles.bold]}>
                        {infoblock.name}
                    </Text>
                </View>
                <View style={[styles.td, styles.tdDesc, styles.tdLast]}>
                    <Text style={styles.tdDescText}>
                        {pickInfoblockDescription(infoblock, mode) ?? ''}
                    </Text>
                </View>
            </View>
        ))}
    </>
);

const TableView: FC<{
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    withGroups: boolean;
}> = ({ groups, mode, withGroups }) => {
    const withDescription = mode !== DocumentFieldDescriptionMode.NO;
    const renderRows = (items: IInfblockRenderData[]): ReactElement =>
        withDescription ? (
            <DescriptionRows items={items} mode={mode} />
        ) : (
            <NamesRows items={items} />
        );

    return (
        <View style={styles.table}>
            {withGroups
                ? groups.map(group => {
                      // Шапка группы — вместе с первой строкой (с двумя,
                      // когда названия идут в две колонки), чтобы не
                      // оставалась одна внизу страницы.
                      const firstCount = withDescription ? 1 : 2;
                      return (
                          <View key={group.groupsName}>
                              <View wrap={false}>
                                  <View style={[styles.tr, styles.trGroup]}>
                                      <View
                                          style={[
                                              styles.td,
                                              styles.tdFull,
                                              styles.tdLast,
                                          ]}
                                      >
                                          <Text style={styles.groupCell}>
                                              {group.groupsName}
                                          </Text>
                                      </View>
                                  </View>
                                  {renderRows(
                                      group.infoblocks.slice(0, firstCount),
                                  )}
                              </View>
                              {renderRows(group.infoblocks.slice(firstCount))}
                          </View>
                      );
                  })
                : renderRows(groups.flatMap(group => group.infoblocks))}
        </View>
    );
};

/** Информационное наполнение комплекта: список или таблица, описание по режиму. */
export const ClassicInfoblocks: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { data, settings } = model;
    const groups = groupsWithItems(data.infoblocksByGroups ?? []);
    if (groups.length === 0) return null;

    return (
        <View style={classicStyles.section}>
            <Text style={classicStyles.h2} minPresenceAhead={80}>
                Информационное наполнение
            </Text>
            {data.GeneralProductName ? (
                <Text style={styles.complectName}>
                    {data.GeneralProductName}
                </Text>
            ) : null}
            {settings.viewMode === DocumentFieldViewMode.LIST ? (
                <ListView groups={groups} mode={settings.descriptionMode} />
            ) : (
                <TableView
                    groups={groups}
                    mode={settings.descriptionMode}
                    withGroups={
                        settings.viewMode ===
                        DocumentFieldViewMode.TABLE_WITH_GROUP
                    }
                />
            )}
        </View>
    );
};
