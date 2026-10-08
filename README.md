# CogniScan Lab – SIH26055 (DRDO) · Team InceptionX_2.0
**React + Node.js** full-stack 3D web lab that *measures* a smart scan scheduler (CogniScan) against a fixed sweep and a random-hop baseline.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Three.js (3D) |
| Backend | Node.js + Express – simulation engine + REST API |
| Storage | JSON file (`server/data/runs.json`, created automatically) |

## Run (development)
```bash
npm install
npm run dev          # API on :3001 + React on http://localhost:5173
```
## Run (production / demo)
```bash
npm install
npm run build        # builds the React app into /dist
npm start            # one server: http://localhost:3001  (API + frontend)
```
Needs Node.js 18+ (tested on 22).

## Measured factors
Probability of Intercept · Emitters found · Time to detect · False alarms · Scan efficiency · Decision latency – all computed by the simulator, nothing hard-coded.

## API
`GET /api/health` · `/api/presets` · `/api/metrics` · `POST /api/simulate` · `POST /api/benchmark` · `GET /api/runs` · `GET /api/runs/:id` · `GET /api/runs/:id/csv` · `DELETE /api/runs/:id`

## Tests
`npm test`

## Folder map
```
server/   index.js (API) · sim.js (simulation engine) · db.js (saved runs)
client/   src/App.jsx · components/{Simulator,Benchmark,History,Guide,Charts,Stage3D}.jsx · scene.js (Three.js)
test/     api.test.js
```

## Honest limits
The scheduler is a bandit-style stand-in (Bayesian occupancy + exploration + pulse-timing prediction) for the planned PPO policy. Results are simulation results; hardware validation is the next phase.

## Deploy (public link for the PPT)
Render / Railway / any Node host: build `npm install && npm run build`, start `npm start` (uses `PORT` automatically).
