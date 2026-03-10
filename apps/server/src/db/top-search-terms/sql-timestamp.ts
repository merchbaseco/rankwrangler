export const formatSqlTimestamp = (value: Date) => {
    return value.toISOString().replace('T', ' ').replace('Z', '');
};
