use super::Oid;

pub fn type_name(typeid: Oid) -> Option<&'static str> {
    Some(match typeid {
        000702 => "abstime",
        001023 => "abstime[]",
        001033 => "aclitem",
        001034 => "aclitem[]",
        002276 => "any",
        002277 => "anyarray",
        002283 => "anyelement",
        003500 => "anyenum",
        002776 => "anynonarray",
        003831 => "anyrange",
        000020 => "bigint",
        001016 => "bigint[]",
        001560 => "bit",
        001561 => "bit[]",
        001562 => "bit varying",
        001563 => "bit varying[]",
        000016 => "boolean",
        001000 => "boolean[]",
        000603 => "box",
        001020 => "box[]",
        000017 => "bytea",
        001001 => "bytea[]",
        000018 => "char",
        001002 => "char[]",
        001042 => "character",
        001014 => "character[]",
        001043 => "character varying",
        001015 => "character varying[]",
        000029 => "cid",
        001012 => "cid[]",
        000650 => "cidr",
        000651 => "cidr[]",
        000718 => "circle",
        000719 => "circle[]",
        002275 => "cstring",
        001263 => "cstring[]",
        001082 => "date",
        001182 => "date[]",
        003912 => "daterange",
        003913 => "daterange[]",
        000701 => "double precision",
        001022 => "double precision[]",
        003838 => "event_trigger",
        003115 => "fdw_handler",
        003642 => "gtsvector",
        003644 => "gtsvector[]",
        000869 => "inet",
        001041 => "inet[]",
        011535 => "information_schema.cardinal_number",
        011537 => "information_schema.character_data",
        011538 => "information_schema.sql_identifier",
        011542 => "information_schema.time_stamp",
        011543 => "information_schema.yes_or_no",
        000022 => "int2vector",
        001006 => "int2vector[]",
        003904 => "int4range",
        003905 => "int4range[]",
        003926 => "int8range",
        003927 => "int8range[]",
        000023 => "integer",
        001007 => "integer[]",
        002281 => "internal",
        001186 => "interval",
        001187 => "interval[]",
        000114 => "json",
        000199 => "json[]",
        002280 => "language_handler",
        000628 => "line",
        000629 => "line[]",
        000601 => "lseg",
        001018 => "lseg[]",
        000829 => "macaddr",
        001040 => "macaddr[]",
        000790 => "money",
        000791 => "money[]",
        000019 => "name",
        001003 => "name[]",
        001700 => "numeric",
        001231 => "numeric[]",
        003906 => "numrange",
        003907 => "numrange[]",
        000026 => "oid",
        001028 => "oid[]",
        000030 => "oidvector",
        001013 => "oidvector[]",
        002282 => "opaque",
        000602 => "path",
        001019 => "path[]",
        000194 => "pg_node_tree",
        000600 => "point",
        001017 => "point[]",
        000604 => "polygon",
        001027 => "polygon[]",
        000700 => "real",
        001021 => "real[]",
        002249 => "record",
        002287 => "record[]",
        001790 => "refcursor",
        002201 => "refcursor[]",
        002205 => "regclass",
        002210 => "regclass[]",
        003734 => "regconfig",
        003735 => "regconfig[]",
        003769 => "regdictionary",
        003770 => "regdictionary[]",
        002203 => "regoper",
        002208 => "regoper[]",
        002204 => "regoperator",
        002209 => "regoperator[]",
        000024 => "regproc",
        001008 => "regproc[]",
        002202 => "regprocedure",
        002207 => "regprocedure[]",
        002206 => "regtype",
        002211 => "regtype[]",
        000703 => "reltime",
        001024 => "reltime[]",
        000021 => "smallint",
        001005 => "smallint[]",
        000210 => "smgr",
        000025 => "text",
        001009 => "text[]",
        000027 => "tid",
        001010 => "tid[]",
        001114 => "timestamp without time zone",
        001115 => "timestamp without time zone[]",
        001184 => "timestamp with time zone",
        001185 => "timestamp with time zone[]",
        001083 => "time without time zone",
        001183 => "time without time zone[]",
        001266 => "time with time zone",
        001270 => "time with time zone[]",
        000704 => "tinterval",
        001025 => "tinterval[]",
        002279 => "trigger",
        003615 => "tsquery",
        003645 => "tsquery[]",
        003908 => "tsrange",
        003909 => "tsrange[]",
        003910 => "tstzrange",
        003911 => "tstzrange[]",
        003614 => "tsvector",
        003643 => "tsvector[]",
        002970 => "txid_snapshot",
        002949 => "txid_snapshot[]",
        000705 => "unknown",
        002950 => "uuid",
        002951 => "uuid[]",
        002278 => "void",
        000028 => "xid",
        001011 => "xid[]",
        000142 => "xml",
        000143 => "xml[]",
        _ => return None
    })
}

pub fn type_isnum(typeid: Oid) -> bool {
    match typeid {
          0020 // bigint
        | 0021 // smallint
        | 0023 // integer
        | 0026 // oid
        | 0700 // real
        | 0701 // double precision
        | 0790 // money
        | 1700 // numeric
        => true,
        _ => false
    }
}


