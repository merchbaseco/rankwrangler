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
        case "signOut":
            Task {
                do {
                    try await SafariTokenSession.shared.signOut()
                    finish(context, with: nativeSuccess())
                } catch {
                    finish(context, with: nativeFailure("Account sign-out could not be fully completed."))
                }
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
            let token = try await SafariTokenSession.shared.getAccessToken()
            finish(context, with: nativeSuccess(accessToken: token))
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

        var generation: Int?
        do {
            let attempt = try await SafariTokenSession.shared.beginSignIn()
            generation = attempt
            let client = try await OAuthClient.shared.register(configuration: configuration)
            let authorization = try await authorize(client: client)
            let token = try await OAuthClient.shared.exchange(
                authorizationCode: authorization.code,
                verifier: authorization.verifier,
                client: client
            )
            try await SafariTokenSession.shared.finishSignIn(token, generation: attempt)
            finish(context, with: nativeSuccess())
        } catch {
            if let generation { await SafariTokenSession.shared.cancelSignIn(generation: generation) }
            finish(context, with: nativeFailure("Account sign-in was not completed."))
        }
    }

    private func authorize(client: OAuthClientConfiguration) async throws -> AuthorizationResult {
        guard authenticationSession == nil else {
            throw OAuthError.busy
        }

        let verifier = try PKCE.randomVerifier()
        var components = URLComponents(url: client.authorizationURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: client.clientId),
            URLQueryItem(name: "redirect_uri", value: client.configuration.redirectURI.absoluteString),
            URLQueryItem(name: "resource", value: client.configuration.resource.absoluteString),
            URLQueryItem(name: "state", value: verifier.state),
            URLQueryItem(name: "code_challenge", value: verifier.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        guard let authorizationURL = components?.url else {
            throw OAuthError.invalidConfiguration
        }

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callback: .https(host: client.configuration.redirectURI.host!, path: client.configuration.redirectURI.path),
                completionHandler: { [weak self] callbackURL, error in
                    self?.authenticationSession = nil
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard
                        let callbackURL,
                        let callback = OAuthCallback(url: callbackURL, expected: client.configuration.redirectURI),
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
