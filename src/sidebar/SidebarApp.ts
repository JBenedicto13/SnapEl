let classNames: string[] = []

const STORAGE_PREFIX = 'txn-snap-entry:'

interface SnapshotEntry {
  id: string
  createdAt?: number
  entry: Record<string, string | null>
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseLocalDate(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatTimestamp(ms?: number): string {
  if (typeof ms !== 'number') return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function formatFileStamp(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function SidebarApp() {
  const root = document.getElementById('root')
  if (!root) return

  root.innerHTML = `
    <div class="sidebar_app">
      <div class="sidebar_header">
        <h1 class="sidebar_title">SnapEl</h1>
        <p class="sidebar_subtitle">Snap Elements you need.</p>
      </div>
      <div class="sidebar_content">
        <div class="nav_pill">
          <div>
            <button>Home</button>
            <button>List</button>
            <button>Export</button>  
          </div>
        </div>
        <div class="snap_these_section">
          <h2>Snap these:</h2>
          <ul class="class_list"></ul>
        </div>
        <div>
          <input class="sidebar_input" type="text" placeholder="Enter a class to snap" />
          <button class="add_class_button">Add Class</button>
          <button class="sidebar_button">Snap</button>
        </div>
        <div class="Captured Values">
          <h2>Captured Values</h2>
          <ul class="results_list"></ul>
        </div>
        <div class="export_section">
          <h2>Export Data</h2>
          <div class="export_fields">
            <label>
              From
              <input class="export_start" type="date" />
            </label>
            <label>
              To
              <input class="export_end" type="date" />
            </label>
          </div>
          <button class="export_button" type="button">Export CSV</button>
          <p class="export_status"></p>
        </div>
      </div>
    </div>
  `

  const classInput = root.querySelector<HTMLInputElement>('.sidebar_input')
  const addButton = root.querySelector<HTMLButtonElement>('.add_class_button')
  const snapButton = root.querySelector<HTMLButtonElement>('.sidebar_button')
  const classList = root.querySelector<HTMLUListElement>('.class_list')
  const resultsList = root.querySelector<HTMLUListElement>('.results_list')
  const exportStart = root.querySelector<HTMLInputElement>('.export_start')
  const exportEnd = root.querySelector<HTMLInputElement>('.export_end')
  const exportButton = root.querySelector<HTMLButtonElement>('.export_button')
  const exportStatus = root.querySelector<HTMLParagraphElement>('.export_status')
  if (!classInput || !addButton || !snapButton || !classList || !resultsList) return
  if (!exportStart || !exportEnd || !exportButton || !exportStatus) return

  const renderClasses = () => {
    classList.innerHTML = ''
    classNames.forEach((name, index) => {
      const li = document.createElement('li')

      const label = document.createElement('span')
      label.textContent = name
      li.appendChild(label)

      const removeButton = document.createElement('button')
      removeButton.type = 'button'
      removeButton.textContent = 'Remove'
      removeButton.addEventListener('click', () => {
        classNames.splice(index, 1)
        renderClasses()
      })

      li.appendChild(removeButton)
      classList.appendChild(li)
    })
  }

  const renderResults = (values: Record<string, string | null>) => {
    resultsList.innerHTML = ''
    for (const [className, value] of Object.entries(values)) {
      const li = document.createElement('li')
      li.textContent = `${className}: ${value ?? '—'}`
      resultsList.appendChild(li)
    }
  }

  addButton.addEventListener('click', () => {
    const name = classInput.value.trim()
    if (!name || classNames.includes(name)) return
    classNames.push(name)
    classInput.value = ''
    renderClasses()
  })

  snapButton.addEventListener('click', snapValues)
  exportButton.addEventListener('click', exportCsv)

  async function snapValues() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return

    const values = await chrome.tabs.sendMessage(tab.id, {
      type: 'getValuesByClassName',
      classNames
    })

    // Save the whole snap as one entry: a unique id, the capture timestamp
    // (so exports can be filtered by date range) and all captured values.
    const id = crypto.randomUUID()
    await chrome.storage.local.set({
      [`txn-snap-entry:${id}`]: {
        id,
        createdAt: Date.now(),
        entry: values
      }
    })

    renderResults(values as Record<string, string | null>)
  }

  async function exportCsv() {
    const storage = await chrome.storage.local.get(null)

    const entries = Object.entries(storage)
      .filter(([key]) => key.startsWith(STORAGE_PREFIX))
      .map(([, value]) => value as SnapshotEntry)

    const start = parseLocalDate(exportStart!.value)
    const end = parseLocalDate(exportEnd!.value)
    // The `To` date is inclusive, so compare against the start of the day after it.
    const endExclusive = end ? end.getTime() + 24 * 60 * 60 * 1000 : null

    const filtered = entries.filter((entry) => {
      if (typeof entry.createdAt !== 'number') return !start && !end
      if (start && entry.createdAt < start.getTime()) return false
      if (endExclusive && entry.createdAt >= endExclusive) return false
      return true
    })

    if (filtered.length === 0) {
      exportStatus!.textContent = 'No entries found in the selected date range.'
      return
    }

    // Build a stable column set from the union of class names across entries.
    const columns: string[] = []
    for (const entry of filtered) {
      for (const key of Object.keys(entry.entry)) {
        if (!columns.includes(key)) columns.push(key)
      }
    }

    const header = ['id', 'createdAt', ...columns]
    const rows = filtered.map((entry) => [
      entry.id,
      formatTimestamp(entry.createdAt),
      ...columns.map((column) => entry.entry[column] ?? '')
    ])

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `txn-snap-export-${formatFileStamp()}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    exportStatus!.textContent = `Exported ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}.`
  }
}

SidebarApp()
export default SidebarApp