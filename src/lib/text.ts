export const stripHashtags = (value: string) => value.replace(/#\w+/g, '').trim()

export const truncateText = (value: string, maxLength: number) => {
  const text = value.trim()
  if (text.length <= maxLength) return text
  if (maxLength <= 3) return text.slice(0, maxLength)
  return `${text.slice(0, maxLength - 3)}...`
}

export const formatMediaTitle = (title: string, maxLength = 35) =>
  truncateText(stripHashtags(title), maxLength)
