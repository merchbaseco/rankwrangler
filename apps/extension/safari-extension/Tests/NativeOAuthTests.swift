import Foundation

private enum TestFailure: Error { case failed(String) }
private func check(_ value: Bool, _ message: String) throws {
    if !value { throw TestFailure.failed(message) }
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var respond: ((URLRequest) -> (Int, [String: String], Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let responder = Self.respond, let url = request.url else { fatalError("Missing test responder") }
        let (status, headers, data) = responder(request)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private final class MemoryStore: OAuthTokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var token: OAuthToken?
    init(_ token: OAuthToken?) { self.token = token }
    func read() -> OAuthToken? { lock.withLock { token } }
    func save(_ token: OAuthToken) { lock.withLock { self.token = token } }
    func delete() { lock.withLock { token = nil } }
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    func increment() { lock.withLock { value += 1 } }
    func read() -> Int { lock.withLock { value } }
}

private actor DelayedRefreshClient: OAuthTokenClient {
    private var pending: CheckedContinuation<OAuthToken, Never>?
    private var started: CheckedContinuation<Void, Never>?
    private var revoked: [String] = []

    func refresh(_ token: OAuthToken) async throws -> OAuthToken {
        await withCheckedContinuation { continuation in
            pending = continuation
            started?.resume()
            started = nil
        }
    }

    func waitForRefresh() async {
        if pending != nil { return }
        await withCheckedContinuation { started = $0 }
    }

    func complete(_ token: OAuthToken) {
        pending?.resume(returning: token)
        pending = nil
    }

    func revoke(_ token: OAuthToken) async throws { revoked.append(token.refreshToken!) }
    func revokedTokens() -> [String] { revoked }
}

@main struct NativeOAuthTests {
    static func main() async throws {
        let configuration = try makeConfiguration()
        let callback = configuration.redirectURI.absoluteString
        try check(OAuthCallback(url: URL(string: callback + "?code=one&state=two")!, expected: configuration.redirectURI)?.code == "one", "Valid callback rejected")
        for value in [
            callback + "?code=one&state=two&state=three",
            callback + "?code=one&code=two&state=three",
            callback + "?code=&state=two",
            callback + "?code=one&state=two&error=access_denied",
            callback + "?code=one&state=two#fragment",
            callback.replacingOccurrences(of: "https:", with: "http:") + "?code=one&state=two",
            callback.replacingOccurrences(of: "rankwrangler.merchbase.co", with: "evil.example") + "?code=one&state=two",
            callback.replacingOccurrences(of: "/oauth/", with: "/wrong/") + "?code=one&state=two",
            callback.replacingOccurrences(of: ".co/", with: ".co:444/") + "?code=one&state=two",
        ] {
            try check(OAuthCallback(url: URL(string: value)!, expected: configuration.redirectURI) == nil, "Unsafe callback accepted")
        }
        try check(OAuthConfiguration(message: ["issuer": "https://evil.example", "resource": configuration.resource.absoluteString, "redirectURI": callback]) == nil, "Untrusted issuer accepted")
        let pkce = try PKCE.randomVerifier()
        try check(pkce.verifier.count >= 43 && pkce.challenge.count == 43 && !pkce.state.isEmpty, "PKCE generation failed")
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [StubProtocol.self]
        let client = OAuthClient(session: URLSession(configuration: sessionConfiguration))
        let calls = Counter()
        StubProtocol.respond = { request in
            calls.increment()
            let path = request.url!.path
            if path == "/" {
                return (401, ["WWW-Authenticate": "Bearer resource_metadata=\"https://rankwrangler-api.merchbase.co/.well-known/resource\""], Data())
            }
            if path == "/.well-known/resource" {
                return json(["resource": configuration.resource.absoluteString, "authorization_servers": [configuration.issuer.absoluteString]])
            }
            if path == "/.well-known/oauth-authorization-server" {
                return json([
                    "issuer": configuration.issuer.absoluteString,
                    "authorization_endpoint": endpoint("authorization"), "token_endpoint": endpoint("token"),
                    "registration_endpoint": endpoint("registration"), "revocation_endpoint": endpoint("revoke"),
                    "grant_types_supported": ["authorization_code", "refresh_token"],
                    "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"],
                ])
            }
            if path.hasSuffix("/registration") {
                let body = try! JSONSerialization.jsonObject(with: requestBody(request)) as! [String: Any]
                precondition(body["token_endpoint_auth_method"] as? String == "none")
                precondition(body["redirect_uris"] as? [String] == [callback])
                return json(["client_id": "public-safari-client"], status: 201)
            }
            fatalError("Unexpected discovery request")
        }
        let registered = try await client.register(configuration: configuration)
        try check(registered.clientId == "public-safari-client" && calls.read() == 4, "Discovery or registration failed")
        let refreshCalls = Counter()
        StubProtocol.respond = { request in
            precondition(request.url!.absoluteString == endpoint("token"))
            let body = String(data: requestBody(request), encoding: .utf8) ?? ""
            let fields = URLComponents(string: "?" + body)?.queryItems ?? []
            precondition(fields.first(where: { $0.name == "resource" })?.value == configuration.resource.absoluteString)
            precondition(fields.first(where: { $0.name == "client_id" })?.value == "public-safari-client")
            refreshCalls.increment()
            Thread.sleep(forTimeInterval: 0.05)
            return json(["access_token": "oauth:renewed-opaque", "refresh_token": "renewed-refresh", "token_type": "bearer", "expires_in": 300, "resource": configuration.resource.absoluteString])
        }
        let stored = try OAuthToken(response: TokenResponse(accessToken: "oauth:expired", refreshToken: "refresh", expiresIn: 1, tokenType: "bearer", resource: nil), client: registered)
        let store = MemoryStore(stored)
        let manager = SafariTokenSession(store: store, client: client)
        let values = try await withThrowingTaskGroup(of: String?.self) { group in
            for _ in 0..<5 { group.addTask { try await manager.getAccessToken() } }
            var values: [String?] = []
            for try await value in group { values.append(value) }
            return values
        }
        try check(values == Array(repeating: "oauth:renewed-opaque", count: 5), "Concurrent renewal failed")
        try check(refreshCalls.read() == 1, "Refresh was not serialized")
        try check(store.read()?.refreshToken == "renewed-refresh", "Renewed credential was not stored")
        StubProtocol.respond = { request in
            precondition(request.url!.absoluteString == endpoint("revoke"))
            return (200, [:], Data())
        }
        try await manager.signOut()
        try check(store.read() == nil, "Sign-out retained credentials")
        let invalidStore = MemoryStore(stored)
        let invalidManager = SafariTokenSession(store: invalidStore, client: client)
        StubProtocol.respond = { _ in (400, [:], Data()) }
        let invalidResult = try await invalidManager.getAccessToken()
        try check(invalidResult == nil && invalidStore.read() == nil, "Invalid refresh did not clear credentials")
        let offlineStore = MemoryStore(stored)
        let offlineManager = SafariTokenSession(store: offlineStore, client: client)
        StubProtocol.respond = { _ in (503, [:], Data()) }
        do {
            _ = try await offlineManager.getAccessToken()
            throw TestFailure.failed("Dependency outage returned a credential")
        } catch OAuthError.unavailable {}
        try check(offlineStore.read() != nil, "Dependency outage discarded renewable credentials")
        StubProtocol.respond = { request in
            precondition(request.url!.absoluteString == endpoint("revoke"))
            return (200, [:], Data())
        }
        let staleStore = MemoryStore(nil)
        let staleManager = SafariTokenSession(store: staleStore, client: client)
        let previous = try await staleManager.beginSignIn()
        try await staleManager.signOut()
        let current = try await staleManager.beginSignIn()
        do {
            try await staleManager.finishSignIn(stored, generation: previous)
            throw TestFailure.failed("Stale sign-in survived logout")
        } catch OAuthError.invalidCallback {}
        do {
            _ = try await staleManager.beginSignIn()
            throw TestFailure.failed("Stale completion released the new sign-in lock")
        } catch OAuthError.busy {}
        try await staleManager.finishSignIn(stored, generation: current)
        try check(staleStore.read()?.accessToken == stored.accessToken, "Current sign-in did not commit")
        for replacingSignIn in [false, true] {
            try await staleRefreshTest(stored: stored, registered: registered, replacingSignIn: replacingSignIn)
        }
        print("Safari native OAuth behavior tests passed.")
    }

    private static func staleRefreshTest(stored: OAuthToken, registered: OAuthClientConfiguration, replacingSignIn: Bool) async throws {
        let client = DelayedRefreshClient()
        let store = MemoryStore(stored)
        let manager = SafariTokenSession(store: store, client: client)
        let request = Task { try await manager.getAccessToken() }
        await client.waitForRefresh()
        if replacingSignIn {
            _ = try await manager.beginSignIn()
        } else {
            try await manager.signOut()
        }
        let rotated = try OAuthToken(response: TokenResponse(accessToken: "rotated-access", refreshToken: "rotated-refresh", expiresIn: 300, tokenType: "bearer", resource: nil), client: registered)
        await client.complete(rotated)
        let result = try await request.value
        try check(result == nil && store.read() == nil, "Stale refresh restored a credential")
        let revoked = await client.revokedTokens()
        try check(revoked == ["refresh", "rotated-refresh"], "Stale refresh did not revoke the rotated credential")
        if replacingSignIn {
            do {
                _ = try await manager.beginSignIn()
                throw TestFailure.failed("Stale refresh released replacement sign-in lock")
            } catch OAuthError.busy {}
        }
    }

    private static func makeConfiguration() throws -> OAuthConfiguration {
        guard let value = OAuthConfiguration(message: ["issuer": OAuthConfiguration.trustedIssuer.absoluteString, "resource": OAuthConfiguration.protectedResource.absoluteString, "redirectURI": OAuthConfiguration.callbackURI.absoluteString]) else { throw TestFailure.failed("Invalid test configuration") }
        return value
    }

    private static func endpoint(_ name: String) -> String {
        "https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/" + name
    }

    private static func json(_ value: [String: Any], status: Int = 200) -> (Int, [String: String], Data) {
        (status, ["Content-Type": "application/json"], try! JSONSerialization.data(withJSONObject: value))
    }
}

private func requestBody(_ request: URLRequest) -> Data {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return Data() }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count <= 0 { break }
        data.append(contentsOf: buffer.prefix(count))
    }
    return data
}
