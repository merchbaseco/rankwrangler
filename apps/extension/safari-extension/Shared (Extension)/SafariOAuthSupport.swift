import CryptoKit
import Foundation
import Security

struct OAuthConfiguration: Equatable {
    static let trustedIssuer = URL(string: "https://thearcade.cloudflareaccess.com")!
    static let protectedResource = URL(string: "https://rankwrangler-api.merchbase.co/")!
    static let callbackURI = URL(string: "https://rankwrangler.merchbase.co/oauth/safari/callback")!

    let issuer: URL
    let resource: URL
    let redirectURI: URL

    init?(message: [String: Any]) {
        guard
            let issuerString = message["issuer"] as? String,
            let resourceString = message["resource"] as? String,
            let redirectString = message["redirectURI"] as? String,
            let issuer = URL(string: issuerString), issuer == Self.trustedIssuer,
            let resource = URL(string: resourceString), resource == Self.protectedResource,
            let redirectURI = URL(string: redirectString), redirectURI == Self.callbackURI
        else { return nil }
        self.issuer = issuer
        self.resource = resource
        self.redirectURI = redirectURI
    }
}

struct OAuthClientConfiguration {
    let configuration: OAuthConfiguration
    let authorizationURL: URL
    let tokenURL: URL
    let revocationURL: URL
    let clientId: String
}

struct OAuthCallback {
    let code: String
    let state: String

    init?(url: URL, expected: URL) {
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            url.scheme == expected.scheme, url.host == expected.host,
            url.port == expected.port, url.path == expected.path,
            url.user == nil, url.password == nil, url.fragment == nil,
            let items = components.queryItems,
            items.filter({ $0.name == "code" }).count == 1,
            items.filter({ $0.name == "state" }).count == 1,
            !items.contains(where: { $0.name == "error" }),
            let code = items.first(where: { $0.name == "code" })?.value,
            let state = items.first(where: { $0.name == "state" })?.value,
            !code.isEmpty, !state.isEmpty
        else { return nil }
        self.code = code
        self.state = state
    }
}

struct AuthorizationResult {
    let code: String
    let verifier: String
}

enum OAuthError: Error {
    case busy
    case invalidCallback
    case invalidConfiguration
    case reauthenticationRequired
    case unavailable
}

enum PKCE {
    static func randomVerifier() throws -> (verifier: String, challenge: String, state: String) {
        let verifier = try randomString(byteCount: 32)
        let state = try randomString(byteCount: 24)
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return (verifier, Data(digest).base64URLEncodedString(), state)
    }

    private static func randomString(byteCount: Int) throws -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw OAuthError.unavailable
        }
        return Data(bytes).base64URLEncodedString()
    }
}

struct OAuthToken: Codable, Sendable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date
    let clientId: String
    let issuer: URL
    let resource: URL
    let tokenURL: URL
    let revocationURL: URL

    var hasTrustedContext: Bool {
        issuer == OAuthConfiguration.trustedIssuer
            && resource == OAuthConfiguration.protectedResource
            && OAuthClient.isIssuerEndpoint(tokenURL, issuer: issuer)
            && OAuthClient.isIssuerEndpoint(revocationURL, issuer: issuer)
    }

    init(response: TokenResponse, client: OAuthClientConfiguration, previousRefreshToken: String? = nil) throws {
        guard !response.accessToken.isEmpty,
            response.tokenType.lowercased() == "bearer", response.expiresIn > 0,
            response.refreshToken == nil || response.refreshToken?.isEmpty == false,
            response.resource == nil || response.resource == client.configuration.resource.absoluteString
        else { throw OAuthError.unavailable }
        accessToken = response.accessToken
        refreshToken = response.refreshToken ?? previousRefreshToken
        expiresAt = Date().addingTimeInterval(TimeInterval(response.expiresIn))
        clientId = client.clientId
        issuer = client.configuration.issuer
        resource = client.configuration.resource
        tokenURL = client.tokenURL
        revocationURL = client.revocationURL
    }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int
    let tokenType: String
    let resource: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case tokenType = "token_type"
        case resource
    }
}

func nativeSuccess(accessToken: String? = nil) -> [String: Any] {
    var payload: [String: Any] = ["success": true]
    if let accessToken { payload["accessToken"] = accessToken }
    return payload
}

func nativeFailure(_ message: String) -> [String: Any] {
    ["success": false, "error": message]
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
