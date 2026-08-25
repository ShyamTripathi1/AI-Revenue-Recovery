# RecoverAI - AI Revenue Recovery Engine

RecoverAI is an autonomous, explainable AI system designed to intelligently route and recover failed payments and abandoned checkouts. Built for Track 3: AI Revenue Recovery (Razorpay Buildathon).

## Key Differentiators
1. **Measured Accuracy**: We seed a deterministic SQLite database with an explicit 75/25 train/holdout split. The classifier accuracy shown in the dashboard is strictly computed on holdout data that the system hasn't been tuned against.
2. **Explainable & Bounded**: The LLM ONLY performs root-cause classification. The actual recovery intervention is decided by a deterministic, inspectable rules engine (`backend/src/decision-rules.ts`). 
3. **Hard Guardrails**: A hard limit is set at ₹50,000. Any failure above this limit is automatically escalated, overriding any agent confidence.
4. **Honesty About Exceptions**: A dedicated Exceptions view highlights cases the agent cannot process due to low confidence or guardrail triggers.

## Quick Start (Run Locally)
1. Install dependencies in backend and start the server:
   ```bash
   cd backend
   npm install
   npx tsx src/api.ts
   ```
2. In a separate terminal, start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

## Tech Stack
- **Backend**: Node.js, Express, Better-SQLite3, Zod, OpenAI
- **Frontend**: React, Vite, Tailwind CSS, Recharts, Lucide React

## What Broke & How I Fixed It
- **Challenge**: Enforcing the boundary between LLM inference and financial action.
- **Fix**: Moving the decision layer entirely to deterministic TS logic (`decision-rules.ts`), making it easily auditable and completely bypassing LLM hallucination risks for payment retries.
