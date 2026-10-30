
import { useState } from 'react'

const AUTH_URL = 'http://localhost:5000/api/auth'

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateForm(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = mode === 'login' ? 'login' : 'register'

      const response = await fetch(`${AUTH_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Authentication failed.')
      }

      onLogin(data.token, data.user)
    } catch (error) {
      setError(error.message || 'Unable to connect to CivicSense.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>CivicSense</strong>
            <small>Better cities, together.</small>
          </div>
        </div>

        <p className="eyebrow">CIVIC ISSUE MANAGEMENT</p>

        <h1>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>

        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to report and track civic issues.'
            : 'Join your community and make a difference.'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Full name
              <input
                name="fullName"
                value={form.fullName}
                onChange={updateForm}
                placeholder="Enter your full name"
                required
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={updateForm}
              placeholder="Enter your email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={updateForm}
              placeholder="Enter your password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in →'
                : 'Create account →'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
            }}
          >
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  )
}

export default Auth
