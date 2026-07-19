/** Homepage hero / search / sort copy. Locale via language mode chrome tag. */
export type HomeHeroKey =
  | 'slogan'
  | 'searchPlaceholder'
  | 'search'
  | 'searching'
  | 'users'
  | 'viewProfile'
  | 'noResults'
  | 'sortBy'
  | 'sortAria'
  | 'mostPopular'
  | 'mostRecent'
  | 'random'
  | 'showingFrom'
  | 'showingResults'
  | 'clearSearch'

type Pack = Record<HomeHeroKey, string>

const EN: Pack = {
  slogan: 'Community for AI and Real Contents Creators and Digital Enthusiasts',
  searchPlaceholder: 'Search media or @username...',
  search: 'Search',
  searching: 'Searching...',
  users: 'Users',
  viewProfile: 'View profile →',
  noResults: 'No results found for "{query}"',
  sortBy: 'Sort by:',
  sortAria: 'Sort media by',
  mostPopular: 'Most Popular',
  mostRecent: 'Most Recent',
  random: 'Random',
  showingFrom: 'Showing content from:',
  showingResults: 'Showing results for:',
  clearSearch: 'Clear search',
}

const KO: Pack = {
  ...EN,
  slogan: 'AI·실사 콘텐츠 크리에이터와 디지털 애호가를 위한 커뮤니티',
  searchPlaceholder: '미디어 또는 @사용자명 검색...',
  search: '검색',
  searching: '검색 중...',
  users: '사용자',
  viewProfile: '프로필 보기 →',
  noResults: '"{query}"에 대한 결과가 없습니다',
  sortBy: '정렬:',
  sortAria: '미디어 정렬',
  mostPopular: '인기순',
  mostRecent: '최신순',
  random: '랜덤',
  showingFrom: '콘텐츠 출처:',
  showingResults: '검색 결과:',
  clearSearch: '검색 지우기',
}

const JA: Pack = {
  ...EN,
  slogan: 'AI・実写クリエイターとデジタル愛好家のためのコミュニティ',
  searchPlaceholder: 'メディアまたは @ユーザー名を検索...',
  search: '検索',
  searching: '検索中...',
  users: 'ユーザー',
  viewProfile: 'プロフィールを見る →',
  noResults: '「{query}」の結果はありません',
  sortBy: '並び替え:',
  sortAria: 'メディアの並び替え',
  mostPopular: '人気順',
  mostRecent: '新着順',
  random: 'ランダム',
  showingFrom: '表示中の投稿者:',
  showingResults: '検索結果:',
  clearSearch: '検索をクリア',
}

const ZH: Pack = {
  ...EN,
  slogan: '面向 AI 与真实内容创作者及数字爱好者的社区',
  searchPlaceholder: '搜索媒体或 @用户名...',
  search: '搜索',
  searching: '搜索中...',
  users: '用户',
  viewProfile: '查看资料 →',
  noResults: '未找到 “{query}” 的结果',
  sortBy: '排序:',
  sortAria: '媒体排序',
  mostPopular: '最热门',
  mostRecent: '最新',
  random: '随机',
  showingFrom: '来自:',
  showingResults: '搜索结果:',
  clearSearch: '清除搜索',
}

const DE: Pack = {
  ...EN,
  slogan: 'Community für KI- und Real-Content-Creator sowie Digital-Enthusiasten',
  searchPlaceholder: 'Medien oder @Benutzername suchen...',
  search: 'Suchen',
  searching: 'Suche läuft...',
  users: 'Benutzer',
  viewProfile: 'Profil ansehen →',
  noResults: 'Keine Ergebnisse für „{query}“',
  sortBy: 'Sortieren:',
  sortAria: 'Medien sortieren',
  mostPopular: 'Beliebteste',
  mostRecent: 'Neueste',
  random: 'Zufällig',
  showingFrom: 'Inhalte von:',
  showingResults: 'Ergebnisse für:',
  clearSearch: 'Suche löschen',
}

const FR: Pack = {
  ...EN,
  slogan: 'Communauté pour créateurs de contenus IA et réels et passionnés du numérique',
  searchPlaceholder: 'Rechercher un média ou @utilisateur...',
  search: 'Rechercher',
  searching: 'Recherche...',
  users: 'Utilisateurs',
  viewProfile: 'Voir le profil →',
  noResults: 'Aucun résultat pour « {query} »',
  sortBy: 'Trier par :',
  sortAria: 'Trier les médias',
  mostPopular: 'Les plus populaires',
  mostRecent: 'Les plus récents',
  random: 'Aléatoire',
  showingFrom: 'Contenu de :',
  showingResults: 'Résultats pour :',
  clearSearch: 'Effacer la recherche',
}

const ES: Pack = {
  ...EN,
  slogan: 'Comunidad para creadores de contenido IA y real y entusiastas digitales',
  searchPlaceholder: 'Buscar medios o @usuario...',
  search: 'Buscar',
  searching: 'Buscando...',
  users: 'Usuarios',
  viewProfile: 'Ver perfil →',
  noResults: 'No hay resultados para "{query}"',
  sortBy: 'Ordenar por:',
  sortAria: 'Ordenar medios',
  mostPopular: 'Más populares',
  mostRecent: 'Más recientes',
  random: 'Aleatorio',
  showingFrom: 'Contenido de:',
  showingResults: 'Resultados para:',
  clearSearch: 'Borrar búsqueda',
}

const PT: Pack = {
  ...EN,
  slogan: 'Comunidade para criadores de conteúdo IA e real e entusiastas digitais',
  searchPlaceholder: 'Pesquisar mídia ou @usuário...',
  search: 'Pesquisar',
  searching: 'Pesquisando...',
  users: 'Usuários',
  viewProfile: 'Ver perfil →',
  noResults: 'Nenhum resultado para "{query}"',
  sortBy: 'Ordenar por:',
  sortAria: 'Ordenar mídia',
  mostPopular: 'Mais populares',
  mostRecent: 'Mais recentes',
  random: 'Aleatório',
  showingFrom: 'Conteúdo de:',
  showingResults: 'Resultados para:',
  clearSearch: 'Limpar pesquisa',
}

const IT: Pack = {
  ...EN,
  slogan: 'Community per creator di contenuti AI e reali e appassionati digitali',
  searchPlaceholder: 'Cerca media o @username...',
  search: 'Cerca',
  searching: 'Ricerca...',
  users: 'Utenti',
  viewProfile: 'Vedi profilo →',
  noResults: 'Nessun risultato per "{query}"',
  sortBy: 'Ordina per:',
  sortAria: 'Ordina i media',
  mostPopular: 'Più popolari',
  mostRecent: 'Più recenti',
  random: 'Casuale',
  showingFrom: 'Contenuti di:',
  showingResults: 'Risultati per:',
  clearSearch: 'Cancella ricerca',
}

const RU: Pack = {
  ...EN,
  slogan: 'Сообщество для авторов ИИ и реального контента и цифровых энтузиастов',
  searchPlaceholder: 'Поиск медиа или @имя...',
  search: 'Поиск',
  searching: 'Поиск...',
  users: 'Пользователи',
  viewProfile: 'Смотреть профиль →',
  noResults: 'Ничего не найдено по запросу «{query}»',
  sortBy: 'Сортировка:',
  sortAria: 'Сортировать медиа',
  mostPopular: 'Популярные',
  mostRecent: 'Недавние',
  random: 'Случайно',
  showingFrom: 'Контент от:',
  showingResults: 'Результаты для:',
  clearSearch: 'Очистить поиск',
}

const AR: Pack = {
  ...EN,
  slogan: 'مجتمع لصنّاع محتوى الذكاء الاصطناعي والواقعي وعشاق الرقمي',
  searchPlaceholder: 'ابحث عن وسائط أو @اسم_المستخدم...',
  search: 'بحث',
  searching: 'جارٍ البحث...',
  users: 'المستخدمون',
  viewProfile: 'عرض الملف →',
  noResults: 'لا توجد نتائج لـ "{query}"',
  sortBy: 'ترتيب حسب:',
  sortAria: 'ترتيب الوسائط',
  mostPopular: 'الأكثر شعبية',
  mostRecent: 'الأحدث',
  random: 'عشوائي',
  showingFrom: 'عرض المحتوى من:',
  showingResults: 'نتائج البحث عن:',
  clearSearch: 'مسح البحث',
}

const HI: Pack = {
  ...EN,
  slogan: 'AI और वास्तविक सामग्री रचनाकारों तथा डिजिटल उत्साही लोगों का समुदाय',
  searchPlaceholder: 'मीडिया या @उपयोगकर्ता खोजें...',
  search: 'खोजें',
  searching: 'खोज हो रही है...',
  users: 'उपयोगकर्ता',
  viewProfile: 'प्रोफ़ाइल देखें →',
  noResults: '"{query}" के लिए कोई परिणाम नहीं',
  sortBy: 'क्रमबद्ध करें:',
  sortAria: 'मीडिया क्रमबद्ध करें',
  mostPopular: 'सबसे लोकप्रिय',
  mostRecent: 'सबसे हालिया',
  random: 'रैंडम',
  showingFrom: 'सामग्री इनसे:',
  showingResults: 'परिणाम इसके लिए:',
  clearSearch: 'खोज साफ़ करें',
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

export function homeHeroT(localeTag: string | undefined, key: HomeHeroKey): string {
  const primary = (localeTag || 'en').toLowerCase().split('-')[0]
  const pack = MESSAGES[primary] ?? EN
  return pack[key] ?? EN[key]
}

export function homeHeroInterpolate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}
