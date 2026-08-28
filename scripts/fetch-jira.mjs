// Pulls Jira issues assigned to anyone in ASSIGNEE_EMAILS that moved through
// STATUS_DISCOVERY and STATUS_DESIGN_DONE within [DISCOVERY_START, DISCOVERY_END],
// derives the two transition dates from each issue's changelog, and writes
// docs/data.json for the static dashboard to read.

const JIRA_BASE_URL = requireEnv('JIRA_BASE_URL').replace(/\/$/, '')
const JIRA_EMAIL = requireEnv('JIRA_EMAIL')
const JIRA_API_TOKEN = requireEnv('JIRA_API_TOKEN')
const ASSIGNEE_EMAILS = requireEnv('ASSIGNEE_EMAILS')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)
const DISCOVERY_START = requireEnv('DISCOVERY_START') // e.g. 2025-08-01
const DISCOVERY_END = requireEnv('DISCOVERY_END') // e.g. 2026-08-31
const STATUS_DISCOVERY = process.env.STATUS_DISCOVERY || 'Discovery'
const STATUS_DESIGN_DONE = process.env.STATUS_DESIGN_DONE || 'Design Done'
// Kept as a secret (not hardcoded here) so the salt isn't visible in this
// public repo's source — otherwise anyone could recompute a slug from a
// known Jira accountId.
const SLUG_SALT = requireEnv('SLUG_SALT')

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')

const { createHash } = await import('node:crypto')
function slugFor(accountId) {
  if (!accountId) return 'unassigned'
  return createHash('sha256').update(`${SLUG_SALT}:${accountId}`).digest('hex').slice(0, 12)
}

async function jiraFetch(path, options = {}) {
  const res = await fetch(`${JIRA_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Jira request failed: ${res.status} ${res.statusText} ${path}\n${body}`)
  }
  return res.json()
}

async function searchIssues(jql) {
  const issues = []
  let nextPageToken = undefined
  do {
    const body = {
      jql,
      maxResults: 100,
      fields: ['summary', 'project', 'assignee'],
      ...(nextPageToken ? { nextPageToken } : {}),
    }
    const page = await jiraFetch('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    issues.push(...page.issues)
    nextPageToken = page.nextPageToken
  } while (nextPageToken)
  return issues
}

async function getFullChangelog(issueKey) {
  const histories = []
  let startAt = 0
  while (true) {
    const page = await jiraFetch(
      `/rest/api/3/issue/${issueKey}/changelog?startAt=${startAt}&maxResults=100`
    )
    histories.push(...page.values)
    if (page.startAt + page.values.length >= page.total) break
    startAt += page.values.length
  }
  return histories
}

function earliestTransitionTo(histories, statusName) {
  let earliest = null
  for (const history of histories) {
    for (const item of history.items) {
      if (item.field === 'status' && item.toString === statusName) {
        const when = new Date(history.created)
        if (!earliest || when < earliest) earliest = when
      }
    }
  }
  return earliest
}

async function main() {
  const assigneeList = ASSIGNEE_EMAILS.map((e) => `"${e}"`).join(', ')
  const jql =
    `assignee in (${assigneeList}) ` +
    `AND status changed to "${STATUS_DESIGN_DONE}" after "${DISCOVERY_START}" before "${DISCOVERY_END}" ` +
    `ORDER BY created DESC`

  console.log('JQL:', jql)
  const issues = await searchIssues(jql)
  console.log(`Found ${issues.length} candidate issues`)

  const rows = []
  for (const issue of issues) {
    const histories = await getFullChangelog(issue.key)
    const designDoneDate = earliestTransitionTo(histories, STATUS_DESIGN_DONE)

    if (!designDoneDate) {
      console.warn(`Skipping ${issue.key}: missing Design Done transition date`)
      continue
    }

    // Some tickets (e.g. bugs, epics) skip Discovery entirely. Fall back to
    // Design Done date so the row still has a Discovery Date to sort/filter on.
    const discoveryDate = earliestTransitionTo(histories, STATUS_DISCOVERY) || designDoneDate

    rows.push({
      key: issue.key,
      summary: issue.fields.summary,
      project: issue.fields.project.key,
      assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
      assigneeSlug: slugFor(issue.fields.assignee && issue.fields.assignee.accountId),
      discoveryDate: discoveryDate.toISOString(),
      designDoneDate: designDoneDate.toISOString(),
      hadDiscovery: Boolean(earliestTransitionTo(histories, STATUS_DISCOVERY)),
      url: `${JIRA_BASE_URL}/browse/${issue.key}`,
    })
  }

  rows.sort((a, b) => new Date(b.discoveryDate) - new Date(a.discoveryDate))

  const output = {
    generatedAt: new Date().toISOString(),
    reportingWindow: { start: DISCOVERY_START, end: DISCOVERY_END },
    tasks: rows,
  }

  const fs = await import('node:fs/promises')
  await fs.writeFile(new URL('../docs/data.json', import.meta.url), JSON.stringify(output, null, 2))
  console.log(`Wrote ${rows.length} tasks to docs/data.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
