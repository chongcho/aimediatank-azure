import AVFoundation
import UIKit
import WebRTC

/// KakaoTalk-style full-screen native video call UI (Metal views + controls).
/// Replaces RTCMTLVideoView overlay on Capacitor WebView for incoming CallKit video.
final class CallVideoViewController: UIViewController {
    var onEndCall: (() -> Void)?
    var onToggleMute: ((Bool) -> Void)?
    var onToggleSpeaker: ((Bool) -> Void)?
    /// Fired when Metal views have non-zero bounds and are in a window (safe to track.add).
    var onVideoViewsReady: (() -> Void)?

    private(set) var remoteVideoView: RTCMTLVideoView!
    private(set) var localPreviewView: RTCMTLVideoView!

    private let nameLabel = UILabel()
    private let statusLabel = UILabel()
    private var controlsStack: UIStackView!
    private var muteButton: UIButton!
    private var speakerButton: UIButton!
    private var endButton: UIButton!

    private var isMuted = false
    private var isSpeakerOn = true
    private var displayName: String = "AiMediaTank"
    private var didNotifyViewsReady = false

    convenience init(displayName: String?) {
        self.init(nibName: nil, bundle: nil)
        if let displayName, !displayName.isEmpty {
            self.displayName = displayName
        }
        modalPresentationStyle = .fullScreen
        modalTransitionStyle = .crossDissolve
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.04, alpha: 1)

        // Non-zero initial frames — RTCMTLVideoView with .zero + Auto Layout often never paints.
        let screen = UIScreen.main.bounds
        remoteVideoView = RTCMTLVideoView(frame: screen)
        remoteVideoView.videoContentMode = .scaleAspectFill
        remoteVideoView.backgroundColor = UIColor(white: 0.05, alpha: 1)
        remoteVideoView.isOpaque = true
        remoteVideoView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(remoteVideoView)

        localPreviewView = RTCMTLVideoView(frame: CGRect(x: screen.width - 116, y: 56, width: 100, height: 140))
        localPreviewView.videoContentMode = .scaleAspectFill
        localPreviewView.backgroundColor = UIColor(white: 0.12, alpha: 1)
        localPreviewView.isOpaque = true
        // Mirror only — no clipsToBounds/cornerRadius (breaks Metal frame delivery).
        localPreviewView.transform = CGAffineTransform(scaleX: -1, y: 1)
        view.addSubview(localPreviewView)

        nameLabel.text = displayName
        nameLabel.textColor = .white
        nameLabel.font = .systemFont(ofSize: 28, weight: .bold)
        nameLabel.textAlignment = .center
        view.addSubview(nameLabel)

        statusLabel.text = "Connecting…"
        statusLabel.textColor = UIColor.white.withAlphaComponent(0.75)
        statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
        statusLabel.textAlignment = .center
        view.addSubview(statusLabel)

        muteButton = roundControlButton(systemName: "mic.fill", title: "Mute", action: #selector(toggleMute))
        speakerButton = roundControlButton(systemName: "speaker.wave.2.fill", title: "Speaker", action: #selector(toggleSpeaker))
        endButton = roundControlButton(
            systemName: "phone.down.fill",
            title: "End",
            action: #selector(endTapped),
            background: UIColor(red: 0.90, green: 0.22, blue: 0.21, alpha: 1)
        )

        let stack = UIStackView(arrangedSubviews: [controlColumn(speakerButton, "Speaker"), controlColumn(endButton, "End"), controlColumn(muteButton, "Mute")])
        stack.axis = .horizontal
        stack.distribution = .equalSpacing
        stack.alignment = .top
        view.addSubview(stack)
        controlsStack = stack

        refreshControlAppearance()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        remoteVideoView.frame = view.bounds
        let safe = view.safeAreaInsets
        let previewW: CGFloat = 100
        let previewH: CGFloat = 140
        localPreviewView.frame = CGRect(
            x: view.bounds.width - previewW - 16,
            y: safe.top + 12,
            width: previewW,
            height: previewH
        )
        let stackH: CGFloat = 92
        let stackY = view.bounds.height - safe.bottom - stackH - 20
        controlsStack.frame = CGRect(x: 40, y: stackY, width: view.bounds.width - 80, height: stackH)
        statusLabel.frame = CGRect(x: 24, y: stackY - 36, width: view.bounds.width - 48, height: 22)
        nameLabel.frame = CGRect(x: 24, y: stackY - 72, width: view.bounds.width - 48, height: 34)

        notifyViewsReadyIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        notifyViewsReadyIfNeeded()
    }

    func updateStatus(_ text: String) {
        statusLabel.text = text
    }

    func updateDisplayName(_ name: String) {
        displayName = name
        nameLabel.text = name
    }

    private func notifyViewsReadyIfNeeded() {
        guard !didNotifyViewsReady else { return }
        guard view.window != nil else { return }
        guard remoteVideoView.bounds.width > 1, remoteVideoView.bounds.height > 1 else { return }
        guard localPreviewView.bounds.width > 1, localPreviewView.bounds.height > 1 else { return }
        didNotifyViewsReady = true
        print("[CallVideoViewController] video views ready remote=\(remoteVideoView.bounds.size) local=\(localPreviewView.bounds.size)")
        onVideoViewsReady?()
    }

    private func controlColumn(_ button: UIButton, _ title: String) -> UIView {
        let wrap = UIView()
        wrap.translatesAutoresizingMaskIntoConstraints = false
        button.translatesAutoresizingMaskIntoConstraints = false
        let label = UILabel()
        label.text = title
        label.textColor = .white
        label.font = .systemFont(ofSize: 12, weight: .medium)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        wrap.addSubview(button)
        wrap.addSubview(label)
        NSLayoutConstraint.activate([
            wrap.widthAnchor.constraint(equalToConstant: 72),
            wrap.heightAnchor.constraint(equalToConstant: 92),
            button.topAnchor.constraint(equalTo: wrap.topAnchor),
            button.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
            button.widthAnchor.constraint(equalToConstant: 64),
            button.heightAnchor.constraint(equalToConstant: 64),
            label.topAnchor.constraint(equalTo: button.bottomAnchor, constant: 8),
            label.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
            label.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
        ])
        return wrap
    }

    private func roundControlButton(systemName: String, title: String, action: Selector, background: UIColor = UIColor.white.withAlphaComponent(0.22)) -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = background
        button.tintColor = .white
        button.layer.cornerRadius = 32
        button.setImage(UIImage(systemName: systemName), for: .normal)
        button.accessibilityLabel = title
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func refreshControlAppearance() {
        muteButton?.backgroundColor = isMuted
            ? UIColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1)
            : UIColor.white.withAlphaComponent(0.22)
        muteButton?.setImage(UIImage(systemName: isMuted ? "mic.slash.fill" : "mic.fill"), for: .normal)
        speakerButton?.backgroundColor = isSpeakerOn
            ? UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1)
            : UIColor.white.withAlphaComponent(0.22)
    }

    @objc private func toggleMute() {
        isMuted.toggle()
        refreshControlAppearance()
        onToggleMute?(isMuted)
    }

    @objc private func toggleSpeaker() {
        isSpeakerOn.toggle()
        refreshControlAppearance()
        onToggleSpeaker?(isSpeakerOn)
    }

    @objc private func endTapped() {
        onEndCall?()
    }
}
