import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev-only convenience: forwards the 9 real API routes to the Cloud Run
  // adapter (server/index.js, run separately via `npm run server`) so
  // `npm run dev` works as a full-stack local setup without `vercel dev`.
  // Listed as exact paths, one per real route, rather than a blanket
  // "/api" prefix — App.jsx/RevenueBreakdownView.jsx import
  // ../api/_category.js as a plain JS module under that same /api/ path,
  // and a broad prefix proxy would intercept (and 404) that module
  // request too. A regex key (^/api/(a|b|...)$) was tried first but did
  // not match on this Vite version — exact string keys are Vite's most
  // basic, unambiguous proxy form. Does not affect `vite build` /
  // production in any way; production keeps using relative /api/* as-is.
  server: {
    proxy: {
      '/api/overview': 'http://localhost:8080',
      '/api/leaderboards': 'http://localhost:8080',
      '/api/live-auctions': 'http://localhost:8080',
      '/api/live-auction-detail': 'http://localhost:8080',
      '/api/payables': 'http://localhost:8080',
      '/api/auction-detail': 'http://localhost:8080',
      '/api/revenue-breakdown': 'http://localhost:8080',
      '/api/upcoming-auctions': 'http://localhost:8080',
      '/api/bidding-pace': 'http://localhost:8080',
    },
  },
})
