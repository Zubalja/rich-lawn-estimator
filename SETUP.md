# Rich Lawn Estimator — Setup Guide

This version has an AI photo assistant, so it needs to deploy through a GitHub
repo connected to Netlify instead of drag-and-drop. It's still free on
Netlify's plan — just a different upload method, and it unlocks live pricing
updates without redeploying by hand.

## Files in this folder
- `index.html` — the whole site (measuring tool, builder, AI box, review, print)
- `catalog.json` — your pricing sheet. Edit this file to change prices.
- `netlify/functions/ai-estimate.js` — the server-side function that talks to Claude
- `netlify.toml` — tells Netlify where the function lives

## One-time setup (about 15 minutes)

**1. Put this folder on GitHub**
- Go to github.com, create a free account if you don't have one
- Click "New repository," name it something like `rich-lawn-estimator`
- Upload all four files/folders from this download (drag the whole folder in,
  GitHub keeps the netlify/functions structure intact)

**2. Connect it to Netlify**
- In Netlify, click "Add new site" → "Import an existing project"
- Choose GitHub, pick the repo you just made
- Build settings can stay blank/default — just click Deploy

**3. Add your Anthropic API key**
- Get a key at console.anthropic.com (Settings → API Keys) — you'll need
  billing set up there, usage is billed per request, roughly a cent or two
  per AI suggestion
- In Netlify: Site settings → Environment variables → Add a variable
  - Key: `ANTHROPIC_API_KEY`
  - Value: (paste your key)
- Redeploy the site once (Deploys tab → Trigger deploy) so the function
  picks up the new key

**4. Add your Google Maps key** (for the yard measuring step)
- Steps are commented at the top of `index.html`
- Paste the key in place of `YOUR_GOOGLE_MAPS_API_KEY_HERE`, then push the
  updated file to GitHub — Netlify redeploys automatically

**5. Turn on form notifications**
- Site settings → Forms → Form notifications → add your email
- This is how finished estimates reach your inbox

## Making future changes
- **Pricing:** edit `catalog.json` — either directly on GitHub (click the
  file, pencil icon, edit, commit) or send it to me to edit and I'll hand
  back the updated file
- **Anything else:** send me what you want changed, I'll edit the files,
  you (or I can walk you through it) push the update to GitHub, Netlify
  redeploys on its own within about a minute
