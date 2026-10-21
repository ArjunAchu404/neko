import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ConferbotWidget from './ConferbotWidget.jsx'
import './styles.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verify = params.get('verify_email')
    const reset = params.get('reset_password')
    if (verify) {
      setMode('verify')
      setBusy(true)
      fetch(`${API_BASE}/api/auth/verify-email`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:verify})})
        .then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.detail||'Verification failed.'); onAuth(d) })
        .catch(e=>{setError(e.message);setMode('login')})
        .finally(()=>{setBusy(false);window.history.replaceState({},'',window.location.pathname)})
    } else if (reset) { setResetToken(reset); setMode('reset'); window.history.replaceState({},'',window.location.pathname) }
  }, [])

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      let url, body
      if (mode === 'forgot') { url='/api/auth/forgot-password'; body={email} }
      else if (mode === 'reset') { url='/api/auth/reset-password'; body={token:resetToken,password} }
      else if (mode === 'resend') { url='/api/auth/resend-verification'; body={email} }
      else { url=`/api/auth/${mode}`; body={email,password} }
      const response = await fetch(`${API_BASE}${url}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || 'Could not complete the request. Please try again.')
      if (mode === 'signup') { setNotice(data.message || 'Account created. Verify your email using the link printed in the backend terminal.'); setMode('resend'); setPassword('') }
      else if (mode === 'login') onAuth(data)
      else if (mode === 'reset') { setNotice(data.message || 'Password changed. Sign in with your new password.'); setMode('login'); setPassword(''); setResetToken('') }
      else setNotice(data.message || 'Check the backend terminal for the local development link.')
    } catch (err) { setError(err.message || 'Could not connect to Neko. Check the backend URL.') }
    finally { setBusy(false) }
  }

  const heading = ({signup:'Create your account.',login:'Welcome back.',forgot:'Reset your password.',reset:'Choose a new password.',resend:'Verify your email.',verify:'Verifying your email…'})[mode]
  const subtitle = ({signup:'Create an account to save your anime watchlist and conversations.',login:'Sign in to continue your anime journey.',forgot:'Enter your email and we’ll help you reset your password.',reset:'Choose a new password with at least 8 characters.',resend:'Check the backend terminal for your verification link during local development.',verify:'Please wait while Neko verifies your email.'})[mode]
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><div className="brand-mark neko-mark">N<span>✦</span></div><div><b>NEKO</b><small>YOUR ANIME COMPANION</small></div></div><div className="auth-eyebrow">YOUR PERSONAL ANIME SPACE</div><h1>{heading}</h1><p className="auth-subtitle">{subtitle}</p>
    {mode !== 'verify' && <form onSubmit={submit} className="auth-form">
      {mode !== 'reset' && <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>}
      {(mode==='signup'||mode==='login'||mode==='reset') && <label>{mode==='reset'?'New password':'Password'}<input type="password" autoComplete={mode==='signup'||mode==='reset'?'new-password':'current-password'} required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}
      {mode==='signup'&&<small className="auth-hint">Use at least 8 characters. You’ll need to verify your email before signing in.</small>}
      {error&&<div className="auth-error" role="alert">{error}</div>}{notice&&<div className="auth-notice" role="status">{notice}</div>}
      <button className="auth-submit" disabled={busy}>{busy?'Please wait…':({signup:'Create account',login:'Sign in',forgot:'Send reset link',reset:'Save new password',resend:'Resend verification email'})[mode]}</button>
    </form>}
    {mode==='verify'&&(error||notice)&&<div className={error?'auth-error':'auth-notice'}>{error||notice}</div>}
    <div className="auth-links">
      {mode==='login'&&<button onClick={()=>{setMode('forgot');setError('');setNotice('')}}>Forgot password?</button>}
      {mode==='forgot'&&<button onClick={()=>{setMode('resend');setError('');setNotice('')}}>Need to verify your email?</button>}
      {mode==='forgot'&&<button onClick={()=>{setMode('login');setError('');setNotice('')}}>Back to sign in</button>}
      {mode==='reset'&&<button onClick={()=>{setMode('login');setError('');setNotice('')}}>Cancel</button>}
      {(mode==='login'||mode==='signup')&&<p className="auth-switch">{mode==='signup'?'Already have an account?':'New to Neko?'} <button onClick={()=>{setMode(mode==='signup'?'login':'signup');setError('');setNotice('')}}>{mode==='signup'?'Sign in':'Create account'}</button></p>}
      {mode==='resend'&&<button onClick={()=>{setMode('signup');setError('');setNotice('')}}>Back to create account</button>}
    </div>
    {error&&mode!=='verify'&&<div className="auth-error auth-error-bottom" role="alert">{error}</div>}
    {notice&&mode!=='verify'&&<div className="auth-notice auth-notice-bottom" role="status">{notice}</div>}
    <div className="auth-security">Your chats and watchlist are private to your account.</div></section></main>
}

function ProfileScreen({token,user,onBack,onUserUpdated,onLogout}) {
  const [username,setUsername]=useState(user?.username||user?.email?.split('@')[0]||'Neko user')
  const [avatarUrl,setAvatarUrl]=useState(user?.avatar_url||'')
  const [characters,setCharacters]=useState([])
  const [avatarsLoading,setAvatarsLoading]=useState(true)
  const [avatarError,setAvatarError]=useState('')
  const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false)

  useEffect(()=>{
    let alive=true
    const query=`query NekoAvatarGallery { Page(page:1,perPage:30){ characters(sort:FAVOURITES_DESC){ id name{full} image{large} } } }`
    fetch(`${API_BASE}/api/anilist`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error('Could not load the avatar gallery.');if(d.errors?.length)throw new Error('AniList could not load the character gallery.');return d})
      .then(d=>{if(alive)setCharacters((d?.data?.Page?.characters||[]).filter(c=>c.image?.large&&c.name?.full))})
      .catch(e=>{if(alive)setAvatarError(e.message||'Could not load avatars.')})
      .finally(()=>{if(alive)setAvatarsLoading(false)})
    return()=>{alive=false}
  },[])

  async function save(e){
    e.preventDefault();setBusy(true);setMessage('');setError('')
    try{
      const r=await fetch(`${API_BASE}/api/account/profile`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({username,avatar_url:avatarUrl})})
      const d=await r.json();if(!r.ok)throw new Error(d.detail||'Could not save profile')
      onUserUpdated(d.user);setMessage('Profile saved successfully.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function removeAccount(){
    if(!window.confirm('Delete your account and all associated chats and watchlist data? This cannot be undone.'))return
    try{const r=await fetch(`${API_BASE}/api/account/me`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error('Could not delete account');await onLogout()}catch(e){setError(e.message)}
  }
  return <main className="auth-page"><section className="auth-card profile-card">
    <button className="profile-back" onClick={onBack}>← Back to Neko</button>
    <div className="auth-eyebrow">ACCOUNT SETTINGS</div><h1>Your profile.</h1><p className="auth-subtitle">Choose an anime character to represent you around Neko.</p>
    <form className="auth-form" onSubmit={save}>
      <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} minLength={2} maxLength={32} required placeholder="Your display name" /></label>
      <div className="avatar-picker-section">
        <div className="avatar-picker-heading"><b>Choose your anime avatar</b><span>{characters.length ? `${characters.length} characters` : 'Character gallery'}</span></div>
        <p className="avatar-picker-help">Select a character portrait. Your choice is saved to your account.</p>
        {avatarUrl&&<div className="selected-avatar-preview"><img src={avatarUrl} alt="Selected avatar preview" /><div><b>Current avatar</b><small>Click another character below to change it.</small></div><button type="button" onClick={()=>setAvatarUrl('')} className="avatar-reset">Use default</button></div>}
        {avatarsLoading&&<div className="avatar-gallery-status">Loading popular anime characters…</div>}
        {avatarError&&!characters.length&&<div className="avatar-gallery-status avatar-gallery-error">{avatarError} Check that the backend and AniList connection are available.</div>}
        {!avatarsLoading&&characters.length>0&&<div className="avatar-gallery" role="radiogroup" aria-label="Anime character avatars">
          {characters.map(character=><button type="button" key={character.id} className={`avatar-choice ${avatarUrl===character.image.large?'selected':''}`} onClick={()=>setAvatarUrl(character.image.large)} role="radio" aria-checked={avatarUrl===character.image.large} title={character.name.full}>
            <img src={character.image.large} alt="" loading="lazy"/><span>{character.name.full}</span>{avatarUrl===character.image.large&&<i>✓</i>}
          </button>)}
        </div>}
        {!avatarsLoading&&!characters.length&&!avatarError&&<div className="avatar-gallery-status">No characters were returned. Please try again later.</div>}
      </div>
      <label>Email address<input value={user?.email||''} readOnly /></label>
      <div className="profile-verified">Email status: {user?.email_verified?'Verified':'Not verified'}</div>
      {error&&<div className="auth-error">{error}</div>}{message&&<div className="auth-notice">{message}</div>}
      <button className="auth-submit" disabled={busy}>{busy?'Saving…':'Save profile'}</button>
    </form>
    <button className="delete-account" onClick={removeAccount}>Delete account and data</button><button className="profile-logout" onClick={onLogout}>Sign out</button>
  </section></main>
}
function AuthRoot() {
  const [session, setSession] = useState(() => ({ token: localStorage.getItem('neko-auth-token') || '', user: null }))
  const [checking, setChecking] = useState(true)
  const [showProfile,setShowProfile]=useState(false)
  useEffect(() => { let alive=true;const token=localStorage.getItem('neko-auth-token');if(!token){setChecking(false);return}fetch(`${API_BASE}/api/auth/me`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||'Session expired');if(alive)setSession({token,user:d.user})}).catch(()=>{localStorage.removeItem('neko-auth-token');if(alive)setSession({token:'',user:null})}).finally(()=>{if(alive)setChecking(false)});return()=>{alive=false}},[])
  function acceptAuth(data){localStorage.setItem('neko-auth-token',data.token);setSession({token:data.token,user:data.user});setShowProfile(false)}
  async function logout(){const token=session.token;try{await fetch(`${API_BASE}/api/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`}})}catch{}localStorage.removeItem('neko-auth-token');setSession({token:'',user:null});setShowProfile(false)}
  if(checking)return <main className="auth-page"><div className="auth-loading">Loading Neko…</div></main>
  if(!session.token||!session.user)return <AuthScreen onAuth={acceptAuth}/>
  return <>
    <ConferbotWidget />
    {/* Keep App mounted while ProfileScreen is open so an in-progress Neko
        response is not interrupted by profile navigation. */}
    <div style={{ display: showProfile ? 'none' : 'block' }}>
      <App
        token={session.token}
        user={session.user}
        onLogout={logout}
        onOpenProfile={() => setShowProfile(true)}
      />
    </div>
    {showProfile && (
      <ProfileScreen
        token={session.token}
        user={session.user}
        onBack={() => setShowProfile(false)}
        onUserUpdated={user => setSession(s => ({ ...s, user }))}
        onLogout={logout}
      />
    )}
  </>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AuthRoot /></React.StrictMode>)
