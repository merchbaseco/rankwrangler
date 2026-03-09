import { beforeEach, describe, expect, it, mock } from 'bun:test';

const createdLicense = {
    id: 'license-123',
    key: 'new-license-key',
    email: 'person@example.com',
    createdAt: new Date('2026-03-09T19:24:29.000Z'),
    revokedAt: null,
    lastUsedAt: null,
    usageToday: 0,
    usageCount: 0,
    usageLimit: 100000,
    lastResetAt: new Date('2026-03-09T19:24:29.000Z'),
};

const operationOrder: string[] = [];
const deleteWhereMock = mock(async () => {
    operationOrder.push('delete');
});
const deleteMock = mock(() => ({
    where: deleteWhereMock,
}));
const insertReturningMock = mock(async () => {
    operationOrder.push('insert');
    return [createdLicense];
});
const insertValuesMock = mock(() => ({
    returning: insertReturningMock,
}));
const insertMock = mock(() => ({
    values: insertValuesMock,
}));
const transactionMock = mock(async callback =>
    await callback({
        delete: deleteMock,
        insert: insertMock,
    })
);

mock.module('@/db/index.js', () => ({
    db: {
        transaction: transactionMock,
    },
}));

describe('createLicense', () => {
    beforeEach(() => {
        operationOrder.length = 0;
        deleteWhereMock.mockClear();
        deleteMock.mockClear();
        insertReturningMock.mockClear();
        insertValuesMock.mockClear();
        insertMock.mockClear();
        transactionMock.mockClear();
    });

    it('replaces existing licenses for the email before inserting the new key', async () => {
        const { createLicense } = await import('./create-license.js');

        const result = await createLicense(
            createdLicense.key,
            createdLicense.email,
            createdLicense.usageLimit
        );

        expect(result).toEqual(createdLicense);
        expect(transactionMock.mock.calls).toHaveLength(1);
        expect(deleteMock.mock.calls).toHaveLength(1);
        expect(deleteWhereMock.mock.calls).toHaveLength(1);
        expect(insertMock.mock.calls).toHaveLength(1);
        expect(insertValuesMock.mock.calls).toHaveLength(1);
        expect(insertValuesMock.mock.calls[0]?.[0]).toEqual({
            key: createdLicense.key,
            email: createdLicense.email,
            usageLimit: createdLicense.usageLimit,
            usageCount: 0,
            usageToday: 0,
            lastResetAt: expect.any(Date),
        });
        expect(insertReturningMock.mock.calls).toHaveLength(1);
        expect(operationOrder).toEqual(['delete', 'insert']);
    });
});
