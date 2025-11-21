export type NonEmptyArray<Item> = readonly [Item, ...Item[]];

type FieldItemBase = { code: string;[key: string]: unknown };

export type PbxFieldDefinition<ItemKey extends string> = {
    code: string;
} & {
    [Key in ItemKey]: readonly FieldItemBase[];
};

type FieldWithItemsInternal<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = Extract<
    Fields[number],
    {
        [Key in ItemKey]: NonEmptyArray<FieldItemBase>;
    }
>;

export type FieldWithItems<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = FieldWithItemsInternal<Fields, ItemKey>;

type FieldItemsMap<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = {
        [Field in Fields[number]as Field[ItemKey] extends NonEmptyArray<FieldItemBase>
        ? Field['code']
        : never]: Field[ItemKey];
    };

export type FieldWithItemsCode<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = keyof FieldItemsMap<Fields, ItemKey> & string;

export type FieldItemCode<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
    Code extends FieldWithItemsCode<Fields, ItemKey>,
> = FieldItemsMap<Fields, ItemKey>[Code] extends readonly (infer Item)[]
    ? Item extends {
        code: infer ItemCode extends string;
    }
    ? ItemCode
    : never
    : never;

export type FieldItemCodesMap<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = {
        [Code in FieldWithItemsCode<Fields, ItemKey>]: FieldItemCode<
            Fields,
            ItemKey,
            Code
        >;
    };

export type FieldItemsEnumRecord<
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
> = {
        [Code in FieldWithItemsCode<Fields, ItemKey>]: Record<
            FieldItemCode<Fields, ItemKey, Code>,
            FieldItemCode<Fields, ItemKey, Code>
        >;
    };

export const createEnumObject = <Value extends string | number>(
    values: readonly Value[],
): Record<Value, Value> =>
    values.reduce((acc, value) => {
        acc[value] = value;
        return acc;
    }, {} as Record<Value, Value>);

export const createFieldItemsEnum = <
    Fields extends readonly PbxFieldDefinition<ItemKey>[],
    ItemKey extends keyof Fields[number] & string,
>(
    fields: Fields,
    itemKey: ItemKey,
): FieldItemsEnumRecord<Fields, ItemKey> => {
    const result = {} as Record<string, Record<string | number, string | number>>;

    fields.forEach(field => {
        const items = field[itemKey] as readonly FieldItemBase[];

        if (!items.length) {
            return;
        }

        result[field.code] = Object.freeze(
            createEnumObject(
                items.map(item => item.code) as readonly (string | number)[],
            ),
        );
    });

    return result as FieldItemsEnumRecord<Fields, ItemKey>;
};

