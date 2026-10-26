import { useState } from 'react'
import PowerMap from './tabs/PowerMap'
import ScenarioBuilder from './tabs/ScenarioBuilder'

type Tab = 'power' | 'scenario'

export default function App() {
  const [tab, setTab] = useState<Tab>('power')
  // Cross-tab link: a venue or segment in Tab 2 opens its node in Tab 1.
  const [focusActor, setFocusActor] = useState<{ id: string; nonce: number } | null>(null)
  const openActor = (id: string) => {
    setFocusActor({ id, nonce: Date.now() })
    setTab('power')
  }

  return (
    <div className="app">
      <div className="banner lattice" role="note">Prototype. Uses illustrative data. Not a forecast.</div>
      <div className="topbar">
        <h1>
          The 78 <small>PD 1434 · Power Map and Scenario Simulator</small>
        </h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'power'} onClick={() => setTab('power')}>
            1 · Power map <span className="q">Who holds the power?</span>
          </button>
          <button role="tab" aria-selected={tab === 'scenario'} onClick={() => setTab('scenario')}>
            2 · Scenario builder <span className="q">Where can nonprofits act in time?</span>
          </button>
        </div>
      </div>
      {/* Both tabs stay mounted so their state survives switching. */}
      <div className="tab-body" hidden={tab !== 'power'}>
        <PowerMap focus={focusActor} />
      </div>
      <div className="tab-body" hidden={tab !== 'scenario'}>
        <ScenarioBuilder openActor={openActor} />
      </div>
    </div>
  )
}
