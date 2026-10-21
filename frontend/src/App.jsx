import { useEffect, useMemo, useState } from 'react'
import { Activity, Bookmark, CalendarDays, ChevronRight, Compass, Home, Menu, Search, Sparkles, Tv, X, Star, ExternalLink, Plus, Check, Trash2, Sun, Moon } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
const SEARCH_QUERY = `query SearchAnime($search: String) { Page(page: 1, perPage: 18) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) episodes status season seasonYear startDate { year month day } endDate { year month day } averageScore popularity favourites genres studios(isMain: true) { nodes { name } } format source countryOfOrigin duration nextAiringEpisode { episode airingAt timeUntilAiring } siteUrl } } }`
const TRENDING_QUERY = `query TrendingAnime($page: Int = 1, $perPage: Int = 30) { Page(page: $page, perPage: $perPage) { media(type: ANIME, sort: TRENDING_DESC) { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) episodes status season seasonYear startDate { year month day } averageScore popularity favourites genres studios(isMain: true) { nodes { name } } format source countryOfOrigin duration nextAiringEpisode { episode airingAt timeUntilAiring } siteUrl } } }`
const API = async (query, variables = {}) => { const r = await fetch(`${API_BASE}/api/anilist`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query,variables}) }); if(!r.ok) throw new Error(`AniList request failed (${r.status})`); return r.json() }
const displayNameOf = user => user?.username?.trim() || user?.email?.split('@')[0] || 'Account'
const titleOf = a => a?.title?.english || a?.title?.romaji || a?.title?.native || 'Untitled anime'
const stripHtml = s => (s || '').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#039;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim()

export default function App({ token, user, onLogout, onOpenProfile }) {
  const [active,setActive] = useState('Home')
  const [theme,setTheme] = useState(()=>localStorage.getItem('neko-theme') || 'light')
  useEffect(()=>{ localStorage.setItem('neko-theme', theme); document.documentElement.dataset.theme = theme },[theme])
  const [mobileMenu,setMobileMenu] = useState(false)
  const [query,setQuery] = useState('')
  const [selectedGenre,setSelectedGenre] = useState('All')
  const [results,setResults] = useState([])
  const [trending,setTrending] = useState([])
  const [trendingPage,setTrendingPage] = useState(1)
  const [loadingMore,setLoadingMore] = useState(false)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [watchlist,setWatchlist] = useState([])
  const [watchlistLoaded,setWatchlistLoaded] = useState(false)
  const [similarAnime,setSimilarAnime] = useState([])
  const [personalizedLoading,setPersonalizedLoading] = useState(false)
  const [accountMenu,setAccountMenu] = useState(false)
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [selected,setSelected] = useState(null)
  const [detailLoading,setDetailLoading] = useState(false)
  const [toast,setToast] = useState('')
  useEffect(()=>{let alive=true;fetch(`${API_BASE}/api/account/watchlist`,{headers:authHeaders}).then(r=>{if(!r.ok)throw new Error('Could not load watchlist');return r.json()}).then(d=>{if(alive)setWatchlist(Array.isArray(d.value)?d.value:[])}).catch(e=>console.error(e)).finally(()=>{if(alive)setWatchlistLoaded(true)});return()=>{alive=false}},[token])
  useEffect(()=>{if(!token||!watchlistLoaded)return;const timer=setTimeout(()=>{fetch(`${API_BASE}/api/account/watchlist`,{method:'PUT',headers:authHeaders,body:JSON.stringify({value:watchlist})}).catch(e=>console.error('Watchlist sync failed',e))},500);return()=>clearTimeout(timer)},[watchlist,token,watchlistLoaded])
  // Load trending anime on first render and retry when returning to Home/Explore if the first request failed.
  useEffect(()=>{if(!['Home','Explore'].includes(active)||trending.length>0)return;let cancelled=false;API(TRENDING_QUERY,{page:1,perPage:30}).then(d=>{if(cancelled)return;const items=d?.data?.Page?.media||[];setTrending(items);if(!items.length)setError('AniList returned no anime. Check the backend and try again.');else setError(current=>current==='Could not load AniList. Check that the backend is running.'?'':current)}).catch(()=>{if(!cancelled)setError('Could not load AniList. Check that the backend is running.')});return()=>{cancelled=true}},[active,trending.length])
  // Fetch AniList's related-title recommendations for a few saved anime. This is separate
  // from trending, so a slow recommendation request never blocks Home or Explore.
  const watchlistIds = useMemo(() => watchlist.map(item => Number(item.id)).filter(Number.isFinite).slice(0, 4), [watchlist])
  useEffect(() => {
    if (!watchlistLoaded || !watchlistIds.length) { setSimilarAnime([]); setPersonalizedLoading(false); return }
    let cancelled = false
    setPersonalizedLoading(true)
    const recommendationQuery = `query SavedAnimeRecommendations($id: Int) { Media(id: $id, type: ANIME) { recommendations(perPage: 12, sort: RATING_DESC) { nodes { mediaRecommendation { id title { romaji english native } coverImage { extraLarge large } bannerImage description(asHtml: false) episodes status season seasonYear averageScore popularity favourites genres format siteUrl } } } } }`
    Promise.allSettled(watchlistIds.map(id => API(recommendationQuery, { id })))
      .then(responses => {
        if (cancelled) return
        const unique = new Map()
        responses.forEach(response => {
          const media = response.status === 'fulfilled' ? response.value?.data?.Media?.recommendations?.nodes || [] : []
          media.forEach(node => { const anime = node?.mediaRecommendation; if (anime?.id) unique.set(anime.id, anime) })
        })
        setSimilarAnime([...unique.values()])
      })
      .catch(() => { if (!cancelled) setSimilarAnime([]) })
      .finally(() => { if (!cancelled) setPersonalizedLoading(false) })
    return () => { cancelled = true }
  }, [watchlistLoaded, watchlistIds.join(',')])
  async function loadMoreTrending(){if(loadingMore)return;setLoadingMore(true);setError('');try{const nextPage=trendingPage+1;const d=await API(TRENDING_QUERY,{page:nextPage,perPage:30});const incoming=d?.data?.Page?.media||[];setTrending(old=>{const ids=new Set(old.map(a=>a.id));return [...old,...incoming.filter(a=>!ids.has(a.id))]});setTrendingPage(nextPage)}catch(err){setError(err.message||'Could not load more anime. Please try again.')}finally{setLoadingMore(false)}}
  const upcoming = useMemo(()=>[...results,...trending].filter((a,i,arr)=>a.nextAiringEpisode && arr.findIndex(x=>x.id===a.id)===i).sort((a,b)=>a.nextAiringEpisode.airingAt-b.nextAiringEpisode.airingAt),[results,trending])
  const personalizedAnime = useMemo(() => {
    const savedIds = new Set(watchlist.map(item => String(item.id)))
    const savedAnime = watchlist.map(item => item.anime).filter(Boolean)
    const genreCounts = new Map()
    savedAnime.forEach(anime => (anime.genres || []).forEach(genre => genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)))
    const genreTotal = [...genreCounts.values()].reduce((sum, count) => sum + count, 0) || 1
    const genreProfile = new Map([...genreCounts].map(([genre, count]) => [genre, count / genreTotal]))
    const candidates = new Map()
    ;[...similarAnime, ...trending].forEach(anime => { if (anime?.id && !savedIds.has(String(anime.id))) candidates.set(String(anime.id), anime) })
    const relatedIds = new Set(similarAnime.map(anime => String(anime.id)))
    return [...candidates.values()].map(anime => {
      const genres = anime.genres || []
      const genreMatch = genres.reduce((sum, genre) => sum + (genreProfile.get(genre) || 0), 0)
      const normalizedGenre = Math.min(1, genreMatch * 2.2)
      const rating = Math.max(0, Math.min(1, (anime.averageScore || 65) / 100))
      const popularity = Math.min(1, Math.log10((anime.popularity || 1) + 1) / 6)
      const related = relatedIds.has(String(anime.id)) ? 1 : 0
      const score = (normalizedGenre * 0.4) + (related * 0.25) + (rating * 0.2) + (popularity * 0.15)
      const sharedGenres = genres.filter(genre => genreProfile.has(genre)).sort((a, b) => (genreProfile.get(b) || 0) - (genreProfile.get(a) || 0))
      const reason = related && sharedGenres.length ? `Similar to your saved anime · ${sharedGenres.slice(0, 2).join(', ')}` : related ? 'Related to anime in your watchlist' : sharedGenres.length ? `Matches your taste · ${sharedGenres.slice(0, 2).join(', ')}` : 'Popular pick with a strong rating'
      return { anime, score, reason }
    }).sort((a, b) => b.score - a.score).map(item => ({ ...item.anime, _recommendationReason: item.reason, _recommendationScore: item.score }))
  }, [watchlist, similarAnime, trending])
  async function searchAnime(e){e?.preventDefault();if(!query.trim()){setError('Type an anime title to search.');return}setLoading(true);setError('');setActive('Explore');try{const d=await API(SEARCH_QUERY,{search:query.trim()});setResults(d?.data?.Page?.media||[]);if(!d?.data?.Page?.media?.length)setError('No results found. Try another title.')}catch(err){setError(err.message||'Could not load anime data.')}finally{setLoading(false)}}
  async function openAnime(anime){setSelected(anime);setDetailLoading(true);try{const q=`query ($id:Int){Media(id:$id,type:ANIME){id title {romaji english native} coverImage {extraLarge large} bannerImage description(asHtml:false) episodes status season seasonYear startDate {year month day} endDate {year month day} averageScore popularity favourites genres studios(isMain:true){nodes{name}} format source countryOfOrigin duration nextAiringEpisode{episode airingAt timeUntilAiring} siteUrl}}`;const d=await API(q,{id:anime.id});if(d?.data?.Media)setSelected(d.data.Media)}catch{}finally{setDetailLoading(false)}}
  function toggleWatch(anime){setWatchlist(old=>old.some(x=>String(x.id)===String(anime.id))?old.filter(x=>String(x.id)!==String(anime.id)):[...old,{id:anime.id,title:titleOf(anime),image:anime.coverImage?.large||anime.coverImage?.extraLarge,url:anime.siteUrl,anime}]);setToast(watchlist.some(x=>String(x.id)===String(anime.id))?'Removed from watchlist':'Added to watchlist');setTimeout(()=>setToast(''),2200)}
  const nav=[{name:'Home',icon:Home},{name:'Explore',icon:Compass},{name:'Upcoming',icon:CalendarDays},{name:'Watchlist',icon:Bookmark}]
  const activeAnime = active==='Home' ? trending.slice(0,6) : active==='Explore' ? (results.length ? results : trending) : active==='Upcoming' ? upcoming : active==='Watchlist' ? watchlist.map(w=>w.anime||{id:w.id,title:{romaji:w.title},coverImage:{large:w.image},siteUrl:w.url}) : []
  const exploreGenres = ['All','Action','Adventure','Comedy','Drama','Fantasy','Romance','Sci-Fi','Mystery']
  const visibleAnime = active==='Explore' && selectedGenre!=='All'
    ? activeAnime.filter(anime => (anime.genres||[]).some(genre => genre.toLowerCase()===selectedGenre.toLowerCase()))
    : activeAnime
  return <div className={`app-shell neko-shell theme-${theme}`} data-theme={theme}>
    <aside className={`sidebar ${mobileMenu?'open':''}`}><div className="brand"><div className="brand-mark neko-mark">N<span>✦</span></div><div><b>NEKO</b><small>YOUR ANIME COMPANION</small></div><button className="icon-btn close-menu" onClick={()=>setMobileMenu(false)}><X size={18}/></button></div><div className="side-label">MENU</div><nav>{nav.map(item=><button key={item.name} className={`nav-item ${active===item.name?'selected':''}`} onClick={()=>{setActive(item.name);setMobileMenu(false)}}><item.icon size={18}/><span>{item.name}</span></button>)}</nav><div className="sidebar-bottom"><div className="status-orb"><Activity size={16}/></div><div><b>Neko is ready</b><small>Your anime companion</small></div></div></aside>
    {mobileMenu&&<button className="mobile-overlay" aria-label="Close menu" onClick={()=>setMobileMenu(false)}/>}
    <main className="main-area"><header className="topbar"><button className="icon-btn menu-btn" onClick={()=>setMobileMenu(true)}><Menu size={20}/></button><div className="breadcrumb">Neko <ChevronRight size={14}/><b>{active}</b></div><div className="top-actions"><button className="theme-toggle" onClick={()=>setTheme(current=>current==='light'?'dark':'light')} aria-label={`Switch to ${theme==='light'?'dark':'light'} theme`} title={`Switch to ${theme==='light'?'dark':'light'} theme`}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}<span>{theme==='light'?'Dark mode':'Light mode'}</span></button><div className="account-wrap"><button className="account-button" onClick={()=>setAccountMenu(v=>!v)} title={user?.email||'Account'}>{(user?.avatar_url || user?.avatarUrl || user?.avatar || user?.profile_picture || user?.profilePicture) ? <img className="account-avatar account-avatar-image" src={user.avatar_url || user.avatarUrl || user.avatar || user.profile_picture || user.profilePicture} alt={`${displayNameOf(user)} avatar`} /> : <span className="account-avatar">{displayNameOf(user).charAt(0).toUpperCase()}</span>}<span className="account-email">{displayNameOf(user)}</span></button>{accountMenu&&<div className="account-popover"><b>{displayNameOf(user)}</b><small>{user?.email || 'Personal Neko account'}</small><button onClick={()=>{setAccountMenu(false);onOpenProfile?.()}}>Profile &amp; settings</button><button onClick={()=>{setAccountMenu(false);onLogout()}}>Sign out</button></div>}</div></div></header>
      <div className="content">

          {active==='Explore' ? (
            <section className="explore-hub">
              <div className="explore-hub-copy">
                <div className="eyebrow"><Compass size={14}/> DISCOVER YOUR NEXT FAVORITE</div>
                <h1>Find anime <span>your way.</span></h1>
                <p>Browse what's trending, filter by genre, or search for a specific series.</p>
              </div>
              <form className="search-box neko-search explore-search" onSubmit={searchAnime}>
                <Search size={19}/>
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search titles, characters, or series..." aria-label="Search anime"/>
                <button disabled={loading}>{loading?'Searching…':'Search'}</button>
              </form>
              <div className="explore-quick-stats">
                <span><i className="live-dot"/> Updated from AniList</span>
                <span>{activeAnime.length} titles to discover</span>
                <span>{watchlist.length} saved</span>
              </div>
            </section>
          ) : (
            <section className="neko-welcome"><div><div className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL ANIME SPACE</div><h1>{active==='Home'?'Find your next':active==='Watchlist'?'Your saved':'Anime airing'} <span>{active==='Home'?'anime obsession.':active==='Watchlist'?'watchlist.':'soon.'}</span></h1><p>Discover stories, explore anime details, and chat with Neko about anything anime.</p><form className="search-box neko-search" onSubmit={searchAnime}><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anime titles..." aria-label="Search anime"/><button disabled={loading}>{loading?'Searching…':'Search'}</button></form><div className="hero-meta"><span><i className="live-dot"/> Anime details from AniList</span><span>·</span><span>{watchlist.length} saved titles</span></div></div><div className="neko-hero-badge"><div className="neko-cat">猫</div><span>LET'S FIND YOUR NEXT FAVORITE</span></div></section>
          )}
          {error&&<div className="error-banner">{error}<button onClick={()=>setError('')} aria-label="Dismiss">×</button></div>}
          {active==='Home'&&<div className="quick-actions"><button onClick={()=>setActive('Explore')}><Compass size={17}/> Explore anime</button><button onClick={()=>setActive('Watchlist')}><Bookmark size={17}/> My watchlist</button></div>}
          {(active==='Home' || active==='Explore') && watchlist.length > 0 && (
            <section className="personalized-section">
              <div className="section-head neko-section-head personalized-heading">
                <div><div className="eyebrow"><Sparkles size={13}/> BASED ON YOUR WATCHLIST</div><h2>Picked for you</h2><p className="personalized-subtitle">Anime matched to your saved titles, genres, and ratings.</p></div>
                {active==='Home' && <button className="subtle-button" onClick={()=>setActive('Explore')}>More picks <ChevronRight size={15}/></button>}
              </div>
              {personalizedLoading && personalizedAnime.length===0 ? <div className="personalized-loading">Finding anime similar to your watchlist…</div> : personalizedAnime.length > 0 ? (
                <div className={`anime-grid neko-anime-grid personalized-grid ${active==='Home'?'personalized-home-grid':'personalized-explore-grid'}`}>
                  {personalizedAnime.slice(0, active==='Home' ? 3 : 6).map((anime,i)=><AnimeCard key={`personal-${anime.id}-${i}`} anime={anime} saved={watchlist.some(x=>String(x.id)===String(anime.id))} onOpen={()=>openAnime(anime)} onToggle={()=>toggleWatch(anime)} recommendationReason={anime._recommendationReason}/>) }
                </div>
              ) : <div className="personalized-loading">No matches yet. Save a few anime with different genres, and Neko will learn your taste.</div>}
            </section>
          )}
          <section className={`section-head neko-section-head ${active==='Explore'?'explore-results-head':''}`}><div><div className="eyebrow">{active==='Home'?'POPULAR RIGHT NOW':active==='Explore'?(query.trim()&&results.length?'SEARCH RESULTS':'CURATED DISCOVERY') :active==='Upcoming'?'AIRING SCHEDULE':'YOUR COLLECTION'}</div><h2>{active==='Home'?'Trending anime':active==='Explore'?(query.trim()&&results.length?'Search results':'Popular anime to discover'):active==='Upcoming'?'Upcoming episodes':'My watchlist'}</h2></div>{active==='Home'&&<button className="subtle-button" onClick={()=>setActive('Explore')}>Explore all <ChevronRight size={15}/></button>}{active==='Explore'&&<span className="explore-result-count">{visibleAnime.length} anime</span>}</section>
          {active==='Explore'&&<div className="genre-filter-row" aria-label="Filter anime by genre">{exploreGenres.map(genre=><button type="button" key={genre} className={selectedGenre===genre?'genre-filter active':'genre-filter'} onClick={()=>setSelectedGenre(genre)}>{genre}</button>)}</div>}
          {loading?<div className="loading-grid">{Array.from({length:8},(_,i)=><div className="skeleton-card" key={i}/>)}</div>:<div className={`anime-grid neko-anime-grid ${active==='Explore'?'explore-anime-grid':'home-anime-grid'}`}>{visibleAnime.map((anime,i)=><AnimeCard key={`${anime.id}-${i}`} anime={anime} saved={watchlist.some(x=>String(x.id)===String(anime.id))} onOpen={()=>openAnime(anime)} onToggle={()=>toggleWatch(anime)} upcoming={active==='Upcoming'}/>)}</div>}
          {!loading && active==='Explore' && !(query.trim() && results.length) && trending.length>0 && <div className="load-more-wrap"><button className="load-more-anime" onClick={loadMoreTrending} disabled={loadingMore}>{loadingMore ? 'Loading more anime…' : 'Load more anime'} <span aria-hidden="true">↓</span></button><small>Showing {trending.length} recommendations from AniList</small></div>}
          {!loading&&visibleAnime.length===0&&!error&&<div className="empty-news"><div className="news-icon"><Bookmark size={24}/></div><h3>{active==='Watchlist'?'Your watchlist is waiting':active==='Explore'?'No anime in this genre yet':'Nothing to show yet'}</h3><p>{active==='Watchlist'?'Open an anime and tap Add to watchlist to save it here.':active==='Explore'?'Try another genre or search for an anime title.':'Use the search above to discover titles, read details, and save favorites.'}</p></div>}

        <footer>NEKO <span>·</span> Your anime universe, one story at a time. </footer>
      </div>
    </main>
    {selected&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="anime-detail-modal" role="dialog" aria-modal="true" aria-label={`${titleOf(selected)} details`}><button className="detail-close" onClick={()=>setSelected(null)} aria-label="Close details"><X size={20}/></button><div className="detail-banner" style={{backgroundImage:selected.bannerImage?`linear-gradient(90deg,rgba(15,15,20,.98),rgba(15,15,20,.45)),url(${selected.bannerImage})`:undefined}}/><div className="detail-content"><img className="detail-poster" src={selected.coverImage?.extraLarge||selected.coverImage?.large} alt={`${titleOf(selected)} poster`}/><div className="detail-main"><div className="eyebrow">ANIME DETAILS {detailLoading&&'· UPDATING'}</div><h2>{titleOf(selected)}</h2>{selected.title?.native&&<p className="native-title">{selected.title.native}</p>}<div className="detail-badges">{selected.averageScore&&<span><Star size={14} fill="currentColor"/> {(selected.averageScore/10).toFixed(1)} / 10</span>}<span>{selected.status?.replaceAll('_',' ')||'Unknown status'}</span>{selected.seasonYear&&<span>{selected.season?`${selected.season} `:''}{selected.seasonYear}</span>}</div><p className="detail-synopsis">{stripHtml(selected.description)||'No synopsis is available for this title.'}</p><div className="detail-stats"><div><small>EPISODES</small><b>{selected.episodes??'TBA'}</b></div><div><small>FORMAT</small><b>{selected.format||'—'}</b></div><div><small>DURATION</small><b>{selected.duration?`${selected.duration} min`:'—'}</b></div><div><small>POPULARITY</small><b>{selected.popularity?.toLocaleString()||'—'}</b></div><div><small>FAVOURITES</small><b>{selected.favourites?.toLocaleString()||'—'}</b></div><div><small>COUNTRY</small><b>{selected.countryOfOrigin||'—'}</b></div></div><div className="detail-genres">{(selected.genres||[]).map(g=><span key={g}>{g}</span>)}</div>{selected.studios?.nodes?.length>0&&<p className="detail-studio">Studio: {selected.studios.nodes.map(s=>s.name).join(', ')}</p>}<div className="detail-actions"><button className="add-button" onClick={()=>toggleWatch(selected)}>{watchlist.some(x=>String(x.id)===String(selected.id))?<><Check size={16}/> Saved to watchlist</>:<><Plus size={16}/> Add to watchlist</>}</button>{selected.siteUrl&&<a className="source-link" href={selected.siteUrl} target="_blank" rel="noreferrer">AniList page <ExternalLink size={14}/></a>}</div></div></div></section></div>}
    {toast&&<div className="neko-toast"><Check size={16}/>{toast}</div>}
  </div>
}

function AnimeCard({anime,saved,onOpen,onToggle,upcoming,recommendationReason}){const title=titleOf(anime);const airing=anime.nextAiringEpisode?.airingAt?new Date(anime.nextAiringEpisode.airingAt*1000):null;return <article className="anime-card neko-card"><button className="neko-cover-button" onClick={onOpen} aria-label={`Read details about ${title}`}><div className="cover-wrap">{(anime.coverImage?.large||anime.coverImage?.extraLarge)?<img src={anime.coverImage.extraLarge||anime.coverImage.large} alt={`${title} cover`} loading="lazy"/>:<div className="cover-placeholder"><Tv/></div>}{anime.averageScore&&<span className="score"><Star size={12} fill="currentColor"/> {(anime.averageScore/10).toFixed(1)}</span>}<span className="cover-open">View details <ChevronRight size={14}/></span></div></button><div className="anime-card-body"><div className="anime-meta">{anime.seasonYear||anime.format||'ANIME'} <span>·</span> {(anime.status||'Unknown').replaceAll('_',' ').toLowerCase()}</div><button className="anime-title-button" onClick={onOpen}><h3>{title}</h3></button><p>{stripHtml(anime.description||'No synopsis available.').slice(0,116)}{stripHtml(anime.description||'').length>116?'…':''}</p>{recommendationReason&&<div className="recommendation-reason"><Sparkles size={12}/><span>{recommendationReason}</span></div>}<div className="genre-row">{(anime.genres||[]).slice(0,2).map(g=><span key={g}>{g}</span>)}</div>{upcoming&&airing&&<div className="airing-line"><CalendarDays size={14}/><span>Episode {anime.nextAiringEpisode.episode} · {airing.toLocaleString()}</span></div>}<div className="card-bottom"><span className="episode-count">{anime.episodes??'TBA'} eps</span><button className={`add-button ${saved?'saved':''}`} onClick={onToggle}>{saved?<><Check size={14}/> Saved</>:<><Plus size={14}/> Watchlist</>}</button></div></div></article>}
