/** ICE servers for TalkChat WebRTC voice calls. Optional TURN via env for strict NAT. */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = []

  const stunRaw =
    process.env.NEXT_PUBLIC_WEBRTC_STUN_SERVERS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  for (const url of stunRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
    servers.push({ urls: url })
  }

  const turnUrl =
    process.env.NEXT_PUBLIC_WEBRTC_TURN_URL || process.env.WEBRTC_TURN_URL
  const turnUser =
    process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME || process.env.WEBRTC_TURN_USERNAME
  const turnPass =
    process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL || process.env.WEBRTC_TURN_CREDENTIAL
  if (turnUrl && turnUser && turnPass) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    })
  }

  return servers
}
