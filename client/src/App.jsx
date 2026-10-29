
import { useEffect, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:5000/api/issues'

// Demo reporter ID: your existing database issue uses user ID 1.
const DEMO_REPORTER_ID = 1

const categories = [
  { value: 'sanitation', label: 'Sanitation' },
  { value: 'roads', label: 'Roads & Potholes' },
  { value: 'water_supply', label: 'Water Supply' },
  { value: 'street_lighting', label: 'Street Lighting' },
  { value: 'drainage', label: 'Drainage' },
  { value: 'waste_management', label: 'Waste Management' },
  { value: 'public_safety', label: 'Public Safety' },
  { value: 'other', label: 'Other' },
]

const statuses = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'closed', label: 'Closed' },
]

const emptyForm = {
  title: '',
  description: '',
  category: 'roads',
  address: '',
  priority: 'medium',
}

function readableLabel(value = '') {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function App() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusUpdates, setStatusUpdates] = useState({})
  const [updatingIssueId, setUpdatingIssueId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadIssues() {
      setLoading(true)
      setLoadError('')

      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)

      const query = params.toString()
      const url = query ? `${API_URL}?${query}` : API_URL

      try {
        const response = await fetch(url, { signal: controller.signal })
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Could not load civic issues.')
        }

        setIssues(Array.isArray(data.issues) ? data.issues : [])
      } catch (error) {
        if (error.name !== 'AbortError') {
          setLoadError(
            'Unable to connect to CivicSense. Make sure the backend and database are running.',
          )
          setIssues([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadIssues()
    return () => controller.abort()
  }, [statusFilter, categoryFilter, refreshKey])

  const submittedCount = issues.filter(
    (issue) => issue.status === 'submitted',
  ).length

  const inProgressCount = issues.filter(
    (issue) => issue.status === 'in_progress',
  ).length

  const resolvedCount = issues.filter(
    (issue) => issue.status === 'resolved',
  ).length

  function updateForm(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    setSubmitting(true)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          reportedBy: DEMO_REPORTER_ID,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'The issue could not be submitted.',
        )
      }

      setForm(emptyForm)
      setShowForm(false)
      setStatusFilter('')
      setCategoryFilter('')
      setNotice('Your civic issue has been submitted successfully.')
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setFormError(
        error.message ||
        'Could not submit the report. Check your backend connection.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusUpdate(issue) {
    const newStatus = statusUpdates[issue.id] ?? issue.status

    if (newStatus === issue.status) {
      setNotice('Choose a different status before updating.')
      return
    }

    setUpdatingIssueId(issue.id)
    setNotice('')

    try {
      const response = await fetch(`${API_URL}/${issue.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          changedBy: DEMO_REPORTER_ID,
          note: 'Status updated from the CivicSense dashboard',
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not update the issue status.')
      }

      setNotice(`Issue #${issue.id} status updated to ${readableLabel(newStatus)}.`)
      setStatusUpdates((current) => {
        const updated = { ...current }
        delete updated[issue.id]
        return updated
      })
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setNotice(error.message || 'Could not update the issue status.')
    } finally {
      setUpdatingIssueId(null)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="CivicSense home">
          <span className="brand-mark">C</span>
          <span>
            <strong>CivicSense</strong>
            <small>Better cities, together.</small>
          </span>
        </a>

        <div className="nav-caption">WORKSPACE</div>
        <a className="nav-link active" href="#dashboard">
          <span className="nav-icon">▦</span>
          Dashboard
        </a>
        <a className="nav-link" href="#issues">
          <span className="nav-icon">☷</span>
          Civic issues
        </a>
        <button
          className="nav-link nav-button"
          type="button"
          onClick={() => {
            setShowForm(true)
            setFormError('')
          }}
        >
          <span className="nav-icon">＋</span>
          Report an issue
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">✦</span>
            <strong>Your city. Your voice.</strong>
            <p>Small reports can lead to meaningful change.</p>
          </div>
          <div className="profile-row">
            <div className="avatar">DC</div>
            <div>
              <strong>Demo Citizen</strong>
              <small>Citizen account · ID 1</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Dashboard</strong>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <span className="status-dot" />
              Civic reporting portal
            </span>
            <div className="top-avatar">DC</div>
          </div>
        </header>

        <section className="welcome-row">
          <div>
            <p className="eyebrow">CIVIC ISSUE MANAGEMENT</p>
            <h1>Community dashboard</h1>
            <p className="welcome-copy">
              See local concerns, track reports, and help make your
              neighbourhood better.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setShowForm(true)
              setFormError('')
              setNotice('')
            }}
          >
            <span>＋</span> Report an issue
          </button>
        </section>

        {notice && (
          <div className="notice success-notice" role="status">
            <span>✓</span> {notice}
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}

        <section className="summary-grid" aria-label="Issue summary">
          <article className="summary-card">
            <div className="summary-top">
              <span className="summary-icon purple">▤</span>
              <span className="summary-label">Matching reports</span>
            </div>
            <div className="summary-number">{loading ? '—' : issues.length}</div>
            <p className="summary-foot">Issues returned by the database</p>
          </article>

          <article className="summary-card">
            <div className="summary-top">
              <span className="summary-icon amber">◷</span>
              <span className="summary-label">Submitted</span>
            </div>
            <div className="summary-number">{loading ? '—' : submittedCount}</div>
            <p className="summary-foot">Awaiting further action</p>
          </article>

          <article className="summary-card">
            <div className="summary-top">
              <span className="summary-icon blue">↗</span>
              <span className="summary-label">In progress</span>
            </div>
            <div className="summary-number">{loading ? '—' : inProgressCount}</div>
            <p className="summary-foot">Currently being addressed</p>
          </article>

          <article className="summary-card">
            <div className="summary-top">
              <span className="summary-icon green">✓</span>
              <span className="summary-label">Resolved</span>
            </div>
            <div className="summary-number">{loading ? '—' : resolvedCount}</div>
            <p className="summary-foot">Marked as resolved</p>
          </article>
        </section>

        <section className="feature-banner">
          <div className="banner-symbol">⌖</div>
          <div className="banner-copy">
            <p className="banner-kicker">A BETTER WAY TO REPORT</p>
            <h2>Notice a problem? Help us put it on the map.</h2>
            <p>Report civic concerns so they can be documented and tracked.</p>
          </div>
          <button
            className="banner-button"
            type="button"
            onClick={() => {
              setShowForm(true)
              setFormError('')
              setNotice('')
            }}
          >
            Create a report <span>→</span>
          </button>
          <div className="banner-decoration decoration-one" />
          <div className="banner-decoration decoration-two" />
        </section>

        {showForm && (
          <section className="report-panel" id="report-form">
            <div className="section-heading">
              <div>
                <p className="eyebrow">NEW SUBMISSION</p>
                <h2>Report a civic issue</h2>
                <p className="section-subtitle">
                  Describe the problem and where it is happening.
                </p>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close report form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="issue-form">
              <label>
                Issue title <span>*</span>
                <input
                  name="title"
                  value={form.title}
                  onChange={updateForm}
                  maxLength={200}
                  placeholder="e.g. Pothole near the main road"
                  required
                />
              </label>

              <label>
                Category <span>*</span>
                <select
                  name="category"
                  value={form.category}
                  onChange={updateForm}
                  required
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-full">
                Location / address <span>*</span>
                <input
                  name="address"
                  value={form.address}
                  onChange={updateForm}
                  placeholder="Enter the street, area, or landmark"
                  required
                />
              </label>

              <label>
                Priority
                <select
                  name="priority"
                  value={form.priority}
                  onChange={updateForm}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label className="form-full">
                Description <span>*</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  rows={4}
                  placeholder="Explain what is happening and how it affects the community..."
                  required
                />
              </label>

              {formError && (
                <div className="form-error form-full" role="alert">
                  {formError}
                </div>
              )}

              <div className="form-actions form-full">
                <p><span>*</span> Required fields</p>
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setShowForm(false)
                      setFormError('')
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : 'Submit report →'}
                  </button>
                </div>
              </div>
            </form>
            <p className="demo-note">
              Demo mode: reports are submitted under the existing citizen ID 1.
            </p>
          </section>
        )}

        <section className="issues-section" id="issues">
          <div className="section-heading issues-heading">
            <div>
              <p className="eyebrow">COMMUNITY REPORTS</p>
              <h2>Recent civic issues</h2>
              <p className="section-subtitle">
                Review reported concerns and their current status.
              </p>
            </div>
            <button
              type="button"
              className="refresh-button"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={loading}
            >
              ↻ <span>Refresh</span>
            </button>
          </div>

          <div className="filters">
            <div className="filter-search">
              <span>⌕</span>
              <span>Filter reports</span>
            </div>
            <label>
              <span className="sr-only">Filter by category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading && (
            <div className="state-panel">
              <div className="loader" />
              <strong>Loading community reports…</strong>
              <p>Connecting to the CivicSense database.</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="state-panel error-state">
              <span className="state-emoji">!</span>
              <strong>We couldn't load the reports</strong>
              <p>{loadError}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && issues.length === 0 && (
            <div className="state-panel">
              <span className="state-emoji">⌕</span>
              <strong>No matching issues found</strong>
              <p>Try changing the filters or submit a new civic report.</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setStatusFilter('')
                  setCategoryFilter('')
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {!loading && !loadError && issues.length > 0 && (
            <div className="issue-list">
              {issues.map((issue) => (
                <article className="issue-card" key={issue.id}>
                  <div className="issue-type-icon">
                    {issue.category === 'roads'
                      ? '⌁'
                      : issue.category === 'sanitation' ||
                        issue.category === 'waste_management'
                        ? '♻'
                        : issue.category === 'water_supply' ||
                          issue.category === 'drainage'
                          ? '≋'
                          : issue.category === 'street_lighting'
                            ? '☼'
                            : '⌖'}
                  </div>

                  <div className="issue-main">
                    <div className="issue-title-row">
                      <h3>{issue.title}</h3>
                      <span
                        className={`status-pill status-${issue.status || 'unknown'}`}
                      >
                        <span className="pill-dot" />
                        {readableLabel(issue.status || 'Unknown')}
                      </span>
                    </div>
                    <p className="issue-description">{issue.description}</p>
                    <div className="issue-meta">
                      <span>⌖ {issue.address || 'Location not provided'}</span>
                      <span>▦ {readableLabel(issue.category || 'other')}</span>
                      <span>◷ {formatDate(issue.created_at)}</span>
                    </div>
                  </div>

                  <div className="issue-side">
                    <span className={`priority-pill priority-${issue.priority || 'medium'}`}>
                      {readableLabel(issue.priority || 'medium')} priority
                    </span>

                    <small>Issue #{issue.id}</small>
                    <small>By {issue.reporter_name || 'Citizen'}</small>

                    <label className="status-editor">
                      <span>Update status</span>
                      <select
                        value={statusUpdates[issue.id] ?? issue.status}
                        onChange={(event) =>
                          setStatusUpdates((current) => ({
                            ...current,
                            [issue.id]: event.target.value,
                          }))
                        }
                        disabled={updatingIssueId === issue.id}
                      >
                        {statuses.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="status-update-button"
                      type="button"
                      onClick={() => handleStatusUpdate(issue)}
                      disabled={
                        updatingIssueId === issue.id ||
                        (statusUpdates[issue.id] ?? issue.status) === issue.status
                      }
                    >
                      {updatingIssueId === issue.id ? 'Updating...' : 'Update Status'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="data-note">
            <span className="data-note-dot" />
            Reports shown here are retrieved from the CivicSense backend.
          </div>
        </section>

        <footer className="footer">
          <span>© 2026 CivicSense</span>
          <span>Built for communities, powered by participation.</span>
        </footer>
      </main>
    </div>
  )
}

export default App
