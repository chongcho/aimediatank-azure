import type { CSSProperties, ReactNode } from 'react'

/** Plain text shown for a chat message (hashtags and media tokens stripped) — used before MT. */
export function normalizeChatMessagePlainText(content: string): string {
  const contentWithoutHashtags = (content || '').replace(/#\w+/g, '')
  const contentWithoutMediaTokens = contentWithoutHashtags
    .replace(/\[\[media:[^\]]+\]\]/g, '')
    .replace(/\[[^\]]+\]\([^)]*\/media\/[^)]+\)/g, '')
    .replace(/https?:\/\/[^\s]*\/media\/[^\s]+/g, '')
  return contentWithoutMediaTokens.replace(/\s+/g, ' ').trim()
}

const linkAnchorStyle: CSSProperties = {
  color: 'inherit',
  textDecoration: 'underline',
}

const linkAnchorStrongStyle: CSSProperties = {
  ...linkAnchorStyle,
  fontWeight: '500',
}

/** Link-aware rendering for {@link normalizeChatMessagePlainText} output (same rules as TalkChat). */
export function renderNormalizedChatPlainText(normalizedContent: string): ReactNode {
  if (!normalizedContent) return null

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(normalizedContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push(normalizedContent.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      if (match[2].includes('/media/')) {
        lastIndex = match.index + match[0].length
        continue
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          style={linkAnchorStrongStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {match[1]}
        </a>
      )
    } else if (match[3]) {
      if (match[3].includes('/media/')) {
        lastIndex = match.index + match[0].length
        continue
      }
      parts.push(
        <a key={match.index} href={match[3]} style={linkAnchorStyle} onClick={(e) => e.stopPropagation()}>
          {match[3]}
        </a>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < normalizedContent.length) {
    parts.push(normalizedContent.slice(lastIndex))
  }

  return parts.length > 0 ? parts : normalizedContent
}
