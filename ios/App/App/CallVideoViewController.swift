import AVFoundation
import UIKit
import WebRTC

/// KakaoTalk-style full-screen native video call UI (Metal views + controls).
/// Replaces RTCMTLVideoView overlay on Capacitor WebView for incoming CallKit video.
final class CallVideoViewController: UIViewController {
    var onEndCall: (() -> Void)?
    var onToggleMute: ((Bool) -> Void)?
    var onToggleSpeaker: ((Bool) -> Void)?

    private(set) var remoteVideoView: RTCMTLVideoView!
    private(set) var localPreviewView: RTCMTLVideoView!

    private let nameLabel = UILabel()
    private let statusLabel = UILabel()
    private var muteButton: UIButton!
    private var speakerButton: UIButton!
    private var endButton: UIButton!

    private var isMuted = false
    private var isSpeakerOn = true
    private var displayName: String = "AiMediaTank"

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

        remoteVideoView = RTCMTLVideoView(frame: .zero)
        remoteVideoView.videoContentMode = .scaleAspectFill
        remoteVideoView.backgroundColor = UIColor(white: 0.05, alpha: 1)
        remoteVideoView.isOpaque = true
        remoteVideoView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(remoteVideoView)

        localPreviewView = RTCMTLVideoView(frame: .zero)
        localPreviewView.videoContentMode = .scaleAspectFill
        localPreviewView.backgroundColor = UIColor(white: 0.12, alpha: 1)
        localPreviewView.isOpaque = true
        localPreviewView.translatesAutoresizingMaskIntoConstraints = false
        // No cornerRadius/clipsToBounds — both break Metal frame delivery on RTCMTLVideoView.
        view.addSubview(localPreviewView)

        nameLabel.text = displayName
        nameLabel.textColor = .white
        nameLabel.font = .systemFont(ofSize: 28, weight: .bold)
        nameLabel.textAlignment = .center
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(nameLabel)

        statusLabel.text = "Connecting…"
        statusLabel.textColor = UIColor.white.withAlphaComponent(0.75)
        statusLabel.font = .systemFont(ofSize: 15, weight: .medium)
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        muteButton = roundControlButton(systemName: "mic.fill", title: "Mute", action: #selector(toggleMute))
        speakerButton = roundControlButton(systemName: "speaker.wave.2.fill", title: "Speaker", action: #selector(toggleSpeaker))
        endButton = roundControlButton(systemName: "phone.down.fill", title: "End", action: #selector(endTapped), background: UIColor(red: 0.90, green: 0.22, blue: 0.21, alpha: 1))

        let stack = UIStackView(arrangedSubviews: [speakerButton, endButton, muteButton])
        stack.axis = .horizontal
        stack.distribution = .equalSpacing
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            remoteVideoView.topAnchor.constraint(equalTo: view.topAnchor),
            remoteVideoView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            remoteVideoView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            remoteVideoView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            localPreviewView.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            localPreviewView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            localPreviewView.widthAnchor.constraint(equalToConstant: 100),
            localPreviewView.heightAnchor.constraint(equalToConstant: 140),

            nameLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            nameLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            nameLabel.bottomAnchor.constraint(equalTo: statusLabel.topAnchor, constant: -6),

            statusLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            statusLabel.bottomAnchor.constraint(equalTo: stack.topAnchor, constant: -28),

            stack.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 40),
            stack.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -40),
            stack.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -20),
            stack.heightAnchor.constraint(equalToConstant: 92),
        ])

        refreshControlAppearance()
    }

    func updateStatus(_ text: String) {
        statusLabel.text = text
    }

    func updateDisplayName(_ name: String) {
        displayName = name
        nameLabel.text = name
    }

    private func roundControlButton(systemName: String, title: String, action: Selector, background: UIColor = UIColor.white.withAlphaComponent(0.22)) -> UIButton {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.backgroundColor = background
        button.tintColor = .white
        button.layer.cornerRadius = 32
        button.setImage(UIImage(systemName: systemName), for: .normal)
        button.accessibilityLabel = title
        button.addTarget(self, action: action, for: .touchUpInside)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 64),
            button.heightAnchor.constraint(equalToConstant: 64),
        ])

        let label = UILabel()
        label.text = title
        label.textColor = .white
        label.font = .systemFont(ofSize: 12, weight: .medium)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: button.bottomAnchor, constant: 8),
            label.centerXAnchor.constraint(equalTo: button.centerXAnchor),
        ])
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
