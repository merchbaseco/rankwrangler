import Foundation

private final class OAuthRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

struct OAuthClient: Sendable {
    static let shared = OAuthClient(session: URLSession(
        configuration: .ephemeral, delegate: OAuthRedirectDelegate(), delegateQueue: nil
    ))
    private let session: URLSession

    init(session: URLSession) { self.session = session }

    func register(configuration: OAuthConfiguration) async throws -> OAuthClientConfiguration {
        var request = URLRequest(url: configuration.resource)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (_, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 401,
            let challenge = response.value(forHTTPHeaderField: "WWW-Authenticate"),
            let metadataURL = Self.resourceMetadataURL(challenge: challenge, resource: configuration.resource)
        else { throw OAuthError.invalidConfiguration }
        let resource: ResourceMetadata = try await read(metadataURL)
        guard resource.resource == configuration.resource.absoluteString,
            resource.authorizationServers.contains(configuration.issuer.absoluteString)
        else { throw OAuthError.invalidConfiguration }
        let metadataURLForIssuer = configuration.issuer.appendingPathComponent(".well-known/oauth-authorization-server")
        let metadata: ServerMetadata = try await read(metadataURLForIssuer)
        guard metadata.issuer == configuration.issuer.absoluteString,
            metadata.pkce.contains("S256"), metadata.grants.contains("authorization_code"),
            metadata.grants.contains("refresh_token"), metadata.authMethods.contains("none"),
            Self.isIssuerEndpoint(metadata.authorizationURL, issuer: configuration.issuer),
            Self.isIssuerEndpoint(metadata.tokenURL, issuer: configuration.issuer),
            Self.isIssuerEndpoint(metadata.revocationURL, issuer: configuration.issuer),
            Self.isIssuerEndpoint(metadata.registrationURL, issuer: configuration.issuer)
        else { throw OAuthError.invalidConfiguration }
        var registration = URLRequest(url: metadata.registrationURL)
        registration.httpMethod = "POST"
        registration.setValue("application/json", forHTTPHeaderField: "Content-Type")
        registration.httpBody = try JSONSerialization.data(withJSONObject: [
            "client_name": "RankWrangler Safari",
            "redirect_uris": [configuration.redirectURI.absoluteString],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"], "token_endpoint_auth_method": "none",
        ])
        let client: RegisteredClient = try await send(registration)
        guard !client.clientId.isEmpty else { throw OAuthError.invalidConfiguration }
        return OAuthClientConfiguration(
            configuration: configuration, authorizationURL: metadata.authorizationURL,
            tokenURL: metadata.tokenURL, revocationURL: metadata.revocationURL, clientId: client.clientId
        )
    }

    func exchange(
        authorizationCode: String, verifier: String, client: OAuthClientConfiguration
    ) async throws -> OAuthToken {
        let response: TokenResponse = try await form(client.tokenURL, values: [
            "grant_type": "authorization_code", "code": authorizationCode,
            "code_verifier": verifier, "client_id": client.clientId,
            "redirect_uri": client.configuration.redirectURI.absoluteString,
            "resource": client.configuration.resource.absoluteString,
        ])
        return try OAuthToken(response: response, client: client)
    }

    func refresh(_ stored: OAuthToken) async throws -> OAuthToken {
        guard stored.hasTrustedContext, let refreshToken = stored.refreshToken,
            let configuration = OAuthConfiguration(message: [
                "issuer": stored.issuer.absoluteString, "resource": stored.resource.absoluteString,
                "redirectURI": OAuthConfiguration.callbackURI.absoluteString,
            ])
        else { throw OAuthError.reauthenticationRequired }
        let response: TokenResponse = try await form(stored.tokenURL, values: [
            "grant_type": "refresh_token", "refresh_token": refreshToken,
            "client_id": stored.clientId, "resource": stored.resource.absoluteString,
        ])
        return try OAuthToken(
            response: response,
            client: OAuthClientConfiguration(
                configuration: configuration, authorizationURL: stored.issuer,
                tokenURL: stored.tokenURL, revocationURL: stored.revocationURL, clientId: stored.clientId
            ), previousRefreshToken: refreshToken
        )
    }

    func revoke(_ stored: OAuthToken) async throws {
        guard stored.hasTrustedContext else { throw OAuthError.invalidConfiguration }
        let token = stored.refreshToken ?? stored.accessToken
        var request = Self.formRequest(stored.revocationURL, values: [
            "token": token, "client_id": stored.clientId,
            "token_type_hint": stored.refreshToken == nil ? "access_token" : "refresh_token",
        ])
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (_, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw OAuthError.unavailable
        }
    }

    static func isIssuerEndpoint(_ url: URL, issuer: URL) -> Bool {
        url.scheme == "https" && url.host == issuer.host && url.port == issuer.port
            && url.user == nil && url.password == nil && url.query == nil && url.fragment == nil
    }

    private static func resourceMetadataURL(challenge: String, resource: URL) -> URL? {
        guard let range = challenge.range(of: #"resource_metadata="([^"]+)""#, options: .regularExpression) else {
            return nil
        }
        let value = challenge[range].dropFirst("resource_metadata=\"".count).dropLast()
        guard let url = URL(string: String(value)),
            url.scheme == "https", url.host == resource.host, url.port == resource.port,
            url.user == nil, url.password == nil, url.fragment == nil
        else { return nil }
        return url
    }

    private func read<T: Decodable>(_ url: URL) async throws -> T {
        try await send(URLRequest(url: url))
    }

    private func form<T: Decodable>(_ url: URL, values: [String: String]) async throws -> T {
        try await send(Self.formRequest(url, values: values))
    }

    private static func formRequest(_ url: URL, values: [String: String]) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var body = URLComponents()
        body.queryItems = values.sorted(by: { $0.key < $1.key }).map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = body.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw OAuthError.unavailable }
        if response.statusCode == 400 || response.statusCode == 401 {
            throw OAuthError.reauthenticationRequired
        }
        guard (200..<300).contains(response.statusCode) else { throw OAuthError.unavailable }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct ResourceMetadata: Decodable {
    let resource: String
    let authorizationServers: [String]
    enum CodingKeys: String, CodingKey { case resource; case authorizationServers = "authorization_servers" }
}

private struct ServerMetadata: Decodable {
    let issuer: String
    let authorizationURL: URL
    let tokenURL: URL
    let registrationURL: URL
    let revocationURL: URL
    let pkce: [String]
    let grants: [String]
    let authMethods: [String]
    enum CodingKeys: String, CodingKey {
        case issuer
        case authorizationURL = "authorization_endpoint"
        case tokenURL = "token_endpoint"
        case registrationURL = "registration_endpoint"
        case revocationURL = "revocation_endpoint"
        case pkce = "code_challenge_methods_supported"
        case grants = "grant_types_supported"
        case authMethods = "token_endpoint_auth_methods_supported"
    }
}

private struct RegisteredClient: Decodable {
    let clientId: String
    enum CodingKeys: String, CodingKey { case clientId = "client_id" }
}
