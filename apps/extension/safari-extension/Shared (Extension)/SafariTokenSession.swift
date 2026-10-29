import Foundation

protocol OAuthTokenClient: Sendable {
    func refresh(_ token: OAuthToken) async throws -> OAuthToken
    func revoke(_ token: OAuthToken) async throws
}

extension OAuthClient: OAuthTokenClient {}

actor SafariTokenSession {
    static let shared = SafariTokenSession()
    private let store: any OAuthTokenStore
    private let client: any OAuthTokenClient
    private var generation = 0
    private var signingIn = false
    private var refreshTask: Task<OAuthToken, Error>?

    init(store: any OAuthTokenStore = KeychainTokenStore(), client: any OAuthTokenClient = OAuthClient.shared) {
        self.store = store
        self.client = client
    }

    func beginSignIn() async throws -> Int {
        guard !signingIn else { throw OAuthError.busy }
        generation += 1
        let expected = generation
        refreshTask?.cancel()
        refreshTask = nil
        signingIn = true
        do {
            if let stored = try store.read(), stored.hasTrustedContext {
                try await client.revoke(stored)
            }
            guard expected == generation else { throw OAuthError.invalidCallback }
            try store.delete()
            return expected
        } catch {
            if expected == generation { signingIn = false }
            throw error
        }
    }

    func finishSignIn(_ token: OAuthToken, generation expected: Int) async throws {
        guard expected == generation else {
            try await client.revoke(token)
            throw OAuthError.invalidCallback
        }
        do {
            try store.save(token)
            signingIn = false
        } catch {
            signingIn = false
            try await client.revoke(token)
            throw error
        }
    }

    func cancelSignIn(generation expected: Int) {
        if expected == generation { signingIn = false }
    }

    func getAccessToken() async throws -> String? {
        if signingIn { return nil }
        guard let stored = try store.read() else { return nil }
        guard stored.hasTrustedContext else {
            try store.delete()
            return nil
        }
        if stored.expiresAt > Date().addingTimeInterval(60) { return stored.accessToken }
        guard stored.refreshToken != nil else {
            try store.delete()
            return nil
        }
        let expected = generation
        if let refreshTask {
            do {
                let token = try await refreshTask.value
                guard expected == generation else { return nil }
                return token.accessToken
            } catch OAuthError.reauthenticationRequired {
                return nil
            } catch {
                if expected != generation { return nil }
                throw error
            }
        }
        let task = Task { try await client.refresh(stored) }
        refreshTask = task
        defer { if expected == generation { refreshTask = nil } }
        do {
            let token = try await task.value
            guard expected == generation else {
                try await client.revoke(token)
                return nil
            }
            try store.save(token)
            return token.accessToken
        } catch OAuthError.reauthenticationRequired {
            if expected == generation { try store.delete() }
            return nil
        } catch {
            if expected != generation { return nil }
            throw error
        }
    }

    func signOut() async throws {
        generation += 1
        signingIn = false
        refreshTask?.cancel()
        refreshTask = nil
        let stored = try store.read()
        try store.delete()
        if let stored, stored.hasTrustedContext { try await client.revoke(stored) }
    }
}
