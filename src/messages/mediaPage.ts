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
  | 'description'
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
  | 'card'
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
  | 'kakaoSdkUnavailable'
  | 'kakaoShareFailed'
  | 'kakaoNotConfigured'
  | 'kakaoComposeHint'
  | 'kakaoShareSend'
  | 'kakaoTitleLabel'
  | 'kakaoCharLimit'
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
  description: 'Description',
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
  card: 'Card',
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
  kakaoSdkUnavailable:
    'KakaoTalk share is unavailable on this site (SDK not loaded). Link copied — paste it in KakaoTalk.',
  kakaoNotConfigured:
    'KakaoTalk share is not configured on this deployment (JavaScript key missing at build). Link copied — paste it in KakaoTalk.',
  kakaoShareFailed:
    'KakaoTalk share could not open. Link copied — paste it in KakaoTalk. If this keeps happening, register this site domain in Kakao Developers (Platform Web + Talk Share Domain).',
  kakaoComposeHint:
    'Edit your message below, then choose who to send it to in KakaoTalk. Up to 200 characters are shown in full (no View button).',
  kakaoShareSend: 'Share on KakaoTalk',
  kakaoTitleLabel: 'Title',
  kakaoCharLimit: '{count}/200 characters',
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
  description: '설명',
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
  card: '카드',
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
  kakaoSdkUnavailable: '카카오톡 공유를 사용할 수 없습니다(SDK 미로드). 링크가 복사되었습니다 — 카카오톡에 붙여넣으세요.',
  kakaoNotConfigured:
    '카카오톡 공유가 설정되지 않았습니다(빌드 시 JavaScript 키 없음). 링크가 복사되었습니다 — 카카오톡에 붙여넣으세요.',
  kakaoShareFailed:
    '카카오톡 공유를 열 수 없습니다. 링크가 복사되었습니다 — 카카오톡에 붙여넣으세요. 계속 실패하면 Kakao Developers에서 이 사이트 도메인을 등록하세요.',
  kakaoComposeHint:
    '아래 메시지를 수정한 뒤 카카오톡에서 보낼 대상을 선택하세요. 최대 200자까지 전체 표시됩니다(보기 버튼 없음).',
  kakaoShareSend: '카카오톡으로 공유',
  kakaoTitleLabel: '제목',
  kakaoCharLimit: '{count}/200자',
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
  description: '説明',
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
  card: 'カード',
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
  kakaoSdkUnavailable:
    'KakaoTalk共有は利用できません（SDK未読み込み）。リンクをコピーしました — KakaoTalkに貼り付けてください。',
  kakaoNotConfigured:
    'KakaoTalk共有は未設定です（ビルド時にJavaScriptキーがありません）。リンクをコピーしました — KakaoTalkに貼り付けてください。',
  kakaoShareFailed:
    'KakaoTalk共有を開けませんでした。リンクをコピーしました — KakaoTalkに貼り付けてください。Kakao Developersでドメイン登録を確認してください。',
  kakaoComposeHint:
    '下のメッセージを編集してから、KakaoTalkで送信先を選んでください。最大200文字まで全文表示（表示ボタンなし）。',
  kakaoShareSend: 'KakaoTalkで共有',
  kakaoTitleLabel: 'タイトル',
  kakaoCharLimit: '{count}/200文字',
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
  description: '说明',
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
  card: '卡片',
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
  kakaoSdkUnavailable: '无法使用 KakaoTalk 分享（SDK 未加载）。链接已复制 — 请粘贴到 KakaoTalk。',
  kakaoNotConfigured: 'KakaoTalk 分享未配置（构建时缺少 JavaScript 密钥）。链接已复制 — 请粘贴到 KakaoTalk。',
  kakaoShareFailed:
    '无法打开 KakaoTalk 分享。链接已复制 — 请粘贴到 KakaoTalk。若仍失败，请在 Kakao Developers 注册本站域名。',
  kakaoComposeHint: '请先编辑下方消息，然后在 KakaoTalk 中选择发送对象。最多显示 200 个字符（无“查看”按钮）。',
  kakaoShareSend: '通过 KakaoTalk 分享',
  kakaoTitleLabel: '标题',
  kakaoCharLimit: '{count}/200 字符',
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
  description: 'Beschreibung',
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
  description: 'Description',
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
  description: 'Descripción',
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
  description: 'Descrição',
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
  description: 'Descrizione',
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
  description: 'Описание',
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

const AR: Pack = {
  ...EN,
  edit: 'تعديل',
  close: 'إغلاق',
  mediaNotFound: 'تعذر العثور على الوسائط. جارٍ التوجيه إلى الصفحة الرئيسية…',
  goHome: 'الصفحة الرئيسية',
  processingTitle: 'جارٍ المعالجة...',
  processingBody:
    'يتم تحويل الوسائط للبث. عادةً يستغرق ذلك من 1 إلى 5 دقائق. ستتحدث الصفحة تلقائيًا عند الجاهزية.',
  processingOwnerNote:
    'يمكنك فقط رؤية هذه الصفحة حتى تكتمل المعالجة. لن تظهر في الصفحة الرئيسية قبل ذلك.',
  failedTitle: 'فشلت المعالجة',
  failedBody: 'حدث خطأ أثناء معالجة هذا الفيديو. يمكنك إعادة المحاولة أو إعادة الرفع.',
  retryProcessing: 'إعادة المعالجة',
  retrying: 'جارٍ إعادة المحاولة…',
  checkThisOut: 'ألقِ نظرة على هذا',
  createdBy: 'أنشئ بواسطة',
  description: 'الوصف',
  aiTool: 'أداة الذكاء الاصطناعي:',
  views: 'مشاهدة',
  typeVideo: 'فيديو',
  typeImage: 'صورة',
  typeMusic: 'موسيقى',
  like: 'إعجاب',
  unlike: 'إزالة الإعجاب',
  saveToMyContents: 'حفظ في محتوياتي',
  savedToMyContents: 'تم الحفظ في محتوياتي',
  download: 'تنزيل',
  preparing: 'جارٍ التحضير...',
  downloading: 'جارٍ التنزيل ...',
  share: 'مشاركة',
  card: 'بطاقة',
  copied: 'تم النسخ!',
  sendByEmail: 'إرسال بالبريد',
  buyNow: 'اشترِ الآن',
  buyNowWithPrice: 'اشترِ الآن - {price}',
  processingShort: 'جارٍ المعالجة...',
  yourPrice: 'سعرك:',
  yourPriceWithAmount: 'سعرك: {price}',
  shareModalTitle: 'مشاركة',
  copy: 'نسخ',
  emailAppHint: 'البريد (يفتح تطبيق البريد لديك)',
  from: 'من:',
  to: 'إلى:',
  emailTab: 'البريد',
  phoneTab: 'الهاتف',
  placeholderEmail: 'أدخل عنوان البريد',
  placeholderPhone: 'أدخل رقم الهاتف',
  thumbEmailNote: 'ستظهر هذه الصورة المصغرة في البريد (رابط قابل للنقر)',
  recipientEmailNote:
    'سيتلقى المستلم بريدًا بصورة مصغرة مرتبطة بهذه الوسائط ليتمكن من المشاهدة بالنقر.',
  message: 'رسالة',
  messagePlaceholder: 'أضف رسالة شخصية...',
  cancel: 'إلغاء',
  send: 'إرسال',
  sending: 'جارٍ الإرسال...',
  deleteMedia: 'حذف الوسائط',
  cannotUndo: 'لا يمكن التراجع عن هذا الإجراء',
  deleteConfirm:
    'هل أنت متأكد من حذف "{title}"؟ سيؤدي ذلك إلى حذف ملف الوسائط وجميع التعليقات والتقييمات المرتبطة نهائيًا.',
  deleting: 'جارٍ الحذف...',
  delete: 'حذف',
  back: '→ رجوع',
  invalidEmail: 'يرجى إدخال عنوان بريد صالح.',
  enterPhone: 'يرجى إدخال رقم هاتف.',
  phoneNotAvailable: 'التسليم عبر الهاتف غير متاح بعد.',
  checkoutFail: 'تعذر بدء الدفع',
  checkoutFailGeneric: 'تعذر بدء الدفع. يرجى المحاولة مرة أخرى.',
  deleteFail: 'تعذر حذف الوسائط',
  deleteFailGeneric: 'تعذر حذف الوسائط',
  sendEmailFail: 'تعذر إرسال البريد',
  sendEmailFailGeneric: 'تعذر إرسال البريد',
  retryFailed: 'فشلت إعادة المحاولة',
  retryFailedAlert: 'فشلت إعادة المحاولة. يرجى المحاولة مرة أخرى.',
  someone: 'شخص ما',
  emailThoughtLine: 'ظنّ {who} أن هذا قد يهمك.',
  emailThoughtAnonymous: 'ظنّ شخص ما أن هذا قد يهمك.',
  view: 'عرض',
  kakaoTitleLabel: 'العنوان',
  kakaoCharLimit: '{count}/200 حرفًا',
  kakaoShareSend: 'مشاركة عبر KakaoTalk',
}

const HI: Pack = {
  ...EN,
  edit: 'संपादित करें',
  close: 'बंद करें',
  mediaNotFound: 'मीडिया नहीं मिला। होम पर भेजा जा रहा है…',
  goHome: 'होम जाएँ',
  processingTitle: 'प्रोसेस हो रहा है...',
  processingBody:
    'मीडिया को स्ट्रीमिंग के लिए ट्रांसकोड किया जा रहा है। इसमें आमतौर पर 1–5 मिनट लगते हैं। तैयार होने पर पेज अपने आप अपडेट होगा।',
  processingOwnerNote:
    'प्रोसेसिंग पूरी होने तक यह पेज केवल आप देख सकते हैं। तब तक यह होमपेज पर नहीं दिखेगा।',
  failedTitle: 'प्रोसेसिंग विफल',
  failedBody: 'इस वीडियो को प्रोसेस करते समय त्रुटि हुई। आप फिर से कोशिश कर सकते हैं या दोबारा अपलोड कर सकते हैं।',
  retryProcessing: 'प्रोसेसिंग फिर से आज़माएँ',
  retrying: 'फिर से कोशिश…',
  checkThisOut: 'यह देखें',
  createdBy: 'द्वारा बनाया गया',
  description: 'विवरण',
  aiTool: 'AI टूल:',
  views: 'व्यूज़',
  typeVideo: 'वीडियो',
  typeImage: 'छवि',
  typeMusic: 'संगीत',
  like: 'पसंद',
  unlike: 'पसंद हटाएँ',
  saveToMyContents: 'मेरी सामग्री में सहेजें',
  savedToMyContents: 'मेरी सामग्री में सहेजा गया',
  download: 'डाउनलोड',
  preparing: 'तैयार हो रहा है...',
  downloading: 'डाउनलोड हो रहा है ...',
  share: 'शेयर',
  card: 'कार्ड',
  copied: 'कॉपी हो गया!',
  sendByEmail: 'ईमेल से भेजें',
  buyNow: 'अभी खरीदें',
  buyNowWithPrice: 'अभी खरीदें - {price}',
  processingShort: 'प्रोसेस हो रहा है...',
  yourPrice: 'आपकी कीमत:',
  yourPriceWithAmount: 'आपकी कीमत: {price}',
  shareModalTitle: 'शेयर',
  copy: 'कॉपी',
  emailAppHint: 'ईमेल (आपका ईमेल ऐप खोलेगा)',
  from: 'से:',
  to: 'को:',
  emailTab: 'ईमेल',
  phoneTab: 'फ़ोन',
  placeholderEmail: 'ईमेल पता लिखें',
  placeholderPhone: 'फ़ोन नंबर लिखें',
  thumbEmailNote: 'यह थंबनेल ईमेल में होगा (क्लिक करने योग्य लिंक)',
  recipientEmailNote:
    'प्राप्तकर्ता को थंबनेल वाला ईमेल मिलेगा जो इस मीडिया से जुड़ा होगा ताकि वे क्लिक करके देख सकें।',
  message: 'संदेश',
  messagePlaceholder: 'व्यक्तिगत संदेश जोड़ें...',
  cancel: 'रद्द करें',
  send: 'भेजें',
  sending: 'भेजा जा रहा है...',
  deleteMedia: 'मीडिया हटाएँ',
  cannotUndo: 'यह कार्रवाई पूर्ववत नहीं की जा सकती',
  deleteConfirm:
    'क्या आप वाकई "{title}" हटाना चाहते हैं? इससे मीडिया फ़ाइल और सभी संबंधित टिप्पणियाँ व रेटिंग स्थायी रूप से हट जाएँगी।',
  deleting: 'हटाया जा रहा है...',
  delete: 'हटाएँ',
  back: '← वापस',
  invalidEmail: 'कृपया मान्य ईमेल पता दर्ज करें।',
  enterPhone: 'कृपया फ़ोन नंबर दर्ज करें।',
  phoneNotAvailable: 'फ़ोन डिलीवरी अभी उपलब्ध नहीं है।',
  checkoutFail: 'चेकआउट शुरू नहीं हो सका',
  checkoutFailGeneric: 'चेकआउट शुरू नहीं हो सका। कृपया फिर से कोशिश करें।',
  deleteFail: 'मीडिया हटाने में विफल',
  deleteFailGeneric: 'मीडिया हटाने में विफल',
  sendEmailFail: 'ईमेल भेजने में विफल',
  sendEmailFailGeneric: 'ईमेल भेजने में विफल',
  retryFailed: 'फिर से कोशिश विफल',
  retryFailedAlert: 'फिर से कोशिश विफल। कृपया फिर से कोशिश करें।',
  someone: 'कोई',
  emailThoughtLine: '{who} ने सोचा कि यह आपको पसंद आ सकता है।',
  emailThoughtAnonymous: 'किसी ने सोचा कि यह आपको पसंद आ सकता है।',
  view: 'देखें',
  kakaoTitleLabel: 'शीर्षक',
  kakaoCharLimit: '{count}/200 अक्षर',
  kakaoShareSend: 'KakaoTalk पर शेयर करें',
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
  ar: AR,
  hi: HI,
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
  if (p === 'ar') return `${n} مشاهدة`
  if (p === 'hi') return `${n} व्यूज़`
  return `${n} ${mediaPageT(localeTag, 'views')}`
}
