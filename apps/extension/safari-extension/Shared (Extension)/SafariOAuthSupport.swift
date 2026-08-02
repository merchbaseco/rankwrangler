//
//  SafariOAuthSupport.swift
//  Shared (Extension)
//

import CryptoKit
import Foundation
import Security

struct OAuthConfiguration {
    let authorizationURL: URL
    let tokenURL: URL
    let clientId: String
    let redirectURI: URL
    let scopes: String

    init?(message: [String: Any]) {
        guard
            let authorizationURLString = message["authorizationURL"] as? String,
            let tokenURLString = message["tokenURL"] as? String,
            let clientId = message["clientId"] as? String,
            let redirectURIString = message["redirectURI"] as? String,
            let authorizationURL = URL(string: authorizationURLString),
            let tokenURL = URL(string: tokenURLString),
            let redirectURI = URL(string: redirectURIString),
            authorizationURL.scheme == "https",
            tokenURL.scheme == "https",
            redirectURI.scheme != nil,
            !clientId.isEmpty
        else {
            return nil
        }

        self.authorizationURL = authorizationURL
        self.tokenURL = tokenURL
        self.clientId = clientId
        self.redirectURI = redirectURI
        self.scopes = (message["scopes"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? "openid email profile"
    }
}

struct OAuthCallback {
    let code: String
    let state: String

    init?(url: URL) {
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
            let state = components.queryItems?.first(where: { $0.name == "state" })?.value,
            !code.isEmpty,
            !state.isEmpty
        else {
            return nil
        }
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
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw OAuthError.unavailable
        }
        return Data(bytes).base64URLEncodedString()
    }
}

struct OAuthToken: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date
    let clientId: String
    let tokenURL: URL

    init(response: TokenResponse, clientId: String, tokenURL: URL, previousRefreshToken: String? = nil) {
        accessToken = response.accessToken
        refreshToken = response.refreshToken ?? previousRefreshToken
        expiresAt = Date().addingTimeInterval(TimeInterval(response.expiresIn ?? 3600))
        self.clientId = clientId
        self.tokenURL = tokenURL
    }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
    }
}

enum OAuthClient {
    static func exchange(
        authorizationCode: String,
        verifier: String,
        configuration: OAuthConfiguration
    ) async throws -> OAuthToken {
        let response = try await request(
            tokenURL: configuration.tokenURL,
            form: [
                "grant_type": "authorization_code",
                "code": authorizationCode,
                "code_verifier": verifier,
                "client_id": configuration.clientId,
                "redirect_uri": configuration.redirectURI.absoluteString,
            ]
        )
        return OAuthToken(response: response, clientId: configuration.clientId, tokenURL: configuration.tokenURL)
    }

    static func refresh(
        refreshToken: String,
        clientId: String,
        tokenURL: URL
    ) async throws -> OAuthToken {
        let response = try await request(
            tokenURL: tokenURL,
            form: [
                "grant_type": "refresh_token",
                "refresh_token": refreshToken,
                "client_id": clientId,
            ]
        )
        return OAuthToken(
            response: response,
            clientId: clientId,
            tokenURL: tokenURL,
            previousRefreshToken: refreshToken
        )
    }

    private static func request(tokenURL: URL, form: [String: String]) async throws -> TokenResponse {
        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form
            .map { "\($0.key)=\($0.value.formURLEncoded())" }
            .joined(separator: "&")
            .data(using: .utf8)

        return try await withCheckedThrowingContinuation { continuation in
            URLSession.shared.dataTask(with: request) { data, response, error in
                guard error == nil,
                    let data,
                    let httpResponse = response as? HTTPURLResponse,
                    (200..<300).contains(httpResponse.statusCode)
                else {
                    continuation.resume(throwing: OAuthError.unavailable)
                    return
                }

                do {
                    continuation.resume(returning: try JSONDecoder().decode(TokenResponse.self, from: data))
                } catch {
                    continuation.resume(throwing: OAuthError.unavailable)
                }
            }.resume()
        }
    }
}

func nativeSuccess(accessToken: String? = nil) -> [String: Any] {
    var payload: [String: Any] = ["success": true]
    if let accessToken {
        payload["accessToken"] = accessToken
    }
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

private extension String {
    func formURLEncoded() -> String {
        addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._* ")))
            ?? ""
    }
}
