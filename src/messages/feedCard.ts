/** Homepage / profile grid card copy (MediaCard). Locale via `useUiLocale` → `tFeed`. */
export type FeedCardKey =
  | 'openMediaAria'
  | 'feedComment'
  | 'feedChat'
  | 'feedDownload'
  | 'downloading'
  | 'openCommentsAria'
  | 'openFeedChatAria'
  | 'openFeedDownloadAria'
  | 'free'
  | 'aiBadge'
  | 'realBadge'
  | 'signInToPostComment'
  | 'couldNotPost'
  | 'couldNotUpdate'
  | 'couldNotDelete'
  | 'couldNotDeleteGeneric'
  | 'deleteCommentTitle'
  | 'commentModalLoading'
  | 'placeholderWriteComment'
  | 'placeholderEditComment'
  | 'cancelEdit'
  | 'posting'
  | 'saving'
  | 'save'
  | 'post'
  | 'signInBlurb'
  | 'mutePreplayTitle'
  | 'unmutePreplayTitle'
  | 'encodingHd'
  | 'editHelpLine'
  | 'cardTextOriginal'
  | 'cardTextLocal'
  | 'cardTranslationToggleAria'

type Pack = Record<FeedCardKey, string>

const EN: Pack = {
  openMediaAria: 'Open {title}',
  feedComment: 'Comment',
  feedChat: 'Chat',
  feedDownload: 'Download',
  downloading: 'Downloading ...',
  openCommentsAria: 'Open comments',
  openFeedChatAria: 'Open chat',
  openFeedDownloadAria: 'Download media',
  free: 'Free',
  aiBadge: 'AI',
  realBadge: 'Real',
  signInToPostComment: 'Log in to post a comment.',
  couldNotPost: 'Could not post comment.',
  couldNotUpdate: 'Could not update comment.',
  couldNotDelete: 'Could not delete comment.',
  couldNotDeleteGeneric: 'Could not delete comment.',
  deleteCommentTitle: 'Delete comment?',
  commentModalLoading: 'Loading comments…',
  placeholderWriteComment: 'Write a comment…',
  placeholderEditComment: 'Edit comment…',
  cancelEdit: 'Cancel edit',
  posting: 'Posting…',
  saving: 'Saving…',
  save: 'Save',
  post: 'Post',
  signInBlurb: 'Log in to add a comment on this media.',
  mutePreplayTitle: 'Mute video previews on the home feed',
  unmutePreplayTitle: 'Play video previews with sound on the home feed',
  encodingHd: 'Encoding HD…',
  editHelpLine: 'Editing… change text below, then press Save to close.',
  cardTextOriginal: 'Original',
  cardTextLocal: 'Local',
  cardTranslationToggleAria: 'Title and description language',
}

const KO: Pack = {
  ...EN,
  openMediaAria: '{title} 열기',
  feedComment: '댓글',
  feedChat: '채팅',
  feedDownload: '다운로드',
  downloading: '다운로드 중…',
  openCommentsAria: '댓글 열기',
  openFeedChatAria: '채팅 열기',
  openFeedDownloadAria: '미디어 다운로드',
  free: '무료',
  aiBadge: 'AI',
  realBadge: '실사',
  signInToPostComment: '댓글을 남기려면 로그인하세요.',
  couldNotPost: '댓글을 게시할 수 없습니다.',
  couldNotUpdate: '댓글을 수정할 수 없습니다.',
  couldNotDelete: '댓글을 삭제할 수 없습니다.',
  couldNotDeleteGeneric: '댓글을 삭제할 수 없습니다.',
  deleteCommentTitle: '댓글을 삭제할까요?',
  commentModalLoading: '댓글 불러오는 중…',
  placeholderWriteComment: '댓글을 입력하세요…',
  placeholderEditComment: '댓글 수정…',
  cancelEdit: '수정 취소',
  posting: '게시 중…',
  saving: '저장 중…',
  save: '저장',
  post: '게시',
  signInBlurb: '이 미디어에 댓글을 남기려면 로그인하세요.',
  mutePreplayTitle: '홈 피드에서 동영상 미리듣기 음소거',
  unmutePreplayTitle: '홈 피드에서 동영상 미리듣기 소리 켜기',
  encodingHd: 'HD 인코딩 중…',
  editHelpLine: '수정 중… 아래에서 텍스트를 바꾼 뒤 저장을 누르면 닫힙니다.',
  cardTextOriginal: '원문',
  cardTextLocal: '로컬',
  cardTranslationToggleAria: '제목·설명 언어',
}

const JA: Pack = {
  ...EN,
  openMediaAria: '{title}を開く',
  feedComment: 'コメント',
  feedChat: 'チャット',
  feedDownload: 'ダウンロード',
  downloading: 'ダウンロード中…',
  openCommentsAria: 'コメントを開く',
  openFeedChatAria: 'チャットを開く',
  openFeedDownloadAria: 'メディアをダウンロード',
  free: '無料',
  aiBadge: 'AI',
  realBadge: '実写',
  signInToPostComment: 'コメントするにはログインしてください。',
  couldNotPost: 'コメントを投稿できませんでした。',
  couldNotUpdate: 'コメントを更新できませんでした。',
  couldNotDelete: 'コメントを削除できませんでした。',
  couldNotDeleteGeneric: 'コメントを削除できませんでした。',
  deleteCommentTitle: 'コメントを削除しますか？',
  commentModalLoading: 'コメントを読み込み中…',
  placeholderWriteComment: 'コメントを入力…',
  placeholderEditComment: 'コメントを編集…',
  cancelEdit: '編集をキャンセル',
  posting: '投稿中…',
  saving: '保存中…',
  save: '保存',
  post: '投稿',
  signInBlurb: 'このメディアにコメントするにはログインしてください。',
  mutePreplayTitle: 'ホームフィードの動画プレビューをミュート',
  unmutePreplayTitle: 'ホームフィードの動画プレビューで音声をオン',
  encodingHd: 'HDをエンコード中…',
  editHelpLine: '編集中…下のテキストを変更して保存で閉じます。',
  cardTextOriginal: '原文',
  cardTextLocal: 'ローカル',
  cardTranslationToggleAria: 'タイトルと説明の言語',
}

const ZH: Pack = {
  ...EN,
  openMediaAria: '打开 {title}',
  feedComment: '评论',
  feedChat: '聊天',
  feedDownload: '下载',
  downloading: '下载中…',
  openCommentsAria: '打开评论',
  openFeedChatAria: '打开聊天',
  openFeedDownloadAria: '下载媒体',
  free: '免费',
  aiBadge: 'AI',
  realBadge: '实拍',
  signInToPostComment: '请登录后再发表评论。',
  couldNotPost: '无法发表评论。',
  couldNotUpdate: '无法更新评论。',
  couldNotDelete: '无法删除评论。',
  couldNotDeleteGeneric: '无法删除评论。',
  deleteCommentTitle: '删除这条评论？',
  commentModalLoading: '正在加载评论…',
  placeholderWriteComment: '写一条评论…',
  placeholderEditComment: '编辑评论…',
  cancelEdit: '取消编辑',
  posting: '发布中…',
  saving: '保存中…',
  save: '保存',
  post: '发布',
  signInBlurb: '登录后即可对此媒体发表评论。',
  mutePreplayTitle: '在首页动态中静音视频预览',
  unmutePreplayTitle: '在首页动态中播放带声音的视频预览',
  encodingHd: '正在编码高清…',
  editHelpLine: '正在编辑…在下方修改文字后按保存关闭。',
  cardTextOriginal: '原文',
  cardTextLocal: '本地',
  cardTranslationToggleAria: '标题与说明语言',
}

const AR: Pack = {
  ...EN,
  openMediaAria: 'فتح {title}',
  feedComment: 'تعليق',
  feedChat: 'دردشة',
  feedDownload: 'تنزيل',
  downloading: 'جارٍ التنزيل ...',
  openCommentsAria: 'فتح التعليقات',
  openFeedChatAria: 'فتح الدردشة',
  openFeedDownloadAria: 'تنزيل الوسائط',
  free: 'مجاني',
  realBadge: 'واقعي',
  signInToPostComment: 'سجّل الدخول لنشر تعليق.',
  couldNotPost: 'تعذر نشر التعليق.',
  couldNotUpdate: 'تعذر تحديث التعليق.',
  couldNotDelete: 'تعذر حذف التعليق.',
  couldNotDeleteGeneric: 'تعذر حذف التعليق.',
  deleteCommentTitle: 'حذف هذا التعليق؟',
  commentModalLoading: 'جارٍ تحميل التعليقات…',
  placeholderWriteComment: 'اكتب تعليقًا…',
  placeholderEditComment: 'عدّل التعليق…',
  cancelEdit: 'إلغاء التعديل',
  posting: 'جارٍ النشر…',
  saving: 'جارٍ الحفظ…',
  save: 'حفظ',
  post: 'نشر',
  signInBlurb: 'سجّل الدخول للتعليق على هذه الوسائط.',
  mutePreplayTitle: 'كتم معاينة الفيديو في الصفحة الرئيسية',
  unmutePreplayTitle: 'إلغاء كتم معاينة الفيديو في الصفحة الرئيسية',
  encodingHd: 'ترميز HD…',
  editHelpLine: 'جارٍ التعديل… غيّر النص أدناه ثم احفظ للإغلاق.',
  cardTextOriginal: 'الأصلي',
  cardTextLocal: 'المحلي',
  cardTranslationToggleAria: 'لغة العنوان والوصف',
}

const HI: Pack = {
  ...EN,
  openMediaAria: '{title} खोलें',
  feedComment: 'टिप्पणी',
  feedChat: 'चैट',
  feedDownload: 'डाउनलोड',
  downloading: 'डाउनलोड हो रहा है ...',
  openCommentsAria: 'टिप्पणियाँ खोलें',
  openFeedChatAria: 'चैट खोलें',
  openFeedDownloadAria: 'मीडिया डाउनलोड करें',
  free: 'मुफ़्त',
  realBadge: 'रियल',
  signInToPostComment: 'टिप्पणी पोस्ट करने के लिए लॉग इन करें।',
  couldNotPost: 'टिप्पणी पोस्ट नहीं हो सकी।',
  couldNotUpdate: 'टिप्पणी अपडेट नहीं हो सकी।',
  couldNotDelete: 'टिप्पणी हटाई नहीं जा सकी।',
  couldNotDeleteGeneric: 'टिप्पणी हटाई नहीं जा सकी।',
  deleteCommentTitle: 'यह टिप्पणी हटाएँ?',
  commentModalLoading: 'टिप्पणियाँ लोड हो रही हैं…',
  placeholderWriteComment: 'टिप्पणी लिखें…',
  placeholderEditComment: 'टिप्पणी संपादित करें…',
  cancelEdit: 'संपादन रद्द करें',
  posting: 'पोस्ट हो रहा है…',
  saving: 'सहेजा जा रहा है…',
  save: 'सहेजें',
  post: 'पोस्ट',
  signInBlurb: 'इस मीडिया पर टिप्पणी करने के लिए लॉग इन करें।',
  mutePreplayTitle: 'होम फ़ीड में वीडियो प्रीप्ले म्यूट करें',
  unmutePreplayTitle: 'होम फ़ीड में वीडियो प्रीप्ले अनम्यूट करें',
  encodingHd: 'HD एन्कोडिंग…',
  editHelpLine: 'संपादन… नीचे टेक्स्ट बदलें फिर सहेजकर बंद करें।',
  cardTextOriginal: 'मूल',
  cardTextLocal: 'स्थानीय',
  cardTranslationToggleAria: 'शीर्षक और विवरण भाषा',
}

const MESSAGES: Record<string, Pack> = {
  en: EN,
  ko: KO,
  ja: JA,
  zh: ZH,
  de: EN,
  fr: EN,
  es: EN,
  pt: EN,
  it: EN,
  ru: EN,
  ar: AR,
  hi: HI,
}

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}

export function feedCardT(
  localeTag: string | undefined,
  key: FeedCardKey,
  vars?: Record<string, string>
): string {
  const primary = (localeTag || 'en').toLowerCase().split('-')[0]
  const pack = MESSAGES[primary] ?? EN
  const raw = pack[key] ?? EN[key]
  return vars ? interpolate(raw, vars) : raw
}
