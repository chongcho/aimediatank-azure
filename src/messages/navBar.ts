/** Keys for static navbar / shell copy (admin-controlled nav link labels stay in English from API). */
export type NavBarKey =
  | 'home'
  | 'notifications'
  | 'signIn'
  | 'signUp'
  | 'signOut'
  | 'openMenu'
  | 'closeMenu'
  | 'all'
  | 'videos'
  | 'images'
  | 'about'
  | 'play'
  | 'card'
  | 'kong'
  | 'markAllRead'
  | 'delete'
  | 'cancel'
  | 'selectAll'
  | 'deselectAll'
  | 'noNotifications'
  | 'turnNotifOn'
  | 'turnNotifOff'
  | 'on'
  | 'off'
  | 'post'
  | 'profile'
  | 'myContents'
  | 'membership'
  | 'support'
  | 'policy'
  | 'adminPanel'

type Pack = Record<NavBarKey, string>

const EN: Pack = {
  home: 'Home',
  notifications: 'Notifications',
  signIn: 'Sign In',
  signUp: 'Sign Up',
  signOut: 'Sign Out',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  all: 'All',
  videos: 'Videos',
  images: 'Images',
  about: 'About',
  play: 'Play',
  card: 'Card',
  kong: 'Kong',
  markAllRead: 'Mark all read',
  delete: 'Delete',
  cancel: 'Cancel',
  selectAll: 'Select All',
  deselectAll: 'Deselect All',
  noNotifications: 'No notifications',
  turnNotifOn: 'Turn notifications on',
  turnNotifOff: 'Turn notifications off',
  on: 'ON',
  off: 'OFF',
  post: 'Post',
  profile: 'Profile',
  myContents: 'My Contents',
  membership: 'Membership',
  support: 'Support',
  policy: 'Policy',
  adminPanel: 'Admin Panel',
}

const DE: Pack = {
  ...EN,
  home: 'Startseite',
  notifications: 'Benachrichtigungen',
  signIn: 'Anmelden',
  signUp: 'Registrieren',
  signOut: 'Abmelden',
  openMenu: 'Menü öffnen',
  closeMenu: 'Menü schließen',
  all: 'Alle',
  images: 'Bilder',
  about: 'Über uns',
  play: 'Spielen',
  card: 'Karte',
  markAllRead: 'Alle als gelesen',
  delete: 'Löschen',
  cancel: 'Abbrechen',
  selectAll: 'Alle auswählen',
  deselectAll: 'Auswahl aufheben',
  noNotifications: 'Keine Benachrichtigungen',
  turnNotifOn: 'Benachrichtigungen ein',
  turnNotifOff: 'Benachrichtigungen aus',
  post: 'Beitrag',
  profile: 'Profil',
  myContents: 'Meine Inhalte',
  membership: 'Mitgliedschaft',
  support: 'Hilfe',
  policy: 'Richtlinien',
  adminPanel: 'Administration',
}

const FR: Pack = {
  ...EN,
  home: 'Accueil',
  signIn: 'Connexion',
  signUp: "S'inscrire",
  signOut: 'Déconnexion',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  all: 'Tout',
  videos: 'Vidéos',
  about: 'À propos',
  play: 'Jouer',
  card: 'Carte',
  markAllRead: 'Tout marquer comme lu',
  delete: 'Supprimer',
  cancel: 'Annuler',
  selectAll: 'Tout sélectionner',
  deselectAll: 'Tout désélectionner',
  noNotifications: 'Aucune notification',
  turnNotifOn: 'Activer les notifications',
  turnNotifOff: 'Désactiver les notifications',
  post: 'Publier',
  myContents: 'Mes contenus',
  membership: 'Abonnement',
  support: 'Assistance',
  policy: 'Politique',
  adminPanel: 'Administration',
}

const ES: Pack = {
  ...EN,
  home: 'Inicio',
  signIn: 'Entrar',
  signUp: 'Registrarse',
  signOut: 'Salir',
  openMenu: 'Abrir menú',
  closeMenu: 'Cerrar menú',
  all: 'Todo',
  images: 'Imágenes',
  about: 'Acerca de',
  play: 'Jugar',
  card: 'Tarjeta',
  markAllRead: 'Marcar todo leído',
  delete: 'Eliminar',
  cancel: 'Cancelar',
  selectAll: 'Seleccionar todo',
  deselectAll: 'Deseleccionar todo',
  noNotifications: 'Sin notificaciones',
  turnNotifOn: 'Activar notificaciones',
  turnNotifOff: 'Desactivar notificaciones',
  post: 'Publicar',
  myContents: 'Mis contenidos',
  membership: 'Membresía',
  support: 'Soporte',
  policy: 'Política',
  adminPanel: 'Administración',
}

const JA: Pack = {
  ...EN,
  home: 'ホーム',
  notifications: '通知',
  signIn: 'ログイン',
  signUp: '新規登録',
  signOut: 'ログアウト',
  openMenu: 'メニューを開く',
  closeMenu: 'メニューを閉じる',
  all: 'すべて',
  videos: '動画',
  images: '画像',
  about: '概要',
  play: 'プレイ',
  card: 'カード',
  kong: 'コング',
  markAllRead: 'すべて既読',
  delete: '削除',
  cancel: 'キャンセル',
  selectAll: 'すべて選択',
  deselectAll: '選択解除',
  noNotifications: '通知はありません',
  turnNotifOn: '通知をオン',
  turnNotifOff: '通知をオフ',
  post: '投稿',
  profile: 'プロフィール',
  myContents: 'マイコンテンツ',
  membership: 'メンバーシップ',
  support: 'サポート',
  policy: 'ポリシー',
  adminPanel: '管理画面',
}

const KO: Pack = {
  ...EN,
  home: '홈',
  notifications: '알림',
  signIn: '로그인',
  signUp: '가입',
  signOut: '로그아웃',
  openMenu: '메뉴 열기',
  closeMenu: '메뉴 닫기',
  all: '전체',
  videos: '동영상',
  images: '이미지',
  about: '소개',
  play: '플레이',
  card: '카드',
  kong: '콩',
  markAllRead: '모두 읽음',
  delete: '삭제',
  cancel: '취소',
  selectAll: '전체 선택',
  deselectAll: '선택 해제',
  noNotifications: '알림 없음',
  turnNotifOn: '알림 켜기',
  turnNotifOff: '알림 끄기',
  post: '게시',
  profile: '프로필',
  myContents: '내 콘텐츠',
  membership: '멤버십',
  support: '지원',
  policy: '정책',
  adminPanel: '관리자',
}

const ZH: Pack = {
  ...EN,
  home: '首页',
  notifications: '通知',
  signIn: '登录',
  signUp: '注册',
  signOut: '退出',
  openMenu: '打开菜单',
  closeMenu: '关闭菜单',
  all: '全部',
  videos: '视频',
  images: '图片',
  about: '关于',
  play: '游戏',
  card: '卡片',
  kong: '大金刚',
  markAllRead: '全部标为已读',
  delete: '删除',
  cancel: '取消',
  selectAll: '全选',
  deselectAll: '取消全选',
  noNotifications: '暂无通知',
  turnNotifOn: '开启通知',
  turnNotifOff: '关闭通知',
  post: '发布',
  profile: '个人资料',
  myContents: '我的内容',
  membership: '会员',
  support: '支持',
  policy: '政策',
  adminPanel: '管理后台',
}

const PT: Pack = {
  ...EN,
  home: 'Início',
  notifications: 'Notificações',
  signIn: 'Entrar',
  signUp: 'Cadastrar',
  signOut: 'Sair',
  openMenu: 'Abrir menu',
  closeMenu: 'Fechar menu',
  all: 'Tudo',
  videos: 'Vídeos',
  images: 'Imagens',
  about: 'Sobre',
  play: 'Jogar',
  card: 'Cartão',
  markAllRead: 'Marcar todas como lidas',
  delete: 'Excluir',
  cancel: 'Cancelar',
  selectAll: 'Selecionar tudo',
  deselectAll: 'Desmarcar tudo',
  noNotifications: 'Sem notificações',
  turnNotifOn: 'Ativar notificações',
  turnNotifOff: 'Desativar notificações',
  post: 'Publicar',
  myContents: 'Meus conteúdos',
  membership: 'Assinatura',
  support: 'Suporte',
  policy: 'Política',
  adminPanel: 'Administração',
}

const IT: Pack = {
  ...EN,
  home: 'Home',
  notifications: 'Notifiche',
  signIn: 'Accedi',
  signUp: 'Registrati',
  signOut: 'Esci',
  openMenu: 'Apri menu',
  closeMenu: 'Chiudi menu',
  all: 'Tutti',
  videos: 'Video',
  images: 'Immagini',
  about: 'Info',
  play: 'Gioca',
  card: 'Carta',
  markAllRead: 'Segna tutto come letto',
  delete: 'Elimina',
  cancel: 'Annulla',
  selectAll: 'Seleziona tutto',
  deselectAll: 'Deseleziona tutto',
  noNotifications: 'Nessuna notifica',
  turnNotifOn: 'Attiva notifiche',
  turnNotifOff: 'Disattiva notifiche',
  post: 'Pubblica',
  profile: 'Profilo',
  myContents: 'I miei contenuti',
  membership: 'Abbonamento',
  support: 'Supporto',
  policy: 'Policy',
  adminPanel: 'Pannello admin',
}

const RU: Pack = {
  ...EN,
  home: 'Главная',
  notifications: 'Уведомления',
  signIn: 'Войти',
  signUp: 'Регистрация',
  signOut: 'Выйти',
  openMenu: 'Открыть меню',
  closeMenu: 'Закрыть меню',
  all: 'Все',
  videos: 'Видео',
  images: 'Изображения',
  about: 'О проекте',
  play: 'Играть',
  card: 'Карта',
  markAllRead: 'Прочитать все',
  delete: 'Удалить',
  cancel: 'Отмена',
  selectAll: 'Выбрать все',
  deselectAll: 'Снять выбор',
  noNotifications: 'Нет уведомлений',
  turnNotifOn: 'Включить уведомления',
  turnNotifOff: 'Выключить уведомления',
  post: 'Опубликовать',
  profile: 'Профиль',
  myContents: 'Мои материалы',
  membership: 'Подписка',
  support: 'Поддержка',
  policy: 'Правила',
  adminPanel: 'Админ-панель',
}

const NAVBAR_MESSAGES: Record<string, Pack> = {
  en: EN,
  de: DE,
  fr: FR,
  es: ES,
  ja: JA,
  ko: KO,
  zh: ZH,
  pt: PT,
  it: IT,
  ru: RU,
}

/** BCP 47 for <html lang> — best-effort from short UI tag. */
export function htmlLangFromUiTag(tag: string | undefined): string {
  const t = (tag || 'en').toLowerCase().split('-')[0]
  const map: Record<string, string> = {
    en: 'en',
    de: 'de',
    fr: 'fr',
    es: 'es',
    ja: 'ja',
    ko: 'ko',
    zh: 'zh-Hans',
    pt: 'pt',
    it: 'it',
    ru: 'ru',
  }
  return map[t] || 'en'
}

export function navBarT(localeTag: string | undefined, key: NavBarKey): string {
  const primary = (localeTag || 'en').toLowerCase().split('-')[0]
  const pack = NAVBAR_MESSAGES[primary] ?? EN
  return pack[key] ?? EN[key]
}
