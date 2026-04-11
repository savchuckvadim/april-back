export enum EBxNamespace {
    CRM = 'crm',
    TASKS = 'tasks',
    LISTS = 'lists',
    CRM_ITEM = 'crm.item',
    WITHOUT_NAMESPACE = 'without.namespace',
    DISK = 'disk',
    CATALOG = 'catalog',
    RPA = 'rpa',
    IM = 'im',
    USER = 'user',
    BIZPROC = 'bizproc',
}

export enum EBxMethod {
    ADD = 'add',
    SET = 'set',
    UPDATE = 'update',
    GET = 'get',

    USER_FIELD_LIST = 'userfield.list',
    USER_FIELD_GET = 'userfield.get',
    USER_FIELD_ADD = 'userfield.add',
    USER_FIELD_UPDATE = 'userfield.update',
    USER_FIELD_DELETE = 'userfield.delete',
    LIST = 'list',
    DELETE = 'delete',

    CONTACT_ITEMS_SET = 'contact.items.set',
    CONTACT_ADD = 'contact.add',
    CONTACT_ITEMS_GET = 'contact.items.get',
    CONTACT_ITEMS_DELETE = 'contact.items.delete',

    FIELD_GET = 'field.get',
    FIELDS = 'fields',
    GET_BY_ENTITY_TYPE_ID = 'getByEntityTypeId',
    GET_LIST = 'getlist',

    // crm.status.entity.*
    ENTITY_ITEMS = 'entity.items',
    ENTITY_TYPES = 'entity.types',

    // RPA stage methods (rpa.stage.*)
    STAGE_ADD = 'stage.add',
    STAGE_UPDATE = 'stage.update',
    STAGE_LIST_FOR_TYPE = 'stage.listForType',

    // Lists field methods (lists.field.*)
    FIELD_ADD = 'field.add',
    FIELD_UPDATE = 'field.update',
    FIELD_DELETE = 'field.delete',
    FIELD_GET_ALL = 'field.get',

    // CRM enum
    ENUM_OWNER_TYPE = 'enum.ownertype',

    // Tasks
    FILES_ATTACH = 'files.attach',
    DELEGATE = 'delegate',
    COUNTERS_GET = 'counters.get',
    START = 'start',
    PAUSE = 'pause',
    DEFER = 'defer',
    COMPLETE = 'complete',
    RENEW = 'renew',
    APPROVE = 'approve',
    DISAPPROVE = 'disapprove',
    STARTWATCH = 'startwatch',
    STOPWATCH = 'stopwatch',
    FAVORITE_ADD = 'favorite.add',
    FAVORITE_REMOVE = 'favorite.remove',
    GET_FIELDS = 'getFields',
    GET_ACCESS = 'getaccess',
    HISTORY_LIST = 'history.list',
    MUTE = 'mute',
    UNMUTE = 'unmute',
    SEARCH = 'search',
    CURRENT = 'current',
    DIALOG_GET = 'dialog.get',

    // Disk
    MOVE_TO = 'moveto',
    RESTORE = 'restore',
    GET_TYPES = 'gettypes',
    GET_CHILDREN = 'getchildren',
    GET_VERSIONS = 'getVersions',
    MARK_DELETED = 'markdeleted',
    COPY_TO = 'copyto',
    GET_EXTERNAL_LINK = 'getExternalLink',
    GET_EXTERNAL_LINK_LOWER = 'getexternallink',
    RENAME = 'rename',
    UPLOAD_FILE = 'uploadfile',
    UPLOAD_VERSION = 'uploadversion',
    RESTORE_FROM_VERSION = 'restoreFromVersion',
    ADD_FOLDER = 'addfolder',
    ADD_SUBFOLDER = 'addsubfolder',
    SHARE_TO_USER = 'sharetouser',
    DELETE_TREE = 'deletetree',
    PIN = 'pin',
}
