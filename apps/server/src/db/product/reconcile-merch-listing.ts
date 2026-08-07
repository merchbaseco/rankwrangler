import { sql } from 'drizzle-orm';

interface SqlColumn {
    name: string;
}

export const reconcileMerchListing = (column: SqlColumn) => {
    const incoming = excludedColumn(column);

    return sql`CASE
        WHEN ${column} IS TRUE OR ${incoming} IS TRUE THEN true
        WHEN ${incoming} IS NULL THEN ${column}
        ELSE false
    END`;
};

export const reconcileSellerBullet = (bulletColumn: SqlColumn, classificationColumn: SqlColumn) => {
    const incomingBullet = excludedColumn(bulletColumn);
    const incomingClassification = excludedColumn(classificationColumn);

    return sql`CASE
        WHEN ${incomingClassification} IS NULL
            OR (${classificationColumn} IS TRUE AND ${incomingClassification} IS FALSE)
            THEN ${bulletColumn}
        ELSE ${incomingBullet}
    END`;
};

const excludedColumn = (column: SqlColumn) => sql.raw(`excluded.${column.name}`);
