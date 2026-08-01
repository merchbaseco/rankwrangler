//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//

import AuthenticationServices
import Foundation
import SafariServices

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling,
    ASWebAuthenticationPresentationContextProviding
{
    private var authenticationSession: ASWebAuthenticationSession?

    func beginRequest(with context: NSExtensionContext) {
        let message = readMessage(from: context)
        guard let type = message["type"] as? String else {
            finish(context, with: nativeFailure("Invalid native message."))
            return
        }

        switch type {
        case "getAccessToken":
            Task { [weak self] in
                await self?.handleGetAccessToken(context)
            }
        case "beginOAuth":
            Task { [weak self] in
                await self?.handleBeginOAuth(context, message: message)
            }
        default:
            finish(context, with: nativeFailure("Unsupported native message."))
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
#if os(macOS)
        return NSApplication.shared.keyWindow ?? NSApplication.shared.mainWindow ?? NSWindow()
#else
        return UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? UIWindow()
#endif
    }

    private func handleGetAccessToken(_ context: NSExtensionContext) async {
        do {
            guard let stored = try KeychainTokenStore.read() else {
                finish(context, with: nativeSuccess())
                return
            }

            if stored.expiresAt > Date().addingTimeInterval(60) {
                finish(context, with: nativeSuccess(accessToken: stored.accessToken))
                return
            }

            guard let refreshToken = stored.refreshToken else {
                try KeychainTokenStore.delete()
                finish(context, with: nativeSuccess())
                return
            }

            let refreshed = try await OAuthClient.refresh(
                refreshToken: refreshToken,
                clientId: stored.clientId,
                tokenURL: stored.tokenURL
            )
            try KeychainTokenStore.save(refreshed)
            finish(context, with: nativeSuccess(accessToken: refreshed.accessToken))
        } catch {
            finish(context, with: nativeFailure("Account authentication is unavailable."))
        }
    }

    private func handleBeginOAuth(
        _ context: NSExtensionContext,
        message: [String: Any]
    ) async {
        guard let configuration = OAuthConfiguration(message: message) else {
            finish(context, with: nativeFailure("Safari OAuth is not configured."))
            return
        }

        do {
            let authorization = try await authorize(configuration: configuration)
            let token = try await OAuthClient.exchange(
                authorizationCode: authorization.code,
                verifier: authorization.verifier,
                configuration: configuration
            )
            try KeychainTokenStore.save(token)
            finish(context, with: nativeSuccess())
        } catch {
            finish(context, with: nativeFailure("Account sign-in was not completed."))
        }
    }

    private func authorize(configuration: OAuthConfiguration) async throws -> AuthorizationResult {
        guard authenticationSession == nil else {
            throw OAuthError.busy
        }

        let verifier = try PKCE.randomVerifier()
        var components = URLComponents(url: configuration.authorizationURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: configuration.clientId),
            URLQueryItem(name: "redirect_uri", value: configuration.redirectURI.absoluteString),
            URLQueryItem(name: "scope", value: configuration.scopes),
            URLQueryItem(name: "state", value: verifier.state),
            URLQueryItem(name: "code_challenge", value: verifier.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        if !configuration.audience.isEmpty {
            components?.queryItems?.append(URLQueryItem(name: "audience", value: configuration.audience))
        }
        guard let authorizationURL = components?.url else {
            throw OAuthError.invalidConfiguration
        }

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: configuration.redirectURI.scheme,
                completionHandler: { [weak self] callbackURL, error in
                    self?.authenticationSession = nil
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard
                        let callbackURL,
                        let callback = OAuthCallback(url: callbackURL),
                        callback.state == verifier.state
                    else {
                        continuation.resume(throwing: OAuthError.invalidCallback)
                        return
                    }
                    continuation.resume(returning: AuthorizationResult(
                        code: callback.code,
                        verifier: verifier.verifier
                    ))
                }
            )

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authenticationSession = session
            if !session.start() {
                authenticationSession = nil
                continuation.resume(throwing: OAuthError.unavailable)
            }
        }
    }

    private func readMessage(from context: NSExtensionContext) -> [String: Any] {
        let request = context.inputItems.first as? NSExtensionItem
        let userInfo = request?.userInfo
        let value: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            value = userInfo?[SFExtensionMessageKey]
        } else {
            value = userInfo?["message"]
        }
        return value as? [String: Any] ?? [:]
    }

    private func finish(_ context: NSExtensionContext, with payload: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: payload]
        } else {
            response.userInfo = ["message": payload]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
