import { formatViewCount } from '@/lib/formatViewCount'

/** Media detail / share UI — same locale resolution as navbar (`useUiLocale`). */
export type MediaPageKey =
  | 'edit'
  | 'close'
  | 'mediaNotFound'
  | 'goHome'
  | 'processingTitle'
  | 'processingBody'
  | 'processingOwnerNote'
  | 'failedTitle'
  | 'failedBody'
  | 'retryProcessing'
  | 'retrying'
  | 'checkThisOut'
  | 'createdBy'
  | 'aiTool'
  | 'views'
  | 'typeVideo'
  | 'typeImage'
  | 'typeMusic'
  | 'like'
  | 'unlike'
  | 'saveToMyContents'
  | 'savedToMyContents'
  | 'download'
  | 'preparing'
  | 'downloading'
  | 'share'
  | 'copied'
  | 'sendByEmail'
  | 'buyNow'
  | 'buyNowWithPrice'
  | 'processingShort'
  | 'yourPrice'
  | 'yourPriceWithAmount'
  | 'shareModalTitle'
  | 'copy'
  | 'emailAppHint'
  | 'from'
  | 'to'
  | 'emailTab'
  | 'phoneTab'
  | 'placeholderEmail'
  | 'placeholderPhone'
  | 'thumbEmailNote'
  | 'recipientEmailNote'
  | 'message'
  | 'messagePlaceholder'
  | 'cancel'
  | 'send'
  | 'sending'
  | 'deleteMedia'
  | 'cannotUndo'
  | 'deleteConfirm'
  | 'deleting'
  | 'delete'
  | 'back'
  | 'invalidEmail'
  | 'enterPhone'
  | 'phoneNotAvailable'
  | 'checkoutFail'
  | 'checkoutFailGeneric'
  | 'deleteFail'
  | 'deleteFailGeneric'
  | 'sendEmailFail'
  | 'sendEmailFailGeneric'
  | 'retryFailed'
  | 'retryFailedAlert'
  | 'someone'
  | 'emailThoughtLine'
  | 'emailThoughtAnonymous'
  | 'view'
  | 'kakaoSdk'
  | 'kakaoCopy'
  | 'youtubeCopied'
  | 'tiktokCopied'
  | 'instagramShare'

type Pack = Record<MediaPageKey, string>

const EN: Pack = {
  edit: 'Edit',
  close: 'Close',
  mediaNotFound: 'Media not found. Redirecting home…',
  goHome: 'Go Home',
  processingTitle: 'Processing...',
  processingBody:
    'Your media is being transcoded for streaming. This usually takes 1–5 minutes. The page will update automatically when ready.',
  processingOwnerNote:
    'Only you can see this page until processing completes. It won’t appear on the homepage until then.',
  failedTitle: 'Processing Failed',
  failedBody: 'There was an error processing this video. You can retry or re-upload.',
  retryProcessing: 'Retry processing',
  retrying: 'Retrying…',
  checkThisOut: 'Check this out',
  createdBy: 'Created by',
  aiTool: 'AI Tool:',
  views: 'views',
  typeVideo: 'VIDEO',
  typeImage: 'IMAGE',
  typeMusic: 'MUSIC',
  like: 'Like',
  unlike: 'Remove like',
  saveToMyContents: 'Save to My Contents',
  savedToMyContents: 'Saved to My Contents',
  download: 'Download',
  preparing: 'Preparing...',
  downloading: 'Downloading ...',
  share: 'Share',
  copied: 'Copied!',
  sendByEmail: 'Send by email',
  buyNow: 'Buy Now',
  buyNowWithPrice: 'Buy Now - {price}',
  processingShort: 'Processing...',
  yourPrice: 'Your Price:',
  yourPriceWithAmount: 'Your Price: {price}',
  shareModalTitle: 'Share',
  copy: 'Copy',
  emailAppHint: 'Email (opens your email app)',
  from: 'From:',
  to: 'To:',
  emailTab: 'Email',
  phoneTab: 'Phone',
  placeholderEmail: 'Type Email Address',
  placeholderPhone: 'Type Phone Number',
  thumbEmailNote: 'This thumbnail will be in the email (clickable link)',
  recipientEmailNote:
    'Recipient will get an email with a thumbnail linked to this media so they can click to watch.',
  message: 'Message',
  messagePlaceholder: 'Add a personal message...',
  cancel: 'Cancel',
  send: 'Send',
  sending: 'Sending...',
  deleteMedia: 'Delete Media',
  cannotUndo: 'This action cannot be undone',
  deleteConfirm:
    'Are you sure you want to delete "{title}"? This will permanently remove the media file and all associated comments and ratings.',
  deleting: 'Deleting...',
  delete: 'Delete',
  back: '← Back',
  invalidEmail: 'Please enter a valid email address.',
  enterPhone: 'Please enter a phone number.',
  phoneNotAvailable: 'Phone delivery is not yet available.',
  checkoutFail: 'Failed to start checkout',
  checkoutFailGeneric: 'Failed to start checkout. Please try again.',
  deleteFail: 'Failed to delete media',
  deleteFailGeneric: 'Failed to delete media',
  sendEmailFail: 'Failed to send email',
  sendEmailFailGeneric: 'Failed to send email',
  retryFailed: 'Retry failed',
  retryFailedAlert: 'Retry failed. Please try again.',
  someone: 'Someone',
  emailThoughtLine: '{who} thought you might be interested in this.',
  emailThoughtAnonymous: 'Someone thought you might be interested in this.',
  view: 'View',
  kakaoSdk: 'KakaoTalk',
  kakaoCopy: 'KakaoTalk (copies link — paste in KakaoTalk)',
  youtubeCopied: 'YouTube (link copied)',
  tiktokCopied: 'TikTok (link copied)',
  instagramShare:
    'Share: phone may offer Instagram app; otherwise opens a Threads post with your link (Meta — Instagram has no web share URL like LinkedIn)',
}

const KO: Pack = {
  ...EN,
  edit: '수정',
  close: '닫기',
  mediaNotFound: '미디어를 찾을 수 없습니다. 홈으로 이동합니다…',
  goHome: '홈으로',
  processingTitle: '처리 중…',
  processingBody:
    '스트리밍용으로 미디어를 변환하는 중입니다. 보통 1~5분 정도 걸리며, 준비되면 이 페이지가 자동으로 갱신됩니다.',
  processingOwnerNote: '처리가 끝나기 전까지 이 페이지는 본인만 볼 수 있으며, 완료 전에는 홈 피드에 표시되지 않습니다.',
  failedTitle: '처리 실패',
  failedBody: '이 동영상 처리 중 오류가 발생했습니다. 다시 시도하거나 다시 업로드할 수 있습니다.',
  retryProcessing: '처리 다시 시도',
  retrying: '다시 시도 중…',
  checkThisOut: '이 콘텐츠를 확인해 보세요',
  createdBy: '작성자',
  aiTool: 'AI 도구:',
  views: '조회',
  typeVideo: '동영상',
  typeImage: '이미지',
  typeMusic: '음악',
  like: '좋아요',
  unlike: '좋아요 취소',
  saveToMyContents: '내 콘텐츠에 저장',
  savedToMyContents: '내 콘텐츠에 저장됨',
  download: '다운로드',
  preparing: '준비 중…',
  downloading: '다운로드 중…',
  share: '공유',
  copied: '복사됨!',
  sendByEmail: '이메일로 보내기',
  buyNow: '바로 구매',
  buyNowWithPrice: '바로 구매 - {price}',
  processingShort: '처리 중…',
  yourPrice: '내 판매가:',
  yourPriceWithAmount: '내 판매가: {price}',
  shareModalTitle: '공유',
  copy: '복사',
  emailAppHint: '이메일(기본 메일 앱이 열립니다)',
  from: '보낸 사람:',
  to: '받는 사람:',
  emailTab: '이메일',
  phoneTab: '휴대폰',
  placeholderEmail: '이메일 주소 입력',
  placeholderPhone: '휴대폰 번호 입력',
  thumbEmailNote: '이 썸네일이 이메일에 포함되며(링크로 연결됨) 클릭할 수 있습니다.',
  recipientEmailNote: '받는 사람은 썸네일이 포함된 이메일을 받고, 클릭하면 이 미디어를 시청할 수 있습니다.',
  message: '메시지',
  messagePlaceholder: '개인 메시지를 입력하세요…',
  cancel: '취소',
  send: '보내기',
  sending: '보내는 중…',
  deleteMedia: '미디어 삭제',
  cannotUndo: '이 작업은 되돌릴 수 없습니다',
  deleteConfirm:
    '「{title}」을(를) 삭제할까요? 미디어 파일과 관련 댓글·평가가 영구적으로 삭제됩니다.',
  deleting: '삭제 중…',
  delete: '삭제',
  back: '← 뒤로',
  invalidEmail: '올바른 이메일 주소를 입력해 주세요.',
  enterPhone: '휴대폰 번호를 입력해 주세요.',
  phoneNotAvailable: '휴대폰 전송은 아직 사용할 수 없습니다.',
  checkoutFail: '결제를 시작하지 못했습니다',
  checkoutFailGeneric: '결제를 시작하지 못했습니다. 다시 시도해 주세요.',
  deleteFail: '미디어를 삭제하지 못했습니다',
  deleteFailGeneric: '미디어를 삭제하지 못했습니다',
  sendEmailFail: '이메일을 보내지 못했습니다',
  sendEmailFailGeneric: '이메일을 보내지 못했습니다',
  retryFailed: '다시 시도 실패',
  retryFailedAlert: '다시 시도하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  someone: '누군가',
  emailThoughtLine: '{who}님이 이 미디어를 보시면 좋겠다고 하셨습니다.',
  emailThoughtAnonymous: '누군가가 이 미디어를 보시면 좋겠다고 했습니다.',
  view: '보기',
  kakaoSdk: '카카오톡',
  kakaoCopy: '카카오톡(링크 복사 — 카카오톡에 붙여넣기)',
  youtubeCopied: 'YouTube(링크 복사됨)',
  tiktokCopied: 'TikTok(링크 복사됨)',
  instagramShare:
    '공유: 휴대폰에서 인스타그램 앱이 열릴 수 있으며, 그렇지 않으면 링크가 포함된 Threads 게시로 이동합니다.',
}

const JA: Pack = {
  ...EN,
  edit: '編集',
  close: '閉じる',
  mediaNotFound: 'メディアが見つかりません。ホームに移動します…',
  goHome: 'ホームへ',
  processingTitle: '処理中…',
  processingBody:
    'ストリーミング用にトランスコードしています。通常1〜5分ほどで、準備ができたらこのページが自動更新されます。',
  processingOwnerNote: '処理が完了するまでこのページは本人のみ表示され、ホームには表示されません。',
  failedTitle: '処理に失敗しました',
  failedBody: '動画の処理中にエラーが発生しました。再試行するか、再アップロードしてください。',
  retryProcessing: '処理を再試行',
  retrying: '再試行中…',
  checkThisOut: 'このコンテンツをチェック',
  createdBy: '作成者',
  aiTool: 'AIツール:',
  views: '視聴',
  typeVideo: '動画',
  typeImage: '画像',
  typeMusic: '音楽',
  like: 'いいね',
  unlike: 'いいねを取り消す',
  saveToMyContents: 'マイコンテンツに保存',
  savedToMyContents: '保存済み',
  download: 'ダウンロード',
  preparing: '準備中…',
  downloading: 'ダウンロード中…',
  share: '共有',
  copied: 'コピーしました',
  sendByEmail: 'メールで送る',
  buyNow: '今すぐ購入',
  buyNowWithPrice: '今すぐ購入 - {price}',
  processingShort: '処理中…',
  yourPrice: 'あなたの価格:',
  yourPriceWithAmount: 'あなたの価格: {price}',
  shareModalTitle: '共有',
  copy: 'コピー',
  emailAppHint: 'メール（メールアプリが開きます）',
  from: '差出人:',
  to: '宛先:',
  emailTab: 'メール',
  phoneTab: '電話',
  placeholderEmail: 'メールアドレスを入力',
  placeholderPhone: '電話番号を入力',
  thumbEmailNote: 'このサムネイルがメールに表示され（リンク付き）クリックできます。',
  recipientEmailNote: '受信者はサムネイル付きのメールを受け取り、クリックして視聴できます。',
  message: 'メッセージ',
  messagePlaceholder: 'メッセージを追加…',
  cancel: 'キャンセル',
  send: '送信',
  sending: '送信中…',
  deleteMedia: 'メディアを削除',
  cannotUndo: 'この操作は取り消せません',
  deleteConfirm:
    '「{title}」を削除しますか？メディアファイルと関連するコメント・評価が完全に削除されます。',
  deleting: '削除中…',
  delete: '削除',
  back: '← 戻る',
  invalidEmail: '有効なメールアドレスを入力してください。',
  enterPhone: '電話番号を入力してください。',
  phoneNotAvailable: '電話での送信はまだ利用できません。',
  checkoutFail: 'チェックアウトを開始できませんでした',
  checkoutFailGeneric: 'チェックアウトを開始できませんでした。もう一度お試しください。',
  deleteFail: 'メディアを削除できませんでした',
  deleteFailGeneric: 'メディアを削除できませんでした',
  sendEmailFail: 'メールを送信できませんでした',
  sendEmailFailGeneric: 'メールを送信できませんでした',
  retryFailed: '再試行に失敗しました',
  retryFailedAlert: '再試行に失敗しました。もう一度お試しください。',
  someone: '誰か',
  emailThoughtLine: '{who}がこのメディアを共有したいと思っています。',
  emailThoughtAnonymous: '誰かがこのメディアを共有したいと思っています。',
  view: '表示',
  kakaoSdk: 'KakaoTalk',
  kakaoCopy: 'KakaoTalk（リンクをコピー — KakaoTalkに貼り付け）',
  youtubeCopied: 'YouTube（リンクをコピー）',
  tiktokCopied: 'TikTok（リンクをコピー）',
  instagramShare: EN.instagramShare,
}

const ZH: Pack = {
  ...EN,
  edit: '编辑',
  close: '关闭',
  mediaNotFound: '未找到媒体。正在返回首页…',
  goHome: '返回首页',
  processingTitle: '处理中…',
  processingBody: '正在为流媒体转码。通常需要 1–5 分钟，准备好后本页面会自动更新。',
  processingOwnerNote: '处理完成前，仅您本人可访问此页面，且不会出现在首页。',
  failedTitle: '处理失败',
  failedBody: '处理此视频时出错。您可以重试或重新上传。',
  retryProcessing: '重试处理',
  retrying: '正在重试…',
  checkThisOut: '看看这个内容',
  createdBy: '创作者',
  aiTool: 'AI 工具：',
  views: '次观看',
  typeVideo: '视频',
  typeImage: '图片',
  typeMusic: '音乐',
  like: '赞',
  unlike: '取消赞',
  saveToMyContents: '保存到我的内容',
  savedToMyContents: '已保存到我的内容',
  download: '下载',
  preparing: '准备中…',
  downloading: '下载中…',
  share: '分享',
  copied: '已复制！',
  sendByEmail: '通过邮件发送',
  buyNow: '立即购买',
  buyNowWithPrice: '立即购买 - {price}',
  processingShort: '处理中…',
  yourPrice: '您的定价：',
  yourPriceWithAmount: '您的定价：{price}',
  shareModalTitle: '分享',
  copy: '复制',
  emailAppHint: '电子邮件（将打开系统邮件应用）',
  from: '发件人：',
  to: '收件人：',
  emailTab: '邮箱',
  phoneTab: '手机',
  placeholderEmail: '输入邮箱地址',
  placeholderPhone: '输入手机号码',
  thumbEmailNote: '此缩略图将显示在邮件中（可点击链接）。',
  recipientEmailNote: '收件人将收到带缩略图的邮件，点击即可观看此媒体。',
  message: '留言',
  messagePlaceholder: '添加个人留言…',
  cancel: '取消',
  send: '发送',
  sending: '发送中…',
  deleteMedia: '删除媒体',
  cannotUndo: '此操作无法撤销',
  deleteConfirm: '确定要删除「{title}」吗？将永久删除媒体文件及所有相关评论和评分。',
  deleting: '删除中…',
  delete: '删除',
  back: '← 返回',
  invalidEmail: '请输入有效的邮箱地址。',
  enterPhone: '请输入手机号码。',
  phoneNotAvailable: '暂不支持通过手机发送。',
  checkoutFail: '无法开始结账',
  checkoutFailGeneric: '无法开始结账。请重试。',
  deleteFail: '删除媒体失败',
  deleteFailGeneric: '删除媒体失败',
  sendEmailFail: '发送邮件失败',
  sendEmailFailGeneric: '发送邮件失败',
  retryFailed: '重试失败',
  retryFailedAlert: '重试失败。请稍后再试。',
  someone: '有人',
  emailThoughtLine: '{who}觉得您可能会对这个媒体感兴趣。',
  emailThoughtAnonymous: '有人觉得您可能会对这个媒体感兴趣。',
  view: '查看',
  kakaoSdk: 'KakaoTalk',
  kakaoCopy: 'KakaoTalk（复制链接 — 粘贴到 KakaoTalk）',
  youtubeCopied: 'YouTube（已复制链接）',
  tiktokCopied: 'TikTok（已复制链接）',
  instagramShare: EN.instagramShare,
}

const DE: Pack = {
  ...EN,
  edit: 'Bearbeiten',
  saveToMyContents: 'In „Meine Inhalte“ speichern',
  savedToMyContents: 'In „Meine Inhalte“ gespeichert',
  download: 'Herunterladen',
  share: 'Teilen',
  sendByEmail: 'Per E-Mail senden',
  createdBy: 'Erstellt von',
  views: 'Aufrufe',
  typeVideo: 'VIDEO',
  typeImage: 'BILD',
  typeMusic: 'MUSIK',
  processingTitle: 'Wird verarbeitet…',
  processingShort: 'Wird verarbeitet…',
  cancel: 'Abbrechen',
  delete: 'Löschen',
  back: '← Zurück',
  goHome: 'Zur Startseite',
  shareModalTitle: 'Teilen',
  copied: 'Kopiert!',
  copy: 'Kopieren',
  buyNow: 'Jetzt kaufen',
  yourPrice: 'Ihr Preis:',
  like: 'Gefällt mir',
  unlike: 'Gefällt mir nicht mehr',
}

const FR: Pack = {
  ...EN,
  edit: 'Modifier',
  saveToMyContents: 'Enregistrer dans Mes contenus',
  savedToMyContents: 'Enregistré dans Mes contenus',
  download: 'Télécharger',
  share: 'Partager',
  sendByEmail: 'Envoyer par e-mail',
  createdBy: 'Créé par',
  views: 'vues',
  typeVideo: 'VIDÉO',
  typeImage: 'IMAGE',
  typeMusic: 'MUSIQUE',
  processingTitle: 'Traitement…',
  processingShort: 'Traitement…',
  cancel: 'Annuler',
  delete: 'Supprimer',
  back: '← Retour',
  goHome: "À l'accueil",
  shareModalTitle: 'Partager',
  copied: 'Copié !',
  copy: 'Copier',
  buyNow: 'Acheter',
  yourPrice: 'Votre prix :',
  like: "J'aime",
  unlike: "Retirer j'aime",
}

const ES: Pack = {
  ...EN,
  edit: 'Editar',
  saveToMyContents: 'Guardar en Mis contenidos',
  savedToMyContents: 'Guardado en Mis contenidos',
  download: 'Descargar',
  share: 'Compartir',
  sendByEmail: 'Enviar por correo',
  createdBy: 'Creado por',
  views: 'vistas',
  typeVideo: 'VÍDEO',
  typeImage: 'IMAGEN',
  typeMusic: 'MÚSICA',
  processingTitle: 'Procesando…',
  processingShort: 'Procesando…',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  back: '← Volver',
  goHome: 'Ir al inicio',
  shareModalTitle: 'Compartir',
  copied: '¡Copiado!',
  copy: 'Copiar',
  buyNow: 'Comprar ahora',
  yourPrice: 'Tu precio:',
  like: 'Me gusta',
  unlike: 'Quitar me gusta',
}

const PT: Pack = {
  ...EN,
  edit: 'Editar',
  saveToMyContents: 'Salvar em Meus conteúdos',
  savedToMyContents: 'Salvo em Meus conteúdos',
  download: 'Baixar',
  share: 'Compartilhar',
  sendByEmail: 'Enviar por e-mail',
  createdBy: 'Criado por',
  views: 'visualizações',
  processingTitle: 'Processando…',
  processingShort: 'Processando…',
  cancel: 'Cancelar',
  delete: 'Excluir',
  back: '← Voltar',
  goHome: 'Ir ao início',
  shareModalTitle: 'Compartilhar',
  copied: 'Copiado!',
  copy: 'Copiar',
  buyNow: 'Comprar agora',
  yourPrice: 'Seu preço:',
  like: 'Curtir',
  unlike: 'Remover curtida',
}

const IT: Pack = {
  ...EN,
  edit: 'Modifica',
  saveToMyContents: 'Salva in I miei contenuti',
  savedToMyContents: 'Salvato in I miei contenuti',
  download: 'Scarica',
  share: 'Condividi',
  sendByEmail: 'Invia via email',
  createdBy: 'Creato da',
  views: 'visualizzazioni',
  processingTitle: 'Elaborazione…',
  processingShort: 'Elaborazione…',
  cancel: 'Annulla',
  delete: 'Elimina',
  back: '← Indietro',
  goHome: 'Vai alla home',
  shareModalTitle: 'Condividi',
  copied: 'Copiato!',
  copy: 'Copia',
  buyNow: 'Acquista ora',
  yourPrice: 'Il tuo prezzo:',
  like: 'Mi piace',
  unlike: 'Togli mi piace',
}

const RU: Pack = {
  ...EN,
  edit: 'Изменить',
  saveToMyContents: 'Сохранить в Мои материалы',
  savedToMyContents: 'Сохранено в Мои материалы',
  download: 'Скачать',
  share: 'Поделиться',
  sendByEmail: 'Отправить по почте',
  createdBy: 'Автор',
  views: 'просмотров',
  processingTitle: 'Обработка…',
  processingShort: 'Обработка…',
  cancel: 'Отмена',
  delete: 'Удалить',
  back: '← Назад',
  goHome: 'На главную',
  shareModalTitle: 'Поделиться',
  copied: 'Скопировано!',
  copy: 'Копировать',
  buyNow: 'Купить',
  yourPrice: 'Ваша цена:',
  like: 'Нравится',
  unlike: 'Убрать лайк',
}

const MESSAGES: Record<string, Pack> = {
  en: EN,
  ko: KO,
  ja: JA,
  zh: ZH,
  de: DE,
  fr: FR,
  es: ES,
  pt: PT,
  it: IT,
  ru: RU,
}

export function mediaPageT(localeTag: string | undefined, key: MediaPageKey): string {
  const primary = (localeTag || 'en').toLowerCase().split('-')[0]
  const pack = MESSAGES[primary] ?? EN
  return pack[key] ?? EN[key]
}

/** Interpolate `{title}` in delete confirmation and similar. */
export function mediaPageInterpolate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}

/** Localized "{n} views" style line for media detail. */
export function formatMediaViewsLabel(count: number, localeTag: string | undefined): string {
  const n = formatViewCount(count)
  const p = (localeTag || 'en').toLowerCase().split('-')[0]
  if (p === 'ko') return `${n}회 조회`
  if (p === 'ja') return `${n}回の視聴`
  if (p === 'zh') return `${n} 次观看`
  return `${n} ${mediaPageT(localeTag, 'views')}`
}
