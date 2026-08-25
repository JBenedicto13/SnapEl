let classNames: string[] = []

function SidebarApp() {
  const root = document.getElementById('root')
  if (!root) return

  root.innerHTML = `
    <div class="sidebar_app">
      <div>
        <h1 class="sidebar_title">Txn Snap</h1>
        <div class="Registered Classes">
          <h2>Registered Classes</h2>
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
      </div>
    </div>
  `

  const classInput = root.querySelector<HTMLInputElement>('.sidebar_input')
  const addButton = root.querySelector<HTMLButtonElement>('.add_class_button')
  const snapButton = root.querySelector<HTMLButtonElement>('.sidebar_button')
  const classList = root.querySelector<HTMLUListElement>('.class_list')
  const resultsList = root.querySelector<HTMLUListElement>('.results_list')
  if (!classInput || !addButton || !snapButton || !classList || !resultsList) return

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

  async function snapValues() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return

    const values = await chrome.tabs.sendMessage(tab.id, {
      type: 'getValuesByClassName',
      classNames
    })

    renderResults(values as Record<string, string | null>)
  }
}

SidebarApp()
export default SidebarApp