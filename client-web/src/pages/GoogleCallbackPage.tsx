import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function GoogleCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')
    const email = params.get('email')
    if (token) {
      localStorage.setItem('client_token', token)
    }
    if (email) {
      localStorage.setItem('client_email', email)
    }
    navigate('/chats', { replace: true })
  }, [location.search, navigate])

  return <div className="card">Signing you in...</div>
}
