---
viewport: { width: 1280, height: 800 }
fps: 30
voiceover:
  provider: kokoro
  voiceId: af_bella
captions:
  format: both
  burn: true
variables:
  appName: "Acme"
  userName: "Maya"
---

`visit("https://app.example.com")`
Welcome to {{appName}} — the workspace where your team's analytics come alive.

`type("#email", "{{userName}}@example.com")`
`click("#signIn")`
Sign in with your work account and you're straight into the dashboard.

`click("#chart")`
Here's the live chart. Every metric updates the moment your data changes.

`type("#search", "revenue")`
Search across all your metrics — revenue, retention, usage — in one place.

`click("#export")`
Export your data as CSV or PDF. {{caption: Choose a format.}}

`click("#confirm")`
Done. Your export is ready in seconds.
